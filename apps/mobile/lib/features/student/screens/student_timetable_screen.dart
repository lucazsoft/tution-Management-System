import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/sync/sync.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/features/student/models/student_portal_dto.dart';
import 'package:tms_mobile/features/student/student_design.dart';
import 'package:tms_mobile/features/student/viewmodels/student_timetable_viewmodel.dart';
import 'package:tms_mobile/features/student/widgets/student_scaffold.dart';
import 'package:tms_mobile/shared/widgets/academic_calendar.dart';

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
  static const _dayNames = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];
  static const _months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

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
    if (matching.isNotEmpty) return matching.first.sessions;
    return _dayOffset == 0 ? state.todaySessions : const [];
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
              Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: TmsSpace.sm,
                    vertical: TmsSpace.md,
                  ),
                  child: Row(
                    children: [
                      IconButton.filledTonal(
                        tooltip: 'Previous day',
                        onPressed: _dayOffset <= -7
                            ? null
                            : () => setState(() => _dayOffset--),
                        icon: const Icon(Icons.chevron_left_rounded),
                      ),
                      Expanded(
                        child: Column(
                          children: [
                            Text(
                              _dayOffset == 0
                                  ? 'Today · ${_dayNames[date.weekday - 1]}'
                                  : _dayNames[date.weekday - 1],
                              style: Theme.of(context).textTheme.titleLarge,
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 3),
                            Text(
                              '${date.day} ${_months[date.month - 1]} ${date.year}',
                              style: Theme.of(context)
                                  .textTheme
                                  .bodyMedium
                                  ?.copyWith(
                                    color: kColorMutedText,
                                  ),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                      IconButton.filledTonal(
                        tooltip: 'Next day',
                        onPressed: _dayOffset >= 7
                            ? null
                            : () => setState(() => _dayOffset++),
                        icon: const Icon(Icons.chevron_right_rounded),
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: TmsSpace.sm),
                child: Text(
                  'You can review up to one week before or after today.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              if (holidays.isNotEmpty)
                ...holidays.map((holiday) => _HolidayCard(event: holiday))
              else if (sessions.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(TmsSpace.lg),
                    child: Column(
                      children: [
                        Icon(Icons.event_available_outlined,
                            size: 42, color: kColorMutedText),
                        SizedBox(height: TmsSpace.sm),
                        Text('No classes scheduled for this day.'),
                      ],
                    ),
                  ),
                )
              else ...[
                Text(
                  '${sessions.length} session${sessions.length == 1 ? '' : 's'}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: TmsSpace.sm),
                for (final session in sessions) ...[
                  _SessionCard(session: session),
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

class _SessionCard extends StatelessWidget {
  const _SessionCard({required this.session});
  final PortalSession session;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(TmsSpace.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 76,
                padding: const EdgeInsets.symmetric(vertical: TmsSpace.sm),
                decoration: BoxDecoration(
                  color: kColorPrimary.withValues(alpha: .08),
                  borderRadius: BorderRadius.circular(TmsRadius.r10),
                ),
                child: Column(
                  children: [
                    Text(session.time,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, color: kColorPrimary)),
                    Text(session.endTime,
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              const SizedBox(width: TmsSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(session.subject,
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: TmsSpace.xs),
                    Text(session.teacher),
                    if (session.room.isNotEmpty)
                      Text(session.room,
                          style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: TmsSpace.xs),
                    Text(session.typeLabel,
                        style: const TextStyle(
                            color: StudentColors.info,
                            fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
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
