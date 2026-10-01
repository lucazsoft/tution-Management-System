import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/features/tenant_admin/models/tenant_admin_dashboard.dart';
import 'package:tms_mobile/features/tenant_admin/widgets/tenant_admin_state_view.dart';
import 'package:tms_mobile/features/auth/widgets/account_actions.dart';
import 'package:tms_mobile/features/student/widgets/nepal_date_time.dart';
import 'package:go_router/go_router.dart';

/// Tenant-wide operational dashboard backed by
/// `GET /api/tenant-admin/dashboard`.
///
/// Tenant scope is server-derived from the Better Auth session cookie —
/// the client never sends a tenant identifier.
///
/// Missing server-side (TODO(api), never demo data — actions surface a
/// "not available yet" message until the backend adds the route):
/// - per-branch pending-approval counts (tiles show staffing/enrolment only)
/// - tenant notification feed (no notifications affordance)
/// - tenant-scoped people/reports/approvals list endpoints behind
///   `GET /api/tenant-admin/*`.
class TenantAdminHomeScreen extends ConsumerWidget {
  const TenantAdminHomeScreen({super.key});

  static const _pagePadding = 20.0;
  static const _sectionSpacing = 24.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tenant operations'),
        actions: [
          IconButton(
            tooltip: 'Manage notice board',
            onPressed: () => context.push('/tenant/notices'),
            icon: const Icon(Icons.campaign_outlined),
          ),
        ],
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final isExpanded = constraints.maxWidth >= 840;
            final maxContentWidth = isExpanded ? 1200.0 : 800.0;

            return Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: maxContentWidth),
                child: TenantAdminStateView(
                  padding: const EdgeInsets.all(_pagePadding),
                  builder: (context, dashboard) => Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const NepalDateTimeHeader(),
                      const SizedBox(height: _sectionSpacing),
                      Text(
                        'Tenant-wide overview',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Monitor branches, staffing, and enrolment across your organisation.',
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      const SizedBox(height: _sectionSpacing),
                      _KpiGrid(dashboard: dashboard),
                      const SizedBox(height: _sectionSpacing),
                      if (isExpanded)
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              flex: 3,
                              child: _BranchOverview(
                                dashboard: dashboard,
                              ),
                            ),
                            const SizedBox(width: _sectionSpacing),
                            Expanded(
                              flex: 2,
                              child: _QuickActions(
                                onActionSelected: (label) =>
                                    _showUnavailable(context, label),
                              ),
                            ),
                          ],
                        )
                      else ...[
                        _BranchOverview(dashboard: dashboard),
                        const SizedBox(height: _sectionSpacing),
                        _QuickActions(
                          onActionSelected: (label) =>
                              _showUnavailable(context, label),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        onDestinationSelected: (index) {
          if (index == 1) {
            showAccountActionsSheet(context,
                accountRoute: '/tenant/account',
                passwordRoute: '/tenant/change-password');
          }
        },
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.dashboard_outlined),
              selectedIcon: Icon(Icons.dashboard_rounded),
              label: 'Overview'),
          NavigationDestination(
              icon: Icon(Icons.more_horiz_rounded),
              selectedIcon: Icon(Icons.more_rounded),
              label: 'More'),
        ],
      ),
    );
  }

  void _showUnavailable(BuildContext context, String destination) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$destination is not available yet.')),
    );
  }
}

String _formatNpr(double amount) {
  final digits = '${amount.round()}'.replaceAllMapped(
    RegExp(r'\B(?=(?:\d{3})+(?!\d))'),
    (_) => ',',
  );
  return 'Rs $digits';
}

class _KpiData {
  const _KpiData({
    required this.label,
    required this.value,
    required this.supportingText,
  });

  final String label;
  final String value;
  final String supportingText;
}

List<_KpiData> _kpisFor(TenantAdminDashboard dashboard) => [
      _KpiData(
        label: 'Active branches',
        value: '${dashboard.branchSummary.length}',
        supportingText: 'Reporting in this snapshot',
      ),
      _KpiData(
        label: 'Staff',
        value: '${dashboard.totalStaff}',
        supportingText: 'Across all branches',
      ),
      _KpiData(
        label: 'Students',
        value: '${dashboard.activeStudentsCount}',
        supportingText: 'Currently enrolled',
      ),
      _KpiData(
        label: 'Pending leave requests',
        value: '${dashboard.pendingLeaveRequestsCount}',
        supportingText: 'Requires your review',
      ),
      _KpiData(
        label: 'Overdue fees',
        value: _formatNpr(dashboard.totalOverdueAmountNpr),
        supportingText: 'Total overdue (NPR)',
      ),
    ];

