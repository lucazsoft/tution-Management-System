import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/auth/role_codes.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/features/auth/screens/login_screen.dart';
import 'package:tms_mobile/features/auth/screens/forgot_password_screen.dart';
import 'package:tms_mobile/features/auth/screens/reset_password_screen.dart';
import 'package:tms_mobile/features/auth/screens/two_factor_screen.dart';
import 'package:tms_mobile/features/auth/screens/change_password_screen.dart';
import 'package:tms_mobile/features/auth/screens/change_mobile_screen.dart';
import 'package:tms_mobile/features/auth/screens/change_email_screen.dart';
import 'package:tms_mobile/features/auth/screens/account_screen.dart';
import 'package:tms_mobile/features/auth/screens/device_accounts_screen.dart';
import 'package:tms_mobile/features/auth/screens/mpin_settings_screen.dart';
import 'package:tms_mobile/features/auth/screens/unsupported_mobile_role_screen.dart';
import 'package:tms_mobile/features/teacher/screens/teacher_home_screen.dart';
import 'package:tms_mobile/features/teacher/screens/teacher_timetable_screen.dart';
import 'package:tms_mobile/features/teacher/screens/teacher_leave_screen.dart';
import 'package:tms_mobile/features/teacher/screens/geo_attendance_screen.dart';
import 'package:tms_mobile/features/teacher/models/teacher_models.dart';
import 'package:tms_mobile/features/parent/screens/parent_home_screen.dart';
import 'package:tms_mobile/features/parent/screens/parent_attendance_screen.dart';
import 'package:tms_mobile/features/parent/screens/parent_fees_screen.dart';
import 'package:tms_mobile/features/parent/screens/parent_academics_screen.dart';
import 'package:tms_mobile/features/parent/screens/parent_messages_screen.dart';
import 'package:tms_mobile/features/parent/screens/parent_appointments_screen.dart';
import 'package:tms_mobile/features/parent/screens/parent_calendar_screen.dart';
import 'package:tms_mobile/features/parent/screens/parent_timetable_screen.dart';
import 'package:tms_mobile/features/parent/screens/parent_leave_screen.dart';
import 'package:tms_mobile/features/student/screens/student_home_screen.dart';
import 'package:tms_mobile/features/student/screens/student_timetable_screen.dart';
import 'package:tms_mobile/features/student/screens/student_fees_screen.dart';
import 'package:tms_mobile/features/student/screens/student_id_screen.dart';
import 'package:tms_mobile/features/student/screens/student_academics_screen.dart';
import 'package:tms_mobile/features/student/screens/student_attendance_screen.dart';
import 'package:tms_mobile/features/student/screens/student_calendar_screen.dart';
import 'package:tms_mobile/features/student/screens/student_certificates_screen.dart';
import 'package:tms_mobile/features/student/screens/student_notifications_screen.dart';
import 'package:tms_mobile/features/student/screens/student_leave_screen.dart';
import 'package:tms_mobile/features/branch_manager/screens/branch_home_screen.dart';
import 'package:tms_mobile/features/janitor/screens/janitor_home_screen.dart';
import 'package:tms_mobile/features/tenant_admin/screens/tenant_admin_home_screen.dart';

@visibleForTesting
String? mobileRoleBoundaryRedirect({
  required AuthState authState,
  required String location,
}) {
  final isLoggedIn = authState.isAuthenticated;
  final is2FAPending = authState.isTwoFactorPending;
  final isLoading = authState.isLoading;

  if (isLoading) return null;

  const publicRoutes = [
    '/login',
    '/saved-accounts',
    '/forgot-password',
    '/reset-password',
    '/2fa'
  ];
  final isPublicRoute = publicRoutes.contains(location);

  if (is2FAPending && location != '/2fa') {
    return '/2fa';
  }

  if (!isLoggedIn && !isPublicRoute && !is2FAPending) {
    return '/login';
  }

  if (isLoggedIn && isPublicRoute) {
    return authState.roleRedirectPath;
  }

  if (isLoggedIn) {
    final allowedPrefix = switch (authState.user?.role) {
      RoleCodes.tenantAdmin => '/tenant/',
      RoleCodes.branchAdmin => '/branch/',
      RoleCodes.accountant => '/unsupported-role',
      RoleCodes.janitor => '/janitor/',
      RoleCodes.webPortalOnly => '/unsupported-role',
      RoleCodes.teacher => '/teacher/',
      RoleCodes.student => '/student/',
      RoleCodes.parent => '/parent/',
      _ => null,
    };
    if (allowedPrefix == null) {
      return authState.roleRedirectPath;
    }
    if (allowedPrefix == '/unsupported-role' &&
        location != '/unsupported-role') {
      return authState.roleRedirectPath;
    }
    if (allowedPrefix != '/unsupported-role' &&
        !location.startsWith(allowedPrefix)) {
      return authState.roleRedirectPath;
    }
  }

  return null;
}

