import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/features/student/widgets/nepal_date_time.dart';

void main() {
  final instant = DateTime.utc(2026, 9, 19, 12, 30, 45);

  test('formats a UTC instant using Kathmandu date and time', () {
    expect(nepalClockLabel(instant), '06:15:45 PM');
    expect(englishDateLabel(instant), 'September 19, 2026');
    expect(nepaliDateLabel(instant), contains('२०८३'));
    expect(nepaliDateLabel(instant), endsWith('शनिबार'));
  });

  testWidgets('shows prominent Nepali date, English date and live Nepal clock',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: NepalDateTimeHeader(now: () => instant),
      ),
    ));

    expect(find.byKey(const ValueKey('student-home-nepali-date')), findsOneWidget);
    expect(find.text('September 19, 2026'), findsOneWidget);
    expect(find.text('06:15:45 PM'), findsOneWidget);
    expect(find.text('Nepal time'), findsOneWidget);
  });
}
