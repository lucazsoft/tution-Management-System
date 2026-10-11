import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/features/parent/widgets/parent_navigation.dart';

void main() {
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
}
