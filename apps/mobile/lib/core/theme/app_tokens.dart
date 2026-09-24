// Shared radius + spacing scale for the whole app (UI Phase A).
//
// Every screen keeps its current rendered numbers; values that used to live
// as literals or in StudentSpace/StudentRadius are sourced from here instead.
// Numeric entries (r2..rFull) pin each distinct radius in use; the semantic
// aliases below reference the numeric entries so a value change stays atomic.

abstract final class TmsSpace {
  static const double xxs = 4.0;
  static const double xs = 8.0;
  static const double sm = 12.0;
  static const double md = 16.0;
  static const double lg = 24.0;
  static const double xl = 32.0;
  static const double xxl = 40.0;
  static const double display = 56.0;
}

abstract final class TmsRadius {
  static const double r2 = 2.0;
  static const double r4 = 4.0;
  static const double r6 = 6.0;
  static const double r7 = 7.0;
  static const double r8 = 8.0;
  static const double r10 = 10.0;
  static const double r12 = 12.0;
  static const double r14 = 14.0;
  static const double r16 = 16.0;
  static const double r18 = 18.0;
  static const double r20 = 20.0;
  static const double r22 = 22.0;
  static const double r24 = 24.0;
  static const double r99 = 99.0;
  static const double rFull = 999.0;

  // Semantic aliases (pinned to the scale above, values unchanged).
  static const double checkbox = r4;
  static const double control = r7;
  static const double card = r12;
  static const double cardLg = r20;
  static const double input = r16;
  static const double modal = r18;
  static const double pill = r20;
}
