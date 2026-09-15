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
    test('redirects tenant admins to the web-portal handoff', () {
      expect(authenticatedAs('TENANT_ADMIN').roleRedirectPath,
          '/unsupported-role');
    });

    test('redirects branch admins to the web-portal handoff', () {
      expect(authenticatedAs('BRANCH_ADMIN').roleRedirectPath,
          '/unsupported-role');
    });

    test('redirects janitors to the web-portal handoff', () {
      expect(authenticatedAs('JANITOR').roleRedirectPath, '/unsupported-role');
    });

    test('redirects unknown roles safely to login', () {
      expect(authenticatedAs('UNKNOWN').roleRedirectPath, '/login');
    });
  });
}
