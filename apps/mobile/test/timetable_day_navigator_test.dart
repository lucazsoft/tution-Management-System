import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/shared/widgets/timetable_day_navigator.dart';

void main() {
  testWidgets('date label opens a picker limited to one week either side',
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

    await tester.tap(find.textContaining('${today.day} '));
    await tester.pumpAndSettle();

    final dialog =
        tester.widget<DatePickerDialog>(find.byType(DatePickerDialog));
    expect(dialog.firstDate, today.subtract(const Duration(days: 7)));
    expect(dialog.lastDate, today.add(const Duration(days: 7)));

    await tester.tap(find.text('${today.day}').last);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(selectedDate, today);
  });
}
