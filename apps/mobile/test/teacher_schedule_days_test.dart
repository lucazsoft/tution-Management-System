import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';
import 'package:tms_mobile/features/teacher/utils/teacher_schedule_days.dart';

void main() {
  group('rollingTeacherWeekdays', () {
    test('starts on Sunday and wraps to Monday', () {
      expect(
        rollingTeacherWeekdays(DateTime(2026, 10, 4)),
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      );
    });

    test('starts on Monday and wraps to Sunday', () {
      expect(
        rollingTeacherWeekdays(DateTime(2026, 10, 5)),
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      );
    });

    test('starts on Tuesday and preserves chronological order', () {
      expect(
        rollingTeacherWeekdays(DateTime(2026, 10, 6)),
        ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon'],
      );
    });

    test('starts on Saturday and wraps to Sunday', () {
      expect(
        rollingTeacherWeekdays(DateTime(2026, 10, 10)),
        ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      );
    });
  });

  test('attendance label includes only the current weekday slots', () {
    const item = TeacherTodayClass(
      sessionId: 'session-1',
      classId: 'class-1',
      className: 'Grade 8',
      courseName: 'Mathematics',
      slots: [
        TeacherScheduleSlot(day: 'Mon', start: '09:00', end: '10:00'),
        TeacherScheduleSlot(day: 'Tue', start: '11:00', end: '12:00'),
        TeacherScheduleSlot(day: 'Tue', start: '13:00', end: '14:00'),
      ],
    );

    expect(
      teacherTodayScheduleLabel(item, DateTime(2026, 10, 6)),
      '11:00-12:00, 13:00-14:00',
    );
    expect(
      teacherTodayScheduleLabel(item, DateTime(2026, 10, 7)),
      isEmpty,
    );
  });
}
