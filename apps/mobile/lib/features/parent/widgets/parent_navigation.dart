import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/features/auth/widgets/account_actions.dart';

/// Shared navigation chrome for every top-level parent destination.
abstract final class ParentNavigation {
  static const routes = <String>[
    '/parent/home',
    '/parent/academics',
    '/parent/messages',
    '/parent/appointments',
  ];

  static void open(BuildContext context, int index) {
    if (index == routes.length) {
      showAccountActionsSheet(
        context,
        accountRoute: '/parent/account',
        passwordRoute: '/parent/change-password',
      );
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
