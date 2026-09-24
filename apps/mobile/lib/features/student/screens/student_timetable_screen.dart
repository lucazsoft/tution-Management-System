import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/sync/sync.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/features/student/models/student_portal_dto.dart';
import 'package:tms_mobile/features/student/student_design.dart';
import 'package:tms_mobile/features/student/viewmodels/student_timetable_viewmodel.dart';
import 'package:tms_mobile/features/student/widgets/student_scaffold.dart';

class StudentTimetableScreen extends ConsumerWidget {
  const StudentTimetableScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(studentTimetableViewModelProvider);
    final viewModel = ref.read(studentTimetableViewModelProvider.notifier);
    final offline =
        ref.watch(connectivityMonitorProvider) == ConnectivityState.offline;
    return StudentScaffold(
      title: 'My Weekly Timetable',
      selectedIndex: 2,
      body: Builder(builder: (context) {
        if (state.isLoading && !state.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        if (!state.hasData) {
          return _StateMessage(
              state: state, offline: offline, onRetry: viewModel.load);
        }
        final days = _todayFirst(state.days);
        return RefreshIndicator(
          onRefresh: viewModel.refresh,
          child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                if (offline)
                  const Card(
                      child: ListTile(
                          leading: Icon(Icons.wifi_off),
                          title: Text(
                              'You are offline. Showing the last loaded timetable.'))),
                Text(
                  state.todaySessions.isEmpty
                      ? 'No sessions scheduled for today.'
                      : '${state.todaySessions.length} session${state.todaySessions.length == 1 ? '' : 's'} scheduled for today.',
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: kColorPrimary),
                ),
                const SizedBox(height: 12),
                Text('Weekly class timetable',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 4),
                Text(
                    'Swipe left or right to see every day. Today is always the first column.',
                    style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 12),
                Scrollbar(
                    child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: _WeeklyTable(days: days))),
              ]),
        );
      }),
    );
  }

  List<PortalDaySchedule> _todayFirst(List<PortalDaySchedule> days) {
    if (days.isEmpty) return days;
    const names = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    final today = names[DateTime.now().weekday - 1];
    final index =
        days.indexWhere((day) => day.label.toLowerCase().startsWith(today));
    return index < 1 ? days : [...days.skip(index), ...days.take(index)];
  }
}

class _WeeklyTable extends StatelessWidget {
  const _WeeklyTable({required this.days});
  final List<PortalDaySchedule> days;

  @override
  Widget build(BuildContext context) {
    final rowCount = days.fold<int>(
        0,
        (value, day) =>
            day.sessions.length > value ? day.sessions.length : value);
    return Table(
      defaultColumnWidth: const FixedColumnWidth(220),
      border: TableBorder.all(
          color: StudentColors.border,
          borderRadius: BorderRadius.circular(TmsRadius.card)),
      children: [
        TableRow(
            decoration:
                BoxDecoration(color: kColorPrimary.withValues(alpha: .08)),
            children: [
              for (var i = 0; i < days.length; i++)
                Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(children: [
                      if (i == 0)
                        const Padding(
                            padding: EdgeInsets.only(right: 6),
                            child: Icon(Icons.today,
                                size: 16, color: kColorPrimary)),
                      Text(days[i].label,
                          style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              color: kColorPrimary)),
                    ])),
            ]),
        for (var row = 0; row < (rowCount == 0 ? 1 : rowCount); row++)
          TableRow(children: [
            for (final day in days)
              SizedBox(
                  height: 152,
                  child: row < day.sessions.length
                      ? _SessionCell(session: day.sessions[row])
                      : Center(
                          child: Text(row == 0 ? 'No classes' : '',
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(color: kColorMutedText)))),
          ]),
      ],
    );
  }
}

class _SessionCell extends StatelessWidget {
  const _SessionCell({required this.session});
  final PortalSession session;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${session.time}–${session.endTime}',
              style: Theme.of(context)
                  .textTheme
                  .labelLarge
                  ?.copyWith(color: kColorPrimary)),
          const SizedBox(height: 6),
          Text(session.subject,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 4),
          Text('${session.teacher} · ${session.room}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall),
          const Spacer(),
          Text(session.typeLabel,
              style: Theme.of(context)
                  .textTheme
                  .labelSmall
                  ?.copyWith(color: StudentColors.info)),
        ]),
      );
}

class _StateMessage extends StatelessWidget {
  const _StateMessage(
      {required this.state, required this.offline, required this.onRetry});
  final StudentTimetableState state;
  final bool offline;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final title = state.isDenied
        ? 'Access denied'
        : offline || state.isOffline
            ? 'You are offline'
            : state.error == null
                ? 'No timetable yet'
                : 'Could not load the timetable';
    return ListView(padding: const EdgeInsets.all(24), children: [
      const SizedBox(height: 64),
      Icon(offline ? Icons.wifi_off : Icons.event_busy_rounded,
          size: 56, color: kColorMutedText),
      const SizedBox(height: 16),
      Text(title,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 8),
      Text(state.error ?? 'No classes are scheduled for you right now.',
          textAlign: TextAlign.center),
      const SizedBox(height: 20),
      Center(
          child: FilledButton(onPressed: onRetry, child: const Text('Retry'))),
    ]);
  }
}
