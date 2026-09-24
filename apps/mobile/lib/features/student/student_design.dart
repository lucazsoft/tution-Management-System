import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

export 'package:tms_mobile/core/theme/app_tokens.dart';

abstract final class StudentColors {
  static const primary = kColorPrimary;
  static const primaryLight = kColorPrimaryLight;
  static const primaryDark = kColorPrimaryDark;
  static const accent = kColorAccent;
  static const accentHover = kColorAccentHover;
  static const background = kColorBg;
  static const surface = kColorSurface;
  static const text = kColorText;
  static const mutedText = kColorMutedText;
  static const border = kColorBorder;
  static const success = kColorSuccess;
  static const warning = kColorWarning;
  static const error = kColorError;
  static const info = kColorInfo;
}

ThemeData buildStudentTheme(ThemeData base) {
  final roboto = GoogleFonts.robotoTextTheme(base.textTheme);
  return base.copyWith(
    scaffoldBackgroundColor: StudentColors.surface,
    colorScheme: base.colorScheme.copyWith(
      primary: StudentColors.primary,
      secondary: StudentColors.accent,
      surface: StudentColors.background,
      error: StudentColors.error,
    ),
    textTheme: roboto.copyWith(
      displaySmall: GoogleFonts.fraunces(
        fontSize: 28,
        height: 1.15,
        fontWeight: FontWeight.w700,
        color: StudentColors.text,
      ),
      headlineSmall: GoogleFonts.fraunces(
        fontSize: 24,
        height: 1.2,
        fontWeight: FontWeight.w700,
        color: StudentColors.text,
      ),
      titleLarge: GoogleFonts.fraunces(
        fontSize: 20,
        height: 1.25,
        fontWeight: FontWeight.w700,
        color: StudentColors.text,
      ),
      titleMedium: GoogleFonts.roboto(
        fontSize: 16,
        height: 1.35,
        fontWeight: FontWeight.w700,
        color: StudentColors.text,
      ),
      bodyLarge: GoogleFonts.roboto(
        fontSize: 16,
        height: 1.45,
        color: StudentColors.text,
      ),
      bodyMedium: GoogleFonts.roboto(
        fontSize: 14,
        height: 1.45,
        color: StudentColors.text,
      ),
      bodySmall: GoogleFonts.roboto(
        fontSize: 12,
        height: 1.4,
        color: StudentColors.mutedText,
      ),
      labelLarge: GoogleFonts.roboto(
        fontSize: 14,
        fontWeight: FontWeight.w700,
      ),
    ),
    appBarTheme: AppBarTheme(
      elevation: 0,
      centerTitle: false,
      backgroundColor: StudentColors.background,
      foregroundColor: StudentColors.text,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: GoogleFonts.fraunces(
        fontSize: 21,
        fontWeight: FontWeight.w700,
        color: StudentColors.primaryDark,
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      margin: EdgeInsets.zero,
      color: StudentColors.background,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(TmsRadius.card),
        side: const BorderSide(color: StudentColors.border),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 68,
      elevation: 0,
      backgroundColor: StudentColors.background,
      surfaceTintColor: Colors.transparent,
      indicatorColor: StudentColors.primary.withValues(alpha: .10),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => GoogleFonts.roboto(
          fontSize: 11,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w700
              : FontWeight.w500,
          color: states.contains(WidgetState.selected)
              ? StudentColors.primary
              : StudentColors.mutedText,
        ),
      ),
    ),
    dividerColor: StudentColors.border,
    progressIndicatorTheme:
        const ProgressIndicatorThemeData(color: StudentColors.primary),
  );
}
