import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';
import 'package:tms_mobile/features/parent/models/parent_portal.dart';
import 'package:tms_mobile/features/parent/widgets/child_switcher_bar.dart';
import 'package:tms_mobile/features/parent/widgets/parent_navigation.dart';
import 'package:tms_mobile/features/parent/widgets/parent_portal_state_view.dart';
import 'package:tms_mobile/features/student/widgets/nepal_date_time.dart';
import 'package:tms_mobile/shared/widgets/academic_calendar.dart';

class ParentHomeScreen extends ConsumerWidget {
  const ParentHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      drawer: ParentNavigation.drawer(context),
      backgroundColor: kColorSurface,
      appBar: AppBar(
        title: const Text('Family Overview'),
      ),
      bottomNavigationBar: const ParentNavigationBar(selectedIndex: 0),
      body: SafeArea(
        child: ParentPortalStateView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          builder: (context, portal, child) => Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1180),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const NepalDateTimeHeader(),
                  const SizedBox(height: TmsSpace.md),
                  const ChildSwitcherBar(),
                  const SizedBox(height: TmsSpace.md),
                  _DayHero(child: child),
                  const SizedBox(height: TmsSpace.md),
                  _SummaryGrid(portal: portal, child: child),
                  const SizedBox(height: TmsSpace.lg),
                  _DashboardContent(portal: portal, child: child),
                  const SizedBox(height: TmsSpace.lg),
                  _HomeworkDue(homework: portal.homework),
                  if (portal.events.isNotEmpty) ...[
                    const SizedBox(height: TmsSpace.lg),
                    _UpcomingEvents(events: portal.events),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// Retained as a reusable detailed header for wider parent layouts.
// ignore: unused_element
class _PageHeading extends StatelessWidget {
  const _PageHeading({required this.child});

  final ParentChild child;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Parent dashboard',
              style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: TmsSpace.xxs),
          Text(
            'A private, child-specific view of today\'s priorities for ${child.name}.',
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(color: kColorMutedText),
          ),
        ],
      );
}

// ignore: unused_element
class _ChildContext extends StatelessWidget {
  const _ChildContext({required this.child});

  final ParentChild child;

  @override
  Widget build(BuildContext context) => Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(TmsSpace.md),
          child: Row(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: kColorPrimary.withValues(alpha: .12),
                foregroundColor: kColorPrimary,
                child: Text(child.initials,
                    style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: TmsSpace.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('CURRENTLY VIEWING',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: kColorMutedText,
                              letterSpacing: .8,
                            )),
                    Text(child.name,
                        style: Theme.of(context).textTheme.titleMedium),
                    Text('${child.grade} · ${child.branch}',
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              _StatusPill(blocked: child.blocked),
            ],
          ),
        ),
      );
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.blocked});

  final bool blocked;

  @override
  Widget build(BuildContext context) {
    final color = blocked ? kColorError : kColorSuccess;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .1),
        borderRadius: BorderRadius.circular(TmsRadius.rFull),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(blocked ? Icons.lock_outline : Icons.verified_outlined,
              color: color, size: 16),
          const SizedBox(width: 5),
          Text(blocked ? 'Blocked' : 'Active',
              style: TextStyle(color: color, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

// ignore: unused_element
class _FeeAlert extends StatelessWidget {
  const _FeeAlert({required this.child});

  final ParentChild child;

  @override
  Widget build(BuildContext context) => Card(
        margin: EdgeInsets.zero,
        color: kColorError.withValues(alpha: .07),
        child: InkWell(
          borderRadius: BorderRadius.circular(TmsRadius.card),
          onTap: () => context.push('/parent/fees'),
          child: Padding(
            padding: const EdgeInsets.all(TmsSpace.md),
            child: Row(
              children: [
                const Icon(Icons.lock_outline, color: kColorError),
                const SizedBox(width: TmsSpace.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${child.name} is blocked due to fee dues',
                          style: const TextStyle(
                              color: kColorError, fontWeight: FontWeight.w700)),
                      Text('${_money(child.outstanding)} remains outstanding.'),
                    ],
                  ),
                ),
                const Icon(Icons.arrow_forward_rounded),
              ],
            ),
          ),
        ),
      );
}

class _DayHero extends StatelessWidget {
  const _DayHero({required this.child});

