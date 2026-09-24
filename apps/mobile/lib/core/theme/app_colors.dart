import 'package:flutter/material.dart';

// Single source of truth for the TMS palette, aligned with the web app.
// Previously duplicated in lib/app/theme/app_colors.dart (TmsAppColors);
// that file is removed. Values below mirror apps/web/src/index.css:
//  - kColorInfo follows the web app's primary/info semantic mapping.
const kColorPrimary = Color(0xFF1560BD);
const kColorPrimaryLight = Color(0xFF2F6FED);
const kColorPrimaryDark = Color(0xFF002D72);
const kColorAccent = Color(0xFFFFBC3B);
const kColorAccentHover = Color(0xFFFFCB63);
const kColorBg = Color(0xFFFFFFFF);
const kColorSurface = Color(0xFFF5F7FA);
const kColorText = Color(0xFF1B1F3B);
const kColorMutedText = Color(0xFF475569);
const kColorSuccess = Color(0xFF00AB66);
const kColorWarning = Color(0xFFE08E00);
const kColorError = Color(0xFFE63946);
const kColorInfo = kColorPrimary;
const kColorDivider = Color(0xFFE2E8F0);
const kColorBorder = Color(0xFFDCE3ED);
