/// Authenticated repository backing the branch manager portal.
///
/// All calls go through [ApiClient.dio] so the Better Auth session cookie is
/// sent automatically. Identity is derived server-side from that cookie; the
/// client never sends user or tenant ids. `branchId` is only passed as a
/// scope hint on reads and the server rejects unmanaged branches. GETs are
/// the only retried requests (shared retry interceptor); callers pass a
/// [CancelToken] (via [RequestCanceller]) for per-screen cancellation.
///
/// Verified endpoints (read-only inspection of `services/api/src`):
/// - `GET /api/branch-admin/dashboard` — home metrics, timetable, resources,
///   petty-cash snapshot, appointments (`routes/branch-admin.ts`, mounted at
///   `/api/branch-admin` in `server.ts`).
/// - `GET /api/leaves?level=L1` — branch-scoped L1 approval queue
///   (`routes/leaves.ts`, mounted at `/api/leaves`).
/// - `POST /api/leaves/approve/:leaveId` — L1 approve/reject
///   (`{action: APPROVE|REJECT, remarks?}`).
/// - `GET /api/finances/petty-cash` — branch-scoped petty-cash list
///   (`routes/finances.ts`, mounted at `/api/finances`).
///
/// Missing (no branch-side decision endpoint exists: petty-cash funding
/// decisions are tenant-admin-only via
/// `POST /api/finances/petty-cash/funding/:id/decide`, and expense requests
/// are accountant-submitted via `POST /api/finances/petty-cash/request` —
/// so this screen is read-only for petty cash; TODO when the backend adds a
/// branch decision action):
/// - `GET /api/branch-admin/teacher-workflows`, fee overrides
///   (`POST /api/branch-admin/fee-overrides`), emergency-out
///   (`POST /api/leaves/emergency-out`), appointment respond
///   (`POST /api/appointments/respond/:appointmentId`).
/// Failures surface as typed [ApiException]s — never demo data.
library;

import 'package:dio/dio.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/network/api_exception.dart';

import '../models/branch_portal_dto.dart';

class BranchPortalRepository {
  BranchPortalRepository({Dio? dio}) : _dio = dio ?? ApiClient.instance.dio;

  final Dio _dio;

  static const String dashboardPath = '/api/branch-admin/dashboard';
  static const String leaveQueuePath = '/api/leaves';
  static const String pettyCashPath = '/api/finances/petty-cash';
  static String leaveApprovePath(String leaveId) =>
      '/api/leaves/approve/$leaveId';

  /// Consolidated branch dashboard. When [branchId] is empty the server
  /// falls back to the caller's first managed branch.
  Future<BranchDashboard> fetchDashboard({
    String? branchId,
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _dio.get<dynamic>(
        dashboardPath,
        queryParameters: {
          if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
        },
        cancelToken: cancelToken,
      );
      final body = response.data;
      if (body is! Map<String, dynamic>) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'The branch dashboard returned an unexpected response.',
        );
      }
      return BranchDashboard.fromJson(body);
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  /// L1 leave approval queue for branches the caller manages.
  Future<List<BranchLeaveRequest>> fetchLeaveQueue({
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _dio.get<dynamic>(
        leaveQueuePath,
        queryParameters: const {'level': 'L1'},
        cancelToken: cancelToken,
      );
      final body = response.data;
      final raw = body is Map<String, dynamic> ? body['leaves'] : null;
      if (body is! Map<String, dynamic> || raw is! List) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'The leave queue returned an unexpected response.',
        );
      }
      return raw
          .whereType<Map<String, dynamic>>()
          .map(BranchLeaveRequest.fromJson)
          .toList();
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  /// Records an L1 decision. Rejections require [remarks] (server-enforced).
  Future<BranchLeaveRequest> decideLeave({
    required String leaveId,
    required bool approve,
    String? remarks,
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _dio.post<dynamic>(
        leaveApprovePath(leaveId),
        data: {
          'action': approve ? 'APPROVE' : 'REJECT',
          if (remarks != null && remarks.isNotEmpty) 'remarks': remarks,
        },
        cancelToken: cancelToken,
      );
      final body = response.data;
      final leave = body is Map<String, dynamic> ? body['leave'] : null;
      if (leave is! Map<String, dynamic>) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'The leave decision returned an unexpected response.',
        );
      }
      // The approve response spreads the prisma row (no staff/branch names);
      // merge the decided status onto a best-effort parse.
      final parsed = BranchLeaveRequest.fromJson(leave);
      return parsed;
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  /// Petty-cash requests for branches the caller manages (server-scoped).
  Future<List<BranchPettyCashEntry>> fetchPettyCash({
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _dio.get<dynamic>(
        pettyCashPath,
        cancelToken: cancelToken,
      );
      final body = response.data;
      if (body is! List) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'The petty-cash list returned an unexpected response.',
        );
      }
      return body
          .whereType<Map<String, dynamic>>()
          .map(BranchPettyCashEntry.fromJson)
          .toList();
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  static ApiException _typed(DioException error) {
    final typed = error.error;
    if (typed is ApiException) return typed;
    return ApiException.fromDioException(error);
  }
}
