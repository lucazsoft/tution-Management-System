import 'package:flutter/material.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

class TimetableDayNavigator extends StatelessWidget {
  const TimetableDayNavigator({super.key, required this.title, required this.dateLabel, this.onPrevious, this.onNext});

  final String title;
  final String dateLabel;
  final VoidCallback? onPrevious;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: TmsSpace.sm, vertical: TmsSpace.md),
          child: Row(children: [
            IconButton.filledTonal(tooltip: 'Previous day', onPressed: onPrevious, icon: const Icon(Icons.chevron_left_rounded)),
            Expanded(child: Column(children: [
              Text(title, style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
              const SizedBox(height: 3),
              Text(dateLabel, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: kColorMutedText), textAlign: TextAlign.center),
            ])),
            IconButton.filledTonal(tooltip: 'Next day', onPressed: onNext, icon: const Icon(Icons.chevron_right_rounded)),
          ]),
        ),
      );
}

class TimetableSessionCard extends StatelessWidget {
  const TimetableSessionCard({
    super.key,
    required this.startTime,
    required this.endTime,
    required this.title,
    required this.primaryDetail,
    this.secondaryDetail,
    this.badge,
    this.trailing,
  });

  final String startTime;
  final String endTime;
  final String title;
  final String primaryDetail;
  final String? secondaryDetail;
  final String? badge;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(TmsSpace.md),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 76,
              padding: const EdgeInsets.symmetric(vertical: TmsSpace.sm),
              decoration: BoxDecoration(color: kColorPrimary.withValues(alpha: .08), borderRadius: BorderRadius.circular(TmsRadius.r10)),
              child: Column(children: [
                Text(startTime, style: const TextStyle(fontWeight: FontWeight.w800, color: kColorPrimary)),
                if (endTime.isNotEmpty) Text(endTime, style: Theme.of(context).textTheme.bodySmall),
              ]),
            ),
            const SizedBox(width: TmsSpace.md),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: TmsSpace.xs),
              Text(primaryDetail),
              if (secondaryDetail?.isNotEmpty == true) Text(secondaryDetail!, style: Theme.of(context).textTheme.bodySmall),
              if (badge?.isNotEmpty == true) ...[
                const SizedBox(height: TmsSpace.xs),
                Text(badge!, style: TextStyle(color: Theme.of(context).colorScheme.secondary, fontWeight: FontWeight.w600)),
              ],
            ])),
            if (trailing != null) ...[const SizedBox(width: TmsSpace.sm), trailing!],
          ]),
        ),
      );
}
