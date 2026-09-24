// MOB-104 tests: digital-ID status/expiry rules, calendar kind filtering,
// notifications read/unread lifecycle — all against stubbed
// `GET /api/users/me/student-portal` payloads shaped like
// `services/api/src/routes/users.ts` (no network).
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/features/student/data/student_id_calendar_notifications_repository.dart';
import 'package:tms_mobile/features/student/data/student_portal_repository.dart';
import 'package:tms_mobile/features/student/models/student_portal_dto.dart';
import 'package:tms_mobile/features/student/viewmodels/student_calendar_viewmodel.dart';
import 'package:tms_mobile/features/student/viewmodels/student_id_viewmodel.dart';
import 'package:tms_mobile/features/student/viewmodels/student_notifications_viewmodel.dart';

Map<String, dynamic> portalPayload({
  bool blocked = false,
  double outstanding = 0,
  List<Map<String, dynamic>>? events,
  List<Map<String, dynamic>>? notifications,
}) =>
    {
      'studentProfile': {
        'name': 'Aarav Sharma',
        'initials': 'AS',
        'institution': 'Test Academy',
        'grade': 'Grade 8',
        'branch': 'Baneshwor',
        'rollNumber': 'ABC123',
        'enrollmentId': 'stu-1',
        'academicYear': '2026/27',
        'blocked': blocked,
        'outstanding': outstanding,
        'attendanceRate': 90,
      },
      'events': events ??
          [
            {
              'id': 'ev-1',
              'date': '10 Oct 2026',
              'day': '10',
              'month': 'OCT',
              'title': 'Dashain break',
              'kind': 'Holiday',
              'details': 'School closed.',
            },
            {
              'id': 'ev-2',
              'date': '20 Oct 2026',
              'day': '20',
              'month': 'OCT',
              'title': 'Unit test week',
              'kind': 'Exam',
              'details': 'Maths and Science.',
            },
          ],
      'notifications': notifications ??
          [
            {
              'id': 'invoice-inv-1',
              'title': 'Fee due soon',
              'message': 'NPR 4,500 is due on 1 Oct 2026.',
              'time': '1 Sep 2026',
              'destination': '/student/fees',
              'unread': true,
            },
            {
              'id': 'homework-hw-1',
              'title': 'Homework assigned',
              'message': 'Maths homework is due 2 Oct 2026.',
              'time': '20 Aug 2026',
              'destination': '/student/homework',
              'unread': false,
            },
          ],
    };

StudentIdCalendarNotificationsRepository stubRepository(
  Map<String, dynamic> portal,
) {
  final dio = ApiClient.buildDio(
    baseUrl: 'https://test.invalid',
    extraInterceptors: [
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path == StudentPortalRepository.portalPath) {
            handler.resolve(Response<dynamic>(
              requestOptions: options,
              statusCode: 200,
              data: portal,
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
  );
}

Future<void> pumpSettled() =>
    Future<void>.delayed(const Duration(milliseconds: 50));

void main() {
  group('digital ID status/expiry rules', () {
    test('active card shows academic-year validity, never an invented date',
        () async {
      final vm = StudentIdViewModel(
        repository: stubRepository(portalPayload()),
      );
      await pumpSettled();
      final card = vm.state.card!;
      expect(card.status, StudentIdStatus.active);
      expect(card.isSuspended, isFalse);
      expect(card.validityLabel, contains('2026/27'));
      expect(card.validityLabel, contains('actively enrolled'));
      expect(card.validityLabel, isNot(contains('2027-03-31')));
      vm.dispose();
    });

    test('blocked profile suspends the ID', () async {
      final vm = StudentIdViewModel(
        repository: stubRepository(portalPayload(blocked: true)),
      );
      await pumpSettled();
      final card = vm.state.card!;
      expect(card.status, StudentIdStatus.suspended);
      expect(card.isSuspended, isTrue);
      expect(card.statusReason, contains('Suspended'));
      vm.dispose();
    });

    test('outstanding dues keep the card active with a dues notice', () async {
      final vm = StudentIdViewModel(
        repository: stubRepository(portalPayload(outstanding: 4500)),
      );
      await pumpSettled();
      final card = vm.state.card!;
      expect(card.status, StudentIdStatus.active);
      expect(card.statusReason, contains('4500'));
      vm.dispose();
    });

    test('buildIdCard is a pure function of the live profile', () {
      const blocked = PortalProfile(
        name: 'S',
        initials: 'S',
        institution: '',
        grade: 'G',
        branch: 'B',
        rollNumber: 'R',
        enrollmentId: 'E',
        academicYear: '2026/27',
        blocked: true,
        outstanding: 0,
        attendanceRate: null,
      );
      expect(buildIdCard(blocked).isSuspended, isTrue);
    });
  });

  group('calendar event filtering', () {
    test('kinds come from the live payload and filter the list', () async {
      final vm = StudentCalendarViewModel(
        repository: stubRepository(portalPayload()),
      );
      await pumpSettled();
      expect(vm.state.events, hasLength(2));
      expect(vm.state.kinds, containsAll(['Holiday', 'Exam']));

      vm.selectKind('Exam');
      expect(vm.state.visible, hasLength(1));
      expect(vm.state.visible.first.title, 'Unit test week');

      vm.selectKind('All');
      expect(vm.state.visible, hasLength(2));
      vm.dispose();
    });

    test('empty portal events surface an empty state', () async {
      final vm = StudentCalendarViewModel(
        repository: stubRepository(
          portalPayload(events: [], notifications: []),
        ),
      );
      await pumpSettled();
      expect(vm.state.isEmpty, isTrue);
      expect(vm.state.visible, isEmpty);
      vm.dispose();
    });
  });

  group('notifications inbox lifecycle', () {
    test('unread count follows the server flag', () async {
      final vm = StudentNotificationsViewModel(
        repository: stubRepository(portalPayload()),
      );
      await pumpSettled();
      expect(vm.state.notices, hasLength(2));
      expect(vm.state.unreadCount, 1);
      vm.dispose();
    });

    test('markRead and markAllRead clear the unread badge locally', () async {
      final vm = StudentNotificationsViewModel(
        repository: stubRepository(portalPayload()),
      );
      await pumpSettled();
      vm.markRead('invoice-inv-1');
      expect(vm.state.unreadCount, 0);

      final vm2 = StudentNotificationsViewModel(
        repository: stubRepository(portalPayload()),
      );
      await pumpSettled();
      expect(vm2.state.unreadCount, 1);
      vm2.markAllRead();
      expect(vm2.state.unreadCount, 0);
      vm.dispose();
      vm2.dispose();
    });

    test('unread-only filter hides read notices', () async {
      final vm = StudentNotificationsViewModel(
        repository: stubRepository(portalPayload()),
      );
      await pumpSettled();
      vm.setUnreadOnly(true);
      expect(vm.state.visible, hasLength(1));
      expect(vm.state.visible.first.raw.id, 'invoice-inv-1');
      vm.setUnreadOnly(false);
      expect(vm.state.visible, hasLength(2));
      vm.dispose();
    });

    test('reload keeps locally-read ids marked read', () async {
      final vm = StudentNotificationsViewModel(
        repository: stubRepository(portalPayload()),
      );
      await pumpSettled();
      vm.markRead('invoice-inv-1');
      await vm.load();
      await pumpSettled();
      expect(vm.state.unreadCount, 0);
      vm.dispose();
    });
  });
}