@visibleForTesting
String navigationSessionIdentity(AuthState authState) {
  final user = authState.user;
  if (!authState.isAuthenticated || user == null) return 'signed-out';

  return [
    user.id,
    user.email.trim().toLowerCase(),
    user.role,
    user.tenantId ?? '',
  ].join('|');
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final authRefresh = ValueNotifier<AuthState>(ref.read(authProvider));
  ref.listen<AuthState>(authProvider, (_, next) => authRefresh.value = next);
  ref.onDispose(authRefresh.dispose);

  // MOB-005: a 401 anywhere in the app drops provider state so the
  // redirect guard below sends the user to /login (session-expired path).
  ApiClient.onSessionInvalidated =
      () => ref.read(authProvider.notifier).forceLogout();

  return GoRouter(
    initialLocation: '/login',
    debugLogDiagnostics: true,
    refreshListenable: authRefresh,

    // ── Auth redirect guard ──
    // Mirrors the web RequireAuth / RedirectIfAuth / RequireTwoFactor logic.
    redirect: (BuildContext context, GoRouterState state) {
      return mobileRoleBoundaryRedirect(
        authState: authRefresh.value,
        location: state.matchedLocation,
      );
    },

    routes: <RouteBase>[
      // ── Public auth routes ──
      GoRoute(
        path: '/login',
        builder: (BuildContext context, GoRouterState state) =>
            const LoginScreen(),
      ),
      GoRoute(
        path: '/saved-accounts',
        builder: (BuildContext context, GoRouterState state) =>
            const DeviceAccountsScreen(loginMode: true),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (BuildContext context, GoRouterState state) =>
            const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/reset-password',
        builder: (BuildContext context, GoRouterState state) {
          final args = state.extra as Map<String, String>?;
          return ResetPasswordScreen(
            email: args?['email'] ?? '',
            resetToken: args?['resetToken'] ?? '',
          );
        },
      ),
      GoRoute(
        path: '/2fa',
        builder: (BuildContext context, GoRouterState _) =>
            const TwoFactorScreen(),
      ),

      GoRoute(
        path: '/unsupported-role',
        builder: (BuildContext context, GoRouterState state) =>
            const UnsupportedMobileRoleScreen(),
      ),
      // ── Teacher routes ──
      GoRoute(
        path: '/teacher/home',
        builder: (BuildContext context, GoRouterState state) =>
            TeacherHomeScreen(
          key: ValueKey(navigationSessionIdentity(authRefresh.value)),
        ),
      ),
      GoRoute(
        path: '/teacher/change-password',
        builder: (BuildContext context, GoRouterState state) =>
            const ChangePasswordScreen(),
      ),
      GoRoute(
          path: '/teacher/mpin',
          builder: (_, state) => MpinSettingsScreen(
              switchAccountRoute:
                  state.uri.queryParameters['switchAccount'] == 'accounts'
                      ? '/teacher/accounts'
                      : state.uri.queryParameters['switchAccount'] == 'add'
                          ? '/teacher/accounts/add'
                          : null)),
      GoRoute(
          path: '/tenant/home',
          builder: (_, __) => TenantAdminHomeScreen(
              key: ValueKey(navigationSessionIdentity(authRefresh.value)))),
      GoRoute(
          path: '/tenant/account',
          builder: (_, __) =>
              const AccountScreen(passwordRoute: '/tenant/change-password')),
      GoRoute(
          path: '/tenant/accounts',
          builder: (_, __) => const DeviceAccountsScreen()),
      GoRoute(
          path: '/tenant/accounts/add',
          builder: (_, __) => const LoginScreen(addAccountMode: true)),
      GoRoute(
          path: '/tenant/change-password',
          builder: (_, __) => const ChangePasswordScreen()),
      GoRoute(
          path: '/tenant/mpin',
          builder: (_, state) => MpinSettingsScreen(
              switchAccountRoute:
                  state.uri.queryParameters['switchAccount'] == 'accounts'
                      ? '/tenant/accounts'
                      : state.uri.queryParameters['switchAccount'] == 'add'
                          ? '/tenant/accounts/add'
                          : null)),
      GoRoute(
          path: '/branch/home',
          builder: (_, __) => BranchHomeScreen(
              key: ValueKey(navigationSessionIdentity(authRefresh.value)))),
      GoRoute(
          path: '/branch/account',
          builder: (_, __) =>
              const AccountScreen(passwordRoute: '/branch/change-password')),
      GoRoute(
          path: '/branch/accounts',
          builder: (_, __) => const DeviceAccountsScreen()),
      GoRoute(
          path: '/branch/accounts/add',
          builder: (_, __) => const LoginScreen(addAccountMode: true)),
      GoRoute(
          path: '/branch/change-password',
          builder: (_, __) => const ChangePasswordScreen()),
      GoRoute(
          path: '/branch/mpin',
          builder: (_, state) => MpinSettingsScreen(
              switchAccountRoute:
                  state.uri.queryParameters['switchAccount'] == 'accounts'
                      ? '/branch/accounts'
                      : state.uri.queryParameters['switchAccount'] == 'add'
                          ? '/branch/accounts/add'
                          : null)),
      GoRoute(
          path: '/janitor/home',
          builder: (_, __) => JanitorHomeScreen(
              key: ValueKey(navigationSessionIdentity(authRefresh.value)))),
      GoRoute(
          path: '/janitor/account',
          builder: (_, __) =>
              const AccountScreen(passwordRoute: '/janitor/change-password')),
      GoRoute(
          path: '/janitor/accounts',
          builder: (_, __) => const DeviceAccountsScreen()),
      GoRoute(
          path: '/janitor/accounts/add',
          builder: (_, __) => const LoginScreen(addAccountMode: true)),
      GoRoute(
          path: '/janitor/change-password',
          builder: (_, __) => const ChangePasswordScreen()),
      GoRoute(
          path: '/janitor/mpin',
          builder: (_, state) => MpinSettingsScreen(
              switchAccountRoute:
                  state.uri.queryParameters['switchAccount'] == 'accounts'
                      ? '/janitor/accounts'
                      : state.uri.queryParameters['switchAccount'] == 'add'
                          ? '/janitor/accounts/add'
                          : null)),
      GoRoute(
        path: '/teacher/account',
        builder: (_, __) =>
            const AccountScreen(passwordRoute: '/teacher/change-password'),
      ),
      GoRoute(
          path: '/teacher/accounts',
          builder: (_, __) => const DeviceAccountsScreen()),
      GoRoute(
          path: '/teacher/accounts/add',
          builder: (_, __) => const LoginScreen(addAccountMode: true)),
      GoRoute(
        path: '/teacher/timetable',
        builder: (BuildContext context, GoRouterState state) =>
            const TeacherTimetableScreen(),
      ),
      GoRoute(
        path: '/teacher/leave',
        builder: (BuildContext context, GoRouterState state) =>
            const TeacherLeaveScreen(),
      ),
      GoRoute(
        path: '/teacher/attendance',
        builder: (BuildContext context, GoRouterState state) {
          final session = state.extra as TeacherClassSession?;
          if (session == null) {
            return const Scaffold(
              body: Center(
                child: Text('Session data is required for geo attendance.'),
              ),
            );
          }
          return GeoAttendanceScreen(session: session);
        },
      ),

      // ── Parent routes ──
      GoRoute(
        path: '/parent/home',
        builder: (BuildContext context, GoRouterState state) =>
            ParentHomeScreen(
          key: ValueKey(navigationSessionIdentity(authRefresh.value)),
        ),
      ),
      GoRoute(
        path: '/parent/change-password',
        builder: (BuildContext context, GoRouterState state) =>
            const ChangePasswordScreen(),
      ),
      GoRoute(
          path: '/parent/mpin',
          builder: (_, state) => MpinSettingsScreen(
              switchAccountRoute:
                  state.uri.queryParameters['switchAccount'] == 'accounts'
                      ? '/parent/accounts'
                      : state.uri.queryParameters['switchAccount'] == 'add'
                          ? '/parent/accounts/add'
                          : null)),
      GoRoute(
        path: '/parent/account',
        builder: (_, __) =>
            const AccountScreen(passwordRoute: '/parent/change-password'),
      ),
      GoRoute(
          path: '/parent/accounts',
          builder: (_, __) => const DeviceAccountsScreen()),
      GoRoute(
          path: '/parent/accounts/add',
          builder: (_, __) => const LoginScreen(addAccountMode: true)),
      GoRoute(
        path: '/parent/timetable',
        builder: (_, __) => const ParentTimetableScreen(),
      ),
      GoRoute(
        path: '/parent/attendance',
        builder: (BuildContext context, GoRouterState state) =>
            const ParentAttendanceScreen(),
      ),
      GoRoute(
          path: '/parent/leave', builder: (_, __) => const ParentLeaveScreen()),
      GoRoute(
        path: '/parent/fees',
        builder: (BuildContext context, GoRouterState state) =>
            const ParentFeesScreen(),
      ),
      GoRoute(
        path: '/parent/academics',
        builder: (BuildContext context, GoRouterState state) =>
            const ParentAcademicsScreen(),
      ),
      GoRoute(
        path: '/parent/calendar',
        builder: (BuildContext context, GoRouterState state) =>
            const ParentCalendarScreen(),
      ),
      GoRoute(
        path: '/parent/messages',
        builder: (_, __) => const ParentMessagesScreen(),
      ),
      GoRoute(
        path: '/parent/appointments',
        builder: (_, __) => const ParentAppointmentsScreen(),
      ),

      // ── Student routes ──
      GoRoute(
        path: '/student/home',
        builder: (BuildContext context, GoRouterState state) =>
            StudentHomeScreen(
          key: ValueKey(navigationSessionIdentity(authRefresh.value)),
        ),
      ),
      GoRoute(
        path: '/student/change-password',
        builder: (BuildContext context, GoRouterState state) =>
            const ChangePasswordScreen(),
      ),
      GoRoute(
        path: '/student/change-mobile',
        builder: (BuildContext context, GoRouterState state) =>
            const ChangeMobileScreen(),
      ),
      GoRoute(
        path: '/student/change-email',
        builder: (BuildContext context, GoRouterState state) =>
            const ChangeEmailScreen(),
      ),
      GoRoute(
          path: '/student/mpin',
          builder: (_, state) => MpinSettingsScreen(
              switchAccountRoute:
                  state.uri.queryParameters['switchAccount'] == 'accounts'
                      ? '/student/accounts'
                      : state.uri.queryParameters['switchAccount'] == 'add'
                          ? '/student/accounts/add'
                          : null)),
      GoRoute(
        path: '/student/account',
        builder: (_, __) =>
            const AccountScreen(passwordRoute: '/student/change-password'),
      ),
      GoRoute(
          path: '/student/accounts',
          builder: (_, __) => const DeviceAccountsScreen()),
      GoRoute(
          path: '/student/accounts/add',
          builder: (_, __) => const LoginScreen(addAccountMode: true)),
      GoRoute(
        path: '/student/timetable',
        builder: (BuildContext context, GoRouterState state) =>
            const StudentTimetableScreen(),
      ),
      GoRoute(
        path: '/student/fees',
        builder: (BuildContext context, GoRouterState state) =>
            const StudentFeesScreen(),
      ),
      GoRoute(
        path: '/student/id',
        builder: (BuildContext context, GoRouterState state) =>
            const StudentIdScreen(),
      ),
      GoRoute(
        path: '/student/academics',
        builder: (BuildContext context, GoRouterState state) =>
            StudentAcademicsScreen(
          initialSegment:
              state.uri.queryParameters['tab'] == 'homework' ? 2 : 0,
        ),
      ),
      GoRoute(
        path: '/student/attendance',
        builder: (BuildContext context, GoRouterState state) =>
            const StudentAttendanceScreen(),
      ),
      GoRoute(
          path: '/student/leave',
          builder: (_, __) => const StudentLeaveScreen()),
      GoRoute(
        path: '/student/calendar',
        builder: (BuildContext context, GoRouterState state) =>
            const StudentCalendarScreen(),
      ),
      GoRoute(
        path: '/student/certificates',
        builder: (BuildContext context, GoRouterState state) =>
            const StudentCertificatesScreen(),
      ),
      GoRoute(
        path: '/student/notifications',
        builder: (BuildContext context, GoRouterState state) =>
            const StudentNotificationsScreen(),
      ),
    ],
  );
});
