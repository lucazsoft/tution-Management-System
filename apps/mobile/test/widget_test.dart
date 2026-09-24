import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/router/app_router.dart';
import 'package:tms_mobile/features/auth/data/auth_service.dart';
import 'package:tms_mobile/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('shows login screen by default', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: TMSApp()));
    await tester.pumpAndSettle();

    expect(find.text('Welcome Back'), findsOneWidget);
    expect(
      find.text('Sign in to your Tuition Management account'),
      findsOneWidget,
    );
    expect(find.text('Sign In'), findsOneWidget);
  });

  test('navigation session changes when the active account changes', () {
    AuthState signedIn(String id, String email) => AuthState(
          user: AuthUser(
            id: id,
            email: email,
            firstName: 'Test',
            lastName: 'User',
            role: 'STUDENT',
            tenantId: 'tenant-1',
          ),
          isAuthenticated: true,
          isLoading: false,
        );

    expect(
      navigationSessionIdentity(signedIn('student-1', 'one@example.com')),
      isNot(navigationSessionIdentity(
        signedIn('student-2', 'two@example.com'),
      )),
    );
    expect(
      navigationSessionIdentity(const AuthState(isLoading: true)),
      navigationSessionIdentity(const AuthState(isLoading: false)),
    );
  });
}
