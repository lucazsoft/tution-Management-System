import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

export 'package:tms_mobile/core/theme/app_colors.dart';
export 'package:tms_mobile/core/theme/app_tokens.dart';

ThemeData buildTmsTheme() {
  final textTheme = GoogleFonts.robotoTextTheme();

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
      titleLarge: GoogleFonts.fraunces(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: kColorText,
      ),
      titleMedium: GoogleFonts.roboto(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: kColorText,
      ),
      bodyLarge:
          GoogleFonts.roboto(fontSize: 16, height: 1.5, color: kColorText),
      bodyMedium:
          GoogleFonts.roboto(fontSize: 14, height: 1.5, color: kColorText),
      bodySmall: GoogleFonts.roboto(
          fontSize: 12, color: kColorText.withValues(alpha: 0.74)),
      labelLarge: GoogleFonts.roboto(fontWeight: FontWeight.w700),
    ),
    appBarTheme: AppBarTheme(
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      backgroundColor: kColorBg,
      foregroundColor: kColorText,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: GoogleFonts.fraunces(
        fontSize: 21,
        fontWeight: FontWeight.w700,
        color: kColorPrimaryDark,
      ),
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
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
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
      labelStyle: GoogleFonts.roboto(color: kColorText.withValues(alpha: 0.75)),
      helperStyle:
          GoogleFonts.roboto(color: kColorText.withValues(alpha: 0.72)),
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
      contentTextStyle: GoogleFonts.roboto(color: Colors.white, fontSize: 14),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(TmsRadius.input)),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: kColorAccent,
        foregroundColor: kColorText,
        disabledBackgroundColor: const Color(0xFFD6DCE5),
        disabledForegroundColor: const Color(0xFF7E8A9A),
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(TmsRadius.input)),
        textStyle:
            GoogleFonts.roboto(fontSize: 14, fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: kColorPrimaryLight,
        textStyle: GoogleFonts.roboto(fontWeight: FontWeight.w700),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 68,
      elevation: 0,
      backgroundColor: kColorBg,
      surfaceTintColor: Colors.transparent,
      indicatorColor: kColorAccent.withValues(alpha: 0.16),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => GoogleFonts.roboto(
          fontSize: 11,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w700
              : FontWeight.w500,
          color: states.contains(WidgetState.selected)
              ? kColorPrimary
              : kColorText.withValues(alpha: 0.7),
        ),
      ),
    ),
    dividerColor: kColorDivider,
    dialogTheme: DialogThemeData(
      backgroundColor: kColorBg,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(TmsRadius.modal),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: kColorSurface,
      selectedColor: kColorPrimary.withValues(alpha: .1),
      side: const BorderSide(color: kColorDivider),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(TmsRadius.pill),
      ),
      labelStyle: GoogleFonts.roboto(fontSize: 12, fontWeight: FontWeight.w600),
    ),
  );
}
