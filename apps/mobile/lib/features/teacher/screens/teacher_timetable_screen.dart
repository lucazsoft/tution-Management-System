/// API-backed teacher timetable screen.
///
/// Daily view comes from workspace `todayClasses`; the weekly tabs are
/// derived from `classes[].schedule` (no dedicated timetable endpoint
/// exists — see [TeacherPortalRepository] docs).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/sync/sync.dart';

import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';
import 'package:tms_mobile/features/teacher/viewmodels/teacher_portal_viewmodel.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_record_states.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_navigation.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

class TeacherTimetableScreen extends ConsumerStatefulWidget {
  const TeacherTimetableScreen({super.key});

  @override
  ConsumerState<TeacherTimetableScreen> createState() =>
      _TeacherTimetableScreenState();
}

class _TeacherTimetableScreenState extends ConsumerState<TeacherTimetableScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  static const _days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  @override
  void initState() {
    super.initState();
    final todayIndex = DateTime.now().weekday % 7;
    _tabController = TabController(
      length: _days.length + 1,
      vsync: this,
      initialIndex: 0,
    );
    _tabController.index = todayIndex < _days.length ? todayIndex + 1 : 0;
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(teacherPortalViewModelProvider);
    final vm = ref.read(teacherPortalViewModelProvider.notifier);
    final connectivity = ref.watch(connectivityMonitorProvider);
    final offline = connectivity == ConnectivityState.offline;

    return Scaffold(
      drawer: TeacherNavigation.drawer(context),
      appBar: AppBar(
        title: Text(
          'My Timetable',
          style:
              GoogleFonts.fraunces(fontWeight: FontWeight.w700, fontSize: 22),
        ),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: kColorAccent,
          labelColor: kColorPrimary,
          unselectedLabelColor: kColorText.withValues(alpha: 0.55),
          tabs: const [
            Tab(text: 'Today'),
            ...[
              Tab(text: 'Sun'),
              Tab(text: 'Mon'),
              Tab(text: 'Tue'),
              Tab(text: 'Wed'),
              Tab(text: 'Thu'),
              Tab(text: 'Fri'),
              Tab(text: 'Sat')
            ]
          ],
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (offline && state.hasData) const TeacherOfflineBar(),
            Expanded(child: _body(state, vm)),
          ],
        ),
      ),
      bottomNavigationBar:
          const TeacherDashboardNavigationBar(selectedIndex: 0),
    );
  }

  Widget _body(TeacherPortalState state, TeacherPortalViewModel vm) {
    if (state.isLoading && !state.hasData) {
      return const TeacherLoadingView(message: 'Loading timetable…');
    }
    if (state.isDenied && !state.hasData) {
      return TeacherDeniedView(message: state.error);
    }
    if (state.isOffline && !state.hasData) {
      return TeacherOfflineView(onRetry: vm.load);
    }
    if (state.hasError && !state.hasData) {
      return TeacherErrorView(
        message: state.error ?? 'Could not load the timetable.',
        onRetry: vm.load,
      );
    }
    final workspace = state.workspace;
    if (workspace == null) {
      return TeacherErrorView(
        message: state.error ?? 'Timetable unavailable.',
        onRetry: vm.load,
      );
    }
    return TabBarView(
      controller: _tabController,
      children: [
        _TodayList(today: workspace.todayClasses),
        for (final day in _days) _DayList(day: day, classes: workspace.classes),
      ],
    );
  }
}

class _TodayList extends StatelessWidget {
  const _TodayList({required this.today});

  final List<TeacherTodayClass> today;

  @override
  Widget build(BuildContext context) {
    final rows = _todayRows(today);
    if (rows.isEmpty) {
      return const TeacherEmptyView(
        icon: Icons.event_available_rounded,
        title: 'No classes today',
        message: 'Nothing scheduled for today.',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(20),
      itemCount: rows.length + 1,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        if (index == 0) {
          return const _TimetableOverview();
        }
        final row = rows[index - 1];
        final item = row.item;
        return _TimetableCard(
          title: row.slot?.subject?.trim().isNotEmpty == true
              ? row.slot!.subject!
              : item.courseName,
          subtitle:
              '${item.className}${item.branchName == null ? '' : ' • ${item.branchName}'}',
          meta: row.slot?.timeLabel ?? item.scheduleLabel ?? item.status ?? '',
          trailing:
              item.dailyUpdateSubmitted ? 'Update sent' : 'Update pending',
        );
      },
    );
  }
}

