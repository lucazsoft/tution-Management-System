import 'dart:async';

import 'package:tms_mobile/core/network/api_client.dart';

class PushMessage {
  const PushMessage({
    this.title,
    this.body,
    this.data = const {},
  });

  final String? title;
  final String? body;
  final Map<String, String> data;
}

abstract interface class PushMessagingGateway {
  Future<void> requestPermission();
  Future<String?> getToken();
  Stream<String> get onTokenRefresh;
  Stream<PushMessage> get onMessage;
  Stream<PushMessage> get onMessageOpenedApp;
  Future<PushMessage?> getInitialMessage();
}

abstract interface class PushTokenApi {
  Future<void> register({required String token, required String platform});
  Future<void> unregister(String token);
}

abstract interface class LocalNotificationPresenter {
  Future<void> initialize();
  Future<void> show(PushMessage message);
}

class ApiPushTokenApi implements PushTokenApi {
  const ApiPushTokenApi();

  @override
  Future<void> register(
      {required String token, required String platform}) async {
    await ApiClient.instance.dio.post<dynamic>(
      '/api/notifications/devices/register',
      data: {'token': token, 'platform': platform},
    );
  }

  @override
  Future<void> unregister(String token) async {
    await ApiClient.instance.dio.post<dynamic>(
      '/api/notifications/devices/unregister',
      data: {'token': token},
    );
  }
}

class PushNotificationService {
  PushNotificationService({
    required PushMessagingGateway messaging,
    required PushTokenApi api,
    required LocalNotificationPresenter localNotifications,
    required String platform,
    void Function(String deepLink)? onDeepLink,
  })  : _messaging = messaging,
        _api = api,
        _localNotifications = localNotifications,
        _platform = platform,
        _onDeepLink = onDeepLink;

  final PushMessagingGateway _messaging;
  final PushTokenApi _api;
  final LocalNotificationPresenter _localNotifications;
  final String _platform;
  final void Function(String deepLink)? _onDeepLink;
  final List<StreamSubscription<dynamic>> _subscriptions = [];
  final StreamController<PushMessage> _received =
      StreamController<PushMessage>.broadcast();
  String? _currentToken;
  bool _listenersStarted = false;
  bool _authenticated = false;
  int _epoch = 0;
  int _registeredEpoch = -1;
  Future<void> _operations = Future<void>.value();

  Future<void> _serialized(Future<void> Function() operation) {
    final next = _operations.then((_) => operation());
    _operations = next.catchError((Object _) {});
    return next;
  }
  bool _active(int epoch) => _authenticated && epoch == _epoch;
  bool get _bound => _authenticated && _registeredEpoch == _epoch;

  /// Pushes delivered while the app is in the foreground, so open screens can
  /// refresh (e.g. a calendar showing a just-published event).
  Stream<PushMessage> get received => _received.stream;

  /// Forget the registered token so the next [initialize] binds this device
  /// to the newly signed-in account even when FCM returns the same token.
  void resetRegistration() {
    ++_epoch;
    _authenticated = false;
    // Keep an in-flight/current token available for queued logout cleanup.
    // The epoch still forces re-registration for the new account.
  }

  Future<void> initialize({required bool authenticated}) {
    if (!authenticated) return Future<void>.value();
    _authenticated = true;
    final attempt = _epoch;
    return _serialized(() async {
      if (!_active(attempt)) return;
      await _localNotifications.initialize();
      if (!_active(attempt)) return;
      await _messaging.requestPermission();
      if (!_active(attempt)) return;
      final token = await _messaging.getToken();
      if (!_active(attempt)) return;
      await _register(token, attempt);
      if (!_active(attempt) || _listenersStarted) return;
      _listenersStarted = true;
      _subscriptions.add(_messaging.onTokenRefresh.listen(_registerSafely));
      _subscriptions.add(_messaging.onMessage.listen((message) {
        if (!_bound) return;
        unawaited(_localNotifications.show(message).catchError((Object _) {}));
        _received.add(message);
      }));
      _subscriptions.add(_messaging.onMessageOpenedApp.listen(_openMessage));
      final initial = await _messaging.getInitialMessage();
      if (_active(attempt)) _openMessage(initial);
    });
  }

  Future<void> _register(String? token, int attempt) async {
    if (!_active(attempt) || token == null || token.isEmpty ||
        (token == _currentToken && _registeredEpoch == attempt)) return;
    final previousToken = _currentToken;
    await _api.register(token: token, platform: _platform);
    // Remember even a late response so serialized logout can revoke it.
    _currentToken = token;
    _registeredEpoch = attempt;
    if (!_active(attempt)) return;
    if (previousToken != null && previousToken != token) {
      try { await _api.unregister(previousToken); } catch (_) {}
    }
  }

  void _registerSafely(String token) {
    if (!_authenticated) return;
    final attempt = _epoch;
    unawaited(_serialized(() => _register(token, attempt)).catchError((Object _) {}));
  }

  void _openMessage(PushMessage? message) {
    if (message == null || !_bound) return;
    final deepLink = parseDeepLink(message.data);
    if (deepLink != null) _onDeepLink?.call(deepLink);
  }

  Future<void> unregisterForLogout() {
    _authenticated = false;
    ++_epoch;
    return _serialized(() async {
      final token = _currentToken;
      if (token == null || token.isEmpty) return;
      try { await _api.unregister(token); }
      finally { _currentToken = null; _registeredEpoch = -1; }
    });
  }

  static String? parseDeepLink(Map<String, String> data) {
    final value = (data['deepLink'] ?? data['destination'])?.trim();
    if (value == null || !value.startsWith('/') || value.startsWith('//')) {
      return null;
    }
    final uri = Uri.tryParse(value);
    if (uri == null || uri.hasScheme || uri.hasAuthority) return null;
    return uri.toString();
  }

  Future<void> dispose() async {
    _authenticated = false;
    ++_epoch;
    await _operations;
    for (final subscription in _subscriptions) {
      await subscription.cancel();
    }
    _subscriptions.clear();
    _listenersStarted = false;
    await _received.close();
  }
}

class PushNotifications {
  PushNotifications._();

  static PushNotificationService? _service;
  static StreamSubscription<PushMessage>? _forwarder;
  static final StreamController<PushMessage> _received =
      StreamController<PushMessage>.broadcast();
  static String? _sessionUserId;
  static void Function(String deepLink)? deepLinkHandler;

  /// Foreground pushes for the signed-in session.
  static Stream<PushMessage> get received => _received.stream;

  static void install(PushNotificationService? service) {
    unawaited(_forwarder?.cancel());
    _service = service;
    _forwarder = service?.received.listen(_received.add);
  }

  /// Registers this device for [userId]. Safe to call repeatedly; switching
  /// accounts re-binds the device token to the new user.
  static Future<void> startAuthenticatedSession([String? userId]) async {
    final service = _service;
    if (service == null) return;
    if (userId != null && userId != _sessionUserId) {
      service.resetRegistration();
      _sessionUserId = userId;
    }
    try {
      await service.initialize(authenticated: true);
    } catch (_) {
      // Push setup must never block an otherwise valid authenticated session.
    }
  }

  /// Stops local display/refresh after an expired or unauthenticated session.
  /// Server cleanup may require the next authenticated session; do not report
  /// this local gate as proof that the provider/device token was revoked.
  static void suspendSession() {
    _sessionUserId = null;
    _service?.resetRegistration();
  }

  static Future<void> unregisterForLogout() async {
    _sessionUserId = null;
    try {
      await _service?.unregisterForLogout();
    } catch (_) {
      // Logout continues even if token cleanup cannot reach the API.
    }
  }
}
