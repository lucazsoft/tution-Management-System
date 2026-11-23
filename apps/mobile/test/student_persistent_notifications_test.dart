// Persistent notification inbox tests (server-backed list + mark-read).
//
// Covers the repository methods on top of `GET /api/notifications`,
// `POST /api/notifications/:id/read` and `POST /api/notifications/read-all`
// (identity from the Better Auth session cookie; the client never sends
// user/tenant ids) plus the ViewModel server-persisted read state with a
// local optimistic fallback when the network fails. No network.
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/features/student/data/student_id_calendar_notifications_repository.dart';
import 'package:tms_mobile/features/student/data/student_portal_repository.dart';
import 'package:tms_mobile/features/student/viewmodels/student_notifications_viewmodel.dart';

Map<String, dynamic> recordsPayload() => {
      'notifications': [
        {
          'id': 'notif-1',
          'category': 'LEAVE',
          'title': 'Leave Request Update',
          'body': 'Your request has been approved.',
          'destination': 'leave',
          'entityId': 'leave-1',
          'readAt': null,
          'createdAt': '2026-09-10T00:00:00.000Z',
        },
        {
          'id': 'notif-2',
          'category': 'ATTENDANCE',
          'title': 'Attendance marked',
          'body': 'Marked IN at Baneshwor.',
          'destination': 'attendance',
          'entityId': null,
          'readAt': '2026-09-11T00:00:00.000Z',
          'createdAt': '2026-09-11T00:00:00.000Z',
        },
      ],
      'page': 1,
      'pageSize': 20,
      'total': 2,
      'unreadCount': 1,
    };

Map<String, dynamic> emptyPortal() => {
      'studentProfile': {
        'name': 'Aarav Sharma',
        'initials': 'AS',
        'institution': 'Test Academy',
        'grade': 'Grade 8',
        'branch': 'Baneshwor',
        'rollNumber': 'ABC123',
        'enrollmentId': 'stu-1',
        'academicYear': '2026/27',
        'blocked': false,
        'outstanding': 0,
        'attendanceRate': 90,
      },
      'events': [],
      'notifications': [],
    };

class RecordedCall {
  RecordedCall(this.method, this.path, {this.query});
  final String method;
  final String path;
  final Map<String, dynamic>? query;
}

StudentIdCalendarNotificationsRepository stubPersistentRepository(
  List<RecordedCall> calls, {
  Map<String, dynamic>? records,
  bool failMarkRead = false,
  List<Map<String, dynamic>> portalNotices = const [],
}) {
  final dio = ApiClient.buildDio(
    baseUrl: 'https://test.invalid',
    extraInterceptors: [
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path == StudentPortalRepository.portalPath) {
            handler.resolve(Response<dynamic>(
              requestOptions: options,
              statusCode: 200,
              data: {...emptyPortal(), 'notifications': portalNotices},
            ));
            return;
          }
          if (options.path == StudentNotificationsRepositoryPaths.list) {
            calls.add(RecordedCall(
              options.method,
              options.path,
              query: Map<String, dynamic>.from(options.queryParameters),
            ));
            handler.resolve(Response<dynamic>(
              requestOptions: options,
              statusCode: 200,
              data: records ?? recordsPayload(),
            ));
            return;
          }
          if (options.path.startsWith('/api/notifications/') || options.path == '/api/portal-notifications/read') {
            calls.add(RecordedCall(options.method, options.path));
            if (failMarkRead) {
              handler.reject(DioException(
                requestOptions: options,
                type: DioExceptionType.connectionError,
              ));
              return;
            }
            handler.resolve(Response<dynamic>(
              requestOptions: options,
              statusCode: 200,
              data: {'ok': true},
            ));
            return;
          }
          handler.next(options);
        },
      ),
    ],
  );
  return StudentIdCalendarNotificationsRepository(
    portalRepository: StudentPortalRepository(dio: dio),
    dio: dio,
  );
}

Future<void> pumpSettled() =>
    Future<void>.delayed(const Duration(milliseconds: 50));

