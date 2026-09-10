import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/adaptive/capabilities.dart';
import 'package:tms_mobile/core/adaptive/widgets/adaptive_layout.dart';
import 'package:tms_mobile/core/sync/sync.dart';
import '../models/student_portal_dto.dart';
import '../student_design.dart';
import '../viewmodels/student_home_viewmodel.dart';
import '../widgets/student_scaffold.dart';

/// Student home screen backed by the authenticated student portal.
///
/// Data comes from [studentHomeViewModelProvider] (one
/// `GET /api/users/me/student-portal` per load/refresh). Every state is
/// covered: loading, loaded, empty sections, error with retry, access-denied
/// (403) and offline (no connection).
class StudentHomeScreen extends ConsumerWidget {
  const StudentHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(studentHomeViewModelProvider);
    final viewModel = ref.read(studentHomeViewModelProvider.notifier);
    final connectivity = ref.watch(connectivityMonitorProvider);
    final portal = state.portal;

    if (state.isLoading && portal == null) {
      return const StudentScaffold(
        title: 'Student dashboard',
        selectedIndex: 0,
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (portal == null) {
      return StudentScaffold(
        title: 'Student dashboard',
        selectedIndex: 0,
        body: _HomeStateMessage(
          state: state,
          isOffline:
              state.isOffline || connectivity == ConnectivityState.offline,
          onRetry: viewModel.load,
        ),
      );
    }

    final showOfflineBar = connectivity == ConnectivityState.offline;

    return StudentScaffold(
      title: 'Student dashboard',
      selectedIndex: 0,
      actions: [
        Semantics(
          label: '${portal.unreadCount} unread notifications',
          button: true,
          child: Badge(
            isLabelVisible: portal.unreadCount > 0,
            label: Text('${portal.unreadCount}'),
            child: IconButton(
              tooltip: 'Notifications',
              onPressed: () => context.push('/student/notifications'),
              icon: const Icon(Icons.notifications_outlined),
            ),
          ),
        ),
        const SizedBox(width: TmsSpace.xs),
      ],
      body: RefreshIndicator(
        onRefresh: viewModel.refresh,
        child: Column(
          children: [
            if (showOfflineBar)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
                color: StudentColors.warning.withValues(alpha: 0.12),
                child: const Row(
                  children: [
                    Icon(Icons.wifi_off_rounded, size: 18),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'You are offline. Showing the last loaded dashboard.',
                      ),
                    ),
                  ],
                ),
              ),
            Expanded(
              child: ResponsiveBuilder(
                builder: (context, sizeClass) {
                  final useTwoColumns =
                      const UseTwoColumns().isAvailableAt(sizeClass);
                  final useThreeColumns =
                      const UseThreeColumns().isAvailableAt(sizeClass);

                  if (useThreeColumns) {
                    return _buildThreeColumnLayout(context, portal);
                  }

                  if (useTwoColumns) {
                    return _buildTwoColumnLayout(context, portal);
                  }

                  return _buildCompactLayout(context, portal);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCompactLayout(BuildContext context, StudentPortal portal) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        _buildWelcomeCard(context, portal),
        if (portal.overdueAmount > 0) ...[
          const SizedBox(height: TmsSpace.md),
          _buildOverdueCard(context, portal.overdueAmount),
        ],
        const SizedBox(height: TmsSpace.lg),
        _buildTimetableSection(context, portal),
        const SizedBox(height: TmsSpace.sm),
        _buildHomeworkSection(context, portal),
        const SizedBox(height: TmsSpace.sm),
        _buildQuickActions(context, portal),
      ],
    );
  }

  Widget _buildTwoColumnLayout(BuildContext context, StudentPortal portal) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 2,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 8, 12, 24),
            children: [
              _buildWelcomeCard(context, portal),
              if (portal.overdueAmount > 0) ...[
                const SizedBox(height: TmsSpace.md),
                _buildOverdueCard(context, portal.overdueAmount),
              ],
              const SizedBox(height: TmsSpace.lg),
              _buildTimetableSection(context, portal),
              const SizedBox(height: TmsSpace.sm),
              _buildHomeworkSection(context, portal),
            ],
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          flex: 1,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(12, 8, 24, 24),
            children: [
              _buildQuickActions(context, portal, isSidebar: true),
              const SizedBox(height: TmsSpace.lg),
              _buildNextEventCard(context, portal),
              const SizedBox(height: TmsSpace.lg),
              _buildCertificatesCard(context, portal),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildThreeColumnLayout(BuildContext context, StudentPortal portal) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Left sidebar - Quick actions & profile
        SizedBox(
          width: 280,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _buildProfileSidebar(context, portal),
              const SizedBox(height: TmsSpace.lg),
              _buildQuickActions(context, portal, isSidebar: true),
            ],
          ),
        ),
        const VerticalDivider(width: 1),
        // Main content
        Expanded(
          flex: 2,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 8, 12, 24),
            children: [
              _buildWelcomeCard(context, portal),
              if (portal.overdueAmount > 0) ...[
                const SizedBox(height: TmsSpace.md),
                _buildOverdueCard(context, portal.overdueAmount),
              ],
              const SizedBox(height: TmsSpace.lg),
              _buildTimetableSection(context, portal),
              const SizedBox(height: TmsSpace.sm),
              _buildHomeworkSection(context, portal),
            ],
          ),
        ),
        const VerticalDivider(width: 1),
        // Right sidebar - Events, certificates, stats
        SizedBox(
          width: 300,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _buildNextEventCard(context, portal),
              const SizedBox(height: TmsSpace.lg),
              _buildCertificatesCard(context, portal),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildWelcomeCard(BuildContext context, StudentPortal portal) {
    final profile = portal.profile;
    return Container(
      padding: const EdgeInsets.all(TmsSpace.lg),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [StudentColors.primaryDark, StudentColors.primary],
        ),
        borderRadius: BorderRadius.circular(TmsRadius.card),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Namaste, ${profile.name.split(' ').first}',
            style: Theme.of(context)
                .textTheme
                .displaySmall
                ?.copyWith(color: Colors.white),
          ),
          const SizedBox(height: TmsSpace.xs),
          Text(
            '${profile.grade} · ${profile.branch}',
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(color: Colors.white70),
          ),
          const SizedBox(height: TmsSpace.lg),
          Row(
            children: [
              const Icon(Icons.schedule_rounded, color: StudentColors.accent),
              const SizedBox(width: TmsSpace.xs),
              Text(
                '${portal.todaySessions.length} sessions today',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(color: Colors.white),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildOverdueCard(BuildContext context, double overdue) {
    return Card(
      color: StudentColors.error.withValues(alpha: .06),
      child: InkWell(
        borderRadius: BorderRadius.circular(TmsRadius.card),
        onTap: () => context.go('/student/fees'),
        child: Padding(
          padding: const EdgeInsets.all(TmsSpace.md),
          child: Row(
            children: [
              const Icon(Icons.lock_rounded, color: StudentColors.error),
              const SizedBox(width: TmsSpace.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Blocked — fee dues',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(color: StudentColors.error),
                    ),
                    const SizedBox(height: TmsSpace.xxs),
                    Text(
                      'NPR ${overdue.toStringAsFixed(0)} is overdue. View what is owed and the payment QR.',
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTimetableSection(BuildContext context, StudentPortal portal) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(
          title: "Today's timetable",
          action: 'Full timetable',
          onTap: () => context.push('/student/timetable'),
        ),
        const SizedBox(height: TmsSpace.sm),
        if (portal.todaySessions.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(TmsSpace.md),
              child: Row(
                children: [
                  Icon(
                    Icons.event_busy_outlined,
                    color: StudentColors.mutedText,
                  ),
                  SizedBox(width: TmsSpace.sm),
                  Expanded(child: Text('No sessions scheduled for today.')),
                ],
              ),
            ),
          )
        else
          for (final session in portal.todaySessions) ...[
            _SessionTile(session: session),
            const SizedBox(height: TmsSpace.sm),
          ],
      ],
    );
  }

  Widget _buildHomeworkSection(BuildContext context, StudentPortal portal) {
    final pending = portal.pendingHomework;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(
          title: 'Homework due soon',
          action: 'View all',
          onTap: () => context.go('/student/academics'),
        ),
        const SizedBox(height: TmsSpace.sm),
        if (pending.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(TmsSpace.md),
              child: Row(
                children: [
                  Icon(
                    Icons.check_circle_outline_rounded,
                    color: StudentColors.success,
                  ),
                  SizedBox(width: TmsSpace.sm),
                  Expanded(child: Text('All caught up. No pending homework.')),
                ],
              ),
            ),
          )
        else
          for (final item in pending.take(2)) ...[
            Card(
              child: ListTile(
                minTileHeight: 72,
                leading: const Icon(
                  Icons.assignment_outlined,
                  color: StudentColors.primary,
                ),
                title: Text(item.title),
                subtitle: Text('${item.subject} · Due ${item.dueLabel}'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => context.go('/student/academics'),
              ),
            ),
            const SizedBox(height: TmsSpace.sm),
          ],
      ],
    );
  }

  Widget _buildQuickActions(
    BuildContext context,
    StudentPortal portal, {
    bool isSidebar = false,
  }) {
    final profile = portal.profile;
    final latestScore = portal.results.isEmpty
        ? '—'
        : '${portal.results.first.percentage.toStringAsFixed(0)}%';
    final nextEvent = portal.events.isEmpty
        ? '—'
        : '${portal.events.first.day} ${portal.events.first.month}';
    final attendance = profile.attendanceRate == null
        ? '—'
        : '${profile.attendanceRate!.toStringAsFixed(0)}%';
    final actions = [
      _QuickActionData(
        icon: Icons.fact_check_outlined,
        label: 'Attendance',
        value: attendance,
        onTap: () => context.push('/student/attendance'),
      ),
      _QuickActionData(
        icon: Icons.show_chart_rounded,
        label: 'Latest score',
        value: latestScore,
        onTap: () => context.go('/student/academics'),
      ),
      _QuickActionData(
        icon: Icons.workspace_premium_outlined,
        label: 'Certificates',
        value: '${portal.certificates.length}',
        onTap: () => context.push('/student/certificates'),
      ),
      _QuickActionData(
        icon: Icons.event_outlined,
        label: 'Next event',
        value: nextEvent,
        onTap: () => context.push('/student/calendar'),
      ),
    ];

    if (isSidebar) {
      return Column(
        children: actions
            .map((action) => Padding(
                  padding: const EdgeInsets.only(bottom: TmsSpace.sm),
                  child: _QuickAction(
                    icon: action.icon,
                    label: action.label,
                    value: action.value,
                    onTap: action.onTap,
                  ),
                ))
            .toList(),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Your record', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: TmsSpace.sm),
        Row(
          children: [
            Expanded(
              child: _QuickAction(
                icon: actions[0].icon,
                label: actions[0].label,
                value: actions[0].value,
                onTap: actions[0].onTap,
              ),
            ),
            const SizedBox(width: TmsSpace.sm),
            Expanded(
              child: _QuickAction(
                icon: actions[1].icon,
                label: actions[1].label,
                value: actions[1].value,
                onTap: actions[1].onTap,
              ),
            ),
          ],
        ),
        const SizedBox(height: TmsSpace.sm),
        Row(
          children: [
            Expanded(
              child: _QuickAction(
                icon: actions[2].icon,
                label: actions[2].label,
                value: actions[2].value,
                onTap: actions[2].onTap,
              ),
            ),
            const SizedBox(width: TmsSpace.sm),
            Expanded(
              child: _QuickAction(
                icon: actions[3].icon,
                label: actions[3].label,
                value: actions[3].value,
                onTap: actions[3].onTap,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildNextEventCard(BuildContext context, StudentPortal portal) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(TmsSpace.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.event_outlined, color: StudentColors.primary),
                const SizedBox(width: TmsSpace.sm),
                Expanded(
                  child: Text('Upcoming Events',
                      style: Theme.of(context).textTheme.titleMedium),
                ),
              ],
            ),
            const SizedBox(height: TmsSpace.md),
            if (portal.events.isEmpty)
              Text(
                'No upcoming events.',
                style: Theme.of(context).textTheme.bodyMedium,
              )
            else
              ...portal.events.take(3).map((e) => Padding(
                    padding: const EdgeInsets.only(bottom: TmsSpace.sm),
                    child: Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: StudentColors.primary.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(TmsRadius.card),
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                e.day,
                                style: Theme.of(context)
                                    .textTheme
                                    .titleLarge
                                    ?.copyWith(
                                      color: StudentColors.primary,
                                      fontWeight: FontWeight.w700,
                                    ),
                              ),
                              Text(
                                e.month,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                      color: StudentColors.primary,
                                    ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: TmsSpace.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(e.title,
                                  style:
                                      Theme.of(context).textTheme.titleSmall),
                              Text(
                                e.details.isEmpty
                                    ? '${e.kind} · ${e.dateLabel}'
                                    : '${e.details} · ${e.dateLabel}',
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  )),
          ],
        ),
      ),
    );
  }

  Widget _buildCertificatesCard(BuildContext context, StudentPortal portal) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(TmsSpace.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.workspace_premium_outlined,
                    color: StudentColors.primary),
                const SizedBox(width: TmsSpace.sm),
                Expanded(
                  child: Text('Certificates',
                      style: Theme.of(context).textTheme.titleMedium),
                ),
                TextButton(
                  onPressed: () => context.go('/student/certificates'),
                  child: const Text('View All'),
                ),
              ],
            ),
            const SizedBox(height: TmsSpace.md),
            if (portal.certificates.isEmpty)
              Text(
                'No certificates yet.',
                style: Theme.of(context).textTheme.bodyMedium,
              )
            else
              ...portal.certificates.take(2).map((cert) => Padding(
                    padding: const EdgeInsets.only(bottom: TmsSpace.sm),
                    child: Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: StudentColors.accent.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(TmsRadius.card),
                          ),
                          child: const Icon(Icons.star_rounded,
                              color: StudentColors.accent),
                        ),
                        const SizedBox(width: TmsSpace.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(cert.title,
                                  style:
                                      Theme.of(context).textTheme.titleSmall),
                              Text(
                                'Issued ${cert.issuedDateLabel}',
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  )),
          ],
        ),
      ),
    );
  }

  Widget _buildProfileSidebar(BuildContext context, StudentPortal portal) {
    final profile = portal.profile;
    final attendance = profile.attendanceRate == null
        ? '—'
        : '${profile.attendanceRate!.toStringAsFixed(0)}%';
    final latestScore = portal.results.isEmpty
        ? '—'
        : '${portal.results.first.percentage.toStringAsFixed(0)}%';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(TmsSpace.md),
        child: Column(
          children: [
            CircleAvatar(
              radius: 32,
              backgroundColor: StudentColors.primary.withValues(alpha: 0.1),
              child: Text(
                profile.initials,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: StudentColors.primary,
                    ),
              ),
            ),
            const SizedBox(height: TmsSpace.md),
            Text(
              profile.name,
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: TmsSpace.xxs),
            Text(
              '${profile.grade} · ${profile.branch}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: StudentColors.mutedText,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: TmsSpace.md),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                Expanded(
                  child: _ProfileStat(label: 'Attendance', value: attendance),
                ),
                Expanded(
                  child: _ProfileStat(label: 'Score', value: latestScore),
                ),
                Expanded(
                  child: _ProfileStat(
                    label: 'Certificates',
                    value: '${portal.certificates.length}',
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Full-screen loading/error/denied/offline message for the home screen.
class _HomeStateMessage extends StatelessWidget {
  const _HomeStateMessage({
    required this.state,
    required this.isOffline,
    required this.onRetry,
  });

  final StudentHomeState state;
  final bool isOffline;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (state.isDenied) {
      return _StateBody(
        icon: Icons.block_rounded,
        title: 'Access denied',
        message: state.error ??
            'Your account is not allowed to view the student dashboard.',
        actionLabel: 'Try again',
        onAction: onRetry,
      );
    }
    if (isOffline) {
      return _StateBody(
        icon: Icons.wifi_off_rounded,
        title: 'You are offline',
        message:
            'Check your connection and try again. The dashboard needs the network to load.',
        actionLabel: 'Retry',
        onAction: onRetry,
      );
    }
    return _StateBody(
      icon: Icons.error_outline_rounded,
      title: 'Could not load the dashboard',
      message: state.error ?? 'Something went wrong. Please try again.',
      actionLabel: 'Retry',
      onAction: onRetry,
    );
  }
}

class _StateBody extends StatelessWidget {
  const _StateBody({
    required this.icon,
    required this.title,
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 64),
        Icon(icon, size: 56, color: StudentColors.mutedText),
        const SizedBox(height: 16),
        Text(
          title,
          style: Theme.of(context).textTheme.titleLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          message,
          style: Theme.of(context).textTheme.bodyMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        Center(
          child: FilledButton(onPressed: onAction, child: Text(actionLabel)),
        ),
      ],
    );
  }
}

class _ProfileStat extends StatelessWidget {
  const _ProfileStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: StudentColors.primary,
                )),
        Text(label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: StudentColors.mutedText,
                )),
      ],
    );
  }
}

