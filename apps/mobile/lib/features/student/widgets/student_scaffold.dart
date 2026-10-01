import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/features/auth/data/device_account_vault.dart';
import 'package:tms_mobile/features/auth/data/account_repository.dart';

import '../student_design.dart';

class StudentScaffold extends ConsumerStatefulWidget {
  const StudentScaffold({
    super.key,
    required this.title,
    required this.body,
    this.selectedIndex,
    this.actions,
    this.floatingActionButton,
  });

  final String title;
  final Widget body;
  final int? selectedIndex;
  final List<Widget>? actions;
  final Widget? floatingActionButton;

  @override
  ConsumerState<StudentScaffold> createState() => _StudentScaffoldState();
}

class _StudentScaffoldState extends ConsumerState<StudentScaffold> {
  DateTime? _lastHomeBackPress;
  late final Future<PersonalAccount?> _drawerAccount;

  static const _bottomRoutes = <String>[
    '/student/home',
    '/student/academics',
    '/student/timetable',
    '/student/calendar',
    '/student/id',
  ];

  static const _navigationItems = <_StudentDrawerItem>[
    _StudentDrawerItem('Home', Icons.home_outlined, '/student/home'),
    _StudentDrawerItem(
        'Academics', Icons.school_outlined, '/student/academics'),
    _StudentDrawerItem(
      'Timetable',
      Icons.calendar_view_week_outlined,
      '/student/timetable',
    ),
    _StudentDrawerItem(
      'Calendar',
      Icons.calendar_month_outlined,
      '/student/calendar',
    ),
    _StudentDrawerItem('My ID', Icons.badge_outlined, '/student/id'),
    _StudentDrawerItem(
      'Attendance',
      Icons.fact_check_outlined,
      '/student/attendance',
    ),
    _StudentDrawerItem(
        'Leave requests', Icons.event_note_outlined, '/student/leave'),
    _StudentDrawerItem(
      'Certificates',
      Icons.workspace_premium_outlined,
      '/student/certificates',
    ),
    _StudentDrawerItem(
      'Fees & payments',
      Icons.payments_outlined,
      '/student/fees',
    ),
    _StudentDrawerItem(
      'Notifications',
      Icons.notifications_outlined,
      '/student/notifications',
    ),
    _StudentDrawerItem(
      'Notice board',
      Icons.campaign_outlined,
      '/student/notices',
    ),
  ];

  bool get _isHome => widget.selectedIndex == 0;

  @override
  void initState() {
    super.initState();
    _drawerAccount = ApiClient.instance.isInitialized
        ? AccountRepository().load()
        : Future<PersonalAccount?>.value();
  }

  void _open(String route) {
    Navigator.of(context).pop();
    if (widget.selectedIndex != null &&
        widget.selectedIndex! < 5 &&
        _navigationItems[widget.selectedIndex!].route == route) {
      return;
    }
    Future<void>.microtask(() {
      if (mounted) context.push(route);
    });
  }