void main() {
  group('persistent notifications repository', () {
    test('lists the server inbox paged without client identity ids', () async {
      final calls = <RecordedCall>[];
      final repository = stubPersistentRepository(calls);
      final page = await repository.fetchPersistentNotifications(
        page: 2,
        pageSize: 10,
      );
      expect(calls, hasLength(1));
      expect(calls.first.method, 'GET');
      expect(calls.first.path, '/api/notifications');
      expect(calls.first.query?['page'], anyOf(equals(2), equals('2')));
      expect(
        calls.first.query?.keys,
        isNot(contains(anyOf('userId', 'tenantId'))),
      );
      expect(page.items, hasLength(2));
      expect(page.total, 2);
      expect(page.unreadCount, 1);
      expect(page.items.first.unread, isTrue);
      expect(page.items.last.unread, isFalse);
    });

    test('mark-read posts to the scoped read endpoint', () async {
      final calls = <RecordedCall>[];
      final repository = stubPersistentRepository(calls);
      await repository.markNotificationRead('notif-1');
      expect(
        calls.any((call) =>
            call.method == 'POST' &&
            call.path == '/api/notifications/notif-1/read'),
        isTrue,
      );
    });

    test('mark-all-read posts to the scoped read-all endpoint', () async {
      final calls = <RecordedCall>[];
      final repository = stubPersistentRepository(calls);
      await repository.markAllNotificationsRead();
      expect(
        calls.any((call) =>
            call.method == 'POST' &&
            call.path == '/api/notifications/read-all'),
        isTrue,
      );
    });
  });

  test('student inbox preserves both sources and persists portal read to its original endpoint', () async {
    final calls = <RecordedCall>[];
    final vm = StudentNotificationsViewModel(repository: stubPersistentRepository(calls,
      portalNotices: [{'id': 'notif-1', 'title': 'Fee due', 'message': 'A portal alert',
        'time': '2026-11-22', 'destination': '/student/fees', 'unread': true}],
    ));
    await pumpSettled();
    expect(vm.state.notices.map((notice) => notice.source).toSet(),
      {NotificationSource.account, NotificationSource.portal});
    await vm.markRead('notif-1', source: NotificationSource.portal);
    expect(calls.any((call) => call.path == '/api/portal-notifications/read'), isTrue);
    expect(vm.state.notices.where((notice) => notice.source == NotificationSource.account).first.isRead, isFalse);
    vm.dispose();
  });

  group('notifications viewmodel server persistence', () {
    test('markRead persists server-side and keeps the badge cleared', () async {
      final calls = <RecordedCall>[];
      final vm = StudentNotificationsViewModel(
        repository: stubPersistentRepository(calls),
      );
      await pumpSettled();
      await vm.markRead('notif-1');
      await pumpSettled();
      expect(vm.state.unreadCount, 0);
      expect(
        calls.any((call) =>
            call.method == 'POST' &&
            call.path == '/api/notifications/notif-1/read'),
        isTrue,
      );
      vm.dispose();
    });

    test('markRead keeps the local fallback when the network fails', () async {
      final calls = <RecordedCall>[];
      final vm = StudentNotificationsViewModel(
        repository: stubPersistentRepository(calls, failMarkRead: true),
      );
      await pumpSettled();
      await vm.markRead('notif-1');
      await pumpSettled();
      expect(vm.state.unreadCount, 0);
      expect(vm.state.error, isNotNull);
      vm.dispose();
    });

    test('markAllRead persists server-side', () async {
      final calls = <RecordedCall>[];
      final vm = StudentNotificationsViewModel(
        repository: stubPersistentRepository(calls),
      );
      await pumpSettled();
      await vm.markAllRead();
      await pumpSettled();
      expect(vm.state.unreadCount, 0);
      expect(
        calls.any((call) =>
            call.method == 'POST' &&
            call.path == '/api/notifications/read-all'),
        isTrue,
      );
      vm.dispose();
    });
  });
}
