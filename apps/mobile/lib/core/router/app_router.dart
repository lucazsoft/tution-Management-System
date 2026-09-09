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
import 'package:tms_mobile/features/branch_manager/screens/branch_home_screen.dart';
import 'package:tms_mobile/features/janitor/screens/janitor_home_screen.dart';
import 'package:tms_mobile/features/janitor/screens/janitor_task_detail_screen.dart';
import 'package:tms_mobile/features/janitor/models/janitor_task.dart';
import 'package:tms_mobile/features/tenant_admin/screens/tenant_admin_home_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  // MOB-005: a 401 anywhere in the app drops provider state so the
  // redirect guard below sends the user to /login (session-expired path).
  ApiClient.onSessionInvalidated =
      () => ref.read(authProvider.notifier).forceLogout();

  final router = GoRouter(
    initialLocation: '/login',
    debugLogDiagnostics: true,

    // ── Auth redirect guard ──
    // Mirrors the web RequireAuth / RedirectIfAuth / RequireTwoFactor logic.
    redirect: (BuildContext context, GoRouterState state) {
      final isLoggedIn = authState.isAuthenticated;
      final is2FAPending = authState.isTwoFactorPending;
      final isLoading = authState.isLoading;
      final location = state.matchedLocation;

      // While restoring session, don't redirect.
      if (isLoading) return null;

      // Public routes that don't require auth.
      const publicRoutes = [
        '/login',
        '/forgot-password',
        '/reset-password',
        '/2fa'
      ];
      final isPublicRoute = publicRoutes.contains(location);

      // If 2FA is pending, force the user to /2fa.
      if (is2FAPending && location != '/2fa') {
        return '/2fa';
      }

      // If not logged in and trying to access a protected route → login.
      if (!isLoggedIn && !isPublicRoute && !is2FAPending) {
        return '/login';
      }

      // If logged in and on a public route → redirect to role home.
      if (isLoggedIn && isPublicRoute) {
        return authState.roleRedirectPath;
      }

      // A valid session is not permission to browse another role's portal.
      // Server authorization remains authoritative for data, while this guard
      // prevents an invalid deep link from rendering an unrelated UI first.
      if (isLoggedIn) {
        final allowedPrefix = switch (authState.user?.role) {
          RoleCodes.tenantAdmin => '/tenant/',
          RoleCodes.branchAdmin => '/branch/',
          RoleCodes.janitor => '/janitor/',
          RoleCodes.teacher => '/teacher/',
          RoleCodes.student => '/student/',
          RoleCodes.parent => '/parent/',
          _ => null,
        };
        if (allowedPrefix == null || !location.startsWith(allowedPrefix)) {
          return authState.roleRedirectPath;
        }
      }

      return null;
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
        builder: (BuildContext context, GoRouterState state) {
          final email = state.extra as String? ??
              ref.read(authProvider).user?.email ??
              '';
          return TwoFactorScreen(email: email);
        },
      ),

      // ── Branch Manager routes (canonical role: BRANCH_ADMIN) ──
      GoRoute(
        path: '/branch/home',
        builder: (BuildContext context, GoRouterState state) =>
            const BranchHomeScreen(),
      ),
      GoRoute(
        path: '/branch/change-password',
        builder: (BuildContext context, GoRouterState state) =>
            const ChangePasswordScreen(),
      ),

      // ── Tenant Admin routes ──
      GoRoute(
        path: '/tenant/home',
        builder: (BuildContext context, GoRouterState state) =>
            const TenantAdminHomeScreen(),
      ),
      GoRoute(
        path: '/tenant/change-password',
        builder: (BuildContext context, GoRouterState state) =>
            const ChangePasswordScreen(),
      ),

      // ── Janitor routes ──
      GoRoute(
        path: '/janitor/home',
        builder: (BuildContext context, GoRouterState state) =>
            const JanitorHomeScreen(),
      ),
      GoRoute(
        path: '/janitor/change-password',
        builder: (BuildContext context, GoRouterState state) =>
            const ChangePasswordScreen(),
      ),
      GoRoute(
        path: '/janitor/task',
        builder: (BuildContext context, GoRouterState state) {
          final task = state.extra as JanitorTask?;
          if (task == null) {
            return const Scaffold(
              body: Center(child: Text('Task details are unavailable.')),
            );
          }
          return JanitorTaskDetailScreen(task: task);
        },
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
