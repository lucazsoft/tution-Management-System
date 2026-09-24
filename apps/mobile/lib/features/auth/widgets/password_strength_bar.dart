import 'package:flutter/material.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';

class PasswordStrengthBar extends StatelessWidget {
  const PasswordStrengthBar({super.key, required this.password});

  final String password;

  @override
  Widget build(BuildContext context) {
    final strength = _calculateStrength(password);
    final color = _strengthColor(strength);
    final label = _strengthLabel(strength);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(TmsRadius.rFull),
          child: LinearProgressIndicator(
            value: strength,
            minHeight: 8,
            backgroundColor: const Color(0xFFE7EDF4),
            valueColor: AlwaysStoppedAnimation<Color>(color),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Password strength: $label',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: color,
                fontWeight: FontWeight.w700,
              ),
        ),
      ],
    );
  }

  double _calculateStrength(String password) {
    if (password.isEmpty) {
      return 0;
    }

    var score = 0.0;
    if (password.length >= 8) score += 0.3;
    if (RegExp(r'[A-Z]').hasMatch(password)) score += 0.2;
    if (RegExp(r'[0-9]').hasMatch(password)) score += 0.2;
    if (RegExp(r'[^A-Za-z0-9]').hasMatch(password)) score += 0.2;
    if (password.length >= 12) score += 0.1;
    return score.clamp(0.0, 1.0);
  }

  Color _strengthColor(double strength) {
    if (strength >= 0.8) return kColorSuccess;
    if (strength >= 0.5) return kColorWarning;
    return kColorError;
  }

  String _strengthLabel(double strength) {
    if (strength >= 0.8) return 'Strong';
    if (strength >= 0.5) return 'Moderate';
    if (strength > 0) return 'Weak';
    return 'Not set';
  }
}