  final ParentChild child;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(
          horizontal: TmsSpace.lg,
          vertical: TmsSpace.md,
        ),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF0B3969), kColorPrimaryLight],
          ),
          borderRadius: BorderRadius.circular(TmsRadius.cardLg),
        ),
        child: Row(
          children: [
            const Icon(Icons.auto_stories_rounded,
                color: Colors.white, size: 28),
            const SizedBox(width: TmsSpace.sm),
            Expanded(
              child: Text(
                'Welcome! Your child has learned a lot today.',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: Colors.white,
                    ),
              ),
            ),
            const SizedBox(width: TmsSpace.sm),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                const Text('ATTENDANCE',
                    style: TextStyle(color: Colors.white70, fontSize: 10)),
                Text('${child.attendanceRate}%',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                    )),
              ],
            ),
          ],
        ),
      );
}

class _DashboardContent extends StatelessWidget {
  const _DashboardContent({required this.portal, required this.child});

  final ParentPortal portal;
  final ParentChild child;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          final timetable = _SectionCard(
            title: 'Today’s timetable',
            subtitle: '${portal.sessions.length} scheduled sessions',
            action: 'Attendance',
            onAction: () => context.push('/parent/attendance'),
            child: portal.sessions.isEmpty
                ? const _EmptySection(
                    icon: Icons.event_available_outlined,
                    text: 'No classes scheduled for today.',
                  )
                : Column(
                    children: [
                      for (final session in portal.sessions.take(4))
                        _SessionRow(session: session),
                    ],
                  ),
          );
          final remarks = _SectionCard(
            title: 'Parent-visible remarks',
            subtitle: 'Internal institution notes are excluded.',
            action: 'Performance',
            onAction: () => context.push('/parent/academics'),
            child: portal.remarks.isEmpty
                ? const _EmptySection(
                    icon: Icons.visibility_outlined,
                    text: 'Published remarks will appear here.',
                  )
                : Column(
                    children: [
                      for (final remark in portal.remarks.take(2))
                        _RemarkRow(remark: remark),
                    ],
                  ),
          );
          if (constraints.maxWidth < 760) {
            return Column(
                children: [timetable, const SizedBox(height: 16), remarks]);
          }
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 3, child: timetable),
              const SizedBox(width: 16),
              Expanded(flex: 2, child: remarks),
            ],
          );
        },
      );
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.title,
    required this.subtitle,
    required this.action,
    required this.onAction,
    required this.child,
  });

  final String title;
  final String subtitle;
  final String action;
  final VoidCallback onAction;
  final Widget child;

  @override
  Widget build(BuildContext context) => Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(TmsSpace.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title,
                            style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: 2),
                        Text(subtitle,
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(color: kColorMutedText)),
                      ],
                    ),
                  ),
                  TextButton(onPressed: onAction, child: Text(action)),
                ],
              ),
              const SizedBox(height: TmsSpace.sm),
              child,
            ],
          ),
        ),
      );
}

class _SessionRow extends StatelessWidget {
  const _SessionRow({required this.session});

  final ParentSession session;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 9),
        child: Row(
          children: [
            SizedBox(
              width: 58,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(session.time,
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                  Text(session.endTime,
                      style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            Container(width: 3, height: 42, color: kColorAccent),
            const SizedBox(width: TmsSpace.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(session.subject,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text('${session.teacher} · ${session.room}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
          ],
        ),
      );
}

class _RemarkRow extends StatelessWidget {
  const _RemarkRow({required this.remark});

  final ParentRemark remark;

  @override
  Widget build(BuildContext context) {
    final color = remark.signal == 'Improving' ? kColorSuccess : kColorWarning;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.insights_rounded, size: 18, color: color),
              const SizedBox(width: 6),
              Expanded(
                child: Text(remark.subject,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
              Text(remark.signal,
                  style: TextStyle(color: color, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 5),
          Text(remark.message, maxLines: 2, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 4),
          Text('${remark.author} · ${remark.date}',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: kColorMutedText)),
        ],
      ),
    );
  }
}

class _EmptySection extends StatelessWidget {
  const _EmptySection({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: TmsSpace.lg),
        child: Center(
          child: Column(
            children: [
              Icon(icon, color: kColorMutedText),
              const SizedBox(height: 8),
              Text(text, textAlign: TextAlign.center),
            ],
          ),
        ),
      );
}

class _SummaryGrid extends StatelessWidget {
  const _SummaryGrid({required this.portal, required this.child});

  final ParentPortal portal;
  final ParentChild child;

  @override
  Widget build(BuildContext context) {
    final items = [
      _SummaryItem(Icons.fact_check_outlined, 'Attendance',
          '${child.attendanceRate}%', () => context.push('/parent/attendance')),
      _SummaryItem(
          Icons.calendar_view_week_outlined,
          'Timetable',
          '${portal.timetableSessions.length} weekly classes',
          () => context.push('/parent/timetable')),
      _SummaryItem(
          Icons.event_available_outlined,
          'Meetings',
          '${portal.appointments.length}',
          () => context.push('/parent/appointments')),
      _SummaryItem(Icons.forum_outlined, 'Messages',
          '${portal.messages.length}', () => context.push('/parent/messages')),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 900 ? 4 : 2;
        final width = (constraints.maxWidth - ((columns - 1) * 12)) / columns;
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final item in items)
              SizedBox(width: width, child: _SummaryCard(item: item)),
          ],
        );
      },
    );
  }
}

