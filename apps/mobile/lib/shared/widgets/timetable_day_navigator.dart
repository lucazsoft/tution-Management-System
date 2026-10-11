import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';

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

  Future<void> _selectDate(BuildContext context) async {
    if (onDateSelected == null ||
        kIsWeb ||
        defaultTargetPlatform != TargetPlatform.android) {
      return;
    }
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final selected = await showDatePicker(
      context: context,
      initialDate: date,
      firstDate: today.subtract(const Duration(days: 7)),
      lastDate: today.add(const Duration(days: 7)),
      helpText: 'Select timetable date',
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
                  onTap: onDateSelected == null ||
                          kIsWeb ||
                          defaultTargetPlatform != TargetPlatform.android
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
                      Text(
                          '${date.day} ${_months[date.month - 1]} ${date.year}',
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
