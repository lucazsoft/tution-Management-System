import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/features/auth/data/auth_service.dart';

AuthState authenticatedAs(String role) {
  return AuthState(
    user: AuthUser(
      id: 'user-1',
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: role,
    ),
    isAuthenticated: true,
    isLoading: false,
  );
}

void main() {
  group('AuthState.roleRedirectPath', () {
    test('redirects tenant admins to their mobile dashboard', () {
      expect(
        authenticatedAs('TENANT_ADMIN').roleRedirectPath,
        '/tenant/home',
      );
    });

    test('redirects branch admins to their mobile dashboard', () {
      expect(
        authenticatedAs('BRANCH_ADMIN').roleRedirectPath,
        '/branch/home',
      );
    });

    test('redirects janitors to their mobile task list', () {
      expect(
        authenticatedAs('JANITOR').roleRedirectPath,
        '/janitor/home',
      );
    });

    test('redirects accountants to the web/PWA handoff screen', () {
      expect(
        authenticatedAs('ACCOUNTANT').roleRedirectPath,
        '/unsupported-role',
      );
    });

    test('redirects unknown roles safely to the web/PWA handoff screen', () {
      expect(authenticatedAs('UNKNOWN').roleRedirectPath, '/unsupported-role');
    });
  });

  group('AuthState login feedback', () {
    test('can carry and clear a production login error message', () {
      const failed = AuthState(
        isLoading: false,
        errorMessage: 'Cannot reach the TMS server.',
      );

      expect(failed.errorMessage, 'Cannot reach the TMS server.');

      final cleared = failed.copyWith(clearError: true);

      expect(cleared.errorMessage, isNull);
      expect(cleared.isLoading, isFalse);
    });
  });
}
