import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/auth/role_codes.dart';
import 'package:tms_mobile/core/sync/sync.dart';
import 'package:tms_mobile/features/auth/data/auth_service.dart';
import 'package:tms_mobile/features/auth/data/device_account_vault.dart';

/// Global auth state — drives router guards and role-based navigation.
class AuthState {
  final AuthUser? user;
  final bool isAuthenticated;
  final bool isLoading;
  final bool isTwoFactorPending;
  final String? pendingEmail;
  final String? errorMessage;

  const AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isLoading = true,
    this.isTwoFactorPending = false,
    this.pendingEmail,
    this.errorMessage,
  });

  AuthState copyWith({
    AuthUser? user,
    bool? isAuthenticated,
    bool? isLoading,
    bool? isTwoFactorPending,
    String? pendingEmail,
    String? errorMessage,
    bool clearPendingEmail = false,
    bool clearError = false,
  }) {
    return AuthState(
      user: user ?? this.user,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isLoading: isLoading ?? this.isLoading,
      isTwoFactorPending: isTwoFactorPending ?? this.isTwoFactorPending,
      pendingEmail:
          clearPendingEmail ? null : (pendingEmail ?? this.pendingEmail),
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }

  /// Role-based redirect path — mirrors web AuthContext.roleRedirectPath.
  String get roleRedirectPath {
    if (user == null) return '/login';
    if (isTwoFactorPending) return '/2fa';

    return switch (user!.role) {
      RoleCodes.tenantAdmin => '/tenant/home',
      RoleCodes.branchAdmin => '/branch/home',
      RoleCodes.accountant => '/unsupported-role',
      RoleCodes.janitor => '/janitor/home',
      RoleCodes.webPortalOnly => '/unsupported-role',
      RoleCodes.teacher => '/teacher/home',
      RoleCodes.student => '/student/home',
      RoleCodes.parent => '/parent/home',
      _ => '/unsupported-role',
    };
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState()) {
    _restoreSession();
  }

  int _operationVersion = 0;

  /// Restore only a session the server verifies from its cookie.
  Future<void> _restoreSession() async {
    final version = _operationVersion;
    try {
      final user = await AuthService.restoreSession();
      if (version != _operationVersion) return;
      if (user != null) {
        state = AuthState(
          user: user,
          isAuthenticated: true,
          isLoading: false,
        );
      } else {
        state = const AuthState(isLoading: false);
      }
    } catch (_) {
      if (version != _operationVersion) return;
      state = const AuthState(isLoading: false);
    }
  }

  /// Login with email and password.
  Future<void> login(String email, String password) async {
    _operationVersion++;
    state = const AuthState(isLoading: true);

    try {
      final result = await AuthService.signIn(email: email, password: password);

      if (result.requiresTwoFactor) {
        state = AuthState(
          isAuthenticated: false,
          isLoading: false,
          isTwoFactorPending: true,
          pendingEmail: result.pendingEmail,
        );
      } else {
        final user = result.user;
        if (user == null) {
          throw const AuthFailure(
              'The server did not return an account session.');
        }
        state = AuthState(
          user: user,
          isAuthenticated: true,
          isLoading: false,
        );
      }
    } on AuthFailure catch (error) {
      state = AuthState(
        isLoading: false,
        errorMessage: error.message,
      );
      rethrow;
    } catch (e) {
      final error = AuthFailure('Login failed: $e');
      state = AuthState(
        isLoading: false,
        errorMessage: error.message,
      );
      throw error;
    }
  }

  /// Authenticates another device account without discarding the current UI
  /// session on a simple credential failure. The server remains the source of
  /// truth and replaces its single cookie session only after valid sign-in.
  Future<AuthUser?> activateDeviceAccount(String email, String password) async {
    _operationVersion++;
    final previous = state;
    state = previous.copyWith(isLoading: true, clearError: true);
    try {
      final result = await AuthService.signIn(email: email, password: password);
      if (result.requiresTwoFactor) {
        state = AuthState(
          isLoading: false,
          isTwoFactorPending: true,
          pendingEmail: result.pendingEmail,
        );
        return null;
      }
      final user = result.user;
      if (user == null) {
        throw const AuthFailure('Account sign-in did not complete.');
      }
      state = AuthState(user: user, isAuthenticated: true, isLoading: false);
      return user;
    } on AuthFailure catch (error) {
      state = previous.copyWith(isLoading: false, errorMessage: error.message);
      rethrow;
    }
  }

  /// Verifies credentials for Add Account while keeping the visible account
  /// unchanged until the caller has completed mandatory MPIN enrollment.
  Future<PasswordSignInResult> prepareDeviceAccount(
      String email, String password) async {
    final previous = state;
    try {
      final result = await AuthService.signIn(email: email, password: password);
      return result;
    } on AuthFailure catch (error) {
      state = previous.copyWith(isLoading: false, errorMessage: error.message);
      rethrow;
    }
  }

  void beginDeviceAccountTwoFactor(String email) {
    state = AuthState(
      isLoading: false,
      isTwoFactorPending: true,
      pendingEmail: email.trim().toLowerCase(),
    );
  }

  void completeDeviceAccountSignIn(AuthUser user) {
    state = AuthState(user: user, isAuthenticated: true, isLoading: false);
  }

  void clearError() {
    if (state.errorMessage == null) return;
    state = state.copyWith(clearError: true);
  }

  Future<void> send2FACode() async {
    if (!state.isTwoFactorPending || state.pendingEmail == null) {
      throw const AuthFailure('Start sign-in again before requesting a code.');
    }
    await AuthService.sendTwoFactorCode();
  }

  void cancel2FA() {
    state = const AuthState(isLoading: false);
  }

  /// Complete 2FA verification.
  Future<void> verify2FA(String code, {required bool trustDevice}) async {
    if (!state.isTwoFactorPending || state.pendingEmail == null) {
      throw const AuthFailure(
          'Your verification challenge has expired. Sign in again.');
    }

    state = state.copyWith(isLoading: true);

    try {
      await AuthService.verifyTwoFactorCode(
        code: code,
        trustDevice: trustDevice,
      );
      final user = await AuthService.getAuthenticatedSession();
      if (user == null) {
        throw const AuthFailure(
            'Verification completed without an authenticated session.');
      }
      state = AuthState(
        user: user,
        isAuthenticated: true,
        isLoading: false,
      );
      await DeviceAccountVault().completePendingEnrollment(user);
    } on AuthFailure {
      state = state.copyWith(isLoading: false);
      rethrow;
    }
  }

  /// Sign out and clear all session data.
  ///
  /// Captures the current user id BEFORE clearing state, then wipes that
  /// user's offline rows ([clearOfflineCache]). A null/empty id skips the
  /// wipe safely.
  Future<void> logout() async {
    final userId = state.user?.id;
    await AuthService.signOut();
    if (userId != null && userId.isNotEmpty) {
      await clearOfflineCache(userId);
    }
    state = const AuthState(isLoading: false);
  }

  /// Drop local session state without a network call (401/session-expired
  /// path — the server already rejected the session). Drives router to /login.
  ///
  /// Captures the user id first, then wipes that user's offline rows exactly
  /// once: after the first call the state user is null, so repeat calls
  /// (e.g. concurrent 401s via [ApiClient.clearAuth] + onSessionInvalidated)
  /// are safe no-ops that never touch another user's rows.
  Future<void> forceLogout() async {
    final userId = state.user?.id;
    state = const AuthState(isLoading: false);
    if (userId != null && userId.isNotEmpty) {
      await clearOfflineCache(userId);
    }
  }

  /// Seed an authenticated user in tests without touching the network.
  @visibleForTesting
  void seedAuthenticatedForTesting(AuthUser user) {
    state = AuthState(
      user: user,
      isAuthenticated: true,
      isLoading: false,
    );
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier();
});
