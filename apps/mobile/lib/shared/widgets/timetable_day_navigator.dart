import 'package:flutter/material.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';

class TimetableDayNavigator extends StatelessWidget {
  const TimetableDayNavigator({
    super.key,
    required this.date,
    required this.isToday,
    required this.onPrevious,
    required this.onNext,
  });

  final DateTime date;
  final bool isToday;
  final VoidCallback? onPrevious;
  final VoidCallback? onNext;

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
                child: Column(children: [
                  Text(
                      isToday
                          ? 'Today · ${_days[date.weekday - 1]}'
                          : _days[date.weekday - 1],
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 3),
                  Text('${date.day} ${_months[date.month - 1]} ${date.year}',
                      textAlign: TextAlign.center,
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(color: kColorMutedText)),
                ]),
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
