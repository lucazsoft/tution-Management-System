import 'dart:convert';

import 'package:dio/dio.dart';

import '../network/api_client.dart';
import 'sync_models.dart';
import 'sync_queue.dart';

/// Builds a [MutationSender] that replays queued mutations through the
/// shared [ApiClient] Dio (Better Auth cookie identity rides along
/// automatically — this sender contains zero auth logic).
///
/// Mapping:
/// * 2xx → [ReplayOutcome.applied] (drop from queue).
/// * 409 → [ReplayOutcome.conflict] (server wins: drop + notify).
/// * Network failure (no response: timeout / connection error / cancel
///   unrelated) or 5xx → [ReplayOutcome.retryable] (stay queued).
/// * Any other surprise status (400/403/404/422/…): never retried blindly
///   for non-idempotent methods (POST/PATCH) — those become [conflict]
///   (drop + surfaced to the user) instead of poisoning the queue forever.
///   Idempotent methods (GET/PUT/DELETE) are safe to keep queued, so they
///   map to [retryable].
///
/// Pass [dio] in tests to stub the transport; defaults to
/// `ApiClient.instance.dio`, resolved lazily at send time so the provider
/// can be created before init (only an actual replay needs Dio ready).
MutationSender buildApiMutationSender({Dio? dio}) {
  return (SyncOperation op) async {
    final client = dio ?? ApiClient.instance.dio;
    dynamic data;
    if (op.bodyJson != null) {
      try {
        data = jsonDecode(op.bodyJson!);
      } catch (_) {
        // Not JSON — forward the raw string; the server decides.
        data = op.bodyJson;
      }
    }
    try {
      final response = await client.request<dynamic>(
        op.path,
        data: data,
        options: Options(
          method: op.method,
          headers: <String, dynamic>{'Idempotency-Key': op.idempotencyKey},
        ),
      );
      return _mapStatus(op.method, response.statusCode);
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status != null) return _mapStatus(op.method, status);
      // No response: timeout, DNS, socket, TLS — always safe to retry
      // later regardless of method (nothing reached the server, or at
      // least nothing came back; the idempotency key dedupes replays).
      return ReplayOutcome.retryable;
    } catch (_) {
      // Local surprise (e.g. malformed method): never drop user data —
      // keep queued for triage instead of silently discarding.
      return ReplayOutcome.retryable;
    }
  };
}

ReplayOutcome _mapStatus(String method, int? status) {
  if (status != null && status >= 200 && status < 300) {
    return ReplayOutcome.applied;
  }
  if (status == 409) return ReplayOutcome.conflict;
  if (status != null && status >= 500) return ReplayOutcome.retryable;
  // Surprise 4xx/other: only idempotent methods may stay queued.
  return _isIdempotent(method)
      ? ReplayOutcome.retryable
      : ReplayOutcome.conflict;
}

/// HTTP-idempotent replay methods: safe to keep queued and retry.
bool _isIdempotent(String method) {
  switch (method.toUpperCase()) {
    case 'GET':
    case 'PUT':
    case 'DELETE':
      return true;
    default:
      return false;
  }
}
