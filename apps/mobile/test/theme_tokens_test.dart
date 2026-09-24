import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';
import 'package:tms_mobile/features/student/student_design.dart';

double _cardRadius(ThemeData theme) {
  final shape = theme.cardTheme.shape! as RoundedRectangleBorder;
  return (shape.borderRadius as BorderRadius).topLeft.x;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;
  group('core palette (single source of truth)', () {
    test('kColor values are pinned', () {
      expect(kColorPrimary, const Color(0xFF1560BD));
      expect(kColorPrimaryLight, const Color(0xFF2F6FED));
      expect(kColorPrimaryDark, const Color(0xFF002D72));
      expect(kColorAccent, const Color(0xFFFFBC3B));
      expect(kColorAccentHover, const Color(0xFFFFCB63));
      expect(kColorBg, const Color(0xFFFFFFFF));
      expect(kColorSurface, const Color(0xFFF5F7FA));
      expect(kColorText, const Color(0xFF1B1F3B));
      expect(kColorMutedText, const Color(0xFF475569));
      expect(kColorSuccess, const Color(0xFF00AB66));
      expect(kColorWarning, const Color(0xFFE08E00));
      expect(kColorError, const Color(0xFFE63946));
      expect(kColorInfo, const Color(0xFF1560BD));
      expect(kColorDivider, const Color(0xFFE2E8F0));
      expect(kColorBorder, const Color(0xFFDCE3ED));
    });
  });

  group('shared radius + spacing scale', () {
    test('TmsSpace values are pinned', () {
      expect(TmsSpace.xxs, 4.0);
      expect(TmsSpace.xs, 8.0);
      expect(TmsSpace.sm, 12.0);
      expect(TmsSpace.md, 16.0);
      expect(TmsSpace.lg, 24.0);
      expect(TmsSpace.xl, 32.0);
      expect(TmsSpace.xxl, 40.0);
      expect(TmsSpace.display, 56.0);
    });

    test('TmsRadius numeric scale and aliases are pinned', () {
      expect(TmsRadius.r2, 2.0);
      expect(TmsRadius.r4, 4.0);
      expect(TmsRadius.r6, 6.0);
      expect(TmsRadius.r7, 7.0);
      expect(TmsRadius.r8, 8.0);
      expect(TmsRadius.r10, 10.0);
      expect(TmsRadius.r12, 12.0);
      expect(TmsRadius.r14, 14.0);
      expect(TmsRadius.r16, 16.0);
      expect(TmsRadius.r18, 18.0);
      expect(TmsRadius.r20, 20.0);
      expect(TmsRadius.r22, 22.0);
      expect(TmsRadius.r24, 24.0);
      expect(TmsRadius.r99, 99.0);
      expect(TmsRadius.rFull, 999.0);
      // Semantic aliases source the same numbers.
      expect(TmsRadius.checkbox, TmsRadius.r4);
      expect(TmsRadius.control, TmsRadius.r7);
      expect(TmsRadius.card, TmsRadius.r12);
      expect(TmsRadius.cardLg, TmsRadius.r20);
      expect(TmsRadius.input, TmsRadius.r16);
      expect(TmsRadius.modal, TmsRadius.r18);
      expect(TmsRadius.pill, TmsRadius.r20);
    });
  });

  group('global web-aligned theme regression', () {
    testWidgets('card/input/checkbox radii source shared tokens', (_) async {
      final theme = buildTmsTheme();
      expect(_cardRadius(theme), TmsRadius.cardLg);
      expect(_cardRadius(theme), 16.0);
      final border = theme.inputDecorationTheme.border! as OutlineInputBorder;
      expect(border.borderRadius.topLeft.x, TmsRadius.input);
      expect(border.borderRadius.topLeft.x, 7.0);
    });

    testWidgets('palette wires core colors', (_) async {
      final theme = buildTmsTheme();
      expect(theme.colorScheme.primary, kColorPrimary);
      expect(theme.colorScheme.secondary, kColorAccent);
      expect(theme.colorScheme.error, kColorError);
    });
  });

  group('student web-aligned theme regression', () {
    testWidgets('student card radius stays 12 via shared token', (_) async {
      final theme = buildStudentTheme(ThemeData.light());
      expect(_cardRadius(theme), TmsRadius.card);
      expect(_cardRadius(theme), 12.0);
    });

    testWidgets('body/label/nav text uses Roboto, display keeps Fraunces',
        (_) async {
      final theme = buildStudentTheme(ThemeData.light());
      final text = theme.textTheme;
      for (final style in <TextStyle?>[
        text.titleMedium,
        text.bodyLarge,
        text.bodyMedium,
        text.bodySmall,
        text.labelLarge,
      ]) {
        expect(style?.fontFamily, contains('Roboto'));
      }
      expect(text.displaySmall?.fontFamily, contains('Fraunces'));
      final families = <String?>[
        text.displaySmall?.fontFamily,
        text.headlineSmall?.fontFamily,
        text.titleLarge?.fontFamily,
        text.titleMedium?.fontFamily,
        text.bodyLarge?.fontFamily,
        text.bodyMedium?.fontFamily,
        text.bodySmall?.fontFamily,
        text.labelLarge?.fontFamily,
      ];
      expect(families.any((f) => f?.contains('Roboto') ?? false), isTrue);
    });

    testWidgets('nav indicator tint and surface are unchanged', (_) async {
      final theme = buildStudentTheme(ThemeData.light());
      expect(
        theme.navigationBarTheme.indicatorColor,
        StudentColors.primary.withValues(alpha: .10),
      );
      expect(theme.scaffoldBackgroundColor, StudentColors.surface);
    });
  });
}