class _KpiGrid extends StatelessWidget {
  const _KpiGrid({required this.dashboard});

  final TenantAdminDashboard dashboard;

  @override
  Widget build(BuildContext context) {
    final kpis = _kpisFor(dashboard);
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 840
            ? 4
            : constraints.maxWidth >= 600
                ? 2
                : 1;
        const gap = 12.0;
        final itemWidth =
            (constraints.maxWidth - gap * (columns - 1)) / columns;

        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final kpi in kpis)
              SizedBox(width: itemWidth, child: _KpiCard(kpi: kpi)),
          ],
        );
      },
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({required this.kpi});

  final _KpiData kpi;

  @override
  Widget build(BuildContext context) {
    final pendingAttention =
        kpi.label == 'Pending leave requests' && kpi.value != '0';
    final overdueAttention = kpi.label == 'Overdue fees' && kpi.value != 'Rs 0';
    final needsAttention = pendingAttention || overdueAttention;
    final color = needsAttention
        ? Colors.deepOrange
        : Theme.of(context).colorScheme.primary;

    return Semantics(
      label: '${kpi.label}: ${kpi.value}. ${kpi.supportingText}',
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(kpi.label, style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 12),
              Text(
                kpi.value,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      color: color,
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 4),
              Text(kpi.supportingText,
                  style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}

class _BranchOverview extends StatelessWidget {
  const _BranchOverview({required this.dashboard});

  final TenantAdminDashboard dashboard;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Branch overview', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(
          'Staffing and enrolment by branch.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 12),
        if (dashboard.branchSummary.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text('No branches found for this institution.'),
            ),
          )
        else
          Card(
            child: Column(
              children: [
                for (final branch in dashboard.branchSummary)
                  _BranchTile(branch: branch),
              ],
            ),
          ),
      ],
    );
  }
}

class _BranchTile extends StatelessWidget {
  const _BranchTile({required this.branch});

  final TenantBranchSummary branch;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label:
          '${branch.branchName}: ${branch.staffCount} staff, ${branch.activeStudents} students',
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        leading: CircleAvatar(
          backgroundColor: Theme.of(context).colorScheme.primaryContainer,
          child: Icon(
            Icons.account_balance_outlined,
            color: Theme.of(context).colorScheme.onPrimaryContainer,
          ),
        ),
        title: Text(branch.branchName),
        subtitle: Text(
            '${branch.staffCount} staff · ${branch.activeStudents} students'),
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.onActionSelected});

  final ValueChanged<String> onActionSelected;

  @override
  Widget build(BuildContext context) {
    // TODO(api): wire to tenant-scoped people/reports/approvals list
    // endpoints once the backend adds routes behind `GET /api/tenant-admin/*`.
    const actions = [
      _QuickActionData(
        label: 'People',
        description: 'Manage staff and student records.',
        icon: Icons.groups_outlined,
      ),
      _QuickActionData(
        label: 'Reports',
        description: 'Review tenant-wide operational reports.',
        icon: Icons.assessment_outlined,
      ),
      _QuickActionData(
        label: 'Approvals',
        description: 'Review requests awaiting your approval.',
        icon: Icons.fact_check_outlined,
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Quick actions', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text('Shortcuts for tenant administration.',
            style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 12),
        for (final action in actions) ...[
          _QuickActionCard(
              action: action, onTap: () => onActionSelected(action.label)),
          const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _QuickActionData {
  const _QuickActionData({
    required this.label,
    required this.description,
    required this.icon,
  });

  final String label;
  final String description;
  final IconData icon;
}

class _QuickActionCard extends StatelessWidget {
  const _QuickActionCard({required this.action, required this.onTap});

  final _QuickActionData action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Open ${action.label}',
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(action.icon, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(action.label,
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 2),
                      Text(action.description,
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
