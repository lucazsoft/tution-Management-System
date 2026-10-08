import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nepali_utils/nepali_utils.dart';
import 'package:tms_mobile/shared/widgets/academic_calendar.dart';

void main() {
  test('calendar grid fills boundary cells with adjacent Nepali dates', () {
    final anchor = DateTime(2026, 9, 21);
    final anchorBs = anchor.toNepaliDateTime();
    final dates = nepaliMonthGrid(anchor);
    final currentMonthDates = dates.where((date) {
      final bs = date.toNepaliDateTime();
      return bs.year == anchorBs.year && bs.month == anchorBs.month;
    }).toList();

    expect(dates, isNotEmpty);
    expect(dates.length % 7, 0);
    expect(
      currentMonthDates.length,
      NepaliDateTime(anchorBs.year, anchorBs.month).totalDays,
    );
    expect(dates.first.weekday, DateTime.sunday);
    expect(dates.last.weekday, DateTime.saturday);
  });

  test('month navigation follows Nepali rather than English boundaries', () {
    final current = DateTime(2026, 9, 21);
    final currentBs = current.toNepaliDateTime();
    final nextBs = shiftNepaliMonth(current, 1).toNepaliDateTime();

    expect(nextBs.day, 1);
    expect(
      nextBs.year * 12 + nextBs.month,
      currentBs.year * 12 + currentBs.month + 1,
    );
  });

  testWidgets('selected holiday does not present attendance as required',
      (tester) async {
    final day = DateTime(2026, 10, 2);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: AcademicCalendar(
            now: () => day,
            events: [
              AcademicCalendarEvent(
                id: 'holiday-1',
                title: 'Dashain break',
                date: day,
                kind: 'Holiday',
              ),
            ],
            scheduledClasses: const [
              AcademicCalendarClass(
                id: 'class-1',
                weekday: DateTime.friday,
                subject: 'Mathematics',
                time: '09:00 - 10:00',
                teacher: 'Teacher',
              ),
            ],
          ),
        ),
      ),
    ));

    expect(find.text('Holiday - no attendance required'), findsOneWidget);
    expect(find.text('Attendance not recorded'), findsNothing);
  });

  testWidgets('past class day shows its attendance and class details',
      (tester) async {
    final today = DateTime(2026, 10, 2);
    final day = today.subtract(const Duration(days: 1));
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: AcademicCalendar(
            now: () => today,
            events: const [],
            attendance: [
              AcademicCalendarAttendance(
                id: 'attendance-1',
                date: day,
                subject: 'Science',
                session: 'Grade 8 A',
                status: 'Absent',
              ),
            ],
            scheduledClasses: [
              AcademicCalendarClass(
                id: 'class-1',
                weekday: day.weekday,
                subject: 'Science',
                time: '10:00 - 11:00',
                teacher: 'Ms Rai',
              ),
            ],
          ),
        ),
      ),
    ));

    await tester.tap(find.byKey(
      ValueKey('calendar-day-${day.year}-${day.month}-${day.day}'),
    ));
    await tester.pump();

    expect(find.text('Absent - Science'), findsOneWidget);
    expect(find.text('Grade 8 A'), findsOneWidget);
    expect(find.text('10:00 - 11:00 - Ms Rai'), findsOneWidget);
    expect(find.text('Attendance not recorded'), findsNothing);
  });

  testWidgets('Nepali-only mode hides Gregorian event dates', (tester) async {
    final today = DateTime(2026, 10, 8);
    final eventDay = DateTime(2026, 10, 9);
    final eventBs = eventDay.toNepaliDateTime();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: AcademicCalendar(
            now: () => today,
            showGregorianDates: false,
            events: [
              AcademicCalendarEvent(
                id: 'event-1',
                title: 'School ceremony',
                date: eventDay,
                kind: 'Ceremony',
              ),
            ],
          ),
        ),
      ),
    ));

    expect(find.text('School ceremony'), findsOneWidget);
    expect(find.textContaining('${eventBs.year} BS'), findsWidgets);
    expect(find.textContaining('October 9, 2026'), findsNothing);
  });
}
