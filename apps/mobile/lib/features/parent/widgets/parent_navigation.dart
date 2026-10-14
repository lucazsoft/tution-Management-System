import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/navigation/android_back_coordinator.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/features/auth/data/device_account_vault.dart';
import 'package:tms_mobile/features/auth/data/account_repository.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';
import 'package:tms_mobile/shared/widgets/portal_navigation_drawer.dart';

/// Shared navigation chrome for every top-level parent destination.
abstract final class ParentNavigation {
  static const primaryNavigationItemCount = 4;

  static const drawerItems = <({String label, IconData icon, String route})>[
    (label: 'Home', icon: Icons.home_outlined, route: '/parent/home'),
    (label: 'Classes', icon: Icons.school_outlined, route: '/parent/academics'),
    (label: 'Chat', icon: Icons.forum_outlined, route: '/parent/messages'),
    (
      label: 'Meetings',
      icon: Icons.event_outlined,
      route: '/parent/appointments'
    ),
    (
      label: 'Timetable',
      icon: Icons.calendar_view_week_outlined,
      route: '/parent/timetable'
    ),
    (
      label: 'Attendance',
      icon: Icons.fact_check_outlined,
      route: '/parent/attendance'
    ),
    (
      label: 'Leave requests',
      icon: Icons.event_note_outlined,
      route: '/parent/leave'
    ),
    (
      label: 'Bills & payments',
      icon: Icons.receipt_long_outlined,
      route: '/parent/fees'
    ),
    (
      label: 'Events & calendar',
      icon: Icons.calendar_month_outlined,
      route: '/parent/calendar'
    ),
    (
      label: 'Notice board',
      icon: Icons.campaign_outlined,
      route: '/parent/notices'
    ),
  ];

  static const routes = <String>[
    '/parent/home',
    '/parent/academics',
    '/parent/messages',
    '/parent/appointments',
  ];

  static void open(BuildContext context, int index) {
    if (index == routes.length) {
      Scaffold.of(context).openDrawer();
      return;
    }
    final route = routes[index];
    if (GoRouterState.of(context).matchedLocation == route) return;
    index == 0 ? context.go(route) : context.push(route);
  }

  static void back(BuildContext context) {
    context.go('/parent/home');
  }

