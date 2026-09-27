/// Authenticated repository backing the teacher portal.
///
/// All calls go through [ApiClient.dio] so the Better Auth session cookie is
/// sent automatically. Identity is derived server-side from that cookie; the
/// client never sends user, tenant or branch ids on reads. GETs are the only
/// retried requests (shared retry interceptor); callers pass a [CancelToken]
/// (via [RequestCanceller]) for per-screen cancellation.
///
/// Verified endpoints (read-only inspection of `services/api/src`):
/// - `GET /api/teacher/workspace` — home, timetable source, leave list,
///   stamps, stats (`routes/teacher.ts`; `/dashboard` 307-redirects here).
/// - `POST /api/leaves/request` — leave submit (`routes/leaves.ts`).
/// - `POST /api/attendance/in|out` — geo-attendance stamps; the server
///   re-validates GPS accuracy, branch geofence and pending daily updates
///   and is authoritative (`routes/attendance.ts`).
/// - `POST /api/teacher/session/:sessionId/update` — daily lesson update
///   (`routes/teacher.ts`).
///
/// Missing (no dedicated endpoint; surfaced via workspace instead):
/// - standalone leave-status list, standalone timetable feed, geo-config
///   feed. TODO when the backend adds them.
/// Failures surface as typed [ApiException]s — never demo data.
library;

import 'package:dio/dio.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/network/api_exception.dart';

import '../models/teacher_portal_dto.dart';

class TeacherPortalRepository {
  TeacherPortalRepository({Dio? dio}) : _dio = dio ?? ApiClient.instance.dio;

  final Dio _dio;

  static const String workspacePath = '/api/teacher/workspace';
  static const String leaveRequestPath = '/api/leaves/request';
  static const String geoInPath = '/api/attendance/in';
  static const String geoOutPath = '/api/attendance/out';
  static String sessionUpdatePath(String sessionId) =>
      '/api/teacher/session/$sessionId/update';
  static String classAttendancePath(String classId) =>
      '/api/teacher/class/$classId/attendance';

