import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/features/auth/screens/login_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('switch-account login never restores remembered credentials',
      (tester) async {
    FlutterSecureStorage.setMockInitialValues({
      'remembered_login_email': 'remembered@example.com',
      'remembered_login_password': 'visible-secret',
    });

    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: LoginScreen(addAccountMode: true)),
      ),
    );
    await tester.pump();

    final fields = tester
        .widgetList<TextFormField>(find.byType(TextFormField))
        .toList();
    expect(fields[0].controller?.text, isEmpty);
    expect(fields[1].controller?.text, isEmpty);
    expect(find.text('Remember me'), findsNothing);
    expect(find.text('remembered@example.com'), findsNothing);
    expect(find.text('visible-secret'), findsNothing);
  });
}
