/// Repository backing the student digital ID, calendar and notifications
/// inbox screens (MOB-104).
///
/// All data comes from the single authenticated
/// `GET /api/users/me/student-portal` call via [StudentPortalRepository]
/// (identity from the Better Auth session cookie; the client never sends
/// user/tenant/branch ids; GET-only so the shared retry interceptor may
/// safely retry). Reuses the sibling-owned portal repository — no duplicate
/// endpoints or DTOs.
///
/// Verified in `services/api/src` (read-only):
/// - Wired: `GET /api/users/me/student-portal` (`routes/users.ts`) carries
///   `studentProfile` (ID), `events` (calendar) and derived `notifications`.
/// - Missing: no dedicated digital-ID endpoint, no standalone calendar
///   endpoint, and no notification mark-read endpoint — read state is local
///   (see the notifications ViewModel TODO). Missing surface as typed
///   [ApiException]s, never demo data.
library;

import 'package:dio/dio.dart';

import 'package:tms_mobile/core/network/api_exception.dart';

import '../models/student_portal_dto.dart';
import 'student_portal_repository.dart';

/// Status of the digital ID, derived from live scoped server data.
///
/// Rules:
/// - [suspended] when the server flags the profile `blocked` (set when an
///   enrollment is `BLOCKED` or any invoice is `OVERDUE`).
/// - [active] otherwise; unpaid dues are surfaced as a notice, not a block.
enum StudentIdStatus { active, suspended }

/// Digital ID card derived from the live portal profile.
class StudentIdCard {
  const StudentIdCard({
    required this.profile,
    required this.status,
    required this.statusReason,
    required this.validityLabel,
  });

  /// Live scoped profile from the server (name, grade, branch, roll number,
  /// enrollment id, academic year, blocked flag, dues, attendance).
  final PortalProfile profile;

  final StudentIdStatus status;

  /// Human-readable reason for the current status.
  final String statusReason;

  /// Validity line. The backend sends `validUntil: 'While actively
  /// enrolled'` (no expiry date), so validity is the academic year bound to
  /// active enrollment — never an invented date.
  final String validityLabel;

  bool get isSuspended => status == StudentIdStatus.suspended;
}

StudentIdCard buildIdCard(PortalProfile profile) {
  if (profile.blocked) {
    return StudentIdCard(
      profile: profile,
      status: StudentIdStatus.suspended,
      statusReason:
          'Suspended — enrollment blocked or a fee is overdue. Contact the front office.',
      validityLabel:
          'AY ${profile.academicYear} · while actively enrolled (suspended)',
    );
  }
  final duesNote = profile.outstanding > 0
      ? ' · NPR ${profile.outstanding.toStringAsFixed(0)} dues pending'
      : '';
  return StudentIdCard(
    profile: profile,
    status: StudentIdStatus.active,
    statusReason: 'Active$duesNote',
    validityLabel: 'AY ${profile.academicYear} · while actively enrolled',
  );
}

class StudentIdCalendarNotificationsRepository {
  StudentIdCalendarNotificationsRepository({
    StudentPortalRepository? portalRepository,
    Dio? dio,
  })  : _portal = portalRepository ?? StudentPortalRepository(),
        _dio = dio;

  final StudentPortalRepository _portal;

  /// HTTP client for the persistent notification inbox
  /// (`GET /api/notifications`, mark-read posts). Null when the caller only
  /// wired the portal repository — persistent calls then fail fast with a
  /// typed [ApiException] so callers fall back to the portal-derived inbox
  /// without touching the network.
  final Dio? _dio;

  /// True when the persistent server inbox can be reached.
  bool get supportsPersistentInbox => _dio != null;

  Dio get _persistentDio {
    final dio = _dio;
    if (dio == null) {
      throw const ApiException(
        kind: ApiErrorKind.unknown,
        message: 'Persistent notifications are unavailable offline.',
      );
    }
    return dio;
  }

  Future<StudentIdCard> fetchIdCard({CancelToken? cancelToken}) async {
    final portal = await _portal.fetchPortal(cancelToken: cancelToken);
    return buildIdCard(portal.profile);
  }

  /// Portal calendar events (backend `academicEvent` rows scoped to the
  /// student's branches), sorted by day/month as received.
  Future<List<PortalEvent>> fetchEvents({CancelToken? cancelToken}) async {
    final portal = await _portal.fetchPortal(cancelToken: cancelToken);
    return List<PortalEvent>.unmodifiable(portal.events);
  }

