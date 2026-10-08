import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/navigation/android_back_coordinator.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/features/auth/data/device_account_vault.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';
import 'package:tms_mobile/shared/widgets/portal_navigation_drawer.dart';

/// Shared navigation chrome for the teacher portal's route-based screens.
abstract final class TeacherNavigation {
  static const drawerItems = <({String label, IconData icon, String route})>[
    (label: 'Home', icon: Icons.home_outlined, route: '/teacher/home'),
    (
      label: 'Timetable',
      icon: Icons.calendar_view_week_outlined,
      route: '/teacher/timetable'
    ),
    (
      label: 'Leave requests',
      icon: Icons.event_note_outlined,
      route: '/teacher/leave'
    ),
    (
      label: 'Academic calendar',
      icon: Icons.calendar_month_outlined,
      route: '/teacher/calendar'
    ),
    (label: 'Messages', icon: Icons.forum_outlined, route: '/teacher/messages'),
    (
      label: 'Meetings',
      icon: Icons.groups_outlined,
      route: '/teacher/meetings'
    ),
    (
      label: 'Notifications',
      icon: Icons.notifications_outlined,
      route: '/teacher/notifications'
    ),
    (
      label: 'Notice board',
      icon: Icons.campaign_outlined,
      route: '/teacher/notices'
    ),
    (
      label: 'Update syllabus',
      icon: Icons.menu_book_outlined,
      route: '/teacher/syllabus'
    ),
    (
      label: 'Homework',
      icon: Icons.assignment_outlined,
      route: '/teacher/homework'
    ),
    (
      label: 'Enter results',
      icon: Icons.analytics_outlined,
      route: '/teacher/results'
    ),
  ];

  static void openDashboardSection(BuildContext context, int index) {
    const sections = ['home', 'attendance', 'messages', 'classes', 'more'];
    final section = sections[index];
    if (section == 'messages') {
      context.go('/teacher/messages');
    } else if (section == 'classes') {
      context.go('/teacher/timetable');
    } else {
      context.go(
          section == 'home' ? '/teacher/home' : '/teacher/home?tab=$section');
    }
  }

  static Widget drawer(BuildContext context) {
    final router = GoRouter.maybeOf(context);
    final location =
        router?.routeInformationProvider.value.uri.path ?? '/teacher/home';
    final selected = drawerItems.indexWhere((item) => item.route == location);

    void open(String route) {
      Navigator.of(context).pop();
      if (route != location) router?.push(route);
    }

    return Consumer(
      builder: (context, ref, _) => PortalDrawerTheme(
        child: NavigationDrawer(
          selectedIndex: selected < 0 ? null : selected,
          onDestinationSelected: (index) => open(drawerItems[index].route),
          children: [
            PortalDrawerHeader(
              name: ref.watch(authProvider).user?.name ?? 'Teacher',
              subtitle: ref.watch(authProvider).user?.email ?? 'Teacher portal',
              avatar: CircleAvatar(
                radius: 30,
                backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                foregroundColor: kColorPrimary,
                child: const Icon(Icons.person_rounded, size: 30),
              ),
            ),
            for (final item in drawerItems)
              NavigationDrawerDestination(
                icon: Icon(item.icon),
                selectedIcon: Icon(item.icon),
                label: Text(
                  item.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            const Divider(indent: 28, endIndent: 28),
            const PortalDrawerSectionLabel('Account'),
            PortalDrawerAction(
              icon: Icons.manage_accounts_outlined,
              label: 'Profile settings',
              onTap: () => open('/teacher/account'),
            ),
            PortalDrawerAction(
              icon: Icons.key_rounded,
              label: 'Change password',
              onTap: () => open('/teacher/change-password'),
            ),
            PortalDrawerAction(
              icon: Icons.pin_outlined,
              label: 'Set or change MPIN',
              onTap: () => open('/teacher/mpin'),
            ),
            PortalDrawerAction(
              icon: Icons.switch_account_rounded,
              label: 'Switch account',
              onTap: () async {
                Navigator.of(context).pop();
                final currentId = ref.read(authProvider).user?.id;
                final accounts = await DeviceAccountVault().accounts();
                final hasCurrentMpin =
                    accounts.any((account) => account.userId == currentId);
                if (!hasCurrentMpin) {
                  router?.push(
                    '/teacher/mpin?switchAccount=${accounts.isEmpty ? 'add' : 'accounts'}',
                  );
                } else {
                  router?.push(accounts.length > 1
                      ? '/teacher/accounts'
                      : '/teacher/accounts/add');
                }
              },
            ),
            PortalDrawerAction(
              icon: Icons.logout_rounded,
              label: 'Log out',
              destructive: true,
              onTap: () {
                Navigator.of(context).pop();
                ref.read(authProvider.notifier).logout();
              },
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class TeacherDashboardNavigationBar extends StatelessWidget {
  const TeacherDashboardNavigationBar({
    super.key,
    required this.selectedIndex,
    this.onDestinationSelected,
  });

  final int selectedIndex;
  final ValueChanged<int>? onDestinationSelected;

  @override
  Widget build(BuildContext context) {
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    return AndroidBackCoordinator(
      router: GoRouter.of(context),
      child: NavigationBar(
        height: 80.0 + ((textScale - 1).clamp(0.0, 1.0) * 16.0).toDouble(),
        selectedIndex: selectedIndex,
        onDestinationSelected: onDestinationSelected ??
            (index) => TeacherNavigation.openDashboardSection(context, index),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.check_circle_outline),
            selectedIcon: Icon(Icons.check_circle),
            label: 'Attendance',
          ),
          NavigationDestination(
            icon: Icon(Icons.forum_outlined),
            selectedIcon: Icon(Icons.forum_rounded),
            label: 'Messages',
          ),
          NavigationDestination(
            icon: Icon(Icons.school_outlined),
            selectedIcon: Icon(Icons.school),
            label: 'Classes',
          ),
          NavigationDestination(
            icon: Icon(Icons.more_horiz_rounded),
            selectedIcon: Icon(Icons.more_rounded),
            label: 'More',
          ),
        ],
      ),
    );
  }
}

class TeacherPortalScaffold extends StatelessWidget {
  const TeacherPortalScaffold(
      {super.key,
      required this.title,
      required this.body,
      this.floatingActionButton});
  final String title;
  final Widget body;
  final Widget? floatingActionButton;

  @override
  Widget build(BuildContext context) {
    final path =
        GoRouter.maybeOf(context)?.routeInformationProvider.value.uri.path ??
            '';
    final selected = path == '/teacher/messages' ? 2 : 0;
    return Scaffold(
      drawer: TeacherNavigation.drawer(context),
      appBar: AppBar(title: Text(title)),
      body: ColoredBox(
        color: Theme.of(context).colorScheme.surfaceContainerLowest,
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1180),
              child: body,
            ),
          ),
        ),
      ),
      floatingActionButton: floatingActionButton,
      bottomNavigationBar:
          TeacherDashboardNavigationBar(selectedIndex: selected),
    );
  }
}
