import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/auth/role_codes.dart';
import 'package:tms_mobile/core/sync/sync.dart';
import 'package:tms_mobile/core/notifications/push_notification_service.dart';
import 'package:tms_mobile/features/auth/data/auth_service.dart';

/// Global auth state — drives router guards and role-based navigation.
class AuthState {
  final AuthUser? user;
  final bool isAuthenticated;
  final bool isLoading;
  final bool isTwoFactorPending;
  final int attemptCount;

  const AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isLoading = true,
    this.isTwoFactorPending = false,
    this.attemptCount = 0,
  });

  AuthState copyWith({
    AuthUser? user,
    bool? isAuthenticated,
    bool? isLoading,
    bool? isTwoFactorPending,
    int? attemptCount,
  }) {
    return AuthState(
      user: user ?? this.user,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isLoading: isLoading ?? this.isLoading,
      isTwoFactorPending: isTwoFactorPending ?? this.isTwoFactorPending,
      attemptCount: attemptCount ?? this.attemptCount,
    );
  }

  /// Role-based redirect path — mirrors web AuthContext.roleRedirectPath.
  String get roleRedirectPath {
    if (user == null) return '/login';
    if (isTwoFactorPending) return '/2fa';

    return switch (user!.role) {
      RoleCodes.tenantAdmin => '/tenant/home',
      RoleCodes.branchAdmin => '/branch/home',
      RoleCodes.janitor => '/janitor/home',
      RoleCodes.teacher => '/teacher/home',
      RoleCodes.student => '/student/home',
      RoleCodes.parent => '/parent/home',
      _ => '/login',
    };
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState()) {
    _restoreSession();
  }

  /// Try to restore session from stored token + user.
  Future<void> _restoreSession() async {
    try {
      final user = await AuthService.restoreSession();
      if (user != null) {
        state = AuthState(
          user: user,
          isAuthenticated: true,
          isLoading: false,
        );
        await PushNotifications.startAuthenticatedSession();
      } else {
        state = const AuthState(isLoading: false);
      }
    } catch (_) {
      state = const AuthState(isLoading: false);
    }
  }

  /// Login with email and password.
  Future<void> login(String email, String password) async {
    if (state.attemptCount >= 5) {
      throw const AuthFailure(
        'Your account has been locked after 5 failed attempts.',
      );
    }

    state = state.copyWith(isLoading: true);

    try {
      final user = await AuthService.signIn(email: email, password: password);

      if (user.requiresTwoFactor) {
        // Send 2FA code immediately.
        try {
          await AuthService.sendTwoFactorCode(email);
        } catch (_) {
          // The 2FA screen offers a resend option.
        }

        state = AuthState(
          user: user,
          isAuthenticated: false,
          isLoading: false,
          isTwoFactorPending: true,
          attemptCount: 0,
        );
      } else {
        state = AuthState(
          user: user,
          isAuthenticated: true,
          isLoading: false,
        );
        await PushNotifications.startAuthenticatedSession();
      }
    } on AuthFailure {
      state = state.copyWith(
        isLoading: false,
        attemptCount: state.attemptCount + 1,
      );
      rethrow;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        attemptCount: state.attemptCount + 1,
      );
      throw AuthFailure('Login failed: $e');
    }
  }

  /// Complete 2FA verification.
  Future<void> verify2FA(String code) async {
    if (state.user == null) return;

    state = state.copyWith(isLoading: true);

    try {
      await AuthService.verifyTwoFactorCode(
        email: state.user!.email,
        code: code,
      );

      state = AuthState(
        user: state.user,
        isAuthenticated: true,
        isLoading: false,
      );
      await PushNotifications.startAuthenticatedSession();
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
    await PushNotifications.unregisterForLogout();
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

  /// Reset the failed-attempt counter (e.g. after a successful reset-password).
  void resetAttemptCount() {
    state = state.copyWith(attemptCount: 0);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier();
});
