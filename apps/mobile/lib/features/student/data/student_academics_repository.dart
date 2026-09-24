/// API-backed repository for the signed-in student's academic records.
///
/// Wired endpoints (verified in `services/api/src`, read-only here):
/// - `GET /api/users/me/student-portal` — results, homework, insights,
///   syllabi, attendance (latest 60), leave decisions (via notifications).
///   Identity comes from the Better Auth session cookie; no student id is
///   sent, so a signed-in student can only ever see their own records.
/// - `GET /api/performance/student/:studentId` — score/insight/remark
///   detail. The id used is always the `enrollmentId` from the portal
///   snapshot, never user input.
/// - `GET /api/homework/:classId` — per-class homework refresh.
///
/// Missing server-side (typed [ApiException] + TODO, never demo data):
/// - No paginated `GET` for attendance history (portal caps at 60) —
///   [pageAttendance] paginates the snapshot client-side.
/// - No `GET /api/leaves/mine` — [StudentPortalSnapshot.leaveExplanations]
///   derives explanations from portal leave notifications.
/// - `GET /api/homework/:classId` takes no `page`/`limit` — [classHomework]
///   slices the class list client-side into [PagedResult] windows.
library;

import 'package:dio/dio.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/network/pagination.dart';

import '../models/student_academics_api.dart';

class StudentAcademicsRepository {
  StudentAcademicsRepository({Dio? dio}) : _dio = dio ?? ApiClient.instance.dio;

  final Dio _dio;

  static const String portalPath = '/api/users/me/student-portal';
  static const String performancePath = '/api/performance/student';
  static const String homeworkPath = '/api/homework';

  /// Loads the whole academics snapshot for the signed-in student.
  Future<StudentPortalSnapshot> fetchPortal({CancelToken? cancelToken}) async {
    try {
      final response = await _dio.get<dynamic>(
        portalPath,
        cancelToken: cancelToken,
      );
      final body = response.data;
      if (body is! Map<String, dynamic>) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'The student portal returned an unexpected response.',
        );
      }
      return StudentPortalSnapshot.fromJson(body);
    } on DioException catch (e) {
      throw ApiException.from(e);
    }
  }

  /// Score/insight/remark detail for the student's own record.
  Future<StudentPerformanceDetail> fetchPerformance(
    String studentId, {
    CancelToken? cancelToken,
  }) async {
    if (studentId.isEmpty) {
      throw const ApiException(
        kind: ApiErrorKind.unknown,
        message: 'Student record is not linked yet.',
      );
    }
    try {
      final response = await _dio.get<dynamic>(
        '$performancePath/$studentId',
        cancelToken: cancelToken,
      );
      final body = response.data;
      if (body is! Map<String, dynamic>) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'Performance detail returned an unexpected response.',
        );
      }
      return StudentPerformanceDetail.fromJson(body);
    } on DioException catch (e) {
      throw ApiException.from(e);
    }
  }

  /// Homework for one enrolled class, windowed into [query] pages.
  ///
  /// The server returns the full class list (`{homework: [...]}`); paging
  /// is applied client-side until the backend accepts `page`/`limit`.
  /// TODO(mob-102): pass `page`/`limit` through once the backend supports
  /// paginated `GET /api/homework/:classId`.
  Future<PagedResult<HomeworkTask>> classHomework(
    String classId,
    PagedQuery query, {
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _dio.get<dynamic>(
        '$homeworkPath/$classId',
        cancelToken: cancelToken,
      );
      final body = response.data;
      var rows = const <HomeworkTask>[];
      if (body is Map<String, dynamic> && body['homework'] is List) {
        rows = (body['homework'] as List)
            .whereType<Map<String, dynamic>>()
            .map(HomeworkTask.fromClassRow)
            .toList();
      }
      return slicePage(rows, query);
    } on DioException catch (e) {
      throw ApiException.from(e);
    }
  }

  /// Windows any in-memory list into a [PagedResult] page.
  ///
  /// Used for portal collections with no server-side pagination
  /// (attendance history, results, homework aggregate).
  PagedResult<T> slicePage<T>(List<T> all, PagedQuery query) {
    final page = query.page < 1 ? 1 : query.page;
    final limit = query.limit < 1 ? 20 : query.limit;
    final start = (page - 1) * limit;
    if (start >= all.length) {
      return PagedResult<T>(
        items: const [],
        page: page,
        limit: limit,
        hasMore: false,
        total: all.length,
      );
    }
    final end = (start + limit).clamp(0, all.length);
    final items = all.sublist(start, end);
    return PagedResult<T>(
      items: items,
      page: page,
      limit: limit,
      hasMore: end < all.length,
      total: all.length,
    );
  }
}
