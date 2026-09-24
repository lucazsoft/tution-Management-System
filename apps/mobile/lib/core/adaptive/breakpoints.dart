/// Breakpoint definitions for TMS adaptive UI.
///
/// Based on flutter-adaptive-ui skill: three primary breakpoints
/// - compact: < 600px (mobile)
/// - medium: 600 - 839px (tablet/foldable)
/// - expanded: >= 840px (desktop/web/large tablet)
library;

import 'package:flutter/material.dart';

abstract final class Breakpoints {
  /// Mobile phones in portrait orientation
  static const double compact = 600;

  /// Tablets in portrait, foldables, small desktop windows
  static const double medium = 840;

  /// Desktop, large tablets in landscape, web
  static const double expanded = 1200;

  /// Determines the current layout size class from [width].
  static LayoutSizeClass fromWidth(double width) {
    if (width < compact) return LayoutSizeClass.compact;
    if (width < medium) return LayoutSizeClass.medium;
    return LayoutSizeClass.expanded;
  }
}

/// Layout size classes for adaptive UI decisions.
enum LayoutSizeClass {
  /// < 600px - single column, bottom navigation, full-screen dialogs
  compact,

  /// 600-839px - two columns possible, navigation rail, side sheets
  medium,

  /// >= 840px - three columns, permanent navigation rail, modal dialogs
  expanded,
}

/// Extension for easy size class checks.
extension LayoutSizeClassX on LayoutSizeClass {
  bool get isCompact => this == LayoutSizeClass.compact;
  bool get isMedium => this == LayoutSizeClass.medium;
  bool get isExpanded => this == LayoutSizeClass.expanded;

  bool get isAtLeastMedium => index >= LayoutSizeClass.medium.index;
  bool get isAtLeastExpanded => index >= LayoutSizeClass.expanded.index;
}

/// Spacing scale adapted from TmsSpace but unified for the app.
abstract final class AdaptiveSpacing {
  static const double xxs = 4;
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
  static const double xxl = 40;
  static const double display = 56;

  /// Responsive spacing that scales with size class.
  static double responsive({
    required BuildContext context,
    required double compactValue,
    double? mediumValue,
    double? expandedValue,
  }) {
    final sizeClass = Breakpoints.fromWidth(MediaQuery.sizeOf(context).width);
    return switch (sizeClass) {
      LayoutSizeClass.compact => compactValue,
      LayoutSizeClass.medium => mediumValue ?? compactValue * 1.25,
      LayoutSizeClass.expanded => expandedValue ?? compactValue * 1.5,
    };
  }
}

/// Border radius scale.
abstract final class AdaptiveRadius {
  static const double control = 8;
  static const double card = 16;
  static const double modal = 24;
  static const double pill = 999;
}

/// Semantic breakpoint names for use in Capability/Policy pattern.
enum AdaptiveBreakpoint {
  compact('compact'),
  medium('medium'),
  expanded('expanded');

  const AdaptiveBreakpoint(this.name);
  final String name;
}

/// Mixin for widgets that need to know their size class.
mixin AdaptiveSizeMixin on Widget {
  LayoutSizeClass sizeClassOf(BuildContext context) =>
      Breakpoints.fromWidth(MediaQuery.sizeOf(context).width);
}
