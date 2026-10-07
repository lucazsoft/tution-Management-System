import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/features/parent/models/parent_portal.dart';
import 'package:tms_mobile/features/parent/widgets/child_switcher_bar.dart';
import 'package:tms_mobile/features/parent/widgets/parent_navigation.dart';
import 'package:tms_mobile/features/parent/widgets/parent_portal_state_view.dart';
import 'package:tms_mobile/shared/widgets/academic_calendar.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';
import 'package:tms_mobile/shared/widgets/timetable_session_card.dart';
import 'package:tms_mobile/shared/widgets/timetable_day_navigator.dart';

class ParentTimetableScreen extends ConsumerStatefulWidget {
  const ParentTimetableScreen({super.key});

  @override
  ConsumerState<ParentTimetableScreen> createState() =>
      _ParentTimetableScreenState();
}

class _ParentTimetableScreenState extends ConsumerState<ParentTimetableScreen> {
  late final DateTime _today = _dateOnly(DateTime.now());
  late DateTime _selected = _today;

  static DateTime _dateOnly(DateTime value) =>
      DateTime(value.year, value.month, value.day);

  bool get _canPrevious =>
      _selected.isAfter(_today.subtract(const Duration(days: 7)));
  bool get _canNext => _selected.isBefore(_today.add(const Duration(days: 7)));

  String _weekday(DateTime date) => const [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday'
      ][date.weekday - 1];

  bool _matchesDay(ParentSession session) {
    final value = session.day.trim().toLowerCase();
    final day = _weekday(_selected).toLowerCase();
    return value == day || value == day.substring(0, 3);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        drawer: ParentNavigation.drawer(context),
        appBar: AppBar(title: const Text('Child timetable')),
        bottomNavigationBar: const ParentNavigationBar(selectedIndex: 0),
        body: ParentPortalStateView(
          builder: (context, portal, child) {
            final sessions = portal.timetableSessions
                .where(_matchesDay)
                .toList()
              ..sort((a, b) => a.time.compareTo(b.time));
            final events = portal.events.where((event) {
              final date = parsePortalEventDate(event.date);
              return date != null && _dateOnly(date) == _selected;
            }).toList();
            final holiday = events
                .where((event) => event.kind.toLowerCase().contains('holiday'))
                .firstOrNull;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const ChildSwitcherBar(),
                const SizedBox(height: 16),
                Text('${child.name}’s merged schedule',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 16),
                TimetableDayNavigator(
                  date: _selected,
                  isToday: _selected == _today,
                  onPrevious: _canPrevious
                      ? () => setState(() => _selected =
                          _selected.subtract(const Duration(days: 1)))
                      : null,
                  onNext: _canNext
                      ? () => setState(() =>
                          _selected = _selected.add(const Duration(days: 1)))
                      : null,
                ),
                if (holiday != null)
                  Card(
                    color: Theme.of(context).colorScheme.secondaryContainer,
                    child: ListTile(
                      leading: const Icon(Icons.celebration_outlined),
                      title: Text(holiday.title),
                      subtitle: Text(holiday.details.isEmpty
                          ? 'Holiday — no classes scheduled.'
                          : holiday.details),
                    ),
                  )
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
                      footer: Text(session.type,
                          style: const TextStyle(
                              color: kColorPrimary,
                              fontWeight: FontWeight.w600)),
                    ),
                    const SizedBox(height: TmsSpace.sm),
                  ],
                ],
              ],
            );
          },
        ),
      );
}
