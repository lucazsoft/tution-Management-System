import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nepali_utils/nepali_utils.dart';
import 'package:tms_mobile/shared/widgets/academic_calendar.dart';
import 'package:tms_mobile/shared/widgets/meeting_schedule_fields.dart';

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
                details: 'School closed.',
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

    expect(find.text('Holiday - no attendance required'), findsNothing);
    expect(find.text('Dashain break'), findsWidgets);
    expect(find.text('School closed.'), findsOneWidget);
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

  testWidgets('student presentation omits redundant calendar copy',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: AcademicCalendar(
            now: () => DateTime(2026, 10, 8),
            events: const [],
            showSelectedDayLabel: false,
            showUpcomingEmptyDescription: false,
            emphasizeUpcomingEmptyState: true,
          ),
        ),
      ),
    ));

    expect(find.text('Selected day'), findsNothing);
    expect(find.text('No upcoming events published'), findsOneWidget);
    expect(
      find.text(
        'Holidays, exams, ceremonies and deadlines will appear here when the institution publishes them.',
      ),
      findsNothing,
    );
    final emptyCard = find.ancestor(
      of: find.text('No upcoming events published'),
      matching: find.byType(Card),
    );
    expect(tester.getSize(emptyCard).height, greaterThanOrEqualTo(96));
  });

  testWidgets('meeting calendar selects a Bikram Sambat day', (tester) async {
    final firstDate = DateTime(2026, 10, 8);
    final selectedDate = firstDate.add(const Duration(days: 1));
    DateTime? picked;
    final targetBs = selectedDate.toNepaliDateTime();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: NepaliMeetingCalendar(
          selectedDate: firstDate,
          firstDate: firstDate,
          lastDate: firstDate.add(const Duration(days: 365)),
          onDateSelected: (value) => picked = value,
        ),
      ),
    ));

    expect(find.textContaining('BS'), findsOneWidget);
    await tester.tap(find.byKey(ValueKey(
      'meeting-bs-${targetBs.year}-${targetBs.month}-${targetBs.day}',
    )));
    expect(picked, selectedDate);
  });

  testWidgets(
      'meeting calendar uses Nepali digits and disables unavailable days',
      (tester) async {
    final firstDate = DateTime(2026, 10, 8);
    final holiday = DateTime(2026, 10, 9);
    final saturday = DateTime(2026, 10, 10);
    DateTime? picked;

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: NepaliMeetingCalendar(
          selectedDate: firstDate,
          firstDate: firstDate,
          lastDate: firstDate.add(const Duration(days: 30)),
          selectableDayPredicate: (day) =>
              day.weekday != DateTime.saturday &&
              !(day.year == holiday.year &&
                  day.month == holiday.month &&
                  day.day == holiday.day),
          holidayPredicate: (day) =>
              day.year == holiday.year &&
              day.month == holiday.month &&
              day.day == holiday.day,
          redDayPredicate: (day) => day.weekday == DateTime.saturday,
          redDayLegend: 'Saturday / holiday',
          onDateSelected: (value) => picked = value,
        ),
      ),
    ));

    final firstBs = firstDate.toNepaliDateTime();
    final nepaliDay = '${firstBs.day}'.replaceAllMapped(
      RegExp(r'\d'),
      (match) => '०१२३४५६७८९'[int.parse(match.group(0)!)],
    );
    final nepaliYear = '${firstBs.year}'.replaceAllMapped(
      RegExp(r'\d'),
      (match) => '०१२३४५६७८९'[int.parse(match.group(0)!)],
    );
    expect(find.text(nepaliDay), findsOneWidget);
    expect(find.textContaining('$nepaliYear BS'), findsOneWidget);
    expect(find.text('${firstDate.day}'), findsOneWidget);

    final holidayBs = holiday.toNepaliDateTime();
    final holidayCell = find.byKey(ValueKey(
      'meeting-bs-${holidayBs.year}-${holidayBs.month}-${holidayBs.day}',
    ));
    final holidayContainer = tester.widget<Container>(
      find.descendant(of: holidayCell, matching: find.byType(Container)),
    );
    final holidayDecoration = holidayContainer.decoration! as BoxDecoration;
    expect(holidayDecoration.color, Colors.red.shade50);
    expect(holidayDecoration.border, isNotNull);
    expect(find.text('Saturday / holiday'), findsOneWidget);

    final saturdayBs = saturday.toNepaliDateTime();
    final saturdayCell = find.byKey(ValueKey(
      'meeting-bs-${saturdayBs.year}-${saturdayBs.month}-${saturdayBs.day}',
    ));
    final saturdayContainer = tester.widget<Container>(
      find.descendant(of: saturdayCell, matching: find.byType(Container)),
    );
    final saturdayDecoration = saturdayContainer.decoration! as BoxDecoration;
    expect(saturdayDecoration.color, Colors.red.shade50);
    expect(saturdayDecoration.border, isNotNull);

    for (final blocked in [holiday, saturday]) {
      final bs = blocked.toNepaliDateTime();
      await tester.tap(find.byKey(
        ValueKey('meeting-bs-${bs.year}-${bs.month}-${bs.day}'),
      ));
      expect(picked, isNull);
    }
  });
}
