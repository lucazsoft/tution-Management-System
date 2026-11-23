import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';

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
  return base.copyWith(
    scaffoldBackgroundColor: StudentColors.surface,
    colorScheme: base.colorScheme.copyWith(
      primary: StudentColors.primary,
      secondary: StudentColors.accent,
      surface: StudentColors.background,
      error: StudentColors.error,
    ),
    textTheme: buildTmsTextTheme(base.textTheme),
    appBarTheme: AppBarTheme(
      elevation: 0,
      centerTitle: false,
      backgroundColor: StudentColors.background,
      foregroundColor: StudentColors.text,
      iconTheme: const IconThemeData(color: StudentColors.primary),
      surfaceTintColor: Colors.transparent,
      titleTextStyle: GoogleFonts.fraunces(
        fontSize: 21,
        fontWeight: FontWeight.w700,
        color: StudentColors.primaryDark,
      ),
    ),
    navigationDrawerTheme: NavigationDrawerThemeData(
      backgroundColor: StudentColors.background,
      surfaceTintColor: Colors.transparent,
      indicatorColor: StudentColors.primary.withValues(alpha: .08),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          color: states.contains(WidgetState.selected)
              ? StudentColors.primary
              : StudentColors.mutedText,
        ),
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
