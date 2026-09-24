import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:tms_mobile/core/theme/app_colors.dart';
import 'skeleton_loader.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

class KpiCard extends StatelessWidget {
  const KpiCard({
    super.key,
    required this.title,
    required this.value,
    this.deltaText,
    this.deltaPositive = true,
    this.loading = false,
  });

  final String title;
  final String value;
  final String? deltaText;
  final bool deltaPositive;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: loading
            ? const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  SkeletonLoader(
                      height: 16, width: 120, borderRadius: TmsRadius.r8),
                  SizedBox(height: 12),
                  SkeletonLoader(
                      height: 28, width: 180, borderRadius: TmsRadius.r10),
                  SizedBox(height: 10),
                  SkeletonLoader(
                      height: 12, width: 96, borderRadius: TmsRadius.r8),
                ],
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                      color: kColorMutedText,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    value,
                    style: GoogleFonts.fraunces(
                      fontSize: 24,
                      fontWeight: FontWeight.w600,
                      color: kColorText,
                    ),
                  ),
                  if (deltaText != null) ...<Widget>[
                    const SizedBox(height: 8),
                    Text(
                      deltaText!,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: deltaPositive ? kColorSuccess : kColorError,
                      ),
                    ),
                  ],
                ],
              ),
      ),
    );
  }
}