  static Widget drawer(BuildContext context) {
    String? location;
    GoRouter? router;
    try {
      location = GoRouterState.of(context).matchedLocation;
      router = GoRouter.of(context);
    } on GoError {
      // Widget tests and embedded previews may render the drawer without a
      // page-route-backed GoRouter state.
    }
    final selected = drawerItems.indexWhere((item) => item.route == location);
    void open(String route) {
      Navigator.of(context).pop();
      if (route != location && router != null) {
        router.push(route);
      }
    }

    return Consumer(
      builder: (context, ref, _) {
        final account = ref.watch(personalAccountProvider).asData?.value;
        final user = ref.watch(authProvider).user;
        return PortalDrawerTheme(
          child: NavigationDrawer(
            tilePadding: const EdgeInsets.symmetric(horizontal: 8),
            selectedIndex: selected < 0 ? null : selected,
            onDestinationSelected: (index) => open(drawerItems[index].route),
            children: [
              PortalDrawerHeader(
                name: account?.name.isNotEmpty == true
                    ? account!.name
                    : user?.name ?? 'Parent',
                subtitle: account?.email.isNotEmpty == true
                    ? account!.email
                    : user?.email ?? 'Parent portal',
                onTap: () => open('/parent/account'),
                avatar: CircleAvatar(
                  radius: 30,
                  backgroundColor:
                      Theme.of(context).colorScheme.primaryContainer,
                  foregroundColor: kColorPrimary,
                  child: const Icon(Icons.family_restroom_rounded, size: 30),
                ),
              ),
              const PortalDrawerSectionLabel('Navigation'),
              for (final item in drawerItems.take(primaryNavigationItemCount))
                NavigationDrawerDestination(
                  icon: Icon(item.icon),
                  selectedIcon: Icon(item.icon),
                  label: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 200),
                    child: Text(
                      item.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              const PortalDrawerDivider(),
              const PortalDrawerSectionLabel('Features'),
              for (final item in drawerItems.skip(primaryNavigationItemCount))
                NavigationDrawerDestination(
                  icon: Icon(item.icon),
                  selectedIcon: Icon(item.icon),
                  label: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 200),
                    child: Text(
                      item.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              const PortalDrawerDivider(),
              const PortalDrawerSectionLabel('Account'),
              PortalDrawerAction(
                icon: Icons.manage_accounts_outlined,
                label: 'Profile settings',
                useExactAndroidDestinationLayout: true,
                onTap: () => open('/parent/account'),
              ),
              PortalDrawerAction(
                icon: Icons.key_rounded,
                label: 'Change password',
                useExactAndroidDestinationLayout: true,
                onTap: () => open('/parent/change-password'),
              ),
              PortalDrawerAction(
                icon: Icons.pin_outlined,
                label: 'Set or change MPIN',
                useExactAndroidDestinationLayout: true,
                onTap: () => open('/parent/mpin'),
              ),
              PortalDrawerAction(
                icon: Icons.switch_account_rounded,
                label: 'Switch account',
                useExactAndroidDestinationLayout: true,
                onTap: () async {
                  Navigator.of(context).pop();
                  final currentId = ref.read(authProvider).user?.id;
                  final accounts = await DeviceAccountVault().accounts();
                  final hasCurrentMpin =
                      accounts.any((account) => account.userId == currentId);
                  if (!hasCurrentMpin) {
                    router?.push(
                      '/parent/mpin?switchAccount=${accounts.isEmpty ? 'add' : 'accounts'}',
                    );
                  } else {
                    router?.push(accounts.length > 1
                        ? '/parent/accounts'
                        : '/parent/accounts/add');
                  }
                },
              ),
              PortalDrawerAction(
                icon: Icons.logout_rounded,
                label: 'Log out',
                destructive: true,
                useExactAndroidDestinationLayout: true,
                onTap: () {
                  Navigator.of(context).pop();
                  ref.read(authProvider.notifier).logout();
                },
              ),
              const SizedBox(height: 16),
            ],
          ),
        );
      },
    );
  }
}

class ParentNavigationBar extends StatelessWidget {
  const ParentNavigationBar({
    super.key,
    required this.selectedIndex,
    this.coordinateSystemBack = true,
    this.onBack,
  });

  final int selectedIndex;
  final bool coordinateSystemBack;
  final bool Function()? onBack;

  @override
  Widget build(BuildContext context) {
    final router = GoRouter.maybeOf(context);
    String? path;
    try {
      path = GoRouterState.of(context).matchedLocation;
    } on GoError {
      path = router?.routeInformationProvider.value.uri.path;
    }
    final effectiveSelectedIndex = switch (path) {
      '/parent/home' => 0,
      '/parent/academics' || '/parent/timetable' => 1,
      '/parent/messages' => 2,
      '/parent/appointments' => 3,
      null => selectedIndex,
      _ => 4,
    };
    final navigationBar = NavigationBar(
      selectedIndex: effectiveSelectedIndex,
      onDestinationSelected: (index) => ParentNavigation.open(context, index),
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.home_outlined),
          selectedIcon: Icon(Icons.home_rounded),
          label: 'Home',
        ),
        NavigationDestination(
          icon: Icon(Icons.school_outlined),
          selectedIcon: Icon(Icons.school_rounded),
          label: 'Classes',
        ),
        NavigationDestination(
          icon: Icon(Icons.forum_outlined),
          selectedIcon: Icon(Icons.forum_rounded),
          label: 'Chat',
        ),
        NavigationDestination(
          icon: Icon(Icons.event_outlined),
          selectedIcon: Icon(Icons.event_rounded),
          label: 'Meetings',
        ),
        NavigationDestination(
          icon: Icon(Icons.more_horiz_rounded),
          selectedIcon: Icon(Icons.more_rounded),
          label: 'More',
        ),
      ],
    );
    if (!coordinateSystemBack) return navigationBar;
    return router == null
        ? navigationBar
        : AndroidBackCoordinator(
            router: router,
            onBack: onBack,
            child: navigationBar,
          );
  }
}
