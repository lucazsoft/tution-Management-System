/// Authenticated repository backing the student home and timetable screens.
///
/// All calls go through [ApiClient.dio] so the Better Auth session cookie is
/// sent automatically. Identity is derived server-side from that cookie; the
/// client never sends user, tenant or branch ids. Requests are GET-only, so
/// the shared retry interceptor may safely retry them; callers pass a
/// [CancelToken] (via [RequestCanceller]) for per-screen cancellation.
///
/// Verified endpoints (read-only inspection of `services/api/src`):
/// - `GET /api/users/me/student-portal` — consolidated portal payload
///   (profile, today + weekly sessions, homework, results, insights,
///   invoices, events, certificates, notifications).
/// - `GET /api/courses/timetable/student/:studentId` — raw per-class
///   schedules, used only as a timetable fallback when the portal carries no
///   weekly sessions (it lacks teacher and course-type detail).
///
/// Failures are surfaced as typed [ApiException]s — never demo data and never
/// invented contracts.
library;

import 'package:dio/dio.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/network/api_exception.dart';

import '../models/student_portal_dto.dart';

class StudentPortalRepository {
  StudentPortalRepository({Dio? dio}) : _dio = dio ?? ApiClient.instance.dio;

  final Dio _dio;

  /// Consolidated portal path (no parameters; identity from session cookie).
  static const String portalPath = '/api/users/me/student-portal';

  /// Raw per-student timetable path for a known student id.
  static String timetablePath(String studentId) =>
      '/api/courses/timetable/student/$studentId';

  /// Fetches the consolidated student portal payload.
  Future<StudentPortal> fetchPortal({CancelToken? cancelToken}) async {
    try {
      final response =
          await _dio.get<dynamic>(portalPath, cancelToken: cancelToken);
      final body = response.data;
      if (body is! Map<String, dynamic>) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'The student portal returned an unexpected response.',
        );
      }
      return StudentPortal.fromJson(body);
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  /// Fetches raw class schedules for [studentId] (timetable fallback).
  Future<List<StudentClassSchedule>> fetchStudentTimetable(
    String studentId, {
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _dio.get<dynamic>(
        timetablePath(studentId),
        cancelToken: cancelToken,
      );
      final body = response.data;
      final raw = body is Map<String, dynamic> ? body['timetable'] : null;
      if (raw is! List) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'The timetable returned an unexpected response.',
        );
      }
      return [
        for (final item in raw)
          if (item is Map<String, dynamic>) StudentClassSchedule.fromJson(item),
      ];
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  /// Extracts the typed [ApiException] stashed on [error] by the shared
  /// auth interceptor, mapping anything else through [ApiException].
  static ApiException _typed(DioException error) {
    final typed = error.error;
    if (typed is ApiException) return typed;
    return ApiException.fromDioException(error);
  }
}
