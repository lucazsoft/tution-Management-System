import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/features/auth/widgets/auth_card.dart';

void main() {
  testWidgets('supports a viewport shorter than the page padding',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 30));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(
        home: AuthCard(child: Text('Sign in')),
      ),
    );

    expect(find.text('Sign in'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