  Future<List<TeacherMessageContact>> fetchMessageContacts() async {
    try {
      final response =
          await _dio.get<dynamic>('/api/communication/messages/contacts');
      final rows = response.data is Map<String, dynamic>
          ? response.data['contacts']
          : null;
      if (rows is! List)
        throw const ApiException(
            kind: ApiErrorKind.unknown,
            message: 'Message contacts returned an unexpected response.');
      return [
        for (final row in rows)
          if (row is Map<String, dynamic>) TeacherMessageContact.fromJson(row)
      ];
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  Future<List<TeacherMessageItem>> fetchMessageThread(
      TeacherMessageContact contact) async {
    try {
      final response = await _dio.get<dynamic>(
          '/api/communication/messages/thread/${Uri.encodeComponent(contact.studentId)}',
          queryParameters: {'teacherId': contact.parentId});
      final rows = response.data is Map<String, dynamic>
          ? response.data['messages']
          : null;
      if (rows is! List)
        throw const ApiException(
            kind: ApiErrorKind.unknown,
            message: 'Conversation returned an unexpected response.');
      return [
        for (final row in rows)
          if (row is Map<String, dynamic>) TeacherMessageItem.fromJson(row)
      ];
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  Future<void> sendMessage(TeacherMessageContact contact, String text) async {
    try {
      await _dio.post<dynamic>('/api/communication/messages', data: {
        'studentId': contact.studentId,
        'receiverId': contact.parentId,
        'messageText': text.trim()
      });
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  Future<List<TeacherAcademicEvent>> fetchCalendar() async {
    try {
      final response = await _dio.get<dynamic>('/api/academic-events',
          queryParameters: {'viewerRole': 'Teacher'});
      final events = response.data is Map<String, dynamic>
          ? response.data['events']
          : null;
      if (events is! List)
        throw const ApiException(
            kind: ApiErrorKind.unknown,
            message: 'The academic calendar returned an unexpected response.');
      return [
        for (final item in events)
          if (item is Map<String, dynamic>) TeacherAcademicEvent.fromJson(item)
      ];
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  Future<void> createHomework(
      {required String classId,
      required String subject,
      required String title,
      required String description,
      required String? contentUrl,
      required DateTime deadline}) async {
    try {
      await _dio.post<dynamic>('/api/homework', data: {
        'classId': classId,
        'subject': subject,
        'title': title,
        'description': description,
        'contentUrl': contentUrl,
        'deadline': deadline.toIso8601String()
      });
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  Future<void> updateTopicProgress(
      {required String syllabusId,
      required String topicId,
      required String status,
      String? notes}) async {
    try {
      await _dio
          .post<dynamic>('/api/teacher/syllabus/$syllabusId/topic-log', data: {
        'topicId': topicId,
        'status': status,
        'notes': notes,
        'logDate': _dateOnly(DateTime.now())
      });
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  Future<void> createSyllabus(
      {required String classId,
      required String subject,
      required List<String> chapters}) async {
    try {
      await _dio.post<dynamic>('/api/teacher/syllabus',
          data: {'classId': classId, 'subject': subject, 'chapters': chapters});
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  Future<void> updateSyllabus(
      {required String syllabusId,
      required String subject,
      required List<Map<String, String?>> chapters}) async {
    try {
      await _dio.patch<dynamic>('/api/teacher/syllabus/$syllabusId',
          data: {'subject': subject, 'chapters': chapters});
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  Future<void> createSyllabusTopic(
      {required String syllabusId,
      required String chapterId,
      required String title}) async {
    try {
      await _dio.post<dynamic>('/api/teacher/syllabus/$syllabusId/topics',
          data: {'chapterId': chapterId, 'title': title});
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  Future<List<String>> saveResultDraft(
      {required TeacherResultDefinition definition,
      required String classId,
      required double maximum,
      required double passMarks,
      required List<Map<String, dynamic>> marks}) async {
    try {
      final response = await _dio.post<dynamic>('/api/teacher/results', data: {
        'classId': classId,
        'resultDefinitionId': definition.id,
        'subject': definition.subject,
        'assessment': definition.title,
        'maximum': maximum,
        'passMarks': passMarks,
        'testDate': definition.testDate.toIso8601String(),
        'marks': marks
      });
      final ids = response.data is Map<String, dynamic>
          ? response.data['resultIds']
          : null;
      if (ids is! List)
        throw const ApiException(
            kind: ApiErrorKind.unknown,
            message: 'The result draft returned an unexpected response.');
      return ids.map((id) => id.toString()).toList();
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  Future<void> publishResults(List<String> resultIds) async {
    try {
      await _dio.post<dynamic>('/api/teacher/results/share',
          data: {'resultIds': resultIds});
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  /// Consolidated workspace payload (home + timetable source + leaves).
  Future<TeacherWorkspace> fetchWorkspace({CancelToken? cancelToken}) async {
    try {
      final response =
          await _dio.get<dynamic>(workspacePath, cancelToken: cancelToken);
      final body = response.data;
      if (body is! Map<String, dynamic>) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'The teacher workspace returned an unexpected response.',
        );
      }
      return TeacherWorkspace.fromJson(body);
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  /// Submits a leave request. Status is read back from the workspace
  /// `leaves` array (no standalone status endpoint exists).
  Future<TeacherLeaveEntry> submitLeave({
    required String branchId,
    required String leaveType,
    required DateTime startDate,
    required DateTime endDate,
    required String reason,
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _dio.post<dynamic>(
        leaveRequestPath,
        data: {
          'branchId': branchId,
          'leaveType': leaveType,
          'startDate': startDate.toIso8601String(),
          'endDate': endDate.toIso8601String(),
          'reason': reason,
        },
        cancelToken: cancelToken,
      );
      final body = response.data;
      final leave = body is Map<String, dynamic> ? body['leave'] : null;
      if (leave is! Map<String, dynamic>) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'The leave request returned an unexpected response.',
        );
      }
      return TeacherLeaveEntry.fromJson(leave);
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  /// Marks geo-attendance IN. Client coordinates are UX hints only; the
  /// server re-validates the geofence and is authoritative for the record.
  Future<Map<String, dynamic>> markGeoIn({
    required String branchId,
    required double latitude,
    required double longitude,
    required double gpsAccuracy,
    CancelToken? cancelToken,
  }) async {
    return _geoStamp(
      path: geoInPath,
      branchId: branchId,
      latitude: latitude,
      longitude: longitude,
      gpsAccuracy: gpsAccuracy,
      cancelToken: cancelToken,
    );
  }

  /// Marks geo-attendance OUT (same authority rules as [markGeoIn]).
  Future<Map<String, dynamic>> markGeoOut({
    required String branchId,
    required double latitude,
    required double longitude,
    required double gpsAccuracy,
    CancelToken? cancelToken,
  }) async {
    return _geoStamp(
      path: geoOutPath,
      branchId: branchId,
      latitude: latitude,
      longitude: longitude,
      gpsAccuracy: gpsAccuracy,
      cancelToken: cancelToken,
    );
  }

  Future<Map<String, dynamic>> _geoStamp({
    required String path,
    required String branchId,
    required double latitude,
    required double longitude,
    required double gpsAccuracy,
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _dio.post<dynamic>(
        path,
        data: {
          'branchId': branchId,
          'latitude': latitude,
          'longitude': longitude,
          'gpsAccuracy': gpsAccuracy,
        },
        cancelToken: cancelToken,
      );
      final body = response.data;
      if (body is! Map<String, dynamic>) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'Attendance marking returned an unexpected response.',
        );
      }
      return body;
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  /// Submits the daily lesson update for a session.
  Future<void> submitSessionUpdate({
    required String sessionId,
    required String updateContent,
    CancelToken? cancelToken,
  }) async {
    try {
      await _dio.post<dynamic>(
        sessionUpdatePath(sessionId),
        data: {'updateContent': updateContent},
        cancelToken: cancelToken,
      );
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  /// Saves the authenticated teacher's attendance for an assigned class.
  /// The server verifies today's date, teacher clock-in, enrollment, fees and
  /// approved leave before it writes any student record.
  Future<void> saveClassAttendance({
    required String classId,
    required DateTime date,
    required Map<String, String> records,
    CancelToken? cancelToken,
  }) async {
    try {
      await _dio.post<dynamic>(
        classAttendancePath(classId),
        data: {
          'date': _dateOnly(date),
          'records': [
            for (final entry in records.entries)
              {'studentId': entry.key, 'status': entry.value},
          ],
        },
        cancelToken: cancelToken,
      );
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  static String _dateOnly(DateTime value) {
    final local = value.toLocal();
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    return '${local.year}-$month-$day';
  }

  static ApiException _typed(DioException error) {
    final typed = error.error;
    if (typed is ApiException) return typed;
    return ApiException.fromDioException(error);
  }
}
