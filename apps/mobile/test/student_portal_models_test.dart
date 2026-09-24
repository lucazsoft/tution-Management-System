import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/features/student/models/student_portal_models.dart';

void main() {
  group('Student academic insights', () {
    test('calculates improving, stable, and declining trends', () {
      const improving = SubjectInsight(
        subject: 'Mathematics',
        average: 84,
        previousAverage: 78,
      );
      const stable = SubjectInsight(
        subject: 'English',
        average: 78,
        previousAverage: 77,
      );
      const declining = SubjectInsight(
        subject: 'Science',
        average: 62,
        previousAverage: 70,
      );

      expect(improving.trend, 'Improving');
      expect(stable.trend, 'Stable');
      expect(declining.trend, 'Declining');
    });

    test('converts a test score to percentage', () {
      final result = TestResult(
        id: 'result',
        subject: 'Mathematics',
        testName: 'Unit test',
        score: 44,
        maximum: 50,
        classAverage: 36,
        publishedAt: DateTime(2026, 7, 29),
      );

      expect(result.percentage, 88);
    });
  });

  group('Student fee calculations', () {
    test('adds dues, discounts, and fines into net payable', () {
      final invoice = StudentInvoice(
        id: 'invoice',
        cycle: 'August 2026',
        dueDate: DateTime(2026, 8, 1),
        state: FeeDeadlineState.overdue,
        lines: const [
          StudentInvoiceLine('Tuition dues', 3800),
          StudentInvoiceLine('Music course', 900),
          StudentInvoiceLine('Merit discount', -300),
          StudentInvoiceLine('Late fine', 100),
        ],
      );

      expect(invoice.netPayable, 4500);
    });
  });
}
