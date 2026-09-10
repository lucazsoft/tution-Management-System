import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

export 'package:tms_mobile/core/theme/app_colors.dart';
export 'package:tms_mobile/core/theme/app_tokens.dart';

ThemeData buildTmsTheme() {
  final textTheme = GoogleFonts.outfitTextTheme();

  return ThemeData(
    useMaterial3: true,
    scaffoldBackgroundColor: kColorSurface,
    colorScheme: ColorScheme.fromSeed(seedColor: kColorPrimary).copyWith(
      primary: kColorPrimary,
      secondary: kColorAccent,
      surface: kColorBg,
      error: kColorError,
    ),
    textTheme: textTheme.copyWith(
      displayLarge: GoogleFonts.fraunces(
        fontSize: 30,
        fontWeight: FontWeight.w700,
        color: kColorText,
      ),
      displayMedium: GoogleFonts.fraunces(
        fontSize: 24,
        fontWeight: FontWeight.w700,
        color: kColorText,
      ),
      headlineMedium: GoogleFonts.fraunces(
        fontSize: 22,
        fontWeight: FontWeight.w700,
        color: kColorText,
      ),
      titleLarge: GoogleFonts.outfit(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: kColorText,
      ),
      titleMedium: GoogleFonts.outfit(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: kColorText,
      ),
      bodyLarge: GoogleFonts.outfit(fontSize: 16, color: kColorText),
      bodyMedium: GoogleFonts.outfit(fontSize: 14, color: kColorText),
      bodySmall: GoogleFonts.outfit(
          fontSize: 12, color: kColorText.withValues(alpha: 0.74)),
    ),
    cardTheme: CardThemeData(
      color: kColorBg,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(TmsRadius.cardLg),
        side: const BorderSide(color: kColorDivider),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: kColorBg,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(TmsRadius.input),
        borderSide: const BorderSide(color: kColorBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(TmsRadius.input),
        borderSide: const BorderSide(color: kColorBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(TmsRadius.input),
        borderSide: const BorderSide(color: kColorPrimaryLight, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(TmsRadius.input),
        borderSide: const BorderSide(color: kColorError),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(TmsRadius.input),
        borderSide: const BorderSide(color: kColorError, width: 2),
      ),
      labelStyle: GoogleFonts.outfit(color: kColorText.withValues(alpha: 0.75)),
      helperStyle:
          GoogleFonts.outfit(color: kColorText.withValues(alpha: 0.72)),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? kColorPrimaryLight
            : Colors.transparent,
      ),
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(TmsRadius.checkbox)),
      side: const BorderSide(color: kColorPrimaryLight),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: kColorText,
      contentTextStyle: GoogleFonts.outfit(color: Colors.white, fontSize: 14),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(TmsRadius.input)),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: kColorAccent,
        foregroundColor: Colors.white,
        disabledBackgroundColor: const Color(0xFFD6DCE5),
        disabledForegroundColor: const Color(0xFF7E8A9A),
        minimumSize: const Size.fromHeight(56),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(TmsRadius.input)),
        textStyle:
            GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: kColorPrimaryLight,
        textStyle: GoogleFonts.outfit(fontWeight: FontWeight.w600),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      indicatorColor: kColorAccent.withValues(alpha: 0.16),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => GoogleFonts.outfit(
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w700
              : FontWeight.w500,
          color: states.contains(WidgetState.selected)
              ? kColorPrimary
              : kColorText.withValues(alpha: 0.7),
        ),
      ),
    ),
  );
}
