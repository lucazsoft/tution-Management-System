import 'package:flutter/material.dart';
import 'package:nepali_utils/nepali_utils.dart';

import '../../core/theme/app_theme.dart';

class AcademicCalendarEvent {
  const AcademicCalendarEvent({
    required this.id,
    required this.title,
    required this.date,
    required this.kind,
    this.details = '',
  });

  final String id;
  final String title;
  final DateTime date;
  final String kind;
  final String details;
}

DateTime? parsePortalEventDate(String value) {
  final iso = DateTime.tryParse(value);
  if (iso != null) return DateTime(iso.year, iso.month, iso.day);
  final match = RegExp(r'^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$')
      .firstMatch(value.trim());
  if (match == null) return null;
  const months = <String, int>{
    'jan': 1,
    'january': 1,
    'feb': 2,
    'february': 2,
    'mar': 3,
    'march': 3,
    'apr': 4,
    'april': 4,
    'may': 5,
    'jun': 6,
    'june': 6,
    'jul': 7,
    'july': 7,
    'aug': 8,
    'august': 8,
    'sep': 9,
    'sept': 9,
    'september': 9,
    'oct': 10,
    'october': 10,
    'nov': 11,
    'november': 11,
    'dec': 12,
    'december': 12,
  };
  final month = months[match.group(2)!.toLowerCase()];
  if (month == null) return null;
  return DateTime(
      int.parse(match.group(3)!), month, int.parse(match.group(1)!));
}

@visibleForTesting
List<DateTime> nepaliMonthGrid(DateTime anchor) {
  final anchorBs = anchor.toNepaliDateTime();
  final month = NepaliDateTime(anchorBs.year, anchorBs.month);
  final first = month.toDateTime();
  final leadingBlanks = first.weekday % 7;
  final occupiedCells = leadingBlanks + month.totalDays;
  final cellCount = ((occupiedCells + 6) ~/ 7) * 7;
  final gridStart = first.subtract(Duration(days: leadingBlanks));

  return List<DateTime>.generate(
    cellCount,
    (index) => gridStart.add(Duration(days: index)),
  );
}

@visibleForTesting
DateTime shiftNepaliMonth(DateTime anchor, int offset) {
  final current = anchor.toNepaliDateTime();
  final absoluteMonth = current.year * 12 + current.month - 1 + offset;
  final year = absoluteMonth ~/ 12;
  final month = absoluteMonth % 12 + 1;
  var shifted = NepaliDateTime(year, month, 1).toDateTime();
  // Normalise a UTC conversion that can otherwise land on BS day two in the
  // local timezone, causing month paging to skip the first day.
  for (var attempt = 0; attempt < 2; attempt++) {
    final converted = shifted.toNepaliDateTime();
    if (converted.year == year &&
        converted.month == month &&
        converted.day == 1) {
      break;
    }
    shifted = shifted.subtract(const Duration(days: 1));
  }
  return shifted;
}

class AcademicCalendar extends StatefulWidget {
  const AcademicCalendar({super.key, required this.events, this.now});

  final List<AcademicCalendarEvent> events;
  final DateTime Function()? now;

  @override
  State<AcademicCalendar> createState() => _AcademicCalendarState();
}

class _AcademicCalendarState extends State<AcademicCalendar> {
  late DateTime _selected;
  late DateTime _monthAnchor;

  static const _bsMonths = <String>[
    'वैशाख',
    'जेठ',
    'असार',
    'साउन',
    'भदौ',
    'असोज',
    'कात्तिक',
    'मंसिर',
    'पुस',
    'माघ',
    'फागुन',
    'चैत',
  ];
  static const _weekdays = <String>['आ', 'सो', 'मं', 'बु', 'बि', 'शु', 'श'];

  @override
  void initState() {
    super.initState();
    final now = (widget.now ?? DateTime.now)();
    _selected = DateTime(now.year, now.month, now.day);
    final nowBs = now.toNepaliDateTime();
    _monthAnchor = NepaliDateTime(nowBs.year, nowBs.month).toDateTime();
  }

