import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';

const teacherWeekdayKeys = <String>[
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
];

String teacherDayKey(DateTime date) => teacherWeekdayKeys[date.weekday - 1];

/// Returns the seven weekday keys starting with [date]'s weekday.
List<String> rollingTeacherWeekdays(DateTime date) => List.generate(
      DateTime.daysPerWeek,
      (offset) => teacherWeekdayKeys[(date.weekday - 1 + offset) % 7],
      growable: false,
    );

/// Produces a compact label containing only this day's schedule information.
///
/// A teacher class can carry its full weekly routine in [TeacherTodayClass.slots].
/// Attendance should not repeat that routine, so only matching times are shown.
String teacherTodayScheduleLabel(TeacherTodayClass item, DateTime date) {
  final day = teacherDayKey(date);
  final times = <String>{
    for (final slot in item.slots)
      if (slot.matchesDay(day) && slot.timeLabel.isNotEmpty) slot.timeLabel,
  };
  return times.join(', ');
}
