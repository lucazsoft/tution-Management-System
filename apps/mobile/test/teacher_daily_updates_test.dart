import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tms_mobile/core/sync/sync.dart';
import 'package:tms_mobile/features/teacher/data/teacher_portal_repository.dart';
import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';
import 'package:tms_mobile/features/teacher/screens/daily_update_screen.dart';
import 'package:tms_mobile/features/teacher/screens/teacher_daily_updates_screen.dart';
import 'package:tms_mobile/features/teacher/screens/teacher_home_screen.dart';
import 'package:tms_mobile/features/teacher/viewmodels/teacher_leave_viewmodel.dart';
import 'package:tms_mobile/features/teacher/viewmodels/teacher_portal_viewmodel.dart';

class _FakeTeacherRepository extends TeacherPortalRepository {
  _FakeTeacherRepository({required this.workspace}) : super(dio: Dio());

  final TeacherWorkspace workspace;
  String? submittedSessionId;
  String? submittedContent;
  String? updatedSyllabusId;
  String? updatedTopicId;
  String? updatedStatus;
  String? updatedNotes;

  @override
  Future<TeacherWorkspace> fetchWorkspace({dynamic cancelToken}) async =>
      workspace;

  @override
  Future<void> submitSessionUpdate({
    required String sessionId,
    required String updateContent,
    dynamic cancelToken,
  }) async {
    submittedSessionId = sessionId;
    submittedContent = updateContent;
  }

  @override
  Future<void> updateTopicProgress({
    required String syllabusId,
    required String topicId,
    required String status,
    String? notes,
  }) async {
    updatedSyllabusId = syllabusId;
    updatedTopicId = topicId;
    updatedStatus = status;
    updatedNotes = notes;
  }
}

Future<void> _pumpTeacherApp(
  WidgetTester tester, {
  required _FakeTeacherRepository repository,
  Widget? child,
  GoRouter? router,
}) async {
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
      child: router != null
          ? MaterialApp.router(routerConfig: router)
          : MaterialApp(home: child!),
    ),
  );
  await tester.pumpAndSettle();
}

