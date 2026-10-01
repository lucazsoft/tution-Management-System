/// API-backed branch manager home screen (MVVM).
///
/// Reads [BranchPortalViewModel] (one `GET /api/branch-admin/dashboard` plus
/// `GET /api/leaves?level=L1` per load). Covers loading / empty / error /
/// denied / offline states. Petty-cash approvals read their queue from the
/// dashboard snapshot and refresh it after each decision.
///
/// Verified live paths:
/// - `GET /api/branch-admin/dashboard`
/// - `GET /api/leaves?level=L1`
/// - `POST /api/leaves/approve/:leaveId`
/// - `GET /api/finances/petty-cash`
/// Petty cash is read-only here: funding decisions are tenant-admin-only,
/// so no approve action is offered (TODO when the backend adds one).
///
/// Server-side but intentionally not on this screen: teacher-workflows,
/// fee overrides, emergency-out, appointment respond, petty-cash L1 reject.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tms_mobile/core/adaptive/capabilities.dart';
import 'package:tms_mobile/core/adaptive/widgets/adaptive_layout.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/features/branch_manager/models/branch_portal_dto.dart';
import 'package:tms_mobile/features/branch_manager/viewmodels/branch_portal_viewmodel.dart';
import 'package:tms_mobile/features/branch_manager/widgets/branch_record_states.dart';
import 'package:tms_mobile/features/auth/widgets/account_actions.dart';
import 'package:tms_mobile/features/student/widgets/nepal_date_time.dart';

/// Branch-scoped operational dashboard for the API role `BRANCH_ADMIN`.
class BranchHomeScreen extends ConsumerWidget {
  const BranchHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(branchPortalViewModelProvider);
    final vm = ref.read(branchPortalViewModelProvider.notifier);

    ref.listen<BranchPortalState>(
      branchPortalViewModelProvider,
      (previous, next) {
        final notice = next.notice;
        if (notice != null && notice.isNotEmpty && notice != previous?.notice) {
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(SnackBar(content: Text(notice)));
          vm.clearNotice();
        }
      },
    );

    return Scaffold(
      appBar: AppBar(
        title: const Text('Branch Manager'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: state.isRefreshing ? null : vm.refresh,
          ),
        ],
      ),
      body: SafeArea(child: _body(context, state, vm)),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        onDestinationSelected: (index) {
          if (index == 1) {
            showAccountActionsSheet(
              context,
              accountRoute: '/branch/account',
              passwordRoute: '/branch/change-password',
            );
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard_rounded),
            label: 'Dashboard',
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

  Widget _body(
    BuildContext context,
    BranchPortalState state,
    BranchPortalViewModel vm,
  ) {
    if (state.isLoading && !state.hasData) {
      return const BranchLoadingView(message: 'Loading branch dashboard…');
    }
    if (state.isDenied && !state.hasData) {
      return BranchDeniedView(
        message: state.error ?? 'You cannot view this branch dashboard.',
      );
    }
    if (state.isOffline && !state.hasData) {
      return BranchOfflineView(
        message: state.error ?? 'Check your connection and try again.',
        onRetry: vm.load,
      );
    }
    if (state.hasError && !state.hasData) {
      return BranchErrorView(
        message: state.error ?? 'Could not load the branch dashboard.',
        onRetry: vm.load,
      );
    }
    final dashboard = state.dashboard;
    if (dashboard == null ||
        (dashboard.branches.isEmpty && dashboard.selectedBranch == null)) {
      return BranchEmptyView(
        icon: Icons.business_outlined,
        title: 'No managed branch',
        message: state.error ?? 'No managed branch is assigned.',
      );
    }
    return RefreshIndicator(
      onRefresh: vm.refresh,
      child: ResponsiveBuilder(
        builder: (context, sizeClass) {
          final columns =
              const UseTwoColumns().isAvailableAt(sizeClass) ? 2 : 1;
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              if (state.isOffline && state.hasData) const _OfflineBar(),
              if (state.error != null && state.hasData)
                _InlineError(
                  message: state.error!,
                  onRetry: vm.refresh,
                ),
              const NepalDateTimeHeader(),
              const SizedBox(height: 20),
              _BranchHeader(
                dashboard: dashboard,
                onSelect: vm.selectBranch,
              ),
              const SizedBox(height: 20),
              _KpiGrid(dashboard: dashboard, state: state, columns: columns),
              const SizedBox(height: 28),
              Text('Operations', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              _ActionCard(
                icon: Icons.people_outline,
                title: 'People',
                subtitle:
                    'Teachers present ${dashboard.metrics.teacherAttendance.present}/${dashboard.metrics.teacherAttendance.total} · Fee-blocked students ${dashboard.metrics.blockedStudents}',
                onTap: () {},
              ),
              const SizedBox(height: 12),
              _ActionCard(
                icon: Icons.approval_outlined,
                title: 'Approvals',
                subtitle:
                    '${state.pendingLeaves.length} leave · ${state.pendingCash.length} petty-cash awaiting L1 review',
                onTap: () {},
              ),
              const SizedBox(height: 12),
              _ActionCard(
                icon: Icons.inventory_2_outlined,
                title: 'Resources & tasks',
                subtitle:
                    '${dashboard.resources.where((r) => r.actionRequired).length} need action · ${dashboard.metrics.pendingAppointments} appointments pending',
                onTap: () {},
              ),
              const SizedBox(height: 28),
              _LeaveQueueSection(state: state, vm: vm),
              const SizedBox(height: 28),
              _PettyCashSection(state: state, vm: vm),
              const SizedBox(height: 28),
              Text('Priority items',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              _PriorityList(dashboard: dashboard),
              const SizedBox(height: 28),
              Text('More branch tools',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              const _FollowUpsNote(),
            ],
          );
        },
      ),
    );
  }
}

class _OfflineBar extends StatelessWidget {
  const _OfflineBar();

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: ListTile(
        leading: Icon(Icons.cloud_off_outlined),
        title: Text('You are offline'),
        subtitle: Text('Showing the last loaded dashboard.'),
      ),
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: const Icon(Icons.error_outline_rounded),
        title: const Text('Refresh failed'),
        subtitle: Text(message),
        trailing: IconButton(
          tooltip: 'Retry',
          icon: const Icon(Icons.refresh_rounded),
          onPressed: onRetry,
        ),
      ),
    );
  }
}

