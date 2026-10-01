/// API-backed teacher timetable, using dated sessions for completion state.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/sync/sync.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/features/teacher/data/teacher_portal_repository.dart';
import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';
import 'package:tms_mobile/features/teacher/viewmodels/teacher_portal_viewmodel.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_navigation.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_record_states.dart';

class TeacherTimetableScreen extends ConsumerStatefulWidget {
  const TeacherTimetableScreen({super.key});

  @override
  ConsumerState<TeacherTimetableScreen> createState() =>
      _TeacherTimetableScreenState();
}

class _TeacherTimetableScreenState extends ConsumerState<TeacherTimetableScreen>
    with SingleTickerProviderStateMixin {
  static const _days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  late final TabController _tabController;
  List<TeacherAcademicEvent> _events = const [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: _days.length + 1, vsync: this);
    _loadEvents();
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
    final offline = ref.watch(connectivityMonitorProvider) ==
        ConnectivityState.offline;
    return Scaffold(
      drawer: TeacherNavigation.drawer(context),
      appBar: AppBar(
        title: Text('My Timetable',
            style: GoogleFonts.fraunces(
                fontWeight: FontWeight.w700, fontSize: 22)),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: kColorAccent,
          labelColor: kColorPrimary,
          unselectedLabelColor: kColorText.withValues(alpha: .55),
          tabs: const [
            Tab(text: 'Today'),
            Tab(text: 'Sun'),
            Tab(text: 'Mon'),
            Tab(text: 'Tue'),
            Tab(text: 'Wed'),
            Tab(text: 'Thu'),
            Tab(text: 'Fri'),
            Tab(text: 'Sat'),
          ],
        ),
      ),
      body: SafeArea(child: Column(children: [
        if (offline && state.hasData) const TeacherOfflineBar(),
        Expanded(child: _body(state, vm)),
      ])),
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
          onRetry: vm.load);
    }
    final workspace = state.workspace;
    if (workspace == null) {
      return TeacherErrorView(
          message: state.error ?? 'Timetable unavailable.', onRetry: vm.load);
    }
    return TabBarView(controller: _tabController, children: [
      _TimetablePage(
        rows: _todayRows(workspace.todayClasses),
        events: _eventsOn(DateTime.now()),
        emptyTitle: 'No classes today',
        emptyMessage: 'Nothing scheduled for today.',
        onTakeClass: (item) => _markTaken(workspace, item),
        onRefresh: _refresh,
      ),
      for (final day in _days)
        _TimetablePage(
          rows: _dayRows(day, workspace.classes),
          events: _eventsOn(_dateForDay(day)),
          emptyTitle: 'No classes on $day',
          emptyMessage: 'Nothing scheduled for this day.',
          weeklyTemplate: true,
          onRefresh: _refresh,
        ),
    ]);
  }

  Future<void> _loadEvents() async {
    try {
      final events = await TeacherPortalRepository().fetchCalendar();
      if (mounted) setState(() => _events = events);
    } catch (_) {
      // The timetable remains usable if the calendar is temporarily offline.
    }
  }

  Future<void> _refresh() async {
    await Future.wait([
      ref.read(teacherPortalViewModelProvider.notifier).refresh(),
      _loadEvents(),
    ]);
  }

  Future<void> _markTaken(
      TeacherWorkspace workspace, TeacherTodayClass today) async {
    if (!workspace.checkedIn) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Mark yourself present before confirming this class.'),
      ));
      return;
    }
    final ok = await ref
        .read(teacherPortalViewModelProvider.notifier)
        .markSessionTaken(today.sessionId);
    if (!mounted) return;
    final error = ref.read(teacherPortalViewModelProvider).error;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(ok ? 'Class marked as taken.' : error ?? 'Could not confirm the class.'),
    ));
  }

  List<TeacherAcademicEvent> _eventsOn(DateTime date) {
    final target = DateTime(date.year, date.month, date.day);
    return _events.where((event) {
      final start = event.startDate.toLocal();
      final end = (event.endDate ?? event.startDate).toLocal();
      final first = DateTime(start.year, start.month, start.day);
      final last = DateTime(end.year, end.month, end.day);
      return !target.isBefore(first) && !target.isAfter(last);
    }).toList();
  }

  DateTime _dateForDay(String day) {
    final now = DateTime.now();
    final sunday = DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: now.weekday % 7));
    return sunday.add(Duration(days: _days.indexOf(day)));
  }
}

class _RowData {
  const _RowData({
    required this.time,
    required this.subject,
    required this.className,
    this.room,
    this.todayClass,
  });
  final String time;
  final String subject;
  final String className;
  final String? room;
  final TeacherTodayClass? todayClass;
  bool get taken => todayClass?.dailyUpdateSubmitted ?? false;
}

