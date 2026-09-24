import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/adaptive/breakpoints.dart';
import 'package:tms_mobile/core/adaptive/capabilities.dart';
import 'package:tms_mobile/core/adaptive/widgets/adaptive_layout.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/shared/widgets/kpi_card.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

class BranchAdminHomeScreen extends ConsumerStatefulWidget {
  const BranchAdminHomeScreen({super.key});

  @override
  ConsumerState<BranchAdminHomeScreen> createState() =>
      _BranchAdminHomeScreenState();
}

class _BranchAdminHomeScreenState extends ConsumerState<BranchAdminHomeScreen> {
  int _selectedIndex = 0;

  // Mock data for approvals
  final List<Map<String, dynamic>> _leaveRequests = [
    {
      'id': 'leave-1',
      'applicant': 'Aarati Shrestha',
      'role': 'Senior Teacher (Mathematics)',
      'type': 'Personal Leave',
      'dates': '12 Jul 2026 – 13 Jul 2026',
      'reason': 'Family function and personal appointment in Pokhara',
      'status': 'PENDING',
    },
    {
      'id': 'leave-2',
      'applicant': 'Shyam Adhikari',
      'role': 'Science Faculty',
      'type': 'Sick Leave',
      'dates': '15 Jul 2026',
      'reason': 'Viral fever and prescribed medical rest',
      'status': 'PENDING',
    },
    {
      'id': 'leave-3',
      'applicant': 'Rita Maharjan',
      'role': 'Receptionist',
      'type': 'Casual Leave',
      'dates': '20 Jul 2026',
      'reason': 'University semester exam submission',
      'status': 'APPROVED',
    },
  ];

  final List<Map<String, dynamic>> _staffMembers = [
    {
      'name': 'Aarati Shrestha',
      'role': 'Senior Mathematics Teacher',
      'status': 'CHECKED_IN',
      'time': '07:45 AM',
      'phone': '+977 9801234567',
    },
    {
      'name': 'Shyam Adhikari',
      'role': 'Science Faculty',
      'status': 'CHECKED_IN',
      'time': '08:05 AM',
      'phone': '+977 9812345678',
    },
    {
      'name': 'Anita Gurung',
      'role': 'Accountant',
      'status': 'CHECKED_IN',
      'time': '08:30 AM',
      'phone': '+977 9823456789',
    },
    {
      'name': 'Rita Maharjan',
      'role': 'Front Desk / Receptionist',
      'status': 'ON_LEAVE',
      'time': 'Approved Leave',
      'phone': '+977 9834567890',
    },
    {
      'name': 'Jeevan Tamang',
      'role': 'Operations & Maintenance',
      'status': 'CHECKED_IN',
      'time': '07:15 AM',
      'phone': '+977 9845678901',
    },
  ];

