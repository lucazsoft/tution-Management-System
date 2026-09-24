/// Unified application shell providing consistent navigation chrome across all portals.
///
/// Features:
/// - Adaptive AppBar with back navigation, logout, and profile actions
/// - Role-aware routing for profile/settings destinations
/// - Consistent theming and behavior across Teacher/Student/Parent portals
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';

/// Configuration for a portal's navigation shell.
class AppShellConfig {
  const AppShellConfig({
    required this.portalName,
    required this.routes,
    required this.profileRoute,
    required this.settingsRoute,
    this.showBackButton = true,
    this.showLogout = true,
    this.showProfile = true,
    this.actions = const [],
    this.floatingActionButton,
  });

  /// Display name for the portal (e.g., 'Teacher', 'Student', 'Parent')
  final String portalName;

  /// List of bottom navigation destinations
  final List<NavigationDestination> routes;

  /// Route for profile screen
  final String profileRoute;

  /// Route for settings screen
  final String settingsRoute;

  /// Whether to show back button (for sub-screens)
  final bool showBackButton;

  /// Whether to show logout button
  final bool showLogout;

  /// Whether to show profile button
  final bool showProfile;

  /// Additional custom actions
  final List<Widget> actions;

  /// Optional floating action button
  final Widget? floatingActionButton;
}

