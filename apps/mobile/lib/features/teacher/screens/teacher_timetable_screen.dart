/// API-backed teacher timetable, using dated sessions for completion state.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/sync/sync.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';
import 'package:tms_mobile/features/teacher/data/teacher_portal_repository.dart';
import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';
import 'package:tms_mobile/features/teacher/viewmodels/teacher_portal_viewmodel.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_navigation.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_record_states.dart';
import 'package:tms_mobile/shared/widgets/timetable_session_card.dart';
import 'package:tms_mobile/shared/widgets/timetable_day_navigator.dart';

class TeacherTimetableScreen extends ConsumerStatefulWidget {
  const TeacherTimetableScreen({super.key});

  @override
  ConsumerState<TeacherTimetableScreen> createState() =>
      _TeacherTimetableScreenState();
}

class _TeacherTimetableScreenState
    extends ConsumerState<TeacherTimetableScreen> {
  List<TeacherAcademicEvent> _events = const [];
  int _dayOffset = 0;

  DateTime get _today {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }

  DateTime get _selectedDate => _today.add(Duration(days: _dayOffset));

  @override
  void initState() {
    super.initState();
    _loadEvents();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(teacherPortalViewModelProvider);
    final vm = ref.read(teacherPortalViewModelProvider.notifier);
    final offline =
        ref.watch(connectivityMonitorProvider) == ConnectivityState.offline;
    return Scaffold(
      drawer: TeacherNavigation.drawer(context),
      appBar: AppBar(
        title: Text('My Timetable',
            style: GoogleFonts.fraunces(
                fontWeight: FontWeight.w700, fontSize: 22)),
      ),
      body: SafeArea(
          child: Column(children: [
        if (offline && state.hasData) const TeacherOfflineBar(),
        Expanded(child: _body(state, vm)),
      ])),
      bottomNavigationBar:
          const TeacherDashboardNavigationBar(selectedIndex: 3),
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
    final date = _selectedDate;
    final day = _teacherDayKey(date.weekday);
    final isToday = _dayOffset == 0;
    return _TimetablePage(
      header: TimetableDayNavigator(
        date: date,
        isToday: isToday,
        onPrevious:
            _dayOffset <= -7 ? null : () => setState(() => _dayOffset--),
        onNext: _dayOffset >= 7 ? null : () => setState(() => _dayOffset++),
        onDateSelected: (selected) => setState(
          () => _dayOffset = selected.difference(_today).inDays,
        ),
      ),
      rows: isToday
          ? _todayRows(workspace.todayClasses)
          : _dayRows(day, workspace.classes),
      events: _eventsOn(date),
      emptyMessage: isToday
          ? 'Nothing scheduled for today.'
          : 'Nothing scheduled for this day.',
      onRefresh: _refresh,
    );
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
}

class _RowData {
  const _RowData({
    required this.time,
    required this.subject,
    required this.className,
    this.room,
  });
  final String time;
  final String subject;
  final String className;
  final String? room;
}

class _TimetablePage extends StatelessWidget {
  const _TimetablePage({
    required this.header,
    required this.rows,
    required this.emptyMessage,
    this.events = const [],
    required this.onRefresh,
  });
  final Widget header;
  final List<_RowData> rows;
  final String emptyMessage;
  final List<TeacherAcademicEvent> events;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(padding: const EdgeInsets.all(TmsSpace.md), children: [
        header,
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
          TimetableEmptyCard(message: emptyMessage)
        else ...[
          Text('${rows.length} session${rows.length == 1 ? '' : 's'}',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: TmsSpace.sm),
          for (final row in rows) ...[
            TimetableSessionCard(
              startTime: _startTime(row.time),
              endTime: _endTime(row.time),
              subject: row.subject,
              primaryDetail: row.className,
              secondaryDetail: row.room?.trim().isNotEmpty == true
                  ? row.room
                  : 'Room not assigned',
            ),
            const SizedBox(height: TmsSpace.sm),
          ],
        ],
      ]),
    );
  }
}

String _startTime(String value) {
  final parts = value.split(RegExp(r'\s*[-–]\s*'));
  return parts.isEmpty ? value : parts.first;
}

String _endTime(String value) {
  final parts = value.split(RegExp(r'\s*[-–]\s*'));
  return parts.length > 1 ? parts[1] : '';
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
          className: item.className));
    } else {
      rows.addAll(slots.map((slot) => _RowData(
            time: slot.timeLabel,
            subject: slot.subject?.trim().isNotEmpty == true
                ? slot.subject!
                : item.courseName,
            className: item.className,
            room: slot.room,
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
