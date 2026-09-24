import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/utils/validators.dart';
import 'package:tms_mobile/core/utils/formatters.dart';

void main() {
  group('AppValidators tests', () {
    test('isValidEmail accepts valid emails', () {
      expect(AppValidators.isValidEmail('test@example.com'), isTrue);
      expect(
          AppValidators.isValidEmail('teacher.shyam@pinnacle.edu.np'), isTrue);
      expect(AppValidators.isValidEmail('parent.mira@gmail.com'), isTrue);
    });

    test('isValidEmail rejects invalid emails', () {
      expect(AppValidators.isValidEmail('testexample.com'), isFalse);
      expect(AppValidators.isValidEmail('test@'), isFalse);
      expect(AppValidators.isValidEmail('test@example'), isFalse);
      expect(AppValidators.isValidEmail(''), isFalse);
    });

    test('validateEmail output check', () {
      expect(AppValidators.validateEmail(null), 'Email is required');
      expect(AppValidators.validateEmail('  '), 'Email is required');
      expect(AppValidators.validateEmail('invalid'),
          'Enter a valid email address');
      expect(AppValidators.validateEmail('test@example.com'), isNull);
    });

    test('passwordStrengthScore evaluates strength correctly', () {
      // 0 score: empty string
      expect(AppValidators.passwordStrengthScore(''), 0);

      // 1 score: short, lowercase only
      expect(AppValidators.passwordStrengthScore('abc'), 1);

      // 2 score: short, lowercase + uppercase
      expect(AppValidators.passwordStrengthScore('abC'), 2);

      // 2 score: meets min length + lowercase only
      expect(AppValidators.passwordStrengthScore('abcdefgh'), 2);

      // 3 score: meets min length + lowercase + uppercase
      expect(AppValidators.passwordStrengthScore('Abcdefgh'), 3);

      // 4 score: meets min length + lowercase + uppercase + number
      expect(AppValidators.passwordStrengthScore('Abcdefg1'), 4);

      // 4 score: meets min length + lowercase + uppercase + number + special (clamped)
      expect(AppValidators.passwordStrengthScore('Abcdefg1!'), 4);
    });
  });

  group('Formatter utility tests', () {
    test('maskEmail obfuscates emails properly', () {
      expect(maskEmail('shyam@pinnacle.edu.np'), 'sh***@pinnacle.edu.np');
      expect(maskEmail('a@b.com'),
          'a*@b.com'); // boundary case (parts.first.length <= 1)
      expect(maskEmail('ab@cd.com'),
          'a*@cd.com'); // boundary case (parts.first.length == 2)
      expect(maskEmail('abc@def.com'),
          'ab*@def.com'); // boundary case (parts.first.length == 3)
      expect(maskEmail('invalid-email'), 'invalid-email');
    });

    test('formatCountdown outputs MM:SS format', () {
      expect(formatCountdown(300), '05:00');
      expect(formatCountdown(65), '01:05');
      expect(formatCountdown(9), '00:09');
    });

    test('formatShortTime formats time with AM/PM', () {
      final morningTime = DateTime(2026, 7, 9, 9, 30);
      final afternoonTime = DateTime(2026, 7, 9, 14, 5);
      final midnight = DateTime(2026, 7, 9, 0, 15);
      final noon = DateTime(2026, 7, 9, 12, 0);

      expect(formatShortTime(morningTime), '9:30AM');
      expect(formatShortTime(afternoonTime), '2:05PM');
      expect(formatShortTime(midnight), '12:15AM');
      expect(formatShortTime(noon), '12:00PM');
    });

    test('formatDurationClock outputs HH:MM:SS', () {
      expect(
          formatDurationClock(const Duration(hours: 1, minutes: 2, seconds: 3)),
          '01:02:03');
      expect(formatDurationClock(const Duration(minutes: 45, seconds: 12)),
          '00:45:12');
      expect(formatDurationClock(const Duration(seconds: 5)), '00:00:05');
    });
  });
}
