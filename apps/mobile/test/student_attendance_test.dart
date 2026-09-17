// MOB-102 tests: student attendance viewmodel (session record +
// approved-leave explanations) with a stubbed transport.
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/features/student/data/student_academics_repository.dart';
import 'package:tms_mobile/features/student/models/student_academics_api.dart';
import 'package:tms_mobile/features/student/viewmodels/student_attendance_viewmodel.dart';

import 'student_academics_test.dart' show portalJson, stubPortal, stubFailure;

Dio stubAttendancePortal() => stubPortal(
      body: portalJson(homeworkCount: 2),
    );

class _SequencedAttendanceRepository extends StudentAcademicsRepository {
  _SequencedAttendanceRepository(this.snapshots) : super(dio: Dio());

  final List<StudentPortalSnapshot> snapshots;
  var calls = 0;

  @override
  Future<StudentPortalSnapshot> fetchPortal({CancelToken? cancelToken}) async {
    final index = calls++;
    return snapshots[index.clamp(0, snapshots.length - 1)];
  }
}

void main() {
  group('StudentAttendanceViewModel', () {
    test('loads records, counts, and leave explanations', () async {
      final container = ProviderContainer(
        overrides: [
          studentAttendanceViewModelProvider.overrideWith(
            (ref) => StudentAttendanceViewModel(
              repository:
                  StudentAcademicsRepository(dio: stubAttendancePortal()),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      await container.read(studentAttendanceViewModelProvider.notifier).load();
      final state = container.read(studentAttendanceViewModelProvider);

      expect(state.hasData, isTrue);
      expect(state.error, isNull);
      expect(state.records, hasLength(2));
      expect(state.presentCount, 2);
      expect(state.absentCount, 1);
      expect(state.excusedCount, 1);
      expect(state.attendanceRate, 0.5);
      // One excused session explained by the approved-leave decision.
      expect(state.explanations, hasLength(1));
      expect(state.explanations.single.leave, isNotNull);
      expect(
        state.explanations.single.leave!.title,
        'Leave approved',
      );
    });

    test('paginates the session record in pages of 20', () async {
      final attendance = [
        for (var i = 0; i < 45; i++)
          {
            'id': 'a$i',
            'date': '01 Sep 2026',
            'subject': 'Mathematics',
            'session': 'Class 7-A',
            'state': 'Present',
          },
      ];
      final body = portalJson(homeworkCount: 0)..['attendance'] = attendance;
      final container = ProviderContainer(
        overrides: [
          studentAttendanceViewModelProvider.overrideWith(
            (ref) => StudentAttendanceViewModel(
              repository: StudentAcademicsRepository(
                dio: stubPortal(body: body),
              ),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      final viewModel =
          container.read(studentAttendanceViewModelProvider.notifier);
      await viewModel.load();

      var state = container.read(studentAttendanceViewModelProvider);
      expect(state.pagedRecords, hasLength(20));
      expect(state.hasMore, isTrue);

      viewModel.loadMore();
      state = container.read(studentAttendanceViewModelProvider);
      expect(state.pagedRecords, hasLength(40));

      viewModel.loadMore();
      state = container.read(studentAttendanceViewModelProvider);
      expect(state.pagedRecords, hasLength(45));
      expect(state.hasMore, isFalse);
    });

    test('flags session expiry on 401', () async {
      final container = ProviderContainer(
        overrides: [
          studentAttendanceViewModelProvider.overrideWith(
            (ref) => StudentAttendanceViewModel(
              repository: StudentAcademicsRepository(dio: stubFailure(401)),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      await container.read(studentAttendanceViewModelProvider.notifier).load();
      final state = container.read(studentAttendanceViewModelProvider);
      expect(state.sessionExpired, isTrue);
      expect(state.hasData, isFalse);
    });

    test('refresh replaces stale attendance with the latest API snapshot',
        () async {
      final first = portalJson(homeworkCount: 0)
        ..['studentProfile'] = {
          'enrollmentId': 'stu-1',
          'attendanceCounts': {'present': 0, 'absent': 1, 'excused': 0},
        }
        ..['attendance'] = [
          {
            'id': 'old-attendance',
            'date': '14 Sep 2026',
            'subject': 'Tenant A Mathematics',
            'session': 'Class 10 Mathematics Updated',
            'state': 'Absent',
          },
        ];
      final second = portalJson(homeworkCount: 0)
        ..['studentProfile'] = {
          'enrollmentId': 'stu-1',
          'attendanceCounts': {'present': 1, 'absent': 0, 'excused': 0},
        }
        ..['attendance'] = [
          {
            'id': 'live-attendance',
            'date': '15 Sep 2026',
            'subject': 'Tenant A Mathematics',
            'session': 'Class 10 Mathematics Updated',
            'state': 'Present',
          },
        ];
      final repository = _SequencedAttendanceRepository([
        StudentPortalSnapshot.fromJson(first),
        StudentPortalSnapshot.fromJson(second),
      ]);
      final viewModel = StudentAttendanceViewModel(repository: repository);
      addTearDown(viewModel.dispose);

      await viewModel.load();
      expect(viewModel.state.records.single.id, 'old-attendance');
      expect(viewModel.state.absentCount, 1);

      await viewModel.refresh();

      expect(viewModel.state.records.single.id, 'live-attendance');
      expect(viewModel.state.records.single.isPresent, isTrue);
      expect(viewModel.state.presentCount, 1);
      expect(viewModel.state.absentCount, 0);
      expect(viewModel.state.attendanceRate, 1.0);
    });
  });
}
