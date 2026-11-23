import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/features/parent/widgets/parent_navigation.dart';

void main() {
  test('parent drawer starts in bottom navigation order', () {
    expect(
      ParentNavigation.drawerItems.take(4).map((item) => item.label),
      ['Home', 'Classes', 'Chat', 'Meetings'],
    );
  });

  testWidgets('parent drawer aligns account actions with destinations',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: Scaffold(
            drawer: Builder(
              builder: (context) => ParentNavigation.drawer(context),
            ),
            appBar: AppBar(),
          ),
        ),
      ),
    );

    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();

    for (final section in ['NAVIGATION', 'FEATURES']) {
      expect(find.text(section, skipOffstage: false), findsOneWidget);
    }

    final drawer = find.byType(NavigationDrawer);
    final drawerScroll = find.descendant(
      of: drawer,
      matching: find.byType(Scrollable),
    );
    await tester.scrollUntilVisible(
      find.text('Profile settings'),
      300,
      scrollable: drawerScroll,
    );
    expect(find.text('ACCOUNT'), findsOneWidget);

    final classesLabel = find.descendant(
      of: drawer,
      matching: find.text('Classes', skipOffstage: false),
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
      moreOrLessEquals(tester.getTopLeft(classesLabel).dx, epsilon: .01),
    );
    expect(
      tester.getTopLeft(profileIcon).dx,
      moreOrLessEquals(tester.getTopLeft(academicsIcon).dx, epsilon: .01),
    );
  });

  testWidgets('parent navigation highlights the route that is open',
      (tester) async {
    Widget page(String title) => Scaffold(
          body: Text(title),
          bottomNavigationBar: const ParentNavigationBar(selectedIndex: 0),
        );
    final router = GoRouter(
      initialLocation: '/parent/home',
      routes: [
        GoRoute(path: '/parent/home', builder: (_, __) => page('Home')),
        GoRoute(
          path: '/parent/timetable',
          builder: (_, __) => page('Timetable'),
        ),
        GoRoute(
          path: '/parent/appointments',
          builder: (_, __) => page('Meetings'),
        ),
        GoRoute(
          path: '/parent/attendance',
          builder: (_, __) => page('Attendance'),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(child: MaterialApp.router(routerConfig: router)),
    );

    for (final entry in const [
      ('/parent/home', 0),
      ('/parent/timetable', 1),
      ('/parent/appointments', 3),
      ('/parent/attendance', 4),
    ]) {
      router.go(entry.$1);
      await tester.pumpAndSettle();
      expect(
        tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
        entry.$2,
      );
    }
  });

  testWidgets('centered parent drawer profile opens profile settings',
      (tester) async {
    late GoRouter router;
    Widget home() => Scaffold(
          drawer: Builder(
            builder: (context) => ParentNavigation.drawer(context),
          ),
          appBar: AppBar(),
        );
    router = GoRouter(
      initialLocation: '/parent/home',
      routes: [
        GoRoute(path: '/parent/home', builder: (_, __) => home()),
        GoRoute(
          path: '/parent/account',
          builder: (_, __) => const Scaffold(body: Text('Parent profile')),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(child: MaterialApp.router(routerConfig: router)),
    );
    await tester.pumpAndSettle();
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
    expect(find.text('Parent profile'), findsOneWidget);
  });

  testWidgets('back from a parent navigation tab returns to home',
      (tester) async {
    Widget page(String title, int index) => Scaffold(
          body: Text(title),
          bottomNavigationBar: ParentNavigationBar(selectedIndex: index),
        );
    final router = GoRouter(
      initialLocation: '/parent/home',
      routes: [
        GoRoute(
          path: '/parent/home',
          builder: (_, __) => page('Parent home page', 0),
        ),
        GoRoute(
          path: '/parent/messages',
          builder: (_, __) => page('Messages', 2),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(child: MaterialApp.router(routerConfig: router)),
    );
    router.go('/parent/messages');
    await tester.pumpAndSettle();

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(find.text('Parent home page'), findsOneWidget);
  });

  testWidgets('parent home requires two back presses to exit', (tester) async {
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
    final router = GoRouter(
      initialLocation: '/parent/home',
      routes: [
        GoRoute(
          path: '/parent/home',
          builder: (_, __) => const Scaffold(
            body: Text('Home'),
            bottomNavigationBar: ParentNavigationBar(selectedIndex: 0),
          ),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(child: MaterialApp.router(routerConfig: router)),
    );

    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(find.text('Press back again to exit'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(platformMethod, 'SystemNavigator.pop');
  });

  testWidgets('returning to parent home resets the double-back exit sequence',
      (tester) async {
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

    Widget page(String title, int index) => Scaffold(
          body: Text(title),
          bottomNavigationBar: ParentNavigationBar(selectedIndex: index),
        );
    final router = GoRouter(
      initialLocation: '/parent/home',
      routes: [
        GoRoute(
          path: '/parent/home',
          builder: (_, __) => page('Parent home page', 0),
        ),
        GoRoute(
          path: '/parent/messages',
          builder: (_, __) => page('Parent messages page', 2),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(child: MaterialApp.router(routerConfig: router)),
    );

    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(find.text('Press back again to exit'), findsOneWidget);

    router.go('/parent/messages');
    await tester.pumpAndSettle();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Parent home page'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(platformMethod, isNull);
    expect(find.text('Press back again to exit'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(platformMethod, 'SystemNavigator.pop');
  });

  testWidgets('back closes a parent inner page before leaving its navigation',
      (tester) async {
    var insideConversation = true;
    final router = GoRouter(
      initialLocation: '/parent/messages',
      routes: [
        GoRoute(
          path: '/parent/home',
          builder: (_, __) => const Scaffold(body: Text('Parent home page')),
        ),
        GoRoute(
          path: '/parent/messages',
          builder: (_, __) => StatefulBuilder(
            builder: (context, setState) => Scaffold(
              body: Text(insideConversation
                  ? 'Message conversation'
                  : 'Message navigation'),
              bottomNavigationBar: ParentNavigationBar(
                selectedIndex: 2,
                onBack: () {
                  if (!insideConversation) return false;
                  setState(() => insideConversation = false);
                  return true;
                },
              ),
            ),
          ),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(child: MaterialApp.router(routerConfig: router)),
    );

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Message navigation'), findsOneWidget);
    expect(find.text('Parent home page'), findsNothing);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Parent home page'), findsOneWidget);
  });
}