  Future<void> _switchAccount() async {
    Navigator.of(context).pop();
    final currentId = ref.read(authProvider).user?.id;
    final accounts = await DeviceAccountVault().accounts();
    if (!mounted) return;
    final hasMpin = accounts.any((account) => account.userId == currentId);
    if (hasMpin) {
      context.push(
          accounts.length > 1 ? '/student/accounts' : '/student/accounts/add');
      return;
    }

    final proceed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Set MPIN before switching'),
        content: const Text(
          'Protect your current account with a 4-digit MPIN before signing in to another account.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Set MPIN'),
          ),
        ],
      ),
    );
    if (proceed == true && mounted) {
      final destination = accounts.length > 1 ? 'accounts' : 'add';
      context.push('/student/mpin?switchAccount=$destination');
    }
  }

  void _handleBack(bool didPop, Object? result) {
    if (didPop) return;
    if (!_isHome) {
      if (context.canPop()) {
        context.pop();
      } else {
        context.go('/student/home');
      }
      return;
    }

    final now = DateTime.now();
    if (_lastHomeBackPress != null &&
        now.difference(_lastHomeBackPress!) <= const Duration(seconds: 2)) {
      SystemNavigator.pop();
      return;
    }
    _lastHomeBackPress = now;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(
          content: Text('Press back again to exit'),
          duration: Duration(seconds: 2),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: buildStudentTheme(Theme.of(context)),
      child: Builder(
        builder: (context) => PopScope(
          canPop: false,
          onPopInvokedWithResult: _handleBack,
          child: Scaffold(
            appBar: AppBar(
              title: Text(widget.title),
              actions: [...?widget.actions],
            ),
            drawer: _buildDrawer(context),
            body: SafeArea(child: widget.body),
            floatingActionButton: widget.floatingActionButton,
            bottomNavigationBar: widget.selectedIndex == null
                ? null
                : NavigationBar(
                    selectedIndex: widget.selectedIndex!,
                    onDestinationSelected: (index) {
                      if (index != widget.selectedIndex) {
                        context.push(_bottomRoutes[index]);
                      }
                    },
                    destinations: const [
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
                        icon: Icon(Icons.calendar_view_week_outlined),
                        selectedIcon: Icon(Icons.calendar_view_week_rounded),
                        label: 'Timetable',
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
                  ),
          ),
        ),
      ),
    );
  }

  Widget _buildDrawer(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final baseTheme = Theme.of(context);
    return Theme(
      data: baseTheme.copyWith(
        navigationDrawerTheme: NavigationDrawerThemeData(
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
          indicatorColor: StudentColors.primary.withValues(alpha: .10),
          iconTheme: const WidgetStatePropertyAll(IconThemeData(
            color: StudentColors.primary,
          )),
          labelTextStyle: WidgetStateProperty.resolveWith(
            (states) => baseTheme.textTheme.bodyMedium?.copyWith(
              color: StudentColors.text,
              fontWeight: states.contains(WidgetState.selected)
                  ? FontWeight.w700
                  : FontWeight.w500,
            ),
          ),
        ),
        listTileTheme: const ListTileThemeData(
          iconColor: StudentColors.primary,
          textColor: StudentColors.text,
          minLeadingWidth: 24,
          horizontalTitleGap: 16,
        ),
        dividerColor: StudentColors.border,
        textTheme: baseTheme.textTheme.apply(
          bodyColor: StudentColors.text,
          displayColor: StudentColors.text,
        ),
      ),
      child: NavigationDrawer(
        selectedIndex: widget.selectedIndex,
        onDestinationSelected: (index) => _open(_navigationItems[index].route),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(28, 24, 28, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                FutureBuilder<PersonalAccount?>(
                  future: _drawerAccount,
                  builder: (context, snapshot) {
                    final account = snapshot.data;
                    return CircleAvatar(
                      radius: 38,
                      backgroundColor: Colors.white,
                      foregroundImage: account?.photoUrl?.isNotEmpty == true
                          ? NetworkImage(account!.photoUrl!)
                          : null,
                      child: account?.photoUrl?.isNotEmpty == true
                          ? null
                          : Text(
                              account?.initials.isNotEmpty == true
                                  ? account!.initials
                                  : (user?.name.isNotEmpty == true
                                      ? user!.name[0].toUpperCase()
                                      : 'S'),
                              style: const TextStyle(
                                color: StudentColors.primary,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                    );
                  },
                ),
                const SizedBox(height: 12),
                Text(
                  user?.name ?? 'Student',
                  style: Theme.of(context).textTheme.titleMedium,
                  textAlign: TextAlign.center,
                ),
                if (user?.email.isNotEmpty == true)
                  Text(
                    user!.email,
                    style: Theme.of(context).textTheme.bodySmall,
                    textAlign: TextAlign.center,
                  ),
              ],
            ),
          ),
          ..._navigationItems.map(
            (item) => NavigationDrawerDestination(
              icon: Icon(item.icon),
              selectedIcon: Icon(item.icon),
              label: Text(item.label),
            ),
          ),
          const Divider(indent: 28, endIndent: 28),
          const Padding(
            padding: EdgeInsets.fromLTRB(28, 8, 28, 4),
            child: Text('ACCOUNT'),
          ),
          ListTile(
            leading: const Icon(Icons.manage_accounts_outlined),
            title: const Text('Profile settings'),
            onTap: () => _open('/student/account'),
          ),
          ListTile(
            leading: const Icon(Icons.key_rounded),
            title: const Text('Change password'),
            onTap: () => _open('/student/change-password'),
          ),
          ListTile(
            leading: const Icon(Icons.pin_outlined),
            title: const Text('Set or change MPIN'),
            onTap: () => _open('/student/mpin'),
          ),
          ListTile(
            leading: const Icon(Icons.switch_account_rounded),
            title: const Text('Switch account'),
            onTap: _switchAccount,
          ),
          ListTile(
            leading: const Icon(
              Icons.logout_rounded,
              color: StudentColors.error,
            ),
            title: const Text(
              'Log out',
              style: TextStyle(color: StudentColors.error),
            ),
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

class _StudentDrawerItem {
  const _StudentDrawerItem(this.label, this.icon, this.route);

  final String label;
  final IconData icon;
  final String route;
}

class StudentStatusPill extends StatelessWidget {
  const StudentStatusPill({
    super.key,
    required this.label,
    required this.icon,
    required this.color,
  });

  final String label;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Status: $label',
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: TmsSpace.sm,
          vertical: TmsSpace.xs,
        ),
        decoration: BoxDecoration(
          color: color.withValues(alpha: .10),
          borderRadius: BorderRadius.circular(TmsRadius.pill),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: TmsSpace.xxs),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: color,
                      fontWeight: FontWeight.w700,
                    ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
