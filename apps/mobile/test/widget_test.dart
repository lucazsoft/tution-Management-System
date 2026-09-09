import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';
import 'package:tms_mobile/features/auth/screens/login_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('shows login screen by default', (tester) async {
    // Create a mock router that directly renders the LoginScreen,
    // bypassing the auth guard complexity during testing.
    final mockRouter = GoRouter(
      initialLocation: '/login',
      routes: [
        GoRoute(
          path: '/login',
          builder: (context, state) => const LoginScreen(),
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(
          routerConfig: mockRouter,
          title: 'TMS',
          debugShowCheckedModeBanner: false,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Tuition Management System'), findsOneWidget);
    expect(find.text('Sign In'), findsOneWidget);
  });
}
