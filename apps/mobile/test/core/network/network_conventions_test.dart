import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/network/correlation_id.dart';
import 'package:tms_mobile/core/network/pagination.dart';
import 'package:tms_mobile/core/network/request_cancellation.dart';
import 'package:tms_mobile/core/network/retry_policy.dart';

/// MOB-006 example test: exercises every networking convention through the
/// test-override seam ([ApiClient.buildDio] / [ApiClient.setDioForTesting])
/// with fully stubbed transports — no network, no platform plugins.
void main() {
  group('ApiException mapping', () {
    Response<dynamic> response(int code, [dynamic data]) => Response<dynamic>(
          requestOptions: RequestOptions(path: '/x'),
          statusCode: code,
          data: data,
        );

    DioException dioError(
      DioExceptionType type, {
      int? statusCode,
      dynamic data,
      String method = 'GET',
    }) =>
        DioException(
          requestOptions: RequestOptions(path: '/x', method: method),
          type: type,
          response: statusCode == null ? null : response(statusCode, data),
        );

    test('maps timeout / connection / status codes to kinds', () {
      expect(
        ApiException.fromDioException(
                dioError(DioExceptionType.connectionTimeout))
            .kind,
        ApiErrorKind.timeout,
      );
      expect(
        ApiException.fromDioException(dioError(DioExceptionType.receiveTimeout))
            .kind,
        ApiErrorKind.timeout,
      );
      expect(
        ApiException.fromDioException(
                dioError(DioExceptionType.connectionError))
            .kind,
        ApiErrorKind.noConnection,
      );
      expect(
        ApiException.fromDioException(
                dioError(DioExceptionType.badResponse, statusCode: 401))
            .kind,
        ApiErrorKind.unauthorized,
      );
      expect(
        ApiException.fromDioException(
                dioError(DioExceptionType.badResponse, statusCode: 403))
            .kind,
        ApiErrorKind.forbidden,
      );
      expect(
        ApiException.fromDioException(
                dioError(DioExceptionType.badResponse, statusCode: 404))
            .kind,
        ApiErrorKind.notFound,
      );
      expect(
        ApiException.fromDioException(
                dioError(DioExceptionType.badResponse, statusCode: 422))
            .kind,
        ApiErrorKind.validation,
      );
      expect(
        ApiException.fromDioException(
                dioError(DioExceptionType.badResponse, statusCode: 500))
            .kind,
        ApiErrorKind.server,
      );
    });

    test('server body message wins over defaults', () {
      final err = ApiException.fromDioException(dioError(
        DioExceptionType.badResponse,
        statusCode: 422,
        data: {'error': 'Email is already taken.'},
      ));
      expect(err.kind, ApiErrorKind.validation);
      expect(err.message, 'Email is already taken.');
    });

    test('cancellation maps to cancelled', () {
      final err =
          ApiException.fromDioException(dioError(DioExceptionType.cancel));
      expect(err.kind, ApiErrorKind.cancelled);
    });
  });

  group('Correlation id', () {
    test('native client sends an Origin accepted by Better Auth', () {
      final dio = ApiClient.buildDio(baseUrl: 'https://test.invalid');

      expect(
        dio.options.headers['Origin'],
        kIsWeb ? isNull : ApiClient.authOrigin,
      );
    });

    test('x-request-id uuid is stamped on outgoing requests', () async {
      RequestOptions? captured;
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              captured = options;
              handler.resolve(Response<dynamic>(
                requestOptions: options,
                statusCode: 200,
                data: {'ok': true},
              ));
            },
          ),
        ],
      );

      await dio.get('/ping');

      final requestId = captured?.headers[CorrelationIdInterceptor.headerName];
      expect(requestId, isA<String>());
      expect(
        RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ).hasMatch(requestId as String),
        isTrue,
      );
    });

    test('pre-existing x-request-id is preserved', () async {
      RequestOptions? captured;
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              captured = options;
              handler.resolve(Response<dynamic>(
                requestOptions: options,
                statusCode: 200,
                data: {'ok': true},
              ));
            },
          ),
        ],
      );

      await dio.get('/ping',
          options: Options(headers: {'x-request-id': 'test-id-1'}));

      expect(captured?.headers['x-request-id'], 'test-id-1');
    });
  });

  group('Pagination helper', () {
    Map<String, dynamic> item(int id) => {'id': id};

    test('parses meta envelope with explicit hasMore', () {
      final result = parsePagedResponse<Map<String, dynamic>>(
        {
          'data': [item(1), item(2)],
          'meta': {'page': 1, 'limit': 2, 'total': 5, 'hasMore': true},
        },
        fromJson: (json) => json,
        query: const PagedQuery(page: 1, limit: 2),
      );
      expect(result.items, hasLength(2));
      expect(result.hasMore, isTrue);
      expect(result.total, 5);
      expect(result.nextQuery?.page, 2);
    });

    test('derives hasMore from total when absent', () {
      final last = parsePagedResponse<Map<String, dynamic>>(
        {
          'data': [item(1)],
          'meta': {'page': 3, 'limit': 2, 'total': 5},
        },
        fromJson: (json) => json,
        query: const PagedQuery(page: 3, limit: 2),
      );
      expect(last.hasMore, isFalse);
      expect(last.nextQuery, isNull);
    });

    test('parses bare list as a single page', () {
      final result = parsePagedResponse<Map<String, dynamic>>(
        [item(1)],
        fromJson: (json) => json,
        query: const PagedQuery(page: 1, limit: 20),
      );
      expect(result.items, hasLength(1));
      expect(result.hasMore, isFalse);
    });

    test('fetchPage sends page/limit query params', () async {
      Map<String, dynamic>? capturedQuery;
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              capturedQuery =
                  Map<String, dynamic>.from(options.queryParameters);
              handler.resolve(Response<dynamic>(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'data': [
                    {'id': 1}
                  ],
                  'meta': {
                    'page': 2,
                    'limit': 10,
                    'total': 11,
                    'hasMore': true
                  },
                },
              ));
            },
          ),
        ],
      );

      final result = await fetchPage<Map<String, dynamic>>(
        dio,
        '/api/tasks',
        const PagedQuery(page: 2, limit: 10),
        (json) => json,
      );

      expect(capturedQuery?['page'], 2);
      expect(capturedQuery?['limit'], 10);
      expect(result.items, hasLength(1));
      expect(result.hasMore, isTrue);
    });
  });

  group('Safe retry policy', () {
    final policy = SafeRetryPolicy();
    RequestOptions get(String path) =>
        RequestOptions(path: path, method: 'GET');
    RequestOptions post(String path) =>
        RequestOptions(path: path, method: 'POST');

    DioException errorOf(DioExceptionType type, {int? status}) => DioException(
          requestOptions: RequestOptions(path: '/x'),
          type: type,
          response: status == null
              ? null
              : Response<dynamic>(
                  requestOptions: RequestOptions(path: '/x'),
                  statusCode: status,
                ),
        );

    test('retries transient GET failures, up to maxRetries', () {
      expect(
        policy.shouldRetry(
            get('/a'), errorOf(DioExceptionType.connectionTimeout), 0),
        isTrue,
      );
      expect(
        policy.shouldRetry(
            get('/a'), errorOf(DioExceptionType.badResponse, status: 500), 1),
        isTrue,
      );
      expect(
        policy.shouldRetry(
            get('/a'), errorOf(DioExceptionType.badResponse, status: 500), 2),
        isFalse,
      );
    });

    test('never retries writes or client errors', () {
      expect(
        policy.shouldRetry(
            post('/a'), errorOf(DioExceptionType.connectionTimeout), 0),
        isFalse,
      );
      expect(
        policy.shouldRetry(
            get('/a'), errorOf(DioExceptionType.badResponse, status: 404), 0),
        isFalse,
      );
      expect(
        policy.shouldRetry(
            get('/a'), errorOf(DioExceptionType.badResponse, status: 422), 0),
        isFalse,
      );
      expect(
        policy.shouldRetry(get('/a'), errorOf(DioExceptionType.cancel), 0),
        isFalse,
      );
    });

    test('backoff doubles per attempt', () {
      expect(policy.delayForAttempt(1), const Duration(milliseconds: 300));
      expect(policy.delayForAttempt(2), const Duration(milliseconds: 600));
    });
  });

  group('Request cancellation', () {
    test('tokens are reused per key and cancelled together', () {
      final canceller = RequestCanceller();
      final first = canceller.tokenFor('items');
      expect(canceller.tokenFor('items'), same(first));

      canceller.cancelAll();
      expect(first.isCancelled, isTrue);
      expect(() => canceller.tokenFor('items'), throwsStateError);
    });
  });

  group('Test overrides', () {
    test('mock Dio can be injected and reset', () {
      final mock = ApiClient.buildDio(baseUrl: 'https://test.invalid');
      ApiClient.instance.setDioForTesting(mock);
      addTearDown(ApiClient.instance.resetForTesting);

      expect(ApiClient.instance.dio, same(mock));
      expect(ApiClient.instance.isInitialized, isTrue);
    });
  });
}
