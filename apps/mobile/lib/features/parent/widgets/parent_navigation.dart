import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Shared navigation chrome for every top-level parent destination.
abstract final class ParentNavigation {
  static const routes = <String>[
    '/parent/home',
    '/parent/academics',
    '/parent/attendance',
    '/parent/fees',
  ];

  static void open(BuildContext context, int index) {
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
            label: 'Dashboard',
          ),
          NavigationDestination(
            icon: Icon(Icons.school_outlined),
            selectedIcon: Icon(Icons.school_rounded),
            label: 'Academics',
          ),
          NavigationDestination(
            icon: Icon(Icons.fact_check_outlined),
            selectedIcon: Icon(Icons.fact_check_rounded),
            label: 'Attendance',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long_rounded),
            label: 'Fees',
          ),
        ],
      );
}
