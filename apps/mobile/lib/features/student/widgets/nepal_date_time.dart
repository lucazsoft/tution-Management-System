import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nepali_utils/nepali_utils.dart';

import '../student_design.dart';

/// Nepal's fixed UTC offset. Using UTC first keeps the display independent of
/// the phone's configured timezone.
const _nepalOffset = Duration(hours: 5, minutes: 45);

DateTime nepalTime(DateTime instant) => instant.toUtc().add(_nepalOffset);

String nepaliDigits(Object value) => value.toString().replaceAllMapped(
      RegExp(r'\d'),
      (match) => '०१२३४५६७८९'[int.parse(match.group(0)!)],
    );

const _nepaliMonths = <String>[
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

const _nepaliWeekdays = <String>[
  'सोमबार',
  'मंगलबार',
  'बुधबार',
  'बिहिबार',
  'शुक्रबार',
  'शनिबार',
  'आइतबार',
];

const _englishMonths = <String>[
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

String nepaliDateLabel(DateTime instant) {
  final kathmandu = nepalTime(instant);
  final bs = kathmandu.toNepaliDateTime();
  return '${nepaliDigits(bs.day)} ${_nepaliMonths[bs.month - 1]} '
      '${nepaliDigits(bs.year)}, ${_nepaliWeekdays[kathmandu.weekday - 1]}';
}

String englishDateLabel(DateTime instant) {
  final value = nepalTime(instant);
  return '${_englishMonths[value.month - 1]} ${value.day}, ${value.year}';
}

String nepalClockLabel(DateTime instant) {
  final value = nepalTime(instant);
  final hour = value.hour % 12 == 0 ? 12 : value.hour % 12;
  String two(int number) => number.toString().padLeft(2, '0');
  return '${two(hour)}:${two(value.minute)}:${two(value.second)} '
      '${value.hour < 12 ? 'AM' : 'PM'}';
}

class NepalDateTimeHeader extends StatefulWidget {
  const NepalDateTimeHeader({super.key, this.now});

  /// Injectable only to make date and timezone behavior deterministic in tests.
  final DateTime Function()? now;

  @override
  State<NepalDateTimeHeader> createState() => _NepalDateTimeHeaderState();
}

class _NepalDateTimeHeaderState extends State<NepalDateTimeHeader> {
  late DateTime _now;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _now = (widget.now ?? DateTime.now)();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = (widget.now ?? DateTime.now)());
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '${nepaliDateLabel(_now)}. ${englishDateLabel(_now)}. '
          '${nepalClockLabel(_now)} Nepal time',
      liveRegion: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            nepaliDateLabel(_now),
            key: const ValueKey('student-home-nepali-date'),
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: StudentColors.primaryDark,
                  fontWeight: FontWeight.w800,
                  height: 1.15,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            englishDateLabel(_now),
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(color: StudentColors.mutedText),
          ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 6,
            runSpacing: 2,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              const Icon(Icons.schedule_rounded,
                  size: 18, color: StudentColors.primary),
              Text(
                nepalClockLabel(_now),
                key: const ValueKey('student-home-nepal-clock'),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: StudentColors.text,
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              Text(
                'Nepal time',
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: StudentColors.mutedText),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
