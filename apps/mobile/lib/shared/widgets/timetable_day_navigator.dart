import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:nepali_utils/nepali_utils.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';
import 'package:tms_mobile/shared/widgets/academic_calendar.dart';

class TimetableDayNavigator extends StatelessWidget {
  const TimetableDayNavigator({
    super.key,
    required this.date,
    required this.isToday,
    required this.onPrevious,
    required this.onNext,
    this.onDateSelected,
  });

  final DateTime date;
  final bool isToday;
  final VoidCallback? onPrevious;
  final VoidCallback? onNext;
  final ValueChanged<DateTime>? onDateSelected;

  bool get _usesNepaliCalendar =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Future<void> _selectDate(BuildContext context) async {
    if (onDateSelected == null || !_usesNepaliCalendar) {
      return;
    }
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final selected = await showDialog<DateTime>(
      context: context,
      builder: (context) => _NepaliTimetableDatePicker(
        initialDate: date,
        firstDate: today.subtract(const Duration(days: 7)),
        lastDate: today.add(const Duration(days: 7)),
      ),
    );
    if (selected != null) onDateSelected!(selected);
  }

  static const _days = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
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
    'December'
  ];

  String _dateLabel() {
    if (!_usesNepaliCalendar) {
      return '${date.day} ${_months[date.month - 1]} ${date.year}';
    }
    final bs = date.toNepaliDateTime();
    return '${_nepaliDigits(bs.day)} '
        '${academicNepaliMonths[bs.month - 1]} '
        '${_nepaliDigits(bs.year)} BS';
  }

  @override
  Widget build(BuildContext context) => Column(children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: TmsSpace.sm, vertical: TmsSpace.md),
            child: Row(children: [
              IconButton.filledTonal(
                tooltip: 'Previous day',
                onPressed: onPrevious,
                icon: const Icon(Icons.chevron_left_rounded),
              ),
              Expanded(
                child: InkWell(
                  onTap: onDateSelected == null || !_usesNepaliCalendar
                      ? null
                      : () => _selectDate(context),
                  borderRadius: BorderRadius.circular(12),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Column(children: [
                      Text(
                          isToday
                              ? 'Today · ${_days[date.weekday - 1]}'
                              : _days[date.weekday - 1],
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 3),
                      Text(_dateLabel(),
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(color: kColorMutedText)),
                    ]),
                  ),
                ),
              ),
              IconButton.filledTonal(
                tooltip: 'Next day',
                onPressed: onNext,
                icon: const Icon(Icons.chevron_right_rounded),
              ),
            ]),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: TmsSpace.sm),
          child: Text('You can review up to one week before or after today.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall),
        ),
      ]);
}

class _NepaliTimetableDatePicker extends StatefulWidget {
  const _NepaliTimetableDatePicker({
    required this.initialDate,
    required this.firstDate,
    required this.lastDate,
  });

  final DateTime initialDate;
  final DateTime firstDate;
  final DateTime lastDate;

  @override
  State<_NepaliTimetableDatePicker> createState() =>
      _NepaliTimetableDatePickerState();
}

class _NepaliTimetableDatePickerState
    extends State<_NepaliTimetableDatePicker> {
  late DateTime _selected = _dateOnly(widget.initialDate);
  late DateTime _monthAnchor = _firstDayOfNepaliMonth(_selected);

  static DateTime _dateOnly(DateTime value) =>
      DateTime(value.year, value.month, value.day);

  static DateTime _firstDayOfNepaliMonth(DateTime value) {
    final bs = value.toNepaliDateTime();
    return NepaliDateTime(bs.year, bs.month, 1).toDateTime();
  }

  bool _sameDay(DateTime first, DateTime second) =>
      first.year == second.year &&
      first.month == second.month &&
      first.day == second.day;

  bool _enabled(DateTime value) =>
      !value.isBefore(_dateOnly(widget.firstDate)) &&
      !value.isAfter(_dateOnly(widget.lastDate));

  @override
  Widget build(BuildContext context) {
    final anchorBs = _monthAnchor.toNepaliDateTime();
    final days = nepaliMonthGrid(_monthAnchor);
    return AlertDialog(
      title: const Text('Select Nepali date'),
      content: SizedBox(
        width: 360,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: 'Previous Nepali month',
                  onPressed: () => setState(
                    () => _monthAnchor = shiftNepaliMonth(_monthAnchor, -1),
                  ),
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Text(
                    '${academicNepaliMonths[anchorBs.month - 1]} '
                    '${_nepaliDigits(anchorBs.year)} BS',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                IconButton(
                  tooltip: 'Next Nepali month',
                  onPressed: () => setState(
                    () => _monthAnchor = shiftNepaliMonth(_monthAnchor, 1),
                  ),
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            Row(
              children: [
                for (final weekday in academicNepaliWeekdays)
                  Expanded(
                    child: Text(
                      weekday,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 7,
                mainAxisExtent: 42,
              ),
              itemCount: days.length,
              itemBuilder: (context, index) {
                final day = _dateOnly(days[index]);
                final dayBs = day.toNepaliDateTime();
                final inMonth = dayBs.year == anchorBs.year &&
                    dayBs.month == anchorBs.month;
                final enabled = _enabled(day);
                final selected = _sameDay(day, _selected);
                return Padding(
                  padding: const EdgeInsets.all(2),
                  child: TextButton(
                    key: ValueKey(
                      'nepali-timetable-day-${day.year}-${day.month}-${day.day}',
                    ),
                    onPressed: enabled
                        ? () => setState(() => _selected = day)
                        : null,
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      backgroundColor: selected
                          ? Theme.of(context).colorScheme.primary
                          : null,
                      foregroundColor: selected
                          ? Theme.of(context).colorScheme.onPrimary
                          : inMonth
                              ? null
                              : Theme.of(context).disabledColor,
                    ),
                    child: Text(_nepaliDigits(dayBs.day)),
                  ),
                );
              },
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, _selected),
          child: const Text('OK'),
        ),
      ],
    );
  }
}

String _nepaliDigits(Object value) => value.toString().replaceAllMapped(
      RegExp(r'\d'),
      (match) => '०१२३४५६७८९'[int.parse(match.group(0)!)],
    );
