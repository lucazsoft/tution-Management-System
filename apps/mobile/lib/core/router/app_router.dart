import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/auth/role_codes.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/notifications/push_notification_service.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/features/auth/screens/login_screen.dart';
import 'package:tms_mobile/features/auth/screens/forgot_password_screen.dart';
import 'package:tms_mobile/features/auth/screens/reset_password_screen.dart';
import 'package:tms_mobile/features/auth/screens/two_factor_screen.dart';
import 'package:tms_mobile/features/auth/screens/change_password_screen.dart';
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
import 'package:tms_mobile/features/student/screens/student_home_screen.dart';
import 'package:tms_mobile/features/student/screens/student_timetable_screen.dart';
import 'package:tms_mobile/features/student/screens/student_fees_screen.dart';
import 'package:tms_mobile/features/student/screens/student_id_screen.dart';
import 'package:tms_mobile/features/student/screens/student_academics_screen.dart';
import 'package:tms_mobile/features/student/screens/student_attendance_screen.dart';
import 'package:tms_mobile/features/student/screens/student_calendar_screen.dart';
import 'package:tms_mobile/features/student/screens/student_certificates_screen.dart';
import 'package:tms_mobile/features/student/screens/student_notifications_screen.dart';

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
      RoleCodes.tenantAdmin => '/unsupported-role',
      RoleCodes.branchAdmin => '/unsupported-role',
      RoleCodes.accountant => '/unsupported-role',
      RoleCodes.janitor => '/unsupported-role',
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

final appRouterProvider = Provider<GoRouter>((ref) {
  final authRefresh = ValueNotifier<AuthState>(ref.read(authProvider));
  ref.listen<AuthState>(authProvider, (_, next) => authRefresh.value = next);
  ref.onDispose(authRefresh.dispose);

  // MOB-005: a 401 anywhere in the app drops provider state so the
  // redirect guard below sends the user to /login (session-expired path).
  ApiClient.onSessionInvalidated =
      () => ref.read(authProvider.notifier).forceLogout();

  final router = GoRouter(
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
            const TeacherHomeScreen(),
      ),
      GoRoute(
        path: '/teacher/change-password',
        builder: (BuildContext context, GoRouterState state) =>
            const ChangePasswordScreen(),
      ),
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
            const ParentHomeScreen(),
      ),
      GoRoute(
        path: '/parent/change-password',
        builder: (BuildContext context, GoRouterState state) =>
            const ChangePasswordScreen(),
      ),
      GoRoute(
        path: '/parent/attendance',
        builder: (BuildContext context, GoRouterState state) =>
            const ParentAttendanceScreen(),
      ),
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

      // ── Student routes ──
      GoRoute(
        path: '/student/home',
        builder: (BuildContext context, GoRouterState state) =>
            const StudentHomeScreen(),
      ),
      GoRoute(
        path: '/student/change-password',
        builder: (BuildContext context, GoRouterState state) =>
            const ChangePasswordScreen(),
      ),
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
            const StudentAcademicsScreen(),
      ),
      GoRoute(
        path: '/student/attendance',
        builder: (BuildContext context, GoRouterState state) =>
            const StudentAttendanceScreen(),
      ),
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
  PushNotifications.deepLinkHandler = router.go;
  return router;
});