class _SummaryItem {
  const _SummaryItem(this.icon, this.label, this.value, this.onTap);
  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.item});
  final _SummaryItem item;

  @override
  Widget build(BuildContext context) => Card(
        margin: EdgeInsets.zero,
        child: InkWell(
          borderRadius: BorderRadius.circular(TmsRadius.card),
          onTap: item.onTap,
          child: Padding(
            padding: const EdgeInsets.all(TmsSpace.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(item.icon, color: kColorPrimary),
                const SizedBox(height: TmsSpace.sm),
                Text(item.label,
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: kColorMutedText)),
                const SizedBox(height: 2),
                Text(item.value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
          ),
        ),
      );
}

class _HomeworkDue extends StatelessWidget {
  const _HomeworkDue({required this.homework});

  final List<ParentHomeworkItem> homework;

  @override
  Widget build(BuildContext context) {
    final pending = homework.where((item) => !item.completed).toList();
    return _SectionCard(
      title: 'Homework due',
      subtitle: pending.isEmpty
          ? 'Your child has already completed their work.'
          : '${pending.length} assignment${pending.length == 1 ? '' : 's'} remaining',
      action: 'View all',
      onAction: () => context.push('/parent/academics?tab=homework'),
      child: pending.isEmpty
          ? const _EmptySection(
              icon: Icons.task_alt_rounded,
              text: 'Your child has already completed their work.',
            )
          : Column(
              children: [
                for (final item in pending.take(3))
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.assignment_outlined,
                        color: kColorPrimary),
                    title: Text(item.title),
                    subtitle: Text('${item.subject} · Due ${item.dueDate}'),
                  ),
              ],
            ),
    );
  }
}

class _UpcomingEvents extends StatelessWidget {
  const _UpcomingEvents({required this.events});
  final List<ParentEventItem> events;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final upcoming = events.where((event) {
      final date = parsePortalEventDate(event.date);
      return date != null && !date.isBefore(today);
    }).toList()
      ..sort((a, b) => parsePortalEventDate(a.date)!
          .compareTo(parsePortalEventDate(b.date)!));
    return InkWell(
        borderRadius: BorderRadius.circular(TmsRadius.card),
        onTap: () => context.push('/parent/calendar'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('Upcoming events',
                      style: Theme.of(context).textTheme.titleLarge),
                ),
                TextButton(
                  onPressed: () => context.push('/parent/calendar'),
                  child: const Text('View all'),
                ),
              ],
            ),
            const SizedBox(height: TmsSpace.sm),
            if (upcoming.isEmpty)
              const Text('No upcoming events.')
            else
              for (final event in upcoming.take(3))
              Card(
                margin: const EdgeInsets.only(bottom: TmsSpace.sm),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: kColorPrimary.withValues(alpha: .1),
                    foregroundColor: kColorPrimary,
                    child: Text(event.day,
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                  title: Text(event.title),
                  subtitle: Text('${event.month} · ${event.kind}'),
                  trailing: const Icon(Icons.event_outlined),
                ),
              ),
          ],
        ),
      );
  }
}

String _money(double amount) {
  final digits = amount.round().toString();
  final formatted = digits.replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => ',',
  );
  return 'NPR $formatted';
}
