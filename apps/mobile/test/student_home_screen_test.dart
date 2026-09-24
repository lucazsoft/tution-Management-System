import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/sync/sync.dart';
import 'package:tms_mobile/features/student/data/student_portal_repository.dart';
import 'package:tms_mobile/features/student/models/student_portal_dto.dart';
import 'package:tms_mobile/features/student/screens/student_home_screen.dart';
import 'package:tms_mobile/features/student/viewmodels/student_home_viewmodel.dart';

Map<String, dynamic> _portalJson({bool emptyToday = false}) => {
      'studentProfile': {
        'name': 'Aarav Sharma',
        'initials': 'AS',
        'institution': 'Test Academy',
        'grade': 'Grade 8',
        'branch': 'Baneshwor',
        'rollNumber': 'ABC123',
        'enrollmentId': 'student-1',
        'academicYear': '2026/27',
        'blocked': false,
        'outstanding': 4500,
        'attendanceRate': 75,
      },
      'todaySessions': emptyToday
          ? []
          : [
              {
                'id': 'c1-0',
                'time': '07:00',
                'endTime': '08:00',
                'subject': 'Mathematics',
                'teacher': 'Ms. Riya Gurung',
                'room': 'Room 2A',
                'type': 'Regular',
              },
            ],
      'weeklySessions': const [],
      'homework': [
        {
          'id': 'hw-1',
          'subject': 'Mathematics',
          'title': 'Complete algebra worksheet 4',
          'teacher': 'Ms. Riya Gurung',
          'dueLabel': '7 Sep 2026',
          'urgency': 'soon',
          'completed': false,
        },
      ],
      'results': const [],
      'insights': const [],
      'invoices': [
        {
          'id': 'inv-1',
          'cycle': 'August 2026',
          'dueDate': '1 Aug 2026',
          'state': 'Overdue',
          'qrAvailable': true,
          'paymentReference': 'TMS-AUG-0812',
          'netPayable': 4500,
          'lines': const [],
        },
      ],
      'events': const [],
      'certificates': const [],
      'notifications': [
        {
          'id': 'n1',
          'title': 'Fee overdue',
          'message': 'NPR 4,500 is due.',
          'time': '5 Sep 2026',
          'destination': '/student/fees',
          'unread': true,
        },
      ],
    };

class _FakePortalRepository extends StudentPortalRepository {
  _FakePortalRepository() : super(dio: Dio());

  StudentPortal? portalToReturn;
  Object? errorToThrow;
  int loadCount = 0;

  @override
  Future<StudentPortal> fetchPortal({CancelToken? cancelToken}) async {
    loadCount++;
    final error = errorToThrow;
    if (error != null) throw error;
    return portalToReturn!;
  }
}

ConnectivityMonitor _onlineMonitor() =>
    ConnectivityMonitor(check: () async => true, autostart: false);

Future<void> _pumpHome(
  WidgetTester tester,
  _FakePortalRepository fake,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        studentHomeViewModelProvider.overrideWith(
          (ref) => StudentHomeViewModel(repository: fake),
        ),
        connectivityMonitorProvider.overrideWith((ref) => _onlineMonitor()),
      ],
      child: const MaterialApp(home: StudentHomeScreen()),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  group('StudentHomeScreen', () {
    testWidgets('shows loading indicator while the portal loads',
        (tester) async {
      final fake = _FakePortalRepository()
        ..portalToReturn = StudentPortal.fromJson(_portalJson());
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            studentHomeViewModelProvider.overrideWith(
              (ref) => StudentHomeViewModel(repository: fake),
            ),
            connectivityMonitorProvider.overrideWith(
              (ref) => _onlineMonitor(),
            ),
          ],
          child: const MaterialApp(home: StudentHomeScreen()),
        ),
      );
      // Constructor-triggered load is still in flight on the first frame.
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Namaste, Aarav'), findsOneWidget);
    });

    testWidgets('renders portal data with course-type pills', (tester) async {
      // Tall surface so the whole dashboard column is laid out at once.
      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      final fake = _FakePortalRepository()
        ..portalToReturn = StudentPortal.fromJson(_portalJson());
      await _pumpHome(tester, fake);

      expect(find.text('Namaste, Aarav'), findsOneWidget);
      expect(find.text('Grade 8 · Baneshwor'), findsOneWidget);
      expect(find.text('Mathematics'), findsOneWidget);
      expect(find.text('Regular'), findsOneWidget);
      expect(find.textContaining('4500'), findsWidgets);
      expect(find.text('Complete algebra worksheet 4'), findsOneWidget);
    });

    testWidgets('shows empty timetable message when nothing is scheduled',
        (tester) async {
      final fake = _FakePortalRepository()
        ..portalToReturn =
            StudentPortal.fromJson(_portalJson(emptyToday: true));
      await _pumpHome(tester, fake);

      expect(
        find.text('No sessions scheduled for today.'),
        findsOneWidget,
      );
    });

    testWidgets('shows denied state and retries on tap', (tester) async {
      final fake = _FakePortalRepository()
        ..errorToThrow = const ApiException(
          kind: ApiErrorKind.forbidden,
          message: 'You cannot view this portal.',
        );
      await _pumpHome(tester, fake);

      expect(find.text('Access denied'), findsOneWidget);
      await tester.tap(find.text('Try again'));
      await tester.pump(const Duration(milliseconds: 100));
      expect(fake.loadCount, 2);
    });

    testWidgets('shows offline state on connection failure', (tester) async {
      final fake = _FakePortalRepository()
        ..errorToThrow = const ApiException(
          kind: ApiErrorKind.noConnection,
          message: 'No internet connection.',
        );
      await _pumpHome(tester, fake);

      expect(find.text('You are offline'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}
