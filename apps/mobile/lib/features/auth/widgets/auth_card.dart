import 'package:flutter/material.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';

class AuthCard extends StatelessWidget {
  const AuthCard({
    super.key,
    required this.child,
    this.onBack,
    this.backLabel,
    this.backIcon = Icons.arrow_back,
  });

  final Widget child;
  final VoidCallback? onBack;
  final String? backLabel;
  final IconData backIcon;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, viewport) {
            return SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: (viewport.maxHeight - 40).clamp(
                    0.0,
                    double.infinity,
                  ),
                ),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 480),
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (onBack != null) ...[
                              Align(
                                alignment: Alignment.centerLeft,
                                child: TextButton.icon(
                                  onPressed: onBack,
                                  icon: Icon(backIcon),
                                  label: Text(backLabel ?? 'Back'),
                                  style: TextButton.styleFrom(
                                    foregroundColor: kColorPrimaryLight,
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 8,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                            ],
                            child,
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