class _TimetablePage extends StatelessWidget {
  const _TimetablePage({
    required this.rows,
    required this.emptyTitle,
    required this.emptyMessage,
    this.events = const [],
    required this.onRefresh,
    this.onTakeClass,
    this.weeklyTemplate = false,
  });
  final List<_RowData> rows;
  final String emptyTitle;
  final String emptyMessage;
  final List<TeacherAcademicEvent> events;
  final Future<void> Function() onRefresh;
  final ValueChanged<TeacherTodayClass>? onTakeClass;
  final bool weeklyTemplate;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty && events.isEmpty) {
      return TeacherEmptyView(
          icon: Icons.event_available_rounded,
          title: emptyTitle,
          message: emptyMessage);
    }
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(padding: const EdgeInsets.all(20), children: [
        if (events.isNotEmpty) ...[
          Text('Events', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          for (final event in events)
            Card(
              color: kColorAccent.withValues(alpha: .09),
              child: ListTile(
                leading: const Icon(Icons.event_rounded, color: kColorPrimary),
                title: Text(event.title),
                subtitle: Text([
                  event.type,
                  if (event.description.trim().isNotEmpty) event.description,
                ].join(' • ')),
              ),
            ),
          const SizedBox(height: 12),
        ],
        if (rows.isEmpty)
          TeacherEmptyView(
              icon: Icons.event_available_rounded,
              title: emptyTitle,
              message: emptyMessage)
        else
        Card(
          clipBehavior: Clip.antiAlias,
          child: Column(children: [
            if (weeklyTemplate)
              Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                color: kColorPrimary.withValues(alpha: .06),
                child: const Text(
                  'Weekly schedule • Taken status appears on the dated Today session.',
                  style: TextStyle(fontSize: 12),
                ),
              ),
            LayoutBuilder(builder: (context, constraints) {
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minWidth: constraints.maxWidth),
                  child: DataTable(
                    horizontalMargin: 14,
                    columnSpacing: 22,
                    headingRowColor: WidgetStatePropertyAll(
                        Theme.of(context).colorScheme.surfaceContainerLow),
                    columns: const [
                      DataColumn(label: Text('Time')),
                      DataColumn(label: Text('Subject')),
                      DataColumn(label: Text('Class')),
                      DataColumn(label: Text('Room')),
                      DataColumn(label: Text('Action')),
                    ],
                    rows: [
                      for (final row in rows)
                        DataRow(cells: [
                          DataCell(Text(row.time.isEmpty ? 'Not set' : row.time,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700))),
                          DataCell(Text(row.subject)),
                          DataCell(Text(row.className)),
                          DataCell(Text(row.room?.trim().isNotEmpty == true
                              ? row.room!
                              : 'Not assigned')),
                          DataCell(_TakenAction(
                            taken: row.taken,
                            weeklyTemplate: weeklyTemplate,
                            onPressed: row.todayClass != null && !row.taken
                                ? () => onTakeClass?.call(row.todayClass!)
                                : null,
                          )),
                        ]),
                    ],
                  ),
                ),
              );
            }),
          ]),
        ),
      ]),
    );
  }
}

class _TakenAction extends StatelessWidget {
  const _TakenAction(
      {required this.taken, required this.weeklyTemplate, this.onPressed});
  final bool taken;
  final bool weeklyTemplate;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: weeklyTemplate
            ? 'Open Today on the scheduled date to record this class.'
            : taken
                ? 'Class taken and confirmed'
                : 'Complete attendance and the daily class update',
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(8),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Checkbox(
              value: taken,
              onChanged: onPressed == null ? null : (_) => onPressed!(),
            ),
            Text(taken ? 'Taken' : 'Not taken'),
          ]),
        ),
      );
}

List<_RowData> _todayRows(List<TeacherTodayClass> items) {
  final day = _teacherDayKey(DateTime.now().weekday);
  final rows = <_RowData>[];
  for (final item in items) {
    final slots = item.slots.where((slot) => slot.matchesDay(day)).toList();
    if (slots.isEmpty) {
      rows.add(_RowData(
          time: item.scheduleLabel ?? '',
          subject: item.courseName,
          className: item.className,
          todayClass: item));
    } else {
      rows.addAll(slots.map((slot) => _RowData(
            time: slot.timeLabel,
            subject: slot.subject?.trim().isNotEmpty == true
                ? slot.subject!
                : item.courseName,
            className: item.className,
            room: slot.room,
            todayClass: item,
          )));
    }
  }
  rows.sort((a, b) => a.time.compareTo(b.time));
  return rows;
}

List<_RowData> _dayRows(String day, List<TeacherClassInfo> classes) {
  final rows = <_RowData>[
    for (final item in classes)
      for (final slot in item.slots)
        if (slot.matchesDay(day))
          _RowData(
            time: slot.timeLabel,
            subject: slot.subject?.trim().isNotEmpty == true
                ? slot.subject!
                : item.subject,
            className: item.name,
            room: slot.room,
          ),
  ];
  rows.sort((a, b) => a.time.compareTo(b.time));
  return rows;
}

String _teacherDayKey(int weekday) =>
    const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday - 1];