class _QuickActionData {
  const _QuickActionData({
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    required this.action,
    required this.onTap,
  });

  final String title;
  final String action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(title, style: Theme.of(context).textTheme.titleLarge),
        ),
        TextButton(onPressed: onTap, child: Text(action)),
      ],
    );
  }
}

class _SessionTile extends StatelessWidget {
  const _SessionTile({required this.session});

  final PortalSession session;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(TmsSpace.md),
        child: Row(
          children: [
            SizedBox(
              width: 64,
              child: Column(
                children: [
                  Text(
                    session.time,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(color: StudentColors.primaryDark),
                    textAlign: TextAlign.center,
                  ),
                  Text(
                    session.endTime,
                    style: Theme.of(context).textTheme.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
            Container(
              width: 3,
              height: 48,
              margin: const EdgeInsets.symmetric(horizontal: TmsSpace.sm),
              decoration: BoxDecoration(
                color: StudentColors.primary,
                borderRadius: BorderRadius.circular(TmsRadius.pill),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(session.subject,
                      style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: TmsSpace.xxs),
                  Text(
                    '${session.teacher} · ${session.room}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            StudentStatusPill(
              label: session.typeLabel,
              icon: Icons.school_outlined,
              color: StudentColors.info,
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(TmsRadius.card),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(TmsSpace.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: StudentColors.primary),
              const SizedBox(height: TmsSpace.md),
              Text(value, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: TmsSpace.xxs),
              Text(label, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}
