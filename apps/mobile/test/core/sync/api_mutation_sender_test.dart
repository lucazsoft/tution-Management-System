import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/sync/api_mutation_sender.dart';
import 'package:tms_mobile/core/sync/sync_models.dart';
import 'package:tms_mobile/core/sync/sync_queue.dart';

SyncOperation testOp({
  String method = 'POST',
  String path = '/api/tasks',
  String? bodyJson = '{"title":"Fix tap"}',
}) =>
    SyncOperation(
      idempotencyKey: 'k1',
      ownerUserId: 'u1',
      method: method,
      path: path,
      bodyJson: bodyJson,
      createdAt: 1,
    );

/// Stub transport: resolves with [status] or rejects with a DioException
/// carrying [status] (badResponse) / no response (network failure).
Dio stubDio({
  int status = 200,
  bool fail = false,
  DioExceptionType errorType = DioExceptionType.badResponse,
  void Function(RequestOptions options)? onRequest,
}) {
  return ApiClient.buildDio(
    baseUrl: 'https://test.invalid',
    extraInterceptors: [
      InterceptorsWrapper(
        onRequest: (options, handler) {
          onRequest?.call(options);
          if (fail) {
            handler.reject(
              DioException(
                requestOptions: options,
                type: errorType,
                response: errorType == DioExceptionType.badResponse
                    ? Response<dynamic>(
                        requestOptions: options,
                        statusCode: status,
                        data: {'error': 'stub-$status'},
                      )
                    : null,
              ),
            );
          } else {
            handler.resolve(
              Response<dynamic>(
                requestOptions: options,
                statusCode: status,
                data: {'ok': true},
              ),
            );
          }
        },
      ),
    ],
  );
}

void main() {
  group('buildApiMutationSender', () {
    test('2xx replays method+path with JSON-decoded body -> applied', () async {
      RequestOptions? captured;
      final send = buildApiMutationSender(
        dio: stubDio(
          status: 201,
          onRequest: (options) => captured = options,
        ),
      );

      final outcome = await send(testOp());

      expect(outcome, ReplayOutcome.applied);
      expect(captured?.method, 'POST');
      expect(captured?.path, '/api/tasks');
      expect(captured?.data, {'title': 'Fix tap'});
    });

    test('replay sends the queue idempotency key as Idempotency-Key header',
        () async {
      RequestOptions? captured;
      final send = buildApiMutationSender(
        dio: stubDio(onRequest: (options) => captured = options),
      );

      await send(testOp());

      expect(captured?.headers['Idempotency-Key'], 'k1');
    });

    test('bodyless op sends null data', () async {
      RequestOptions? captured;
      final send = buildApiMutationSender(
        dio: stubDio(onRequest: (options) => captured = options),
      );

      expect(await send(testOp(bodyJson: null)), ReplayOutcome.applied);
      expect(captured?.data, isNull);
    });

    test('non-JSON body is forwarded raw', () async {
      RequestOptions? captured;
      final send = buildApiMutationSender(
        dio: stubDio(onRequest: (options) => captured = options),
      );

      expect(await send(testOp(bodyJson: 'plain-text')), ReplayOutcome.applied);
      expect(captured?.data, 'plain-text');
    });

    test('409 -> conflict', () async {
      final send =
          buildApiMutationSender(dio: stubDio(status: 409, fail: true));
      expect(await send(testOp()), ReplayOutcome.conflict);
    });

    test('5xx -> retryable', () async {
      final send =
          buildApiMutationSender(dio: stubDio(status: 503, fail: true));
      expect(await send(testOp()), ReplayOutcome.retryable);
    });

    test('network failure without response -> retryable', () async {
      final send = buildApiMutationSender(
        dio: stubDio(fail: true, errorType: DioExceptionType.connectionError),
      );
      expect(await send(testOp()), ReplayOutcome.retryable);
    });

    test('surprise 4xx on POST is never retried blindly -> conflict', () async {
      final send =
          buildApiMutationSender(dio: stubDio(status: 422, fail: true));
      expect(await send(testOp(method: 'POST')), ReplayOutcome.conflict);
      expect(await send(testOp(method: 'PATCH')), ReplayOutcome.conflict);
    });

    test('surprise 4xx on idempotent method stays queued -> retryable',
        () async {
      final send =
          buildApiMutationSender(dio: stubDio(status: 422, fail: true));
      expect(await send(testOp(method: 'PUT')), ReplayOutcome.retryable);
      expect(await send(testOp(method: 'DELETE')), ReplayOutcome.retryable);
    });

    test('sender carries no auth logic: 403 does not throw, maps cleanly',
        () async {
      final send =
          buildApiMutationSender(dio: stubDio(status: 403, fail: true));
      expect(await send(testOp()), ReplayOutcome.conflict);
    });
  });
}