class _TimetableOverview extends StatelessWidget {
  const _TimetableOverview();
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              colors: [Color(0xFF002D72), Color(0xFF1560BD)]),
          borderRadius: BorderRadius.circular(18),
        ),
        child: const Row(children: [
          Icon(Icons.today_rounded, color: Colors.white, size: 34),
          SizedBox(width: 14),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('TODAY\'S PLAN',
                    style: TextStyle(
                        color: Colors.white70,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1)),
                SizedBox(height: 4),
                Text('Your teaching schedule',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 21,
                        fontWeight: FontWeight.w800)),
                SizedBox(height: 3),
                Text(
                    'Sessions are ordered by start time so the next class is always easy to find.',
                    style: TextStyle(color: Colors.white70)),
              ])),
        ]),
      );
}

class _DayList extends StatelessWidget {
  const _DayList({required this.day, required this.classes});

  final String day;
  final List<TeacherClassInfo> classes;

  @override
  Widget build(BuildContext context) {
    final sessions = _dayRows(day, classes);
    if (sessions.isEmpty) {
      return TeacherEmptyView(
        icon: Icons.event_available_rounded,
        title: 'No classes on $day',
        message: 'Nothing scheduled for this day.',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(20),
      itemCount: sessions.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final row = sessions[index];
        final session = row.item;
        return _TimetableCard(
          title: row.slot.subject?.trim().isNotEmpty == true
              ? row.slot.subject!
              : session.subject,
          subtitle:
              '${session.name}${session.branch == null ? '' : ' • ${session.branch!.name}'}',
          meta: row.slot.timeLabel,
          trailing: '${session.studentCount} students',
        );
      },
    );
  }
}

class _TodayRow {
  const _TodayRow(this.item, this.slot);

  final TeacherTodayClass item;
  final TeacherScheduleSlot? slot;
}

class _DayRow {
  const _DayRow(this.item, this.slot);

  final TeacherClassInfo item;
  final TeacherScheduleSlot slot;
}

List<_TodayRow> _todayRows(List<TeacherTodayClass> items) {
  final day = _teacherDayKey(DateTime.now().weekday);
  final rows = <_TodayRow>[];
  for (final item in items) {
    final matching = item.slots.where((slot) => slot.matchesDay(day)).toList();
    if (matching.isEmpty) {
      rows.add(_TodayRow(item, null));
    } else {
      rows.addAll(matching.map((slot) => _TodayRow(item, slot)));
    }
  }
  rows.sort((a, b) => _compareSlotTimes(a.slot, b.slot));
  return rows;
}

List<_DayRow> _dayRows(String day, List<TeacherClassInfo> classes) {
  final rows = <_DayRow>[
    for (final item in classes)
      for (final slot in item.slots)
        if (slot.matchesDay(day)) _DayRow(item, slot),
  ];
  rows.sort((a, b) {
    final byTime = _compareSlotTimes(a.slot, b.slot);
    return byTime != 0 ? byTime : a.item.subject.compareTo(b.item.subject);
  });
  return rows;
}

int _compareSlotTimes(TeacherScheduleSlot? a, TeacherScheduleSlot? b) {
  final byStart = (a?.start ?? '').compareTo(b?.start ?? '');
  if (byStart != 0) return byStart;
  return (a?.end ?? '').compareTo(b?.end ?? '');
}

String _teacherDayKey(int weekday) =>
    const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday - 1];

class _TimetableCard extends StatelessWidget {
  const _TimetableCard({
    required this.title,
    required this.subtitle,
    required this.meta,
    required this.trailing,
  });

  final String title;
  final String subtitle;
  final String meta;
  final String trailing;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 4,
              height: 56,
              decoration: BoxDecoration(
                color: kColorAccent,
                borderRadius: BorderRadius.circular(TmsRadius.r2),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text(subtitle),
                  if (meta.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(meta, style: Theme.of(context).textTheme.bodySmall),
                  ],
                ],
              ),
            ),
            Flexible(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: kColorPrimary.withValues(alpha: .08),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(trailing,
                    textAlign: TextAlign.center,
                    style: Theme.of(context)
                        .textTheme
                        .labelSmall
                        ?.copyWith(color: kColorPrimary)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
