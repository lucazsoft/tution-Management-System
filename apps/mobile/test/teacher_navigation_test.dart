import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_navigation.dart';

void main() {
  test('teacher drawer starts in bottom navigation order', () {
    expect(
      TeacherNavigation.drawerItems.take(4).map((item) => item.label),
      ['Home', 'Attendance', 'Messages', 'Classes'],
    );
  });

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
          builder: (_, __) => page('Timetable', 3),
        ),
        GoRoute(path: '/teacher/leave', builder: (_, __) => page('Leave', 4)),
        GoRoute(
          path: '/teacher/meetings',
          builder: (_, __) => page('Meetings', 4),
        ),
        GoRoute(
          path: '/teacher/messages',
          builder: (_, __) => page('Messages', 2),
        ),
        GoRoute(
          path: '/teacher/account',
          builder: (_, __) => const Scaffold(body: Text('Teacher profile')),
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

  testWidgets('teacher hamburger exposes destinations and account settings',
      (tester) async {
    await pumpPortal(tester);

    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();

    for (final section in ['NAVIGATION', 'FEATURES']) {
      expect(find.text(section, skipOffstage: false), findsOneWidget);
    }

    for (final label in [
      'Home',
      'Attendance',
      'Messages',
      'Classes',
      'Leave requests',
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
      find.text('Log out'),
      300,
      scrollable: drawerScroll,
    );
    expect(find.text('ACCOUNT'), findsOneWidget);
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
    final classesLabel = find.descendant(
      of: drawer,
      matching: find.text('Classes', skipOffstage: false),
      skipOffstage: false,
    );
    final profileLabel = find.descendant(
      of: drawer,
      matching: find.text('Profile settings'),
    );
    final classesIcon = find.descendant(
      of: drawer,
      matching: find.byIcon(
        Icons.school_outlined,
        skipOffstage: false,
      ),
      skipOffstage: false,
    );
    final profileIcon = find.descendant(
      of: drawer,
      matching: find.byIcon(Icons.manage_accounts_outlined),
    );

    expect(
      tester.getTopLeft(profileLabel).dx,
      moreOrLessEquals(tester.getTopLeft(classesLabel).dx, epsilon: .01),
    );
    expect(
      tester.getTopLeft(profileIcon).dx,
      moreOrLessEquals(tester.getTopLeft(classesIcon).dx, epsilon: .01),
    );
  });

  testWidgets('bottom navigation keeps the teacher dashboard sections',
      (tester) async {
    await pumpPortal(tester);

    router.go('/teacher/leave');
    await tester.pumpAndSettle();
    expect(find.text('Leave page'), findsOneWidget);
    expect(
      tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
      4,
    );

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
    expect(
      tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
      2,
    );
  });

  testWidgets('centered teacher drawer profile opens profile settings',
      (tester) async {
    await pumpPortal(tester);
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();

    final header = find.byKey(const ValueKey('portal-drawer-profile-header'));
    final avatar = find.descendant(
      of: header,
      matching: find.byType(CircleAvatar),
    );
    expect(
      tester.getCenter(avatar).dx,
      moreOrLessEquals(tester.getCenter(header).dx, epsilon: .01),
    );

    await tester.tap(header);
    await tester.pumpAndSettle();
    expect(find.text('Teacher profile'), findsOneWidget);
  });

  testWidgets('back from a teacher sub-page returns to home', (tester) async {
    await pumpPortal(tester);
    router.go('/teacher/meetings');
    await tester.pumpAndSettle();

    expect(find.text('Meetings page'), findsOneWidget);
    expect(
      tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
      4,
    );

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Home page'), findsOneWidget);
  });

  testWidgets('back from Messages returns to the teacher home tab',
      (tester) async {
    await pumpPortal(tester);
    router.go('/teacher/messages');
    await tester.pumpAndSettle();

    expect(
      tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
      2,
    );
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(find.text('Home page'), findsOneWidget);
    expect(
      tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
      0,
    );
  });

  testWidgets('teacher home uses double back to exit', (tester) async {
    String? platformMethod;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'SystemNavigator.pop') platformMethod = call.method;
        return null;
      },
    );
    addTearDown(() => tester.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null));
    await pumpPortal(tester);

    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(find.text('Press back again to exit'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(platformMethod, 'SystemNavigator.pop');
  });
}