class _BranchHeader extends StatelessWidget {
  const _BranchHeader({required this.dashboard, required this.onSelect});

  final BranchDashboard dashboard;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final selected = dashboard.selectedBranch;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          selected == null || selected.name.isEmpty
              ? 'Branch operations'
              : '${selected.name} Branch',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(height: 4),
        Text(
          'Branch operations overview',
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: kColorText.withValues(alpha: 0.65),
              ),
        ),
        if (dashboard.branches.length > 1) ...[
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            key: const Key('branch-selector'),
            initialValue: selected?.id.isNotEmpty == true ? selected!.id : null,
            decoration: const InputDecoration(labelText: 'Branch'),
            items: dashboard.branches
                .map((branch) => DropdownMenuItem(
                      value: branch.id,
                      child: Text(branch.name),
                    ))
                .toList(),
            onChanged: (id) {
              if (id != null && id.isNotEmpty) onSelect(id);
            },
          ),
        ],
      ],
    );
  }
}

class _KpiGrid extends StatelessWidget {
  const _KpiGrid({
    required this.dashboard,
    required this.state,
    required this.columns,
  });

  final BranchDashboard dashboard;
  final BranchPortalState state;
  final int columns;

  @override
  Widget build(BuildContext context) {
    final metrics = dashboard.metrics;
    final teacher = metrics.teacherAttendance;
    final actionCount =
        dashboard.resources.where((r) => r.actionRequired).length;
    return GridView.count(
      crossAxisCount: columns,
      childAspectRatio: columns == 1 ? 3.0 : 2.3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      children: [
        _BranchKpi(
          label: 'Attendance today',
          value: metrics.studentAttendance.label,
          icon: Icons.fact_check_outlined,
          color: kColorSuccess,
        ),
        _BranchKpi(
          label: 'Staff on duty',
          value: teacher.total == 0
              ? '—'
              : '${teacher.present} / ${teacher.total}',
          icon: Icons.badge_outlined,
          color: kColorPrimary,
        ),
        _BranchKpi(
          label: 'L1 approvals',
          value: '${state.pendingLeaves.length}',
          icon: Icons.approval_outlined,
          color: kColorWarning,
        ),
        _BranchKpi(
          label: 'Open resource tasks',
          value: '$actionCount',
          icon: Icons.handyman_outlined,
          color: kColorInfo,
        ),
      ],
    );
  }
}

class _LeaveQueueSection extends StatelessWidget {
  const _LeaveQueueSection({required this.state, required this.vm});

  final BranchPortalState state;
  final BranchPortalViewModel vm;

