import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/sync/sync.dart';
import 'package:tms_mobile/features/teacher/data/teacher_portal_repository.dart';
import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';
import 'package:tms_mobile/features/teacher/screens/teacher_leave_screen.dart';
import 'package:tms_mobile/features/teacher/screens/teacher_home_screen.dart';
import 'package:tms_mobile/features/teacher/screens/teacher_learning_screens.dart';
import 'package:tms_mobile/features/teacher/screens/teacher_timetable_screen.dart';
import 'package:tms_mobile/features/teacher/viewmodels/geo_attendance_viewmodel.dart';
import 'package:tms_mobile/features/teacher/viewmodels/teacher_leave_viewmodel.dart';
import 'package:tms_mobile/features/teacher/viewmodels/teacher_portal_viewmodel.dart';
import 'package:tms_mobile/features/teacher/widgets/geo_radius_card.dart';

Map<String, dynamic> workspaceJson({
  List<Map<String, dynamic>>? leaves,
  List<Map<String, dynamic>>? pendingUpdates,
}) =>
    {
      'teacher': {
        'name': 'Aarati Shrestha',
        'designation': 'Senior Teacher',
        'branches': [
          {'id': 'branch-1', 'name': 'Baneshwor'},
        ],
      },
      'statistics': {'attendanceRate': 92, 'presentDays': 20},
      'attendance': {
        'checkedIn': true,
        'lastStampType': 'IN',
        'lastStampAt': '2026-09-06T03:15:00.000Z',
      },
      'todayClasses': [
        {
          'sessionId': 'session-1',
          'classId': 'class-1',
          'className': 'Grade 8 - A',
          'courseName': 'Mathematics',
          'branch': {'id': 'branch-1', 'name': 'Baneshwor'},
          'schedule': [
            {
              'day': 'Sunday',
              'startTime': '09:00',
              'endTime': '10:00',
              'subject': 'Algebra',
            },
          ],
          'status': 'PRESENT_UPDATE_PENDING',
          'dailyUpdateSubmitted': false,
        },
      ],
      'pendingUpdates': pendingUpdates ??
          [
            {
              'sessionId': 'session-1',
              'classId': 'class-1',
              'className': 'Grade 8 - A',
              'courseName': 'Mathematics',
              'date': '2026-09-05T00:00:00.000Z',
            },
          ],
      'classes': [
        {
          'id': 'class-1',
          'name': 'Grade 8 - A',
          'subject': 'Mathematics',
          'schedule': [
            {'day': 'Sun', 'startTime': '09:00', 'endTime': '10:00'},
            {'day': 'Wednesday', 'startTime': '11:00', 'endTime': '12:00'},
          ],
          'branch': {
            'id': 'branch-1',
            'name': 'Baneshwor',
            'address': 'Kathmandu',
            'radiusMeters': 125,
          },
          'students': [
            {'id': 'student-1', 'name': 'Aarya Rai', 'status': 'ACTIVE'},
            {'id': 'student-2', 'name': 'Bikash Lama', 'status': 'BLOCKED'},
          ],
          'attendance': [
            {
              'studentId': 'student-1',
              'status': 'PRESENT',
            },
            {
              'studentId': 'student-2',
              'status': 'EXCUSED',
            },
          ],
          'syllabi': [
            {
              'id': 'syllabus-1',
              'subject': 'Mathematics',
              'chapters': [
                {
                  'id': 'chapter-1',
                  'title': 'Algebra',
                  'status': 'IN_PROGRESS',
                  'topics': [
                    {
                      'id': 'topic-1',
                      'title': 'Linear equations',
                      'status': 'IN_PROGRESS',
                    },
                  ],
                },
              ],
            },
          ],
          'homework': [
            {
              'id': 'homework-1',
              'subject': 'Mathematics',
              'title': 'Exercise 4',
              'description': 'Complete all questions.',
              'deadline': '2026-09-12T00:00:00.000Z',
              'createdAt': '2026-09-06T00:00:00.000Z',
            },
          ],
        },
      ],
      'resultDefinitions': [
        {
          'id': 'result-definition-1',
          'classId': 'class-1',
          'title': 'First Term',
          'subject': 'Mathematics',
          'testDate': '2026-09-10T00:00:00.000Z',
        },
      ],
      'leaves': leaves ??
          [
            {
              'id': 'leave-1',
              'leaveType': 'CASUAL',
              'status': 'APPROVED_LEVEL1',
              'reason': 'Family event',
              'startDate': '2026-09-08T00:00:00.000Z',
              'endDate': '2026-09-09T00:00:00.000Z',
            },
          ],
      'stamps': [
        {
          'stampType': 'IN',
          'timestamp': '2026-09-06T03:15:00.000Z',
          'branchName': 'Baneshwor',
        },
      ],
    };