TeacherWorkspace _buildTestWorkspace({
  int pendingCount = 2,
}) {
  return TeacherWorkspace(
    teacherName: 'John Doe',
    designation: 'Senior Mathematics Teacher',
    branches: const [TeacherBranchRef(id: 'b1', name: 'Main Campus')],
    todayClasses: [
      TeacherTodayClass(
        sessionId: 'session-1',
        classId: 'class-1',
        className: 'Grade 10 - A',
        courseName: 'Mathematics',
        dailyUpdateSubmitted: false,
      ),
      TeacherTodayClass(
        sessionId: 'session-2',
        classId: 'class-2',
        className: 'Grade 9 - B',
        courseName: 'Science',
        dailyUpdateSubmitted: true,
      ),
    ],
    pendingUpdates: List.generate(
      pendingCount,
      (i) => TeacherPendingUpdate(
        sessionId: 'session-${i + 1}',
        classId: 'class-${i + 1}',
        className: 'Grade 10 - ${String.fromCharCode(65 + i)}',
        courseName: i == 0 ? 'Mathematics' : 'Science',
        date: DateTime(2026, 11, 24),
      ),
    ),
    classes: [
      TeacherClassInfo(
        id: 'class-1',
        name: 'Grade 10 - A',
        subject: 'Mathematics',
        syllabi: [
          TeacherSyllabus(
            id: 'syllabus-1',
            subject: 'Mathematics',
            chapters: [
              TeacherSyllabusChapter(
                id: 'ch-1',
                title: 'Algebra',
                status: 'IN_PROGRESS',
                position: 1,
                topics: [
                  const TeacherSyllabusTopic(
                    id: 'topic-1',
                    title: 'Quadratic Equations',
                    status: 'IN_PROGRESS',
                    logs: [],
                  ),
                  TeacherSyllabusTopic(
                    id: 'topic-2',
                    title: 'Linear Equations',
                    status: 'COMPLETED',
                    logs: [
                      TeacherTopicLog(
                        id: 'log-1',
                        status: 'COMPLETED',
                        logDate: DateTime(2026, 11, 23),
                        notes: 'Finished all exercises',
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
    leaves: const [],
    stamps: const [],
    resultDefinitions: const [],
    checkedIn: true,
  );
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('Teacher Pending Daily Updates Alert & Screen', () {
    testWidgets('renders pending updates alert card on teacher home screen',
        (tester) async {
      final workspace = _buildTestWorkspace(pendingCount: 3);
      final repo = _FakeTeacherRepository(workspace: workspace);

      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await _pumpTeacherApp(
        tester,
        repository: repo,
        child: const Scaffold(body: TeacherHomeScreen()),
      );

      // Alert card is visible with pending count and update button
      expect(find.text('3 Daily Updates Pending'), findsOneWidget);
      expect(find.text('Classroom progress notes required · Tap to record'),
          findsOneWidget);
      expect(find.text('Update'), findsWidgets);
      expect(find.byIcon(Icons.notification_important_rounded), findsOneWidget);
    });

    testWidgets('tapping alert card navigates to daily updates screen',
        (tester) async {
      final workspace = _buildTestWorkspace(pendingCount: 2);
      final repo = _FakeTeacherRepository(workspace: workspace);

      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final router = GoRouter(
        initialLocation: '/teacher/home',
        routes: [
          GoRoute(
            path: '/teacher/home',
            builder: (_, __) => const TeacherHomeScreen(),
          ),
          GoRoute(
            path: '/teacher/daily-updates',
            builder: (_, __) => const TeacherDailyUpdatesScreen(),
          ),
        ],
      );
      addTearDown(router.dispose);

      await _pumpTeacherApp(
        tester,
        repository: repo,
        router: router,
      );

      // Tap alert card
      await tester.tap(find.text('2 Daily Updates Pending'));
      await tester.pumpAndSettle();

      // We are now on Daily Updates screen
      expect(find.text('Daily Updates'), findsOneWidget);
      expect(find.text('Pending Updates'), findsOneWidget);
      expect(find.text('Update History'), findsOneWidget);
      expect(find.text('Quadratic Equations'), findsWidgets);
    });

    testWidgets('allows publishing topic progress update', (tester) async {
      final workspace = _buildTestWorkspace(pendingCount: 1);
      final repo = _FakeTeacherRepository(workspace: workspace);

      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await _pumpTeacherApp(
        tester,
        repository: repo,
        child: const TeacherDailyUpdatesScreen(),
      );

      // Topic form and bottom publish bar are visible
      expect(find.text('Quadratic Equations'), findsWidgets);
      expect(find.text('Publish 1 Update'), findsOneWidget);

      // Enter lesson note
      await tester.enterText(
        find.byType(TextFormField),
        'Covered quadratic formula and derivation.',
      );

      // Tap bottom publish button
      await tester.tap(find.text('Publish 1 Update'));
      await tester.pumpAndSettle();

      expect(repo.updatedTopicId, 'topic-1');
      expect(repo.updatedSyllabusId, 'syllabus-1');
      expect(repo.updatedStatus, 'IN_PROGRESS');
      expect(repo.updatedNotes, 'Covered quadratic formula and derivation.');
    });

    testWidgets('opens pending updates sheet and navigates to session update',
        (tester) async {
      final workspace = _buildTestWorkspace(pendingCount: 1);
      final repo = _FakeTeacherRepository(workspace: workspace);

      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await _pumpTeacherApp(
        tester,
        repository: repo,
        child: const TeacherDailyUpdatesScreen(),
      );

      // Tap Pending Updates button
      await tester.tap(find.text('Pending Updates'));
      await tester.pumpAndSettle();

      // Modal bottom sheet appears
      expect(find.text('1 class session requires daily update notes'),
          findsOneWidget);
      expect(find.text('Grade 10 - A'), findsWidgets);

      // Tap update button in sheet
      await tester.tap(find.text('Update'));
      await tester.pumpAndSettle();

      expect(find.byType(DailyUpdateScreen), findsOneWidget);
      expect(find.text('What was covered?'), findsOneWidget);

      await tester.enterText(
        find.byType(TextField),
        'Completed Chapter 4 practice questions.',
      );
      await tester.tap(find.text('Submit update'));
      await tester.pumpAndSettle();

      expect(repo.submittedSessionId, 'session-1');
      expect(
          repo.submittedContent, 'Completed Chapter 4 practice questions.');
    });

    testWidgets('opens update history sheet and displays past logs',
        (tester) async {
      final workspace = _buildTestWorkspace(pendingCount: 0);
      final repo = _FakeTeacherRepository(workspace: workspace);

      await tester.binding.setSurfaceSize(const Size(420, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await _pumpTeacherApp(
        tester,
        repository: repo,
        child: const TeacherDailyUpdatesScreen(),
      );

      // Tap Update History button
      await tester.tap(find.text('Update History'));
      await tester.pumpAndSettle();

      // Modal bottom sheet shows past topic log
      expect(find.text('Past classroom lesson updates & progress logs'),
          findsOneWidget);
      expect(find.text('Linear Equations'), findsOneWidget);
      expect(find.text('Finished all exercises'), findsOneWidget);
    });
  });
}
