import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

export 'package:tms_mobile/core/theme/app_tokens.dart';

abstract final class StudentColors {
  static const primary = Color(0xFF1560BD);
  static const primaryLight = Color(0xFF2F6FED);
  static const primaryDark = Color(0xFF002D72);
  static const accent = Color(0xFFFFBC3B);
  static const accentHover = Color(0xFFFFCB63);
  static const background = Color(0xFFFFFFFF);
  static const surface = Color(0xFFF5F7FA);
  static const text = Color(0xFF1B1F3B);
  static const mutedText = Color(0xFF5D6478);
  static const border = Color(0xFFDDE3EC);
  static const success = Color(0xFF00AB66);
  static const warning = Color(0xFFE08E00);
  static const error = Color(0xFFE63946);
  static const info = Color(0xFF1560BD);
}

ThemeData buildStudentTheme(ThemeData base) {
  final outfit = GoogleFonts.outfitTextTheme(base.textTheme);
  return base.copyWith(
    scaffoldBackgroundColor: StudentColors.surface,
    colorScheme: base.colorScheme.copyWith(
      primary: StudentColors.primary,
      secondary: StudentColors.accent,
      surface: StudentColors.background,
      error: StudentColors.error,
    ),
    textTheme: outfit.copyWith(
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
      titleMedium: GoogleFonts.outfit(
        fontSize: 16,
        height: 1.35,
        fontWeight: FontWeight.w700,
        color: StudentColors.text,
      ),
      bodyLarge: GoogleFonts.outfit(
        fontSize: 16,
        height: 1.45,
        color: StudentColors.text,
      ),
      bodyMedium: GoogleFonts.outfit(
        fontSize: 14,
        height: 1.45,
        color: StudentColors.text,
      ),
      bodySmall: GoogleFonts.outfit(
        fontSize: 12,
        height: 1.4,
        color: StudentColors.mutedText,
      ),
      labelLarge: GoogleFonts.outfit(
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
        (states) => GoogleFonts.outfit(
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
