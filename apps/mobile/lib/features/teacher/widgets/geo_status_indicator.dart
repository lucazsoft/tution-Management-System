import 'package:flutter/material.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/core/utils/formatters.dart';
import 'package:tms_mobile/features/teacher/models/teacher_models.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

class GeoStatusIndicator extends StatelessWidget {
  const GeoStatusIndicator({
    super.key,
    required this.status,
    required this.lastCheckedAt,
  });

  final GeoFenceStatus status;
  final DateTime? lastCheckedAt;

  @override
  Widget build(BuildContext context) {
    final data = _styleForStatus(status);

    return Card(
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: data.background,
          borderRadius: BorderRadius.circular(TmsRadius.r20),
        ),
        child: Row(
          children: [
            if (status == GeoFenceStatus.checking)
              const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2.4),
              )
            else
              Icon(data.icon, color: data.foreground, size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                status == GeoFenceStatus.unavailable && lastCheckedAt != null
                    ? 'GPS unavailable — Last known: ${formatTimestamp(lastCheckedAt!)}'
                    : data.message,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: data.foreground,
                      fontWeight: FontWeight.w700,
                    ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  _StatusVisual _styleForStatus(GeoFenceStatus status) {
    switch (status) {
      case GeoFenceStatus.inside:
        return const _StatusVisual(
          message: '✓ Inside branch radius — Ready to mark',
          icon: Icons.check_circle,
          background: Color(0xFFE6F5EC),
          foreground: kColorSuccess,
        );
      case GeoFenceStatus.outside:
        return const _StatusVisual(
          message: '✗ Outside branch radius — Move closer to mark attendance',
          icon: Icons.location_off,
          background: Color(0xFFFBEAEA),
          foreground: kColorError,
        );
      case GeoFenceStatus.unavailable:
        return const _StatusVisual(
          message: 'GPS unavailable',
          icon: Icons.gps_off,
          background: Color(0xFFE8EDF4),
          foreground: Color(0xFF617285),
        );
      case GeoFenceStatus.checking:
        return const _StatusVisual(
          message: 'Checking your location...',
          icon: Icons.sync,
          background: Color(0xFFFFF4DE),
          foreground: kColorWarning,
        );
    }
  }
}

class _StatusVisual {
  const _StatusVisual({
    required this.message,
    required this.icon,
    required this.background,
    required this.foreground,
  });

  final String message;
  final IconData icon;
  final Color background;
  final Color foreground;
}
