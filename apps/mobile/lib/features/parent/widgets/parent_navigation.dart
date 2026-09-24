import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/features/auth/data/device_account_vault.dart';

/// Shared navigation chrome for every top-level parent destination.
abstract final class ParentNavigation {
  static const drawerItems = <({String label, IconData icon, String route})>[
    (label: 'Home', icon: Icons.home_outlined, route: '/parent/home'),
    (
      label: 'Academics',
      icon: Icons.school_outlined,
      route: '/parent/academics'
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
    (label: 'Messages', icon: Icons.forum_outlined, route: '/parent/messages'),
    (
      label: 'Meetings',
      icon: Icons.event_available_outlined,
      route: '/parent/appointments'
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
    if (GoRouterState.of(context).matchedLocation != route) context.go(route);
  }

  static void back(BuildContext context) {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/parent/home');
    }
  }

  static Widget drawer(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final router = GoRouter.of(context);
    final selected = drawerItems.indexWhere((item) => item.route == location);
    void open(String route) {
      Navigator.of(context).pop();
      if (route != location) {
        router.push(route);
      }
    }

    return Consumer(
      builder: (context, ref, _) => NavigationDrawer(
        selectedIndex: selected < 0 ? null : selected,
        onDestinationSelected: (index) => open(drawerItems[index].route),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(28, 28, 28, 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 30,
                  backgroundColor:
                      Theme.of(context).colorScheme.primaryContainer,
                  child: const Icon(Icons.family_restroom_rounded, size: 30),
                ),
                const SizedBox(height: 12),
                Text(ref.watch(authProvider).user?.name ?? 'Parent',
                    style: Theme.of(context).textTheme.titleLarge),
                Text(ref.watch(authProvider).user?.email ?? 'Parent portal',
                    style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          for (final item in drawerItems)
            NavigationDrawerDestination(
              icon: Icon(item.icon),
              selectedIcon: Icon(item.icon),
              label: Text(item.label),
            ),
          const Divider(indent: 28, endIndent: 28),
          const Padding(
            padding: EdgeInsets.fromLTRB(28, 8, 28, 4),
            child: Text('ACCOUNT'),
          ),
          ListTile(
            leading: const Icon(Icons.manage_accounts_outlined),
            title: const Text('Profile settings'),
            onTap: () => open('/parent/account'),
          ),
          ListTile(
            leading: const Icon(Icons.key_rounded),
            title: const Text('Change password'),
            onTap: () => open('/parent/change-password'),
          ),
          ListTile(
            leading: const Icon(Icons.pin_outlined),
            title: const Text('Set or change MPIN'),
            onTap: () => open('/parent/mpin'),
          ),
          ListTile(
            leading: const Icon(Icons.switch_account_rounded),
            title: const Text('Switch account'),
            onTap: () async {
              Navigator.of(context).pop();
              final currentId = ref.read(authProvider).user?.id;
              final accounts = await DeviceAccountVault().accounts();
              final hasCurrentMpin =
                  accounts.any((account) => account.userId == currentId);
              if (!hasCurrentMpin) {
                router.push(
                  '/parent/mpin?switchAccount=${accounts.isEmpty ? 'add' : 'accounts'}',
                );
              } else {
                router.push(accounts.length > 1
                    ? '/parent/accounts'
                    : '/parent/accounts/add');
              }
            },
          ),
          ListTile(
            leading: Icon(Icons.logout_rounded,
                color: Theme.of(context).colorScheme.error),
            title: Text('Log out',
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
            onTap: () {
              Navigator.of(context).pop();
              ref.read(authProvider.notifier).logout();
            },
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class ParentNavigationBar extends StatelessWidget {
  const ParentNavigationBar({super.key, required this.selectedIndex});

  final int selectedIndex;

  @override
  Widget build(BuildContext context) => NavigationBar(
        selectedIndex: selectedIndex,
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
}
