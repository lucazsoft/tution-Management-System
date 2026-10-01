import 'package:tms_mobile/features/auth/data/auth_service.dart';

class AuthResult {
  const AuthResult({
    required this.email,
    required this.role,
    required this.requiresTwoFactor,
  });

  final String email;
  final String role;
  final bool requiresTwoFactor;
}

class MockAuthService {
  static const Map<String, String> demoUsers = {
    'teacher@tms.edu.np': 'Teacher@123',
    'student@tms.edu.np': 'Student@123',
    'parent@tms.edu.np': 'Parent@123',
    'branchadmin@tms.edu.np': 'Admin@123',
    'tenantadmin@tms.edu.np': 'Admin@123',
    'superadmin@tms.edu.np': 'Admin@123',
    'staff@tms.edu.np': 'Staff@123',
  };

  static const String forgotPasswordOtp = '654321';
  static const String twoFactorOtp = '246810';

  static Future<AuthResult> signIn({
    required String email,
    required String password,
    required bool rememberMe,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 600));
    final normalizedEmail = email.trim().toLowerCase();

    // If matching demo credentials or any valid email in API mode
    final expectedPassword = demoUsers[normalizedEmail];
    if (expectedPassword != null && password != expectedPassword) {
      throw const AuthFailure('Invalid email or password.');
    }

    String role = 'TEACHER';
    if (normalizedEmail.contains('student')) {
      role = 'STUDENT';
    } else if (normalizedEmail.contains('parent'))
      role = 'PARENT';
    else if (normalizedEmail.contains('branch'))
      role = 'BRANCH_ADMIN';
    else if (normalizedEmail.contains('tenant'))
      role = 'TENANT_ADMIN';
    else if (normalizedEmail.contains('super'))
      role = 'SUPER_ADMIN';
    else if (normalizedEmail.contains('staff')) role = 'STAFF';

    return AuthResult(
        email: normalizedEmail, role: role, requiresTwoFactor: true);
  }

  static Future<void> sendPasswordOtp(String email) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (email.trim().isEmpty) {
      throw const AuthFailure('Email is required.');
    }
  }

  static Future<void> verifyPasswordOtp(String code) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (code != forgotPasswordOtp) {
      throw const AuthFailure('That OTP is incorrect. Please try again.');
    }
  }

  static Future<void> resetPassword(String password) async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    if (password.isEmpty) {
      throw const AuthFailure('Password cannot be empty.');
    }
  }

  static Future<void> sendTwoFactorCode() async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
  }

  static Future<void> verifyTwoFactorCode(String code) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (code != twoFactorOtp) {
      throw const AuthFailure('That verification code is invalid.');
    }
  }
}