  bool _same(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  List<AcademicCalendarEvent> _eventsOn(DateTime day) =>
      widget.events.where((event) => _same(event.date, day)).toList();

  void _moveMonth(int offset) => setState(() {
        _monthAnchor = shiftNepaliMonth(_monthAnchor, offset);
        _selected = _monthAnchor;
      });

  @override
  Widget build(BuildContext context) {
    final days = nepaliMonthGrid(_monthAnchor);
    final firstBs = _monthAnchor.toNepaliDateTime();
    final last = NepaliDateTime(
      firstBs.year,
      firstBs.month,
      NepaliDateTime(firstBs.year, firstBs.month).totalDays,
    ).toDateTime();
    final today = (widget.now ?? DateTime.now)();
    final selectedEvents = _eventsOn(_selected);
    final upcomingEvents = widget.events
        .where((event) => !event.date.isBefore(
            DateTime(today.year, today.month, today.day)))
        .toList()
      ..sort((a, b) => a.date.compareTo(b.date));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(TmsSpace.md),
            child: Column(
              children: [
                LayoutBuilder(builder: (context, constraints) {
                  final heading = Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${_bsMonths[firstBs.month - 1]} ${firstBs.year} BS',
                          style: Theme.of(context).textTheme.titleLarge),
                      Text(
                          '${_englishMonth(_monthAnchor.month)} ${_monthAnchor.day} - ${_englishMonth(last.month)} ${last.day}, ${last.year}',
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(color: kColorMutedText)),
                    ],
                  );
                  final controls =
                      Row(mainAxisSize: MainAxisSize.min, children: [
                    TextButton(
                        onPressed: () => setState(() {
                              _selected =
                                  DateTime(today.year, today.month, today.day);
                              final todayBs = today.toNepaliDateTime();
                              _monthAnchor =
                                  NepaliDateTime(todayBs.year, todayBs.month)
                                      .toDateTime();
                            }),
                        child: const Text('आज / Today')),
                    IconButton(
                        tooltip: 'Previous month',
                        onPressed: () => _moveMonth(-1),
                        icon: const Icon(Icons.chevron_left)),
                    IconButton(
                        tooltip: 'Next month',
                        onPressed: () => _moveMonth(1),
                        icon: const Icon(Icons.chevron_right)),
                  ]);
                  if (constraints.maxWidth < 430)
                    return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          heading,
                          const SizedBox(height: 4),
                          Align(
                              alignment: Alignment.centerRight, child: controls)
                        ]);
                  return Row(children: [Expanded(child: heading), controls]);
                }),
                const SizedBox(height: 8),
                Row(children: [
                  for (var i = 0; i < 7; i++)
                    Expanded(
                        child: Center(
                            child: Text(_weekdays[i],
                                style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: i == 6
                                        ? kColorError
                                        : kColorMutedText))))
                ]),
                const SizedBox(height: 6),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 7,
                    mainAxisExtent: (48 +
                            (MediaQuery.textScalerOf(context)
                                        .scale(1)
                                        .clamp(1, 1.5) -
                                    1) *
                                20)
                        .toDouble(),
                  ),
                  itemCount: days.length,
                  itemBuilder: (context, index) {
                    final day = days[index];
                    final bs = day.toNepaliDateTime();
                    final events = _eventsOn(day);
                    final selected = _same(day, _selected);
                    final isToday = _same(day, today);
                    final outside =
                        bs.year != firstBs.year || bs.month != firstBs.month;
                    return Semantics(
                      selected: selected,
                      label:
                          '${day.day} ${_englishMonth(day.month)}, ${events.length} events',
                      child: InkWell(
                        key: ValueKey(
                            'calendar-day-${day.year}-${day.month}-${day.day}'),
                        borderRadius: BorderRadius.circular(10),
                        onTap: () => setState(() => _selected = day),
                        child: Container(
                          margin: const EdgeInsets.all(2),
                          decoration: BoxDecoration(
                            color: selected
                                ? kColorPrimary
                                : isToday
                                    ? kColorAccent.withValues(alpha: .18)
                                    : null,
                            border: isToday && !selected
                                ? Border.all(color: kColorAccent)
                                : null,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text('${bs.day}',
                                    style: TextStyle(
                                        fontWeight: FontWeight.w800,
                                        color: selected
                                            ? Colors.white
                                            : outside
                                                ? kColorMutedText.withValues(
                                                    alpha: .42)
                                                : day.weekday ==
                                                        DateTime.saturday
                                                    ? kColorError
                                                    : kColorText)),
                                Text('${day.day}',
                                    style: TextStyle(
                                        fontSize: 10,
                                        color: selected
                                            ? Colors.white70
                                            : outside
                                                ? kColorMutedText.withValues(
                                                    alpha: .38)
                                                : kColorMutedText)),
                                if (events.isNotEmpty)
                                  Container(
                                      width: 5,
                                      height: 5,
                                      margin: const EdgeInsets.only(top: 2),
                                      decoration: BoxDecoration(
                                          color: selected
                                              ? Colors.white
                                              : outside
                                                  ? kColorAccent.withValues(
                                                      alpha: .35)
                                                  : kColorAccent,
                                          shape: BoxShape.circle)),
                              ]),
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: TmsSpace.md),
        Text('Selected day',
            style: Theme.of(context)
                .textTheme
                .labelLarge
                ?.copyWith(color: kColorMutedText)),
        Text(
            '${_selected.toNepaliDateTime().day} ${_bsMonths[_selected.toNepaliDateTime().month - 1]} ${_selected.toNepaliDateTime().year} BS',
            style: Theme.of(context).textTheme.titleLarge),
        Text(
            '${_englishMonth(_selected.month)} ${_selected.day}, ${_selected.year}',
            style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: TmsSpace.sm),
        if (selectedEvents.isEmpty)
          const Card(
              child: Padding(
                  padding: EdgeInsets.all(TmsSpace.md),
                  child: Text(
                      'No events scheduled for this day. Select another date to review its schedule.')))
        else
          for (final event in selectedEvents)
            Card(
                child: ListTile(
                    leading: const Icon(Icons.event, color: kColorPrimary),
                    title: Text(event.title),
                    subtitle: Text([
                      event.kind,
                      if (event.details.isNotEmpty) event.details
                    ].join(' · ')))),
        const SizedBox(height: TmsSpace.lg),
        Text('Upcoming events', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: TmsSpace.xs),
        if (upcomingEvents.isEmpty)
          const Card(
            child: ListTile(
              leading: Icon(Icons.event_busy_outlined),
              title: Text('No upcoming events published'),
              subtitle: Text(
                'Holidays, exams, ceremonies and deadlines will appear here when the institution publishes them.',
              ),
            ),
          )
        else
          for (final event in upcomingEvents.take(12))
            Card(
              child: ListTile(
                leading: CircleAvatar(child: Text('${event.date.day}')),
                title: Text(event.title),
                subtitle: Text([
                  '${_englishMonth(event.date.month)} ${event.date.day}, ${event.date.year}',
                  event.kind,
                  if (event.details.isNotEmpty) event.details,
                ].join(' - ')),
                onTap: () => setState(() {
                  _selected = event.date;
                  final eventBs = event.date.toNepaliDateTime();
                  _monthAnchor =
                      NepaliDateTime(eventBs.year, eventBs.month).toDateTime();
                }),
              ),
            ),
      ],
    );
  }

  String _englishMonth(int month) => const [
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
        'December'
      ][month - 1];
}
