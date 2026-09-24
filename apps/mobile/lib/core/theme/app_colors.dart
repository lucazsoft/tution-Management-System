import 'package:flutter/material.dart';

// Single source of truth for TMS core palette (UI Phase A).
// Previously duplicated in lib/app/theme/app_colors.dart (TmsAppColors);
// that file is removed. Every value below matches one of the two former
// files pixel-for-pixel:
//  - kColorMutedText/kColorDivider/kColorBorder carry the exact values that
//    TmsAppColors.mutedText/divider/border had.
//  - TmsAppColors.info was an alias of primaryLight (0xFF1B5FA7); call sites
//    now use kColorPrimaryLight. kColorInfo keeps its distinct teal value.
const kColorPrimary = Color(0xFF0F4C8A);
const kColorPrimaryLight = Color(0xFF1B5FA7);
const kColorAccent = Color(0xFFF39C12);
const kColorAccentHover = Color(0xFFF7B733);
const kColorBg = Color(0xFFFFFFFF);
const kColorSurface = Color(0xFFF5F7FA);
const kColorText = Color(0xFF2C3E50);
const kColorMutedText = Color(0x9E2C3E50);
const kColorSuccess = Color(0xFF2E9E5B);
const kColorWarning = Color(0xFFE08E00);
const kColorError = Color(0xFFD64545);
const kColorInfo = Color(0xFF1AA4A1);
const kColorDivider = Color(0xFFE5E9F0);
const kColorBorder = Color(0xFFD7DFEA);
