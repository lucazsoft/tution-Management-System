import 'package:flutter/material.dart';

import 'package:tms_mobile/core/theme/app_colors.dart';
import '../models/app_models.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

class StatusChip extends StatelessWidget {
  const StatusChip({
    super.key,
    required this.label,
    required this.variant,
  });

  final String label;
  final StatusChipVariant variant;

  @override
  Widget build(BuildContext context) {
    final _ChipColors colors = _resolveColors(variant);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(TmsRadius.r20),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: colors.foreground,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  _ChipColors _resolveColors(StatusChipVariant variant) {
    return switch (variant) {
      StatusChipVariant.success => _ChipColors(
          background: kColorSuccess.withValues(alpha: 0.12),
          foreground: kColorSuccess,
        ),
      StatusChipVariant.warning => _ChipColors(
          background: kColorWarning.withValues(alpha: 0.12),
          foreground: kColorWarning,
        ),
      StatusChipVariant.error => _ChipColors(
          background: kColorError.withValues(alpha: 0.12),
          foreground: kColorError,
        ),
      StatusChipVariant.info => _ChipColors(
          background: kColorPrimaryLight.withValues(alpha: 0.12),
          foreground: kColorPrimaryLight,
        ),
      StatusChipVariant.gold => const _ChipColors(
          background: kColorAccent,
          foreground: Colors.white,
        ),
    };
  }
}

class _ChipColors {
  const _ChipColors({
    required this.background,
    required this.foreground,
  });

  final Color background;
  final Color foreground;
}
