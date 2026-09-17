import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:tms_mobile/core/auth/role_codes.dart';
import 'package:tms_mobile/core/network/api_client.dart';

/// Represents a failure in the auth flow with a human-readable message.
class AuthFailure implements Exception {
  const AuthFailure(this.message);
  final String message;

  @override
  String toString() => 'AuthFailure: $message';
}

/// User model returned after successful authentication.
class AuthUser {
  final String id;
  final String email;
  final String firstName;
  final String lastName;
  final String role;
  final String? tenantId;
  final bool requiresTwoFactor;

  const AuthUser({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.role,
    this.tenantId,
    this.requiresTwoFactor = false,
  });

  String get name => '$firstName $lastName'.trim();

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    final user = json.containsKey('user') && json['user'] is Map
        ? json['user'] as Map<String, dynamic>
        : json;

    // API may return a direct role code/name or a roles entry with roleName.
    String? rawRole;
    if (user['role'] is String) {
      rawRole = user['role'] as String;
    } else if (user['roles'] is List && (user['roles'] as List).isNotEmpty) {
      final firstRole = (user['roles'] as List).first;
      if (firstRole is Map) {
        rawRole = firstRole['roleName'] as String?;
      }
    }

    final role = normalizeRoleCode(rawRole);
    if (role == null) {
      throw const AuthFailure(
        'Your account role is not supported by this mobile app.',
      );
    }

    return AuthUser(
      id: user['id'] as String? ?? '',
      email: user['email'] as String? ?? '',
      firstName: user['firstName'] as String? ??
          user['name']?.toString().split(' ').first ??
          '',
      lastName: user['lastName'] as String? ??
          (((user['name']?.toString().split(' ').length ?? 0) > 1)
              ? user['name']!.toString().split(' ').sublist(1).join(' ')
              : ''),
      role: role,
      tenantId: json['tenantId'] as String? ?? user['tenantId'] as String?,
      requiresTwoFactor: user['requiresTwoFactor'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'firstName': firstName,
        'lastName': lastName,
        'role': role,
        'tenantId': tenantId,
        'requiresTwoFactor': requiresTwoFactor,
      };
}

/// Result of password verification. A two-factor challenge is deliberately
/// not an authenticated user or a session.
class PasswordSignInResult {
  const PasswordSignInResult.authenticated(this.user) : pendingEmail = null;
  const PasswordSignInResult.twoFactorRequired(this.pendingEmail) : user = null;

  final AuthUser? user;
  final String? pendingEmail;

  bool get requiresTwoFactor => pendingEmail != null;
}

/// Server-backed authentication service.
class AuthService {
  AuthService._();

  static Dio get _dio => ApiClient.instance.dio;

  /// Authenticate with email + password.
  static Future<PasswordSignInResult> signIn({
    required String email,
    required String password,
  }) async {
    final normalized = email.trim().toLowerCase();

    try {
      final response = await _dio.post<dynamic>(
        '/api/auth/sign-in/email',
        data: {
          'email': normalized,
          'password': password,
        },
      );
      final body = response.data;
      if (body is Map && body['twoFactorRedirect'] == true) {
        return PasswordSignInResult.twoFactorRequired(normalized);
      }
      final user = await _getAuthenticatedSession();
      if (user == null) {
        throw const AuthFailure(
          'The server did not create an authenticated session. Please try again.',
        );
      }
      return PasswordSignInResult.authenticated(user);
    } on DioException catch (e) {
      throw AuthFailure(_extractAuthMessage(e));
    } catch (e) {
      if (e is AuthFailure) rethrow;
      throw AuthFailure('An unexpected error occurred: $e');
    }
  }

  /// Use [email] to locate the account; delivery goes to its verified mobile.
  static Future<void> sendPasswordOtp(String email) async {
    final normalized = email.trim().toLowerCase();
    try {
      await _dio.post(
        '/api/auth/forgot-password',
        data: {'email': normalized},
      );
    } on DioException catch (e) {
      throw AuthFailure(
          _extractMessage(e, 'Failed to send OTP. Please try again.'));
    }
  }

  /// Verify the password-reset OTP and get a reset token.
  static Future<String> verifyPasswordOtp({
    required String email,
    required String otp,
  }) async {
    final normalized = email.trim().toLowerCase();
    try {
      final response = await _dio.post(
        '/api/auth/verify-reset-otp',
        data: {
          'email': normalized,
          'otp': otp.trim(),
        },
      );

      final data = response.data as Map<String, dynamic>;
      final resetToken = data['resetToken'] as String?;

      if (resetToken == null || resetToken.isEmpty) {
        throw const AuthFailure(
            'Verification succeeded but no reset token was returned.');
      }

      return resetToken;
    } on DioException catch (e) {
      throw AuthFailure(_extractMessage(e, 'Invalid or expired OTP.'));
    }
  }

