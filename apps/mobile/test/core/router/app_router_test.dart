import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/router/app_router.dart';
import 'package:tms_mobile/features/auth/data/auth_service.dart';

AuthState _authStateForRole(String role) {
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
  group('mobileRoleBoundaryRedirect', () {
    test('allows teacher, parent, and student routes for their own role', () {
      expect(
        mobileRoleBoundaryRedirect(
          authState: _authStateForRole('TEACHER'),
          location: '/teacher/home',
        ),
        isNull,
      );
      expect(
        mobileRoleBoundaryRedirect(
          authState: _authStateForRole('PARENT'),
          location: '/parent/attendance',
        ),
        isNull,
      );
      expect(
        mobileRoleBoundaryRedirect(
          authState: _authStateForRole('STUDENT'),
          location: '/student/notifications',
        ),
        isNull,
      );
    });

    test('blocks deep links across supported mobile roles', () {
      expect(
        mobileRoleBoundaryRedirect(
          authState: _authStateForRole('TEACHER'),
          location: '/student/home',
        ),
        '/teacher/home',
      );
      expect(
        mobileRoleBoundaryRedirect(
          authState: _authStateForRole('PARENT'),
          location: '/teacher/timetable',
        ),
        '/parent/home',
      );
      expect(
        mobileRoleBoundaryRedirect(
          authState: _authStateForRole('STUDENT'),
          location: '/parent/fees',
        ),
        '/student/home',
      );
    });

    test('allows API-backed operational mobile roles in their own portal', () {
      for (final entry in {
        'TENANT_ADMIN': '/tenant/home',
        'BRANCH_ADMIN': '/branch/home',
        'JANITOR': '/janitor/home',
      }.entries) {
        expect(
          mobileRoleBoundaryRedirect(
            authState: _authStateForRole(entry.key),
            location: entry.value,
          ),
          isNull,
        );
      }
    });

    test('forces roles without a mobile portal to the web/PWA handoff', () {
      for (final role in ['ACCOUNTANT', 'WEB_PORTAL_ONLY']) {
        expect(
          mobileRoleBoundaryRedirect(
            authState: _authStateForRole(role),
            location: '/student/home',
          ),
          '/unsupported-role',
        );
        expect(
          mobileRoleBoundaryRedirect(
            authState: _authStateForRole(role),
            location: '/unsupported-role',
          ),
          isNull,
        );
      }
    });

    test('keeps protected routes behind authentication', () {
      expect(
        mobileRoleBoundaryRedirect(
          authState: const AuthState(isLoading: false),
          location: '/teacher/home',
        ),
        '/login',
      );
    });

    test('allows the saved-account picker before authentication', () {
      expect(
        mobileRoleBoundaryRedirect(
          authState: const AuthState(isLoading: false),
          location: '/saved-accounts',
        ),
        isNull,
      );
    });
  });
}