  void _updateLeaveStatus(String id, String status) {
    setState(() {
      final item = _leaveRequests.firstWhere((r) => r['id'] == id);
      item['status'] = status;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Leave request $status successfully.'),
        backgroundColor: status == 'APPROVED' ? kColorSuccess : kColorWarning,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final sizeClass = Breakpoints.fromWidth(MediaQuery.sizeOf(context).width);
    final canShowSidebar = const ShowSidebar().isAvailableAt(sizeClass);
    final pendingCount =
        _leaveRequests.where((r) => r['status'] == 'PENDING').length;

    return AdaptiveScaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Branch Admin Portal',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
            ),
            Text(
              'Baneshwor Branch • ${user?.name ?? 'Bikash Karki'}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: kColorText.withValues(alpha: 0.7),
                  ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Pending Approvals',
            icon: Badge(
              isLabelVisible: pendingCount > 0,
              label: Text('$pendingCount'),
              child: const Icon(Icons.notifications_outlined),
            ),
            onPressed: () => setState(() => _selectedIndex = 1),
          ),
          IconButton(
            tooltip: 'Log Out',
            icon: const Icon(Icons.logout_rounded),
            onPressed: () => ref.read(authProvider.notifier).logout(),
          ),
          const SizedBox(width: 8),
        ],
      ),
      selectedIndex: _selectedIndex,
      onDestinationSelected: (index) => setState(() => _selectedIndex = index),
      destinations: [
        const AdaptiveNavigationDestination(
          icon: Icon(Icons.dashboard_outlined),
          selectedIcon: Icon(Icons.dashboard_rounded),
          label: 'Overview',
        ),
        AdaptiveNavigationDestination(
          icon: Badge(
            isLabelVisible: pendingCount > 0,
            label: Text('$pendingCount'),
            child: const Icon(Icons.fact_check_outlined),
          ),
          selectedIcon: const Icon(Icons.fact_check_rounded),
          label: 'Approvals',
        ),
        const AdaptiveNavigationDestination(
          icon: Icon(Icons.people_alt_outlined),
          selectedIcon: Icon(Icons.people_alt_rounded),
          label: 'Staff',
        ),
        const AdaptiveNavigationDestination(
          icon: Icon(Icons.store_mall_directory_outlined),
          selectedIcon: Icon(Icons.store_mall_directory_rounded),
          label: 'Branch Info',
        ),
      ],
      body: (context, index) {
        switch (index) {
          case 0:
            return _buildOverviewTab(context, pendingCount);
          case 1:
            return _buildApprovalsTab(context);
          case 2:
            return _buildStaffTab(context);
          case 3:
            return _buildBranchInfoTab(context);
          default:
            return const SizedBox.shrink();
        }
      },
      sidebar: canShowSidebar ? _buildSidebar(pendingCount) : null,
    );
  }

  Widget _buildOverviewTab(BuildContext context, int pendingCount) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Row(
          children: [
            Expanded(
              child: KpiCard(
                title: 'Today Attendance',
                value: '96.2%',
                deltaText: '+2.1% vs yesterday',
              ),
            ),
            SizedBox(width: 14),
            Expanded(
              child: KpiCard(
                title: 'Enrolled Students',
                value: '428',
                deltaText: '16 Active batches',
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            const Expanded(
              child: KpiCard(
                title: 'Staff On Duty',
                value: '14 / 15',
                deltaText: '1 on approved leave',
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: KpiCard(
                title: 'Pending Approvals',
                value: '$pendingCount',
                deltaText: 'Requires review',
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        Text('Quick Administrative Actions',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: _AdminActionTile(
                icon: Icons.assignment_turned_in_outlined,
                title: 'Approve Leaves',
                subtitle: '$pendingCount pending requests',
                color: kColorAccent,
                onTap: () => setState(() => _selectedIndex = 1),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _AdminActionTile(
                icon: Icons.people_outline,
                title: 'Staff Directory',
                subtitle: '${_staffMembers.length} team members',
                color: kColorPrimary,
                onTap: () => setState(() => _selectedIndex = 2),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _AdminActionTile(
                icon: Icons.location_on_outlined,
                title: 'Geo-Fence Status',
                subtitle: 'Active (100m perimeter)',
                color: kColorSuccess,
                onTap: () => setState(() => _selectedIndex = 3),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _AdminActionTile(
                icon: Icons.payments_outlined,
                title: 'Petty Cash L1',
                subtitle: 'All settled',
                color: kColorPrimaryLight,
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content: Text(
                            'Petty Cash L1 expense reports are currently up to date.')),
                  );
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        Text('Recent Branch Activity',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        Card(
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(TmsRadius.r14)),
          child: Column(
            children: [
              ListTile(
                leading: const CircleAvatar(
                  backgroundColor: Color(0xFFE8F5E9),
                  child: Icon(Icons.check, color: kColorSuccess),
                ),
                title:
                    const Text('Grade 10 Mathematics Geo-Attendance Verified'),
                subtitle: const Text('Aarati Shrestha • 28 students present'),
                trailing: Text('08:02 AM',
                    style: Theme.of(context).textTheme.bodySmall),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const CircleAvatar(
                  backgroundColor: Color(0xFFFFF3E0),
                  child: Icon(Icons.event_busy, color: kColorWarning),
                ),
                title: const Text('Leave Request Submitted'),
                subtitle: const Text(
                    'Shyam Adhikari requested Sick Leave for 15 Jul'),
                trailing: Text('08:30 AM',
                    style: Theme.of(context).textTheme.bodySmall),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildApprovalsTab(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Leave Approvals',
                style: Theme.of(context).textTheme.headlineSmall),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: kColorPrimary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(TmsRadius.r16),
              ),
              child: Text(
                '${_leaveRequests.where((r) => r['status'] == 'PENDING').length} Pending',
                style: const TextStyle(
                    fontWeight: FontWeight.w700, color: kColorPrimary),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        ..._leaveRequests.map((leave) {
          final isPending = leave['status'] == 'PENDING';
          final isApproved = leave['status'] == 'APPROVED';

          return Card(
            margin: const EdgeInsets.only(bottom: 14),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(TmsRadius.r16)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(leave['applicant'] as String,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 16)),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: isApproved
                              ? kColorSuccess.withValues(alpha: 0.1)
                              : isPending
                                  ? kColorWarning.withValues(alpha: 0.1)
                                  : kColorError.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(TmsRadius.r8),
                        ),
                        child: Text(
                          leave['status'] as String,
                          style: TextStyle(
                            color: isApproved
                                ? kColorSuccess
                                : isPending
                                    ? kColorWarning
                                    : kColorError,
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(leave['role'] as String,
                      style: Theme.of(context).textTheme.bodySmall),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: kColorSurface,
                      borderRadius: BorderRadius.circular(TmsRadius.r10),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.calendar_today_outlined,
                                size: 16, color: kColorPrimary),
                            const SizedBox(width: 8),
                            Text('${leave['type']} • ${leave['dates']}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600, fontSize: 13)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text('Reason: ${leave['reason']}',
                            style: Theme.of(context).textTheme.bodyMedium),
                      ],
                    ),
                  ),
                  if (isPending) ...[
                    const SizedBox(height: 14),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        OutlinedButton(
                          onPressed: () => _updateLeaveStatus(
                              leave['id'] as String, 'REJECTED'),
                          style: OutlinedButton.styleFrom(
                              foregroundColor: kColorError),
                          child: const Text('Reject'),
                        ),
                        const SizedBox(width: 10),
                        FilledButton(
                          onPressed: () => _updateLeaveStatus(
                              leave['id'] as String, 'APPROVED'),
                          style: FilledButton.styleFrom(
                              backgroundColor: kColorSuccess),
                          child: const Text('Approve Leave'),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildStaffTab(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Branch Staff & Teachers',
                style: Theme.of(context).textTheme.headlineSmall),
            Text('${_staffMembers.length} Members',
                style: const TextStyle(fontWeight: FontWeight.w600)),
          ],
        ),
        const SizedBox(height: 16),
        ..._staffMembers.map((staff) {
          final isCheckedIn = staff['status'] == 'CHECKED_IN';
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(TmsRadius.r14)),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: isCheckedIn
                    ? kColorSuccess.withValues(alpha: 0.1)
                    : kColorWarning.withValues(alpha: 0.1),
                child: Icon(
                  isCheckedIn ? Icons.person_rounded : Icons.person_off_rounded,
                  color: isCheckedIn ? kColorSuccess : kColorWarning,
                ),
              ),
              title: Text(staff['name'] as String,
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('${staff['role']}\n${staff['phone']}'),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: isCheckedIn
                          ? kColorSuccess.withValues(alpha: 0.1)
                          : kColorWarning.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(TmsRadius.r6),
                    ),
                    child: Text(
                      isCheckedIn ? 'Present' : 'Leave',
                      style: TextStyle(
                        color: isCheckedIn ? kColorSuccess : kColorWarning,
                        fontWeight: FontWeight.w700,
                        fontSize: 11,
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(staff['time'] as String,
                      style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildBranchInfoTab(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Card(
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(TmsRadius.r16)),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: kColorPrimary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(TmsRadius.r12),
                      ),
                      child: const Icon(Icons.business_rounded,
                          color: kColorPrimary, size: 32),
                    ),
                    const SizedBox(width: 14),
                    const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Baneshwor Branch',
                            style: TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 18)),
                        Text('Branch Code: BR-KTM-01 • Active',
                            style: TextStyle(color: kColorSuccess)),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                const Divider(),
                const ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading:
                      Icon(Icons.location_on_outlined, color: kColorPrimary),
                  title: Text('Address'),
                  subtitle: Text('New Baneshwor, Kathmandu, Nepal'),
                ),
                const ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.gps_fixed_outlined, color: kColorPrimary),
                  title: Text('Geofence Coordinates'),
                  subtitle: Text('Lat: 27.6915, Lng: 85.3422 (Radius: 100m)'),
                ),
                const ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.phone_outlined, color: kColorPrimary),
                  title: Text('Contact Phone'),
                  subtitle: Text('+977 1 4782900'),
                ),
                const ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.email_outlined, color: kColorPrimary),
                  title: Text('Branch Email'),
                  subtitle: Text('baneshwor@tms.edu.np'),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => ref.read(authProvider.notifier).logout(),
                    icon: const Icon(Icons.logout_rounded),
                    label: const Text('Log Out of Branch Admin'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSidebar(int pendingCount) {
    return Container(
      width: 250,
      color: kColorSurface,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Admin Quick Actions',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: kColorPrimary,
                ),
          ),
          const SizedBox(height: 16),
          ListTile(
            leading:
                const Icon(Icons.fact_check_outlined, color: kColorPrimary),
            title: Text('Pending Approvals ($pendingCount)'),
            onTap: () => setState(() => _selectedIndex = 1),
          ),
          ListTile(
            leading: const Icon(Icons.people_outline, color: kColorPrimary),
            title: const Text('Staff List'),
            onTap: () => setState(() => _selectedIndex = 2),
          ),
          ListTile(
            leading: const Icon(Icons.business_outlined, color: kColorPrimary),
            title: const Text('Branch Profile'),
            onTap: () => setState(() => _selectedIndex = 3),
          ),
          const SizedBox(height: 24),
          const Divider(),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () => ref.read(authProvider.notifier).logout(),
            icon: const Icon(Icons.logout_rounded, size: 18),
            label: const Text('Log Out'),
          ),
        ],
      ),
    );
  }
}

class _AdminActionTile extends StatelessWidget {
  const _AdminActionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(TmsRadius.r14),
        side: BorderSide(color: color.withValues(alpha: 0.2)),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(TmsRadius.r14),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(TmsRadius.r10),
                ),
                child: Icon(icon, color: color),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14)),
                    Text(subtitle,
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
