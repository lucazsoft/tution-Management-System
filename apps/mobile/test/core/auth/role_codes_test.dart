import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/auth/role_codes.dart';
import 'package:tms_mobile/features/auth/data/auth_service.dart';

void main() {
  group('normalizeRoleCode', () {
    test('normalizes supported API display names to mobile role codes', () {
      expect(normalizeRoleCode('Tenant Admin'), 'TENANT_ADMIN');
      expect(normalizeRoleCode('Branch Admin'), 'BRANCH_ADMIN');
      expect(normalizeRoleCode('Janitor'), 'JANITOR');
    });

    test('normalizes supported role codes regardless of surrounding whitespace',
        () {
      expect(normalizeRoleCode(' TENANT_ADMIN '), 'TENANT_ADMIN');
      expect(normalizeRoleCode('branch_admin'), 'BRANCH_ADMIN');
      expect(normalizeRoleCode('janitor'), 'JANITOR');
      expect(normalizeRoleCode('accountant'), 'ACCOUNTANT');
    });

    test('maps the Branch Manager product label to BRANCH_ADMIN', () {
      expect(normalizeRoleCode('Branch Manager'), 'BRANCH_ADMIN');
    });

    test('returns null only for absent roles and handoffs web/PWA roles', () {
      expect(normalizeRoleCode(null), isNull);
      expect(normalizeRoleCode(''), isNull);
      expect(normalizeRoleCode('Super Admin'), RoleCodes.webPortalOnly);
    });
  });

  group('AuthUser.fromJson', () {
    test('stores the normalized role code from an API role display name', () {
      final user = AuthUser.fromJson({
        'user': {
          'id': 'user-1',
          'email': 'janitor@example.com',
          'roles': [
            {'roleName': 'Janitor'},
          ],
        },
      });

      expect(user.role, 'JANITOR');
    });

    test('maps non-mobile roles to the web/PWA handoff without mobile access',
        () {
      final user = AuthUser.fromJson({
        'user': {
          'id': 'user-1',
          'email': 'unknown@example.com',
          'role': 'Super Admin',
        },
      });

      expect(user.role, RoleCodes.webPortalOnly);
    });
  });
}
