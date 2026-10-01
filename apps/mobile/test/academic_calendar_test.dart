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
}
