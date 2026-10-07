import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/sync/sync.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/features/student/models/student_portal_dto.dart';
import 'package:tms_mobile/features/student/student_design.dart';
import 'package:tms_mobile/features/student/viewmodels/student_timetable_viewmodel.dart';
import 'package:tms_mobile/features/student/widgets/student_scaffold.dart';
import 'package:tms_mobile/shared/widgets/academic_calendar.dart';
import 'package:tms_mobile/shared/widgets/timetable_session_card.dart';
import 'package:tms_mobile/shared/widgets/timetable_day_navigator.dart';

class StudentTimetableScreen extends ConsumerStatefulWidget {
  const StudentTimetableScreen({super.key});

  @override
  ConsumerState<StudentTimetableScreen> createState() =>
      _StudentTimetableScreenState();
}

class _StudentTimetableScreenState
    extends ConsumerState<StudentTimetableScreen> {
  int _dayOffset = 0;

  DateTime get _today {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }

  DateTime get _selectedDate => _today.add(Duration(days: _dayOffset));

  static const _dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  bool _sameDay(DateTime first, DateTime second) =>
      first.year == second.year &&
      first.month == second.month &&
      first.day == second.day;

  List<PortalSession> _sessionsFor(
    StudentTimetableState state,
    DateTime date,
  ) {
    final key = _dayKeys[date.weekday - 1];
    final matching = state.days.where((day) => day.key == key);
    final weekly =
        matching.isEmpty ? const <PortalSession>[] : matching.first.sessions;
    if (_dayOffset != 0) return weekly;

    final merged = <String, PortalSession>{};
    for (final session in [...weekly, ...state.todaySessions]) {
      final identity = [
        session.time,
        session.endTime,
        session.subject,
        session.teacher,
      ].join('|');
      merged[identity] = session;
    }
    final sessions = merged.values.toList()
      ..sort((a, b) => a.time.compareTo(b.time));
    return sessions;
  }

  List<PortalEvent> _eventsFor(
    StudentTimetableState state,
    DateTime date,
  ) =>
      state.events.where((event) {
        final eventDate = parsePortalEventDate(event.dateLabel);
        return eventDate != null && _sameDay(eventDate, date);
      }).toList(growable: false);

  bool _isHoliday(PortalEvent event) {
    final searchable = '${event.kind} ${event.title}'.toLowerCase();
    return searchable.contains('holiday') ||
        searchable.contains('vacation') ||
        searchable.contains('closed');
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(studentTimetableViewModelProvider);
    final viewModel = ref.read(studentTimetableViewModelProvider.notifier);
    final offline =
        ref.watch(connectivityMonitorProvider) == ConnectivityState.offline;
    return StudentScaffold(
      title: 'My timetable',
      selectedIndex: 2,
      body: Builder(builder: (context) {
        if (state.isLoading && !state.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        if (!state.hasData) {
          return _StateMessage(
            state: state,
            offline: offline,
            onRetry: viewModel.load,
          );
        }
        final date = _selectedDate;
        final events = _eventsFor(state, date);
        final holidays = events.where(_isHoliday).toList(growable: false);
        final sessions = holidays.isEmpty
            ? _sessionsFor(state, date)
            : const <PortalSession>[];
        return RefreshIndicator(
          onRefresh: viewModel.refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(TmsSpace.md),
            children: [
              if (offline)
                const Card(
                  child: ListTile(
                    leading: Icon(Icons.wifi_off),
                    title: Text(
                        'You are offline. Showing the last loaded timetable.'),
                  ),
                ),
              TimetableDayNavigator(
                date: date,
                isToday: _dayOffset == 0,
                onPrevious: _dayOffset <= -7
                    ? null
                    : () => setState(() => _dayOffset--),
                onNext:
                    _dayOffset >= 7 ? null : () => setState(() => _dayOffset++),
              ),
              if (holidays.isNotEmpty)
                ...holidays.map((holiday) => _HolidayCard(event: holiday))
              else if (sessions.isEmpty)
                const TimetableEmptyCard(
                    message: 'No classes scheduled for this day.')
              else ...[
                Text(
                  '${sessions.length} session${sessions.length == 1 ? '' : 's'}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: TmsSpace.sm),
                for (final session in sessions) ...[
                  TimetableSessionCard(
                    startTime: session.time,
                    endTime: session.endTime,
                    subject: session.subject,
                    primaryDetail: session.teacher,
                    secondaryDetail: session.room,
                    footer: Text(session.typeLabel,
                        style: const TextStyle(
                            color: StudentColors.info,
                            fontWeight: FontWeight.w600)),
                  ),
                  const SizedBox(height: TmsSpace.sm),
                ],
              ],
              for (final event in events.where((event) => !_isHoliday(event)))
                Card(
                  child: ListTile(
                    leading:
                        const Icon(Icons.event_outlined, color: kColorPrimary),
                    title: Text(event.title),
                    subtitle: Text(
                        event.details.isEmpty ? event.kind : event.details),
                  ),
                ),
            ],
          ),
        );
      }),
    );
  }
}

class _HolidayCard extends StatelessWidget {
  const _HolidayCard({required this.event});
  final PortalEvent event;

  @override
  Widget build(BuildContext context) => Card(
        color: StudentColors.accent.withValues(alpha: .10),
        child: Padding(
          padding: const EdgeInsets.all(TmsSpace.lg),
          child: Column(
            children: [
              const Icon(Icons.beach_access_rounded,
                  size: 44, color: StudentColors.accent),
              const SizedBox(height: TmsSpace.sm),
              Text('Holiday', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: TmsSpace.xs),
              Text(event.title, textAlign: TextAlign.center),
              if (event.details.isNotEmpty) ...[
                const SizedBox(height: TmsSpace.xs),
                Text(event.details, textAlign: TextAlign.center),
              ],
            ],
          ),
        ),
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