class _FakeRepository extends TeacherPortalRepository {
  _FakeRepository({
    required this.workspaces,
    this.submittedLeave,
  }) : super(dio: Dio());

  final List<TeacherWorkspace> workspaces;
  final TeacherLeaveEntry? submittedLeave;
  int fetchCount = 0;
  int geoMarkCount = 0;
  Map<String, Object?>? leaveRequest;
  Map<String, String>? sessionUpdateRequest;
  Map<String, Object?>? classAttendanceRequest;

  @override
  Future<TeacherWorkspace> fetchWorkspace({CancelToken? cancelToken}) async {
    final index =
        fetchCount < workspaces.length ? fetchCount : workspaces.length - 1;
    fetchCount += 1;
    return workspaces[index];
  }

  @override
  Future<TeacherLeaveEntry> submitLeave({
    required String branchId,
    required String leaveType,
    required DateTime startDate,
    required DateTime endDate,
    required String reason,
    CancelToken? cancelToken,
  }) async {
    leaveRequest = {
      'branchId': branchId,
      'leaveType': leaveType,
      'startDate': startDate,
      'endDate': endDate,
      'reason': reason,
    };
    return submittedLeave!;
  }

  @override
  Future<Map<String, dynamic>> markGeoIn({
    required String branchId,
    required double latitude,
    required double longitude,
    required double gpsAccuracy,
    CancelToken? cancelToken,
  }) async {
    geoMarkCount += 1;
    return {'message': 'Marked'};
  }

  @override
  Future<void> submitSessionUpdate({
    required String sessionId,
    required String updateContent,
    CancelToken? cancelToken,
  }) async {
    sessionUpdateRequest = {
      'sessionId': sessionId,
      'updateContent': updateContent,
    };
  }

  @override
  Future<void> saveClassAttendance({
    required String classId,
    required DateTime date,
    required Map<String, String> records,
    CancelToken? cancelToken,
  }) async {
    classAttendanceRequest = {
      'classId': classId,
      'date': date,
      'records': records,
    };
  }
}

class _DeferredRepository extends TeacherPortalRepository {
  _DeferredRepository() : super(dio: Dio());

  final requests = <Completer<TeacherWorkspace>>[];

  @override
  Future<TeacherWorkspace> fetchWorkspace({CancelToken? cancelToken}) {
    final request = Completer<TeacherWorkspace>();
    requests.add(request);
    return request.future;
  }
}

