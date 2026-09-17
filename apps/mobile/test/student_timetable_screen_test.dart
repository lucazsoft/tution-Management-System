import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/sync/sync.dart';
import 'package:tms_mobile/features/student/data/student_portal_repository.dart';
import 'package:tms_mobile/features/student/models/student_portal_dto.dart';
import 'package:tms_mobile/features/student/screens/student_timetable_screen.dart';
import 'package:tms_mobile/features/student/viewmodels/student_timetable_viewmodel.dart';

Map<String, dynamic> _portalJson() => {
      'studentProfile': {
        'name': 'Aarav Sharma',
        'initials': 'AS',
        'institution': 'Test Academy',
        'grade': 'Grade 8',
        'branch': 'Baneshwor',
        'rollNumber': 'ABC123',
        'enrollmentId': '',
        'academicYear': '2026/27',
        'blocked': false,
        'outstanding': 0,
        'attendanceRate': 75,
      },
      'todaySessions': [
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
      'weeklySessions': [
        {
          'id': 'c1-0',
          'day': 'Monday',
          'time': '07:00',
          'endTime': '08:00',
          'subject': 'Mathematics',
          'teacher': 'Ms. Riya Gurung',
          'room': 'Room 2A',
          'className': 'Grade 8 - Morning',
          'type': 'Regular',
        },
        {
          'id': 'c3-0',
          'day': 'Wed',
          'time': '15:30',
          'endTime': '16:30',
          'subject': 'Science Revision',
          'teacher': 'Ms. Nima Sherpa',
          'room': 'Lab 1',
          'className': 'Grade 8 - Evening',
          'type': 'Short-Term',
        },
      ],
      'homework': const [],
      'results': const [],
      'insights': const [],
      'invoices': const [],
      'events': const [],
      'certificates': const [],
      'notifications': const [],
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

  @override
  Future<List<StudentClassSchedule>> fetchStudentTimetable(
    String studentId, {
    CancelToken? cancelToken,
  }) async =>
      const [];
}

class _SequencedPortalRepository extends StudentPortalRepository {
  _SequencedPortalRepository(this.portals) : super(dio: Dio());

  final List<StudentPortal> portals;
  var calls = 0;

  @override
  Future<StudentPortal> fetchPortal({CancelToken? cancelToken}) async {
    final index = calls++;
    return portals[index.clamp(0, portals.length - 1)];
  }

  @override
  Future<List<StudentClassSchedule>> fetchStudentTimetable(
    String studentId, {
    CancelToken? cancelToken,
  }) async =>
      const [];
}

Future<void> _pumpTimetable(
  WidgetTester tester,
  _FakePortalRepository fake,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        studentTimetableViewModelProvider.overrideWith(
          (ref) => StudentTimetableViewModel(repository: fake),
        ),
        connectivityMonitorProvider.overrideWith(
          (ref) => ConnectivityMonitor(
            check: () async => true,
            autostart: false,
          ),
        ),
      ],
      child: const MaterialApp(home: StudentTimetableScreen()),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  group('StudentTimetableScreen', () {
    testWidgets('renders weekly day tabs with course-type pills',
        (tester) async {
      final fake = _FakePortalRepository()
        ..portalToReturn = StudentPortal.fromJson(_portalJson());
      await _pumpTimetable(tester, fake);

      expect(find.text('Monday'), findsOneWidget);
      expect(find.text('Wednesday'), findsOneWidget);
      expect(find.text('1 session scheduled for today.'), findsOneWidget);

      // Switch to the Wednesday tab to see the short-term session.
      await tester.tap(find.text('Wednesday'));
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.text('Science Revision'), findsOneWidget);
      expect(find.text('Short-Term'), findsOneWidget);
    });

    testWidgets('shows empty state when no classes are scheduled',
        (tester) async {
      final body = _portalJson()
        ..['weeklySessions'] = []
        ..['todaySessions'] = [];
      final fake = _FakePortalRepository()
        ..portalToReturn = StudentPortal.fromJson(body);
      await _pumpTimetable(tester, fake);

      expect(find.text('No timetable yet'), findsOneWidget);
    });

    testWidgets('shows error state and retries on tap', (tester) async {
      final fake = _FakePortalRepository()
        ..errorToThrow = const ApiException(
          kind: ApiErrorKind.server,
          message: 'Failed to load the student portal.',
        );
      await _pumpTimetable(tester, fake);

      expect(find.text('Could not load the timetable'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      await tester.pump(const Duration(milliseconds: 100));
      expect(fake.loadCount, 2);
    });

    testWidgets('shows offline state on connection failure', (tester) async {
      final fake = _FakePortalRepository()
        ..errorToThrow = const ApiException(
          kind: ApiErrorKind.noConnection,
          message: 'No internet connection.',
        );
      await _pumpTimetable(tester, fake);

      expect(find.text('You are offline'), findsOneWidget);
    });

    test('refresh adds newly enrolled class sessions from API snapshot',
        () async {
      final before = _portalJson()
        ..['todaySessions'] = []
        ..['weeklySessions'] = [];
      final after = _portalJson()
        ..['todaySessions'] = [
          {
            'id': 'enrollment-class-0',
            'time': '16:30',
            'endTime': '17:30',
            'subject': 'Enrollment Sync Music',
            'teacher': 'Teacher Integration',
            'room': 'Enrollment Sync Music Class',
            'type': 'Music',
          },
        ]
        ..['weeklySessions'] = [
          {
            'id': 'enrollment-class-0',
            'day': 'Tuesday',
            'time': '16:30',
            'endTime': '17:30',
            'subject': 'Enrollment Sync Music',
            'teacher': 'Teacher Integration',
            'room': 'Enrollment Sync Music Class',
            'className': 'Enrollment Sync Music Class',
            'type': 'Music',
          },
        ];
      final viewModel = StudentTimetableViewModel(
        repository: _SequencedPortalRepository([
          StudentPortal.fromJson(before),
          StudentPortal.fromJson(after),
        ]),
      );
      addTearDown(viewModel.dispose);
      await Future<void>.delayed(Duration.zero);

      expect(viewModel.state.hasData, isFalse);

      await viewModel.refresh();

      expect(viewModel.state.todaySessions.single.subject,
          'Enrollment Sync Music');
      expect(
          viewModel.state.todaySessions.single.teacher, 'Teacher Integration');
      expect(viewModel.state.days.single.sessions.single.subject,
          'Enrollment Sync Music');
      expect(viewModel.state.days.single.sessions.single.typeLabel, 'Music');
    });

    test('refresh removes dropped class sessions from API snapshot', () async {
      final before = _portalJson()
        ..['todaySessions'] = [
          {
            'id': 'enrollment-class-0',
            'time': '16:30',
            'endTime': '17:30',
            'subject': 'Enrollment Sync Music',
            'teacher': 'Teacher Integration',
            'room': 'Enrollment Sync Music Class',
            'type': 'Music',
          },
        ]
        ..['weeklySessions'] = [
          {
            'id': 'enrollment-class-0',
            'day': 'Tuesday',
            'time': '16:30',
            'endTime': '17:30',
            'subject': 'Enrollment Sync Music',
            'teacher': 'Teacher Integration',
            'room': 'Enrollment Sync Music Class',
            'className': 'Enrollment Sync Music Class',
            'type': 'Music',
          },
        ];
      final after = _portalJson()
        ..['todaySessions'] = []
        ..['weeklySessions'] = [];
      final viewModel = StudentTimetableViewModel(
        repository: _SequencedPortalRepository([
          StudentPortal.fromJson(before),
          StudentPortal.fromJson(after),
        ]),
      );
      addTearDown(viewModel.dispose);
      await Future<void>.delayed(Duration.zero);

      expect(viewModel.state.todaySessions.single.subject,
          'Enrollment Sync Music');
      expect(viewModel.state.days.single.sessions.single.subject,
          'Enrollment Sync Music');

      await viewModel.refresh();

      expect(viewModel.state.todaySessions, isEmpty);
      expect(viewModel.state.days, isEmpty);
    });

    test('refresh replaces a moved class with its destination session',
        () async {
      final before = _portalJson()
        ..['todaySessions'] = [
          {
            'id': 'source-class-0',
            'time': '16:30',
            'endTime': '17:30',
            'subject': 'Enrollment Sync Music',
            'teacher': 'Teacher Integration',
            'room': 'Enrollment Sync Music Class',
            'type': 'Music',
          },
        ]
        ..['weeklySessions'] = [
          {
            'id': 'source-class-0',
            'day': 'Tuesday',
            'time': '16:30',
            'endTime': '17:30',
            'subject': 'Enrollment Sync Music',
            'teacher': 'Teacher Integration',
            'room': 'Enrollment Sync Music Class',
            'className': 'Enrollment Sync Music Class',
            'type': 'Music',
          },
        ];
      final after = _portalJson()
        ..['todaySessions'] = [
          {
            'id': 'destination-class-0',
            'time': '18:00',
            'endTime': '19:00',
            'subject': 'Enrollment Sync Music',
            'teacher': 'Teacher Integration',
            'room': 'Enrollment Sync Music Destination Class',
            'type': 'Music',
          },
        ]
        ..['weeklySessions'] = [
          {
            'id': 'destination-class-0',
            'day': 'Tuesday',
            'time': '18:00',
            'endTime': '19:00',
            'subject': 'Enrollment Sync Music',
            'teacher': 'Teacher Integration',
            'room': 'Enrollment Sync Music Destination Class',
            'className': 'Enrollment Sync Music Destination Class',
            'type': 'Music',
          },
        ];
      final viewModel = StudentTimetableViewModel(
        repository: _SequencedPortalRepository([
          StudentPortal.fromJson(before),
          StudentPortal.fromJson(after),
        ]),
      );
      addTearDown(viewModel.dispose);
      await Future<void>.delayed(Duration.zero);

      expect(viewModel.state.todaySessions.single.id, 'source-class-0');

      await viewModel.refresh();

      expect(viewModel.state.todaySessions.single.id, 'destination-class-0');
      expect(viewModel.state.todaySessions.single.time, '18:00');
      expect(viewModel.state.days.single.sessions.single.id,
          'destination-class-0');
      expect(viewModel.state.days.single.sessions.single.room,
          'Enrollment Sync Music Destination Class');
    });
  });
}