  /// Reset the password using the token from [verifyPasswordOtp].
  static Future<void> resetPassword({
    required String resetToken,
    required String newPassword,
  }) async {
    try {
      await _dio.post(
        '/api/auth/reset-password',
        data: {
          'resetToken': resetToken,
          'newPassword': newPassword,
        },
      );
    } on DioException catch (e) {
      throw AuthFailure(_extractMessage(e, 'Failed to reset password.'));
    }
  }

  /// Change password for authenticated user (requires current password).
  static Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      await _dio.post(
        '/api/auth/change-password',
        data: {
          'currentPassword': currentPassword,
          'newPassword': newPassword,
        },
      );
    } on DioException catch (e) {
      throw AuthFailure(_extractMessage(e, 'Failed to change password.'));
    }
  }

  /// Request a 2FA code sent to the account's verified security mobile.
  static Future<void> sendTwoFactorCode() async {
    try {
      await _dio.post(
        '/api/auth/two-factor/send-otp',
        data: const {},
      );
    } on DioException catch (e) {
      throw AuthFailure(
          _extractMessage(e, 'Failed to send verification code.'));
    }
  }

  /// Verify the 2FA code.
  static Future<void> verifyTwoFactorCode({
    required String code,
    required bool trustDevice,
  }) async {
    try {
      await _dio.post(
        '/api/auth/two-factor/verify-otp',
        data: {
          'code': code.trim(),
          'trustDevice': trustDevice,
        },
      );
    } on DioException catch (e) {
      throw AuthFailure(_extractMessage(e, 'Invalid verification code.'));
    }
  }

  /// Sign out — clear local session data.
  static Future<void> signOut() async {
    try {
      await _dio.post('/api/auth/sign-out');
    } catch (_) {
      // Ignore network errors on logout
    } finally {
      await ApiClient.clearAuth();
    }
  }

  /// Retrieves the authenticated profile only from the server session cookie.
  static Future<AuthUser?> restoreSession() async {
    try {
      return await _getAuthenticatedSession();
    } on DioException catch (error) {
      if (error.response?.statusCode == 401) await ApiClient.clearAuth();
      return null;
    } catch (_) {
      return null;
    }
  }

  static Future<AuthUser?> getAuthenticatedSession() =>
      _getAuthenticatedSession();

  static Future<AuthUser?> _getAuthenticatedSession() async {
    final session = await _dio
        .get<dynamic>(
          '/api/auth/get-session',
          options: Options(receiveTimeout: const Duration(seconds: 3)),
        )
        .timeout(const Duration(seconds: 3));
    if (session.data is! Map<String, dynamic> ||
        (session.data as Map)['user'] == null) {
      return null;
    }
    final user = AuthUser.fromJson(session.data as Map<String, dynamic>);
    await ApiClient.saveUser(jsonEncode(user.toJson()));
    return user;
  }

  /// Extract a user-friendly error message from a Dio exception.
  static String _extractMessage(DioException e, String fallback) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.sendTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return 'Connection timed out. Check your internet connection and try again.';
    }

    if (e.type == DioExceptionType.connectionError) {
      return 'Cannot reach the TMS server. Check your connection or ask admin to confirm the mobile API URL.';
    }

    if (e.type == DioExceptionType.cancel) {
      return 'The request was cancelled. Please try again.';
    }

    if (e.response?.data is Map) {
      final body = e.response!.data as Map<String, dynamic>;
      final serverMessage =
          body['error'] as String? ?? body['message'] as String?;
      if (serverMessage != null && serverMessage.isNotEmpty) {
        return _friendlyServerMessage(serverMessage, fallback);
      }
    }

    final message = e.message;
    if (message != null && message.isNotEmpty) return message;

    return fallback;
  }

  static String _extractAuthMessage(DioException e) {
    final status = e.response?.statusCode;
    if (status == 400 || status == 401 || status == 403) {
      return _extractMessage(e, 'Invalid email or password.');
    }
    if (status != null && status >= 500) {
      return 'The TMS server could not complete sign in right now. Please try again shortly.';
    }
    return _extractMessage(e, 'Invalid email or password.');
  }

  static String _friendlyServerMessage(String message, String fallback) {
    final normalized = message.trim().toLowerCase();
    if (normalized == 'unauthorized' ||
        normalized == 'forbidden' ||
        normalized == 'bad request') {
      return fallback;
    }
    return message;
  }
}
