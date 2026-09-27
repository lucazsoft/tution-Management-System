import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_navigation.dart';

void main() {
  late GoRouter router;

  setUp(() {
    Widget page(String title, int index) => Scaffold(
          drawer: Builder(
            builder: (context) => TeacherNavigation.drawer(context),
          ),
          appBar: AppBar(title: Text(title)),
          body: Text('$title page'),
          bottomNavigationBar:
              TeacherDashboardNavigationBar(selectedIndex: index),
        );

    router = GoRouter(
      initialLocation: '/teacher/home',
      routes: [
        GoRoute(path: '/teacher/home', builder: (_, __) => page('Home', 0)),
        GoRoute(
          path: '/teacher/timetable',
          builder: (_, __) => page('Timetable', 0),
        ),
        GoRoute(path: '/teacher/leave', builder: (_, __) => page('Leave', 0)),
        GoRoute(
          path: '/teacher/messages',
          builder: (_, __) => page('Messages', 2),
        ),
      ],
    );
  });

  tearDown(() => router.dispose());

  Future<void> pumpPortal(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(child: MaterialApp.router(routerConfig: router)),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('teacher hamburger exposes destinations and account settings',
      (tester) async {
    await pumpPortal(tester);

    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();

    for (final label in ['Home', 'Timetable', 'Leave requests']) {
      expect(
        find.descendant(
          of: find.byType(NavigationDrawer),
          matching: find.text(label),
        ),
        findsOneWidget,
      );
    }

    final drawerScroll = find.descendant(
      of: find.byType(NavigationDrawer),
      matching: find.byType(Scrollable),
    );
    await tester.scrollUntilVisible(
      find.text('Log out'),
      300,
      scrollable: drawerScroll,
    );
    for (final label in [
      'Profile settings',
      'Change password',
      'Set or change MPIN',
      'Switch account',
      'Log out',
    ]) {
      expect(find.text(label), findsOneWidget);
    }
  });

  testWidgets('bottom navigation keeps the teacher dashboard sections',
      (tester) async {
    await pumpPortal(tester);

    router.go('/teacher/leave');
    await tester.pumpAndSettle();
    expect(find.text('Leave page'), findsOneWidget);

    for (final label in ['Home', 'Attendance', 'Messages', 'Classes', 'More']) {
      expect(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text(label),
        ),
        findsOneWidget,
      );
    }

    await tester.tap(find.descendant(
      of: find.byType(NavigationBar),
      matching: find.text('Messages'),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Messages page'), findsOneWidget);
  });
}