/// Unified shell widget that wraps portal content with consistent chrome.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({
    super.key,
    required this.config,
    required this.child,
    this.currentIndex = 0,
    this.onDestinationSelected,
    this.canPop = false,
  });

  final AppShellConfig config;
  final Widget child;
  final int currentIndex;
  final ValueChanged<int>? onDestinationSelected;
  final bool canPop;

  /// Teacher portal shell configuration
  static const AppShellConfig teacherConfig = AppShellConfig(
    portalName: 'Teacher',
    routes: [
      NavigationDestination(
        icon: Icon(Icons.home_outlined),
        selectedIcon: Icon(Icons.home_rounded),
        label: 'Today',
      ),
      NavigationDestination(
        icon: Icon(Icons.calendar_month_outlined),
        selectedIcon: Icon(Icons.calendar_month_rounded),
        label: 'Timetable',
      ),
      NavigationDestination(
        icon: Icon(Icons.check_circle_outline),
        selectedIcon: Icon(Icons.check_circle_rounded),
        label: 'Attendance',
      ),
      NavigationDestination(
        icon: Icon(Icons.person_outline),
        selectedIcon: Icon(Icons.person_rounded),
        label: 'Profile',
      ),
    ],
    profileRoute: '/teacher/profile',
    settingsRoute: '/teacher/settings',
    showBackButton: false,
  );

  /// Student portal shell configuration
  static const AppShellConfig studentConfig = AppShellConfig(
    portalName: 'Student',
    routes: [
      NavigationDestination(
        icon: Icon(Icons.home_outlined),
        selectedIcon: Icon(Icons.home_rounded),
        label: 'Home',
      ),
      NavigationDestination(
        icon: Icon(Icons.school_outlined),
        selectedIcon: Icon(Icons.school_rounded),
        label: 'Academics',
      ),
      NavigationDestination(
        icon: Icon(Icons.receipt_long_outlined),
        selectedIcon: Icon(Icons.receipt_long_rounded),
        label: 'Fees',
      ),
      NavigationDestination(
        icon: Icon(Icons.calendar_month_outlined),
        selectedIcon: Icon(Icons.calendar_month_rounded),
        label: 'Calendar',
      ),
      NavigationDestination(
        icon: Icon(Icons.badge_outlined),
        selectedIcon: Icon(Icons.badge_rounded),
        label: 'My ID',
      ),
    ],
    profileRoute: '/student/profile',
    settingsRoute: '/student/settings',
    showBackButton: false,
  );

  /// Parent portal shell configuration
  static const AppShellConfig parentConfig = AppShellConfig(
    portalName: 'Parent',
    routes: [
      NavigationDestination(
        icon: Icon(Icons.home_outlined),
        selectedIcon: Icon(Icons.home_rounded),
        label: 'Dashboard',
      ),
      NavigationDestination(
        icon: Icon(Icons.people_outlined),
        selectedIcon: Icon(Icons.people_rounded),
        label: 'Children',
      ),
      NavigationDestination(
        icon: Icon(Icons.receipt_long_outlined),
        selectedIcon: Icon(Icons.receipt_long_rounded),
        label: 'Fees',
      ),
      NavigationDestination(
        icon: Icon(Icons.fact_check_outlined),
        selectedIcon: Icon(Icons.fact_check_rounded),
        label: 'Attendance',
      ),
    ],
    profileRoute: '/parent/profile',
    settingsRoute: '/parent/settings',
    showBackButton: false,
  );

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  late int _selectedIndex;

  @override
  void initState() {
    super.initState();
    _selectedIndex = widget.currentIndex;
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final user = authState.user;
    final isSubScreen = widget.canPop;

    return Scaffold(
      appBar: _buildAppBar(context, user, isSubScreen),
      body: SafeArea(child: widget.child),
      bottomNavigationBar: isSubScreen
          ? null
          : NavigationBar(
              selectedIndex: _selectedIndex,
              onDestinationSelected: (index) {
                setState(() => _selectedIndex = index);
                widget.onDestinationSelected?.call(index);
              },
              destinations: widget.config.routes,
            ),
      floatingActionButton: widget.config.floatingActionButton,
    );
  }

  PreferredSizeWidget _buildAppBar(
      BuildContext context, dynamic user, bool isSubScreen) {
    if (isSubScreen && widget.config.showBackButton) {
      return AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
          tooltip: 'Back',
        ),
        title: Text(widget.config.portalName),
        actions: _buildTrailingActions(context, user),
      );
    }

    return AppBar(
      title: Text(widget.config.portalName),
      leading: isSubScreen && widget.config.showBackButton
          ? IconButton(
              icon: const Icon(Icons.arrow_back_rounded),
              onPressed: () => context.pop(),
              tooltip: 'Back',
            )
          : null,
      automaticallyImplyLeading: isSubScreen && widget.config.showBackButton,
      actions: _buildTrailingActions(context, user),
    );
  }

  List<Widget> _buildTrailingActions(BuildContext context, dynamic user) {
    final actions = <Widget>[];

    // Add custom actions from config
    actions.addAll(widget.config.actions);

    // Profile button
    if (widget.config.showProfile) {
      actions.add(
        IconButton(
          icon: const Icon(Icons.person_outline_rounded),
          onPressed: () => context.push(widget.config.profileRoute),
          tooltip: 'Profile',
        ),
      );
    }

    // Logout button
    if (widget.config.showLogout) {
      actions.add(
        IconButton(
          icon: const Icon(Icons.logout_rounded),
          onPressed: () => _showLogoutDialog(context, ref),
          tooltip: 'Logout',
        ),
      );
    }

    // Add spacing
    if (actions.isNotEmpty) {
      actions.add(const SizedBox(width: 8));
    }

    return actions;
  }

  Future<void> _showLogoutDialog(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Logout'),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      ref.read(authProvider.notifier).logout();
    }
  }
}

/// Sub-screen wrapper that provides back button in AppBar
class AppSubScreen extends ConsumerWidget {
  const AppSubScreen({
    super.key,
    required this.title,
    required this.child,
    this.actions = const [],
    this.floatingActionButton,
    this.showProfile = true,
  });

  final String title;
  final Widget child;
  final List<Widget> actions;
  final Widget? floatingActionButton;
  final bool showProfile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
          tooltip: 'Back',
        ),
        actions: [
          ...actions,
          if (showProfile)
            IconButton(
              icon: const Icon(Icons.person_outline_rounded),
              onPressed: () {
                // Navigate to profile based on current route context
                final location = GoRouterState.of(context).uri.toString();
                if (location.startsWith('/teacher/')) {
                  context.push('/teacher/profile');
                } else if (location.startsWith('/student/')) {
                  context.push('/student/profile');
                } else if (location.startsWith('/parent/')) {
                  context.push('/parent/profile');
                }
              },
              tooltip: 'Profile',
            ),
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            onPressed: () => _showLogoutDialog(context, ref),
            tooltip: 'Logout',
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(child: child),
      floatingActionButton: floatingActionButton,
    );
  }

  Future<void> _showLogoutDialog(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Logout'),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      ref.read(authProvider.notifier).logout();
    }
  }
}