Future<void> _pumpWithRepository(
  WidgetTester tester,
  Widget child,
  _FakeRepository repository,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        teacherPortalViewModelProvider.overrideWith(
          (ref) => TeacherPortalViewModel(repository: repository),
        ),
        teacherLeaveViewModelProvider.overrideWith(
          (ref) => TeacherLeaveViewModel(repository: repository),
        ),
        connectivityMonitorProvider.overrideWith(
          (ref) => ConnectivityMonitor(
            check: () async => true,
            autostart: false,
          ),
        ),
      ],
      child: MaterialApp(home: child),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  group('TeacherPortalRepository', () {
    test('requests workspace and parses daily and weekly schedules', () async {
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              expect(options.method, 'GET');
              expect(options.path, TeacherPortalRepository.workspacePath);
              expect(options.queryParameters, isEmpty);
              handler.resolve(Response<dynamic>(
                requestOptions: options,
                statusCode: 200,
                data: workspaceJson(),
              ));
            },
          ),
        ],
      );

      final workspace =
          await TeacherPortalRepository(dio: dio).fetchWorkspace();

      expect(workspace.teacherName, 'Aarati Shrestha');
      expect(workspace.todayClasses.single.branchName, 'Baneshwor');
      expect(workspace.todayClasses.single.scheduleLabel, 'Sunday 09:00-10:00');
      expect(workspace.classes.single.slots, hasLength(2));
      expect(workspace.classes.single.isScheduledOn('Sun'), isTrue);
      expect(workspace.classes.single.isScheduledOn('Mon'), isFalse);
      expect(workspace.classes.single.branch!.radiusMeters, 125);
      expect(workspace.pendingUpdateCount, 1);
      expect(workspace.pendingUpdates.single.sessionId, 'session-1');
      expect(workspace.pendingUpdates.single.courseName, 'Mathematics');
      expect(workspace.leaves.single.isPending, isTrue);
      expect(workspace.classes.single.homework.single.title, 'Exercise 4');
      expect(
          workspace.classes.single.syllabi.single.chapters.single.topics.single
              .title,
          'Linear equations');
      expect(workspace.resultDefinitions.single.title, 'First Term');
    });

    test('submits the exact leave request body and parses returned status',
        () async {
      late RequestOptions captured;
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              captured = options;
              handler.resolve(Response<dynamic>(
                requestOptions: options,
                statusCode: 201,
                data: {
                  'leave': {
                    'id': 'leave-2',
                    'leaveType': 'SICK',
                    'status': 'PENDING',
                    'reason': 'Flu',
                    'startDate': '2026-09-10T00:00:00.000Z',
                    'endDate': '2026-09-11T00:00:00.000Z',
                  },
                },
              ));
            },
          ),
        ],
      );
      final start = DateTime.utc(2026, 9, 10);
      final end = DateTime.utc(2026, 9, 11);

      final leave = await TeacherPortalRepository(dio: dio).submitLeave(
        branchId: 'branch-1',
        leaveType: 'SICK',
        startDate: start,
        endDate: end,
        reason: 'Flu',
      );

      expect(captured.method, 'POST');
      expect(captured.path, TeacherPortalRepository.leaveRequestPath);
      expect(captured.data, {
        'branchId': 'branch-1',
        'leaveType': 'SICK',
        'startDate': start.toIso8601String(),
        'endDate': end.toIso8601String(),
        'reason': 'Flu',
      });
      expect(leave.id, 'leave-2');
      expect(leave.status, 'PENDING');
    });

    test('posts geo attendance coordinates without client identity fields',
        () async {
      late RequestOptions captured;
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              captured = options;
              handler.resolve(Response<dynamic>(
                requestOptions: options,
                statusCode: 200,
                data: {'message': 'Attendance marked.'},
              ));
            },
          ),
        ],
      );

      await TeacherPortalRepository(dio: dio).markGeoIn(
        branchId: 'branch-1',
        latitude: 27.7172,
        longitude: 85.3240,
        gpsAccuracy: 8,
      );

      expect(captured.method, 'POST');
      expect(captured.path, TeacherPortalRepository.geoInPath);
      expect(captured.data, {
        'branchId': 'branch-1',
        'latitude': 27.7172,
        'longitude': 85.3240,
        'gpsAccuracy': 8.0,
      });
      expect((captured.data as Map).keys, isNot(contains('userId')));
      expect((captured.data as Map).keys, isNot(contains('tenantId')));
    });

    test('posts class attendance with the assigned roster only', () async {
      late RequestOptions captured;
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              captured = options;
              handler.resolve(Response<dynamic>(
                requestOptions: options,
                statusCode: 200,
                data: {'message': 'Class attendance saved.'},
              ));
            },
          ),
        ],
      );

      await TeacherPortalRepository(dio: dio).saveClassAttendance(
        classId: 'class-1',
        date: DateTime(2026, 9, 14, 10),
        records: const {'student-1': 'PRESENT', 'student-2': 'ABSENT'},
      );

      expect(captured.method, 'POST');
      expect(captured.path,
          TeacherPortalRepository.classAttendancePath('class-1'));
      expect(captured.data, {
        'date': '2026-09-14',
        'records': [
          {'studentId': 'student-1', 'status': 'PRESENT'},
          {'studentId': 'student-2', 'status': 'ABSENT'},
        ],
      });
    });
  });

  group('teacher viewmodels', () {
    test('older workspace response cannot overwrite a newer refresh', () async {
      final repository = _DeferredRepository();
      final vm = TeacherPortalViewModel(repository: repository);
      expect(repository.requests, hasLength(1));

      final refresh = vm.refresh();
      expect(repository.requests, hasLength(2));
      final newer = TeacherWorkspace.fromJson(
        workspaceJson(pendingUpdates: []),
      );
      repository.requests[1].complete(newer);
      await refresh;
      repository.requests[0].complete(
        TeacherWorkspace.fromJson(workspaceJson()),
      );
      await Future<void>.delayed(Duration.zero);

      expect(vm.state.workspace, same(newer));
      vm.dispose();
    });

    test('portal load exposes workspace-backed daily and weekly data',
        () async {
      final workspace = TeacherWorkspace.fromJson(workspaceJson());
      final repository = _FakeRepository(workspaces: [workspace]);
      final vm = TeacherPortalViewModel(repository: repository);
      await Future<void>.delayed(Duration.zero);

      expect(vm.state.workspace, same(workspace));
      expect(vm.state.workspace!.todayClasses.single.sessionId, 'session-1');
      expect(vm.state.workspace!.classes.single.isScheduledOn('Wed'), isTrue);
      expect(vm.state.isLoading, isFalse);
      vm.dispose();
    });

    test('leave submit refreshes workspace so server status is authoritative',
        () async {
      final before = TeacherWorkspace.fromJson(workspaceJson(leaves: []));
      final submitted = TeacherLeaveEntry.fromJson({
        'id': 'leave-2',
        'leaveType': 'SICK',
        'status': 'PENDING',
      });
      final after = TeacherWorkspace.fromJson(workspaceJson(leaves: [
        {
          'id': 'leave-2',
          'leaveType': 'SICK',
          'status': 'APPROVED_LEVEL1',
        },
      ]));
      final repository = _FakeRepository(
        workspaces: [before, after],
        submittedLeave: submitted,
      );
      final vm = TeacherLeaveViewModel(repository: repository);
      await Future<void>.delayed(Duration.zero);

      final ok = await vm.submitLeave(
        branchId: 'branch-1',
        leaveType: 'SICK',
        startDate: DateTime.utc(2026, 9, 10),
        endDate: DateTime.utc(2026, 9, 11),
        reason: 'Flu',
      );

      expect(ok, isTrue);
      expect(repository.fetchCount, 2);
      expect(vm.state.leaves.single.status, 'APPROVED_LEVEL1');
      expect(repository.leaveRequest!['reason'], 'Flu');
      vm.dispose();
    });
  });

  group('teacher timetable and leave widgets', () {
    testWidgets('saves class roster attendance from the Attendance tab',
        (tester) async {
      final before = TeacherWorkspace.fromJson(workspaceJson());
      final after = TeacherWorkspace.fromJson(workspaceJson());
      final repository = _FakeRepository(workspaces: [before, after]);
      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await _pumpWithRepository(
        tester,
        const TeacherHomeScreen(),
        repository,
      );

      await tester.tap(find.byType(NavigationDestination).at(1));
      await tester.pumpAndSettle();
      expect(find.text('Aarya Rai'), findsOneWidget);
      expect(find.text('Bikash Lama'), findsOneWidget);
      expect(find.text('Excused leave recorded'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Save attendance'), 300);
      expect(
        tester.getTopLeft(find.text('Students')).dy,
        lessThan(tester.getTopLeft(find.text('Save attendance')).dy),
      );
      expect(
        tester.getTopLeft(find.text('Students')).dy,
        greaterThan(tester.getTopLeft(find.text('Bikash Lama')).dy),
      );
      await tester.tap(find.text('Save attendance'));
      await tester.pumpAndSettle();

      expect(repository.classAttendanceRequest!['classId'], 'class-1');
      expect(repository.classAttendanceRequest!['records'], {
        'student-1': 'PRESENT',
        'student-2': 'ABSENT',
      });
      expect(repository.fetchCount, 2);
    });

    testWidgets('opens a class detail hub from the Classes tab',
        (tester) async {
      final repository = _FakeRepository(
        workspaces: [TeacherWorkspace.fromJson(workspaceJson())],
      );
      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await _pumpWithRepository(
        tester,
        const TeacherHomeScreen(),
        repository,
      );

      await tester.tap(find.byType(NavigationDestination).at(3));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Grade 8 - A'));
      await tester.pumpAndSettle();

      expect(find.text('Class tools'), findsOneWidget);
      expect(find.text('Syllabus progress'), findsOneWidget);
      expect(find.text('Homework'), findsOneWidget);
      expect(find.text('Results'), findsOneWidget);
      expect(find.text('Roster'), findsOneWidget);
      expect(find.text('Aarya Rai'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Schedule'), 300);
      expect(find.text('Schedule'), findsOneWidget);
      expect(find.text('Sun 09:00-10:00'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Attendance history'), 300);
      expect(find.text('Attendance history'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('EXCUSED'), 300);
      expect(find.text('EXCUSED'), findsOneWidget);
    });

    testWidgets('home focuses on clock, teaching actions, and today timetable',
        (tester) async {
      final repository = _FakeRepository(
        workspaces: [TeacherWorkspace.fromJson(workspaceJson())],
      );
      await tester.binding.setSurfaceSize(const Size(900, 1000));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await _pumpWithRepository(
        tester,
        const TeacherHomeScreen(),
        repository,
      );

      expect(find.text('Clocked in'), findsOneWidget);
      expect(find.text('Attendance'), findsWidgets);
      expect(find.text('Update syllabus'), findsOneWidget);
      expect(find.text('Assign homework'), findsOneWidget);
      expect(find.text('Enter results'), findsOneWidget);
      expect(find.text('Today\'s timetable'), findsOneWidget);
      expect(find.text('Full timetable'), findsOneWidget);
      expect(find.text('Pending daily updates: 1'), findsNothing);
    });

    testWidgets('learning workflows use workspace classes and records',
        (tester) async {
      final repository = _FakeRepository(
        workspaces: [TeacherWorkspace.fromJson(workspaceJson())],
      );
      await tester.binding.setSurfaceSize(const Size(430, 1000));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await _pumpWithRepository(
          tester, const TeacherHomeworkScreen(), repository);
      expect(find.text('Assign homework'), findsWidgets);
      expect(find.text('Recent homework'), findsOneWidget);
      expect(find.text('Exercise 4'), findsOneWidget);

      await _pumpWithRepository(
          tester, const TeacherSyllabusScreen(), repository);
      expect(find.text('Edit plan'), findsOneWidget);
      expect(find.text('Algebra'), findsOneWidget);
      await tester.tap(find.text('Algebra'));
      await tester.pumpAndSettle();
      expect(find.text('Linear equations'), findsOneWidget);
      expect(find.text('Add topic'), findsOneWidget);

      await _pumpWithRepository(
          tester, const TeacherResultsScreen(), repository);
      expect(find.textContaining('First Term'), findsOneWidget);
      expect(find.text('Aarya Rai'), findsOneWidget);
      expect(find.text('Add paper'), findsWidgets);
      expect(find.text('Publish results'), findsOneWidget);
    });

    testWidgets('renders workspace daily and weekly timetable records',
        (tester) async {
      final body = workspaceJson();
      final classes = body['classes']! as List<dynamic>;
      final classBody = classes.single as Map<String, dynamic>;
      final schedule = classBody['schedule']! as List<dynamic>;
      schedule.add({
        'day': 'Sun',
        'startTime': '13:00',
        'endTime': '14:00',
        'subject': 'Geometry workshop',
      });
      final repository = _FakeRepository(
        workspaces: [TeacherWorkspace.fromJson(body)],
      );
      await tester.binding.setSurfaceSize(const Size(900, 1200));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await _pumpWithRepository(
        tester,
        const TeacherTimetableScreen(),
        repository,
      );

      expect(find.text('Mathematics'), findsOneWidget);

      final sundayOffset = (DateTime.sunday - DateTime.now().weekday) % 7;
      final daysUntilSunday = sundayOffset == 0 ? 7 : sundayOffset;
      for (var day = 0; day < daysUntilSunday; day++) {
        await tester.tap(find.byTooltip('Next day'));
        await tester.pumpAndSettle();
      }
      expect(find.text('Grade 8 - A'), findsNWidgets(2));
      expect(find.text('09:00'), findsOneWidget);
      expect(find.text('10:00'), findsOneWidget);
      expect(find.text('13:00'), findsOneWidget);
      expect(find.text('14:00'), findsOneWidget);
      expect(find.text('Geometry workshop'), findsOneWidget);

      await tester.tap(find.byTooltip('Next day'));
      await tester.pumpAndSettle();
      expect(find.text('Nothing scheduled for this day.'), findsOneWidget);
    });

    testWidgets('renders leave status from the refreshed workspace',
        (tester) async {
      final repository = _FakeRepository(
        workspaces: [TeacherWorkspace.fromJson(workspaceJson())],
      );
      await _pumpWithRepository(
        tester,
        const TeacherLeaveScreen(),
        repository,
      );

      expect(find.text('CASUAL'), findsOneWidget);
      expect(find.text('APPROVED_LEVEL1'), findsOneWidget);
      expect(find.text('Family event'), findsOneWidget);
    });

    testWidgets('offers only leave types supported by the API', (tester) async {
      final repository = _FakeRepository(
        workspaces: [TeacherWorkspace.fromJson(workspaceJson())],
      );
      await _pumpWithRepository(
        tester,
        const TeacherLeaveScreen(),
        repository,
      );

      await tester.tap(find.text('New Request'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('CASUAL').last);
      await tester.pumpAndSettle();

      expect(find.text('SICK'), findsOneWidget);
      expect(find.text('LONG_SICK'), findsOneWidget);
      expect(find.text('EARLY_OUT'), findsOneWidget);
      expect(find.text('EMERGENCY'), findsNothing);
    });
  });

  group('geo-attendance radius eligibility', () {
    test('rejects unusable GPS accuracy before attendance network requests',
        () async {
      final repository = _FakeRepository(workspaces: const []);
      final vm = GeoAttendanceViewModel(
        repository: repository,
        branchId: 'branch-1',
        branchLatitude: null,
        branchLongitude: null,
        branchRadiusMeters: 100,
      );

      for (final accuracy in <double?>[
        null,
        double.nan,
        double.infinity,
        0,
        -1,
        20.01,
      ]) {
        vm.updatePosition(
          latitude: 27.7172,
          longitude: 85.3240,
          gpsAccuracy: accuracy,
        );
        expect(vm.canMark, isFalse, reason: 'accuracy=$accuracy');
        expect(await vm.markIn(), isFalse, reason: 'accuracy=$accuracy');
      }
      expect(repository.geoMarkCount, 0);

      vm.updatePosition(
        latitude: 27.7172,
        longitude: 85.3240,
        gpsAccuracy: 20,
      );
      expect(vm.canMark, isTrue);
      expect(await vm.markIn(), isTrue);
      expect(repository.geoMarkCount, 1);
      vm.dispose();
    });

    test('enables inside, blocks outside, and defers unknown center to server',
        () {
      final inside = GeoAttendanceViewModel(
        repository: _FakeRepository(workspaces: const []),
        branchId: 'branch-1',
        branchLatitude: 27.7172,
        branchLongitude: 85.3240,
        branchRadiusMeters: 100,
      );
      inside.updatePosition(
          latitude: 27.7172, longitude: 85.3240, gpsAccuracy: 5);
      expect(inside.insideRadiusOrUnknown, isTrue);
      expect(inside.canMark, isTrue);
      inside.updatePosition(
          latitude: 27.7272, longitude: 85.3240, gpsAccuracy: 5);
      expect(inside.insideRadiusOrUnknown, isFalse);
      expect(inside.canMark, isFalse);
      inside.dispose();

      final unknown = GeoAttendanceViewModel(
        repository: _FakeRepository(workspaces: const []),
        branchId: 'branch-1',
        branchLatitude: null,
        branchLongitude: null,
        branchRadiusMeters: 100,
      );
      unknown.updatePosition(
          latitude: 27.7172, longitude: 85.3240, gpsAccuracy: 5);
      expect(unknown.insideRadiusOrUnknown, isNull);
      expect(unknown.canMark, isTrue);
      unknown.dispose();
    });

    testWidgets('radius card distinguishes known and server-verified geofences',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: GeoRadiusCard(
            distanceMeters: 42,
            radiusMeters: 100,
            insideRadius: true,
            gpsAccuracy: 8,
          ),
        ),
      ));
      expect(find.text('42 m from branch'), findsOneWidget);
      expect(find.text('Inside 100 m geofence'), findsOneWidget);
      expect(find.text('GPS accuracy: ±8 m'), findsOneWidget);

      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: GeoRadiusCard(
            distanceMeters: null,
            radiusMeters: 100,
            insideRadius: null,
            gpsAccuracy: 8,
          ),
        ),
      ));
      expect(find.text('Distance checked by server'), findsOneWidget);
      expect(
          find.textContaining('Branch center is not shared'), findsOneWidget);
    });
  });
}
