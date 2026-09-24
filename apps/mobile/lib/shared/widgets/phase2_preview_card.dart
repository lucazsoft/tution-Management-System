import 'dart:ui';

import 'package:flutter/material.dart';

import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

class Phase2PreviewCard extends StatelessWidget {
  const Phase2PreviewCard({
    super.key,
    required this.title,
    required this.child,
  });

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 14),
            ClipRRect(
              borderRadius: BorderRadius.circular(TmsRadius.r14),
              child: Stack(
                alignment: Alignment.center,
                children: <Widget>[
                  Opacity(opacity: 0.35, child: child),
                  Positioned.fill(
                    child: BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 2.2, sigmaY: 2.2),
                      child: Container(
                        color: Colors.white.withValues(alpha: 0.32),
                      ),
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: kColorAccent,
                      borderRadius: BorderRadius.circular(TmsRadius.rFull),
                      boxShadow: <BoxShadow>[
                        BoxShadow(
                          color: kColorAccent.withValues(alpha: 0.22),
                          blurRadius: 16,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: const Text(
                      'Phase 2 — Coming Soon',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
