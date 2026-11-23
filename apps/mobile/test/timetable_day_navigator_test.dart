import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nepali_utils/nepali_utils.dart';
import 'package:tms_mobile/shared/widgets/academic_calendar.dart';
import 'package:tms_mobile/shared/widgets/timetable_day_navigator.dart';

void main() {
  testWidgets('date label and Android picker use the Nepali calendar',
      (tester) async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    DateTime? selectedDate;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: TimetableDayNavigator(
            date: today,
            isToday: true,
            onPrevious: () {},
            onNext: () {},
            onDateSelected: (date) => selectedDate = date,
          ),
        ),
      ),
    );

    final todayBs = today.toNepaliDateTime();
    final dateLabel = find.textContaining(
      academicNepaliMonths[todayBs.month - 1],
    );
    expect(dateLabel, findsOneWidget);

    await tester.tap(dateLabel);
    await tester.pumpAndSettle();

    expect(find.text('Select Nepali date'), findsOneWidget);
    expect(find.textContaining('BS'), findsWidgets);

    final enabledButton = tester.widget<TextButton>(find.byKey(ValueKey(
      'nepali-timetable-day-${today.year}-${today.month}-${today.day}',
    )));
    expect(enabledButton.onPressed, isNotNull);
    final calendarButtons = tester.widgetList<TextButton>(
      find.byWidgetPredicate(
        (widget) =>
            widget is TextButton &&
            widget.key is ValueKey<String> &&
            (widget.key! as ValueKey<String>)
                .value
                .startsWith('nepali-timetable-day-'),
      ),
    );
    expect(calendarButtons.any((button) => button.onPressed == null), isTrue);

    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(selectedDate, today);
  });
}