  @override
  Widget build(BuildContext context) {
    final pending = state.pendingLeaves;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Leave approvals (L1)',
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        if (pending.isEmpty)
          const Card(
            child: ListTile(
              leading: Icon(Icons.check_circle_outline_rounded),
              title: Text('No leave requests awaiting L1 review'),
            ),
          )
        else
          ...pending.take(5).map((leave) {
            final deciding = state.decidingLeaveId == leave.id;
            return Card(
              child: ListTile(
                title: Text(
                  leave.staffName.isEmpty ? leave.leaveType : leave.staffName,
                ),
                subtitle: Text(
                  '${leave.leaveType} · ${leave.reason}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: deciding
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            key: Key('approve-leave-${leave.id}'),
                            tooltip: 'Approve',
                            icon: const Icon(Icons.check_rounded),
                            onPressed: () =>
                                vm.decideLeave(leave, approve: true),
                          ),
                          IconButton(
                            key: Key('reject-leave-${leave.id}'),
                            tooltip: 'Reject',
                            icon: const Icon(Icons.close_rounded),
                            onPressed: () async {
                              final remarks = await _remarksDialog(context);
                              if (remarks == null) return;
                              await vm.decideLeave(
                                leave,
                                approve: false,
                                remarks: remarks,
                              );
                            },
                          ),
                        ],
                      ),
              ),
            );
          }),
      ],
    );
  }

  static Future<String?> _remarksDialog(BuildContext context) {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Reject leave request'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Rejection reason (required)',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.of(dialogContext).pop(controller.text.trim()),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
  }
}

class _PettyCashSection extends StatelessWidget {
  const _PettyCashSection({required this.state, required this.vm});

  final BranchPortalState state;
  final BranchPortalViewModel vm;

  @override
  Widget build(BuildContext context) {
    final pending = state.pendingCash;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Petty cash', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        if (pending.isEmpty)
          const Card(
            child: ListTile(
              leading: Icon(Icons.check_circle_outline_rounded),
              title: Text('No pending petty-cash requests'),
            ),
          )
        else
          ...pending.take(5).map((entry) {
            return Card(
              child: ListTile(
                key: Key('cash-${entry.id}'),
                title:
                    Text(entry.purpose.isEmpty ? 'Petty cash' : entry.purpose),
                subtitle: Text(
                    'NPR ${entry.amount.toStringAsFixed(2)} • ${entry.status}'),
                trailing: const Icon(Icons.visibility_outlined),
              ),
            );
          }),
      ],
    );
  }
}

class _PriorityList extends StatelessWidget {
  const _PriorityList({required this.dashboard});

  final BranchDashboard dashboard;

  @override
  Widget build(BuildContext context) {
    final items = <Widget>[];
    for (final resource in dashboard.resources.where((r) => r.actionRequired)) {
      items.add(_PriorityItem(
        title: resource.label.isEmpty ? 'Resource task' : resource.label,
        detail: resource.detail,
        color: kColorError,
      ));
    }
    for (final appointment in dashboard.appointments.take(3)) {
      items.add(_PriorityItem(
        title: 'Meeting: ${appointment.student}',
        detail: appointment.description,
        color: kColorWarning,
      ));
    }
    if (items.isEmpty) {
      return const Card(
        child: ListTile(
          leading: Icon(Icons.check_circle_outline_rounded),
          title: Text('All clear'),
          subtitle: Text('No priority branch items right now.'),
        ),
      );
    }
    return Column(
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          items[i],
        ],
      ],
    );
  }
}

class _FollowUpsNote extends StatelessWidget {
  const _FollowUpsNote();

  @override
  Widget build(BuildContext context) {
    return Text(
      'Teacher workflows, fee overrides, emergency-out, and appointment '
      'responses stay in their own flows and are not shown on this screen.',
      style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: kColorText.withValues(alpha: 0.6),
          ),
    );
  }
}

class _BranchKpi extends StatelessWidget {
  const _BranchKpi({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: color.withValues(alpha: 0.12),
              foregroundColor: color,
              child: Icon(icon),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(value, style: Theme.of(context).textTheme.titleLarge),
                  Text(label, style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon, color: kColorPrimary),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right_rounded),
        onTap: onTap,
      ),
    );
  }
}

class _PriorityItem extends StatelessWidget {
  const _PriorityItem({
    required this.title,
    required this.detail,
    required this.color,
  });

  final String title;
  final String detail;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(Icons.priority_high_rounded, color: color),
        title: Text(title),
        subtitle: Text(detail),
      ),
    );
  }
}
