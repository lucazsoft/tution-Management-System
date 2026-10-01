import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/features/parent/models/parent_portal.dart';
import 'package:tms_mobile/features/parent/widgets/child_switcher_bar.dart';
import 'package:tms_mobile/features/parent/widgets/parent_navigation.dart';
import 'package:tms_mobile/features/parent/widgets/parent_portal_state_view.dart';
import 'package:tms_mobile/shared/widgets/academic_calendar.dart';

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

  String _dateLabel(DateTime date) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    return '${_weekday(date)}, ${date.day} ${months[date.month - 1]}';
  }

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
                const Text(
                    'Every active class is scoped only to the selected child.'),
                const SizedBox(height: 16),
                Card(
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                    child: Row(
                      children: [
                        IconButton(
                          onPressed: _canPrevious
                              ? () => setState(() => _selected =
                                  _selected.subtract(const Duration(days: 1)))
                              : null,
                          icon: const Icon(Icons.chevron_left_rounded),
                        ),
                        Expanded(
                          child: Column(
                            children: [
                              Text(_dateLabel(_selected),
                                  style:
                                      Theme.of(context).textTheme.titleMedium),
                              Text(_selected == _today
                                  ? 'Today'
                                  : 'Within one week of today'),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: _canNext
                              ? () => setState(() => _selected =
                                  _selected.add(const Duration(days: 1)))
                              : null,
                          icon: const Icon(Icons.chevron_right_rounded),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
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
                  const Card(
                    child: ListTile(
                      leading: Icon(Icons.event_busy_outlined),
                      title: Text('No classes scheduled'),
                      subtitle:
                          Text('There is no timetable entry for this day.'),
                    ),
                  )
                else
                  for (final session in sessions)
                    Card(
                      child: ListTile(
                        leading: SizedBox(
                          width: 58,
                          child: Text(session.time,
                              style:
                                  const TextStyle(fontWeight: FontWeight.w800)),
                        ),
                        title: Text(session.subject),
                        subtitle: Text(
                            '${session.teacher}\n${session.room} · ${session.time}–${session.endTime}'),
                        isThreeLine: true,
                        trailing: const Icon(Icons.school_outlined),
                      ),
                    ),
              ],
            );
          },
        ),
      );
}
