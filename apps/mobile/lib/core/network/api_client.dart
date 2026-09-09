import 'package:dio/dio.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/foundation.dart';

import 'api_exception.dart';
import 'correlation_id.dart';
import 'retry_policy.dart';

/// Central API client for the TMS mobile app.
///
/// Uses Dio with a Better Auth session cookie jar. All backend calls should go
/// through [ApiClient.dio] so the httpOnly session cookie is sent automatically.
///
/// Interceptor chain (in order):
/// 1. CookieManager — attaches/persists the Better Auth session cookie.
/// 2. [CorrelationIdInterceptor] — stamps `x-request-id` per request.
/// 3. [RetryInterceptor] — safe retry: idempotent GETs only, max 2 retries
///    with exponential backoff; never auto-retries POST/PUT/PATCH/DELETE.
/// 4. [_AuthInterceptor] — clears local session on 401 and maps every
///    failure to a typed [ApiException] (kept on `DioException.error`) while
///    preserving the human-readable `DioException.message` contract.
class ApiClient {
  ApiClient._();

  static final ApiClient _instance = ApiClient._();
  static ApiClient get instance => _instance;

  /// Set per build using `--dart-define=API_BASE_URL=<url>`.
  ///
  /// The debug default targets the Android emulator. Release builds must
  /// provide an HTTPS endpoint explicitly; a package must never be released
  /// with an emulator URL or clear-text API traffic.
  static String get baseUrl {
    const fromEnv = String.fromEnvironment('API_BASE_URL');
    if (fromEnv.isNotEmpty) return fromEnv;
    if (kIsWeb) return 'http://localhost:3001';
    return 'http://10.0.2.2:3001';
  }

  static const String userKey = 'tms_auth_user';
  static const String tenantKey = 'tms_tenant_id';

  late Dio dio;
  bool _initialized = false;
  static PersistCookieJar? _cookieJar;

  /// Fired after local session data is cleared on a 401. The app layer
  /// (auth provider) sets this so the router redirects to /login.
  static void Function()? onSessionInvalidated;

  /// Initialize the client. Call once from main() before runApp.
  Future<void> init() async {
    if (_initialized) return;

    final currentBaseUrl = baseUrl;
    final endpoint = Uri.tryParse(currentBaseUrl);
    if (endpoint == null || !endpoint.hasScheme || !endpoint.hasAuthority) {
      throw StateError(
        'API_BASE_URL must be an absolute URL. Provide it with --dart-define.',
      );
    }
    if (!kDebugMode && endpoint.scheme != 'https') {
      throw StateError('Release builds require an HTTPS API_BASE_URL.');
    }

    dio = buildDio(baseUrl: currentBaseUrl);

    if (!kIsWeb) {
      // MOB-004: persist session cookies across restarts so the Better Auth
      // session survives app relaunch. Web keeps an in-memory jar.
      final supportDir = await getApplicationSupportDirectory();
      _cookieJar = PersistCookieJar(
        storage: FileStorage('${supportDir.path}/cookies'),
      );
      // CookieManager must run first so the session cookie is attached
      // before any other interceptor sees the request.
      dio.interceptors.insert(0, CookieManager(_cookieJar!));
    }
    _initialized = true;
  }

  /// Builds a fully-wired Dio for [baseUrl] WITHOUT touching platform
  /// plugins (no path_provider / shared_preferences).
  ///
  /// Used by [init] and by unit tests. Pass [adapter] to stub the transport
  /// (e.g. a mock [HttpClientAdapter]) and [extraInterceptors] to observe or
  /// stub requests in tests.
  static Dio buildDio({
    required String baseUrl,
    HttpClientAdapter? adapter,
    List<Interceptor>? extraInterceptors,
    SafeRetryPolicy? retryPolicy,
  }) {
    final client = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      contentType: 'application/json',
      responseType: ResponseType.json,
    ));
    if (adapter != null) client.httpClientAdapter = adapter;
    client.interceptors.add(CorrelationIdInterceptor());
    client.interceptors.add(RetryInterceptor(client, retryPolicy));
    if (extraInterceptors != null) {
      client.interceptors.addAll(extraInterceptors);
    }
    client.interceptors.add(_AuthInterceptor());
    return client;
  }

  /// Injects a mock/stub [Dio] for unit tests.
  ///
  /// Prefer building the double with [buildDio] so the real interceptor
  /// chain (correlation-id, retry, error mapping) stays under test:
  ///
  /// ```dart
  /// ApiClient.instance.setDioForTesting(ApiClient.buildDio(
  ///   baseUrl: 'https://test.invalid',
  ///   adapter: myMockAdapter,
  /// ));
  /// addTearDown(ApiClient.instance.resetForTesting);
  /// ```
  @visibleForTesting
  void setDioForTesting(Dio testDio) {
    dio = testDio;
    _initialized = true;
  }

  /// Clears state injected via [setDioForTesting].
  @visibleForTesting
  void resetForTesting() {
    _initialized = false;
  }

  /// Whether the client is ready to serve requests.
  bool get isInitialized => _initialized;

  /// Save the authenticated user as JSON string.
  static Future<void> saveUser(String userJson) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(userKey, userJson);
  }

  /// Retrieve the stored user JSON (or null).
  static Future<String?> getUser() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(userKey);
  }

  /// Clear all auth data (on logout or session expiry).
  static Future<void> clearAuth() async {
    await _cookieJar?.deleteAll();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(userKey);
    await prefs.remove(tenantKey);
  }
}

/// Clears local user state when the server rejects the session, then maps
/// every failure to a typed [ApiException].
class _AuthInterceptor extends Interceptor {
  @override
  Future<void> onError(
      DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      // Session expired or invalidated: clear local state, then tell the
      // app layer so the router kicks back to /login (MOB-005).
      // Exactly-once wipe: clearAuth only drops cookies/prefs — the per-user
      // offline wipe happens once in AuthNotifier.forceLogout, which captures
      // the user id first and becomes a no-op on repeat 401s (null user).
      await ApiClient.clearAuth();
      ApiClient.onSessionInvalidated?.call();
    }

    // Map to the typed exception. The human-readable message stays on
    // `message` (existing callers read that); the typed value rides on
    // `error` for callers that want to branch on kind/status.
    final apiError = ApiException.fromDioException(err);
    handler.next(DioException(
      requestOptions: err.requestOptions,
      response: err.response,
      type: err.type,
      error: apiError,
      message: apiError.message,
    ));
  }
}