  /// Derived inbox (fee, homework, result, attendance, leave and certificate
  /// notices, newest first as returned by the server).
  Future<List<PortalNotification>> fetchNotifications({
    CancelToken? cancelToken,
  }) async {
    final portal = await _portal.fetchPortal(cancelToken: cancelToken);
    return List<PortalNotification>.unmodifiable(portal.notifications);
  }

  /// Server-persisted inbox (`GET /api/notifications`, newest first).
  ///
  /// Identity comes from the Better Auth session cookie; the client never
  /// sends user/tenant ids. Throws a typed [ApiException] on failure so
  /// callers can fall back to [fetchNotifications].
  Future<PersistentNotificationPage> fetchPersistentNotifications({
    int page = 1,
    int pageSize = 20,
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _persistentDio.get<dynamic>(
        StudentNotificationsRepositoryPaths.list,
        queryParameters: {'page': page, 'pageSize': pageSize},
        cancelToken: cancelToken,
      );
      final body = response.data;
      if (body is! Map<String, dynamic>) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'Notifications returned an unexpected response.',
        );
      }
      return PersistentNotificationPage.fromJson(body);
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  /// Marks one server notification read
  /// (`POST /api/notifications/:id/read`).
  Future<void> markNotificationRead(
    String id, {
    CancelToken? cancelToken,
  }) async {
    try {
      await _persistentDio.post<dynamic>(
        StudentNotificationsRepositoryPaths.read(id),
        cancelToken: cancelToken,
      );
    } on DioException catch (error) {
      throw _typed(error);
    }
  }

  /// Marks every server notification read
  /// (`POST /api/notifications/read-all`). Returns the updated count.
  Future<int> markAllNotificationsRead({CancelToken? cancelToken}) async {
    try {
      final response = await _persistentDio.post<dynamic>(
        StudentNotificationsRepositoryPaths.readAll,
        cancelToken: cancelToken,
      );
      final body = response.data;
      final updated = body is Map<String, dynamic> ? body['updated'] : null;
      return updated is int ? updated : 0;
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

/// Endpoint paths for the persistent notification inbox.
///
/// Identity is derived server-side from the session cookie; no path or
/// query parameter carries user/tenant/branch ids.
abstract final class StudentNotificationsRepositoryPaths {
  static const String list = '/api/notifications';

  static String read(String id) => '/api/notifications/$id/read';

  static const String readAll = '/api/notifications/read-all';
}

/// One server-persisted notification record.
class PersistentNotification {
  const PersistentNotification({
    required this.id,
    required this.category,
    required this.title,
    required this.body,
    required this.destination,
    this.entityId,
    required this.unread,
    required this.createdAt,
  });

  factory PersistentNotification.fromJson(Map<String, dynamic> json) =>
      PersistentNotification(
        id: '${json['id'] ?? ''}',
        category: '${json['category'] ?? 'GENERAL'}',
        title: '${json['title'] ?? ''}',
        body: '${json['body'] ?? json['message'] ?? ''}',
        destination: '${json['destination'] ?? ''}',
        entityId: json['entityId'] == null ? null : '${json['entityId']}',
        unread: json['readAt'] == null && json['unread'] != false,
        createdAt: '${json['createdAt'] ?? json['time'] ?? ''}',
      );

  final String id;
  final String category;
  final String title;
  final String body;
  final String destination;
  final String? entityId;
  final bool unread;
  final String createdAt;

  /// Portal-shaped row so the inbox ViewModel can render server records
  /// with the same read-state lifecycle as derived notices.
  PortalNotification toPortalNotification() => PortalNotification(
        id: id,
        title: title,
        message: body,
        time: createdAt,
        destination: destination,
        unread: unread,
      );
}

/// One page of the server-persisted inbox.
class PersistentNotificationPage {
  const PersistentNotificationPage({
    required this.items,
    required this.page,
    required this.pageSize,
    required this.total,
    required this.unreadCount,
  });

  factory PersistentNotificationPage.fromJson(Map<String, dynamic> json) {
    final raw = json['notifications'];
    return PersistentNotificationPage(
      items: [
        for (final item in raw is List ? raw : const [])
          if (item is Map<String, dynamic>)
            PersistentNotification.fromJson(item),
      ],
      page: json['page'] is int ? json['page'] as int : 1,
      pageSize: json['pageSize'] is int ? json['pageSize'] as int : 20,
      total: json['total'] is int ? json['total'] as int : 0,
      unreadCount: json['unreadCount'] is int ? json['unreadCount'] as int : 0,
    );
  }

  final List<PersistentNotification> items;
  final int page;
  final int pageSize;
  final int total;
  final int unreadCount;
}
