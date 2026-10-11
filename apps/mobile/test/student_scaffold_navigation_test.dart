import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/features/student/widgets/student_scaffold.dart';

void main() {
  late GoRouter router;

  setUp(() {
    router = GoRouter(
      initialLocation: '/student/home',
      routes: [
        GoRoute(
          path: '/student/home',
          builder: (_, __) => const StudentScaffold(
            title: 'Home',
            selectedIndex: 0,
            body: Center(child: Text('Home page')),
          ),
        ),
        GoRoute(
          path: '/student/academics',
          builder: (_, __) => const StudentScaffold(
            title: 'Academics',
            selectedIndex: 1,
            body: Center(child: Text('Academics page')),
          ),
        ),
      ],
    );
  });

  tearDown(() {
    router.dispose();
  });

  Future<void> pumpPortal(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(child: MaterialApp.router(routerConfig: router)),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('hamburger menu contains student and account navigation',
      (tester) async {
    await pumpPortal(tester);

    expect(find.byType(NavigationBar), findsOneWidget);
    for (final label in [
      'Home',
      'Academics',
      'Timetable',
      'Calendar',
      'My ID',
    ]) {
      expect(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text(label),
        ),
        findsOneWidget,
      );
    }

    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();

    for (final label in [
      'Academics',
      'Timetable',
      'Calendar',
      'My ID',
      'Attendance',
      'Certificates',
      'Fees & payments',
    ]) {
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
      find.text('Notifications'),
      200,
      scrollable: drawerScroll,
    );
    expect(find.text('Notifications'), findsOneWidget);
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

    final drawer = find.byType(NavigationDrawer);
    final academicsLabel = find.descendant(
      of: drawer,
      matching: find.text('Academics', skipOffstage: false),
      skipOffstage: false,
    );
    final profileLabel = find.descendant(
      of: drawer,
      matching: find.text('Profile settings'),
    );
    final academicsIcon = find.descendant(
      of: drawer,
      matching: find.byIcon(Icons.school_outlined, skipOffstage: false),
      skipOffstage: false,
    );
    final profileIcon = find.descendant(
      of: drawer,
      matching: find.byIcon(Icons.manage_accounts_outlined),
    );

    expect(
      tester.getTopLeft(profileLabel).dx,
      moreOrLessEquals(tester.getTopLeft(academicsLabel).dx, epsilon: .01),
    );
    expect(
      tester.getTopLeft(profileIcon).dx,
      moreOrLessEquals(tester.getTopLeft(academicsIcon).dx, epsilon: .01),
    );
  });

  testWidgets('device back returns a pushed student page to home',
      (tester) async {
    await pumpPortal(tester);
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationDrawer),
        matching: find.text('Academics'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Academics page'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(find.text('Home page'), findsOneWidget);
  });
}
