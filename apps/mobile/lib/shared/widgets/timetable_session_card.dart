import 'package:flutter/material.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';

class TimetableSessionCard extends StatelessWidget {
  const TimetableSessionCard({
    super.key,
    required this.startTime,
    required this.endTime,
    required this.subject,
    required this.primaryDetail,
    this.secondaryDetail,
    this.footer,
  });

  final String startTime;
  final String endTime;
  final String subject;
  final String primaryDetail;
  final String? secondaryDetail;
  final Widget? footer;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(TmsSpace.md),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 76,
              padding: const EdgeInsets.symmetric(vertical: TmsSpace.sm),
              decoration: BoxDecoration(
                color: kColorPrimary.withValues(alpha: .08),
                borderRadius: BorderRadius.circular(TmsRadius.r10),
              ),
              child: Column(children: [
                Text(startTime.isEmpty ? 'Not set' : startTime,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, color: kColorPrimary)),
                if (endTime.isNotEmpty)
                  Text(endTime,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodySmall),
              ]),
            ),
            const SizedBox(width: TmsSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(subject, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: TmsSpace.xs),
                  Text(primaryDetail),
                  if (secondaryDetail?.isNotEmpty == true)
                    Text(secondaryDetail!,
                        style: Theme.of(context).textTheme.bodySmall),
                  if (footer != null) ...[
                    const SizedBox(height: TmsSpace.xs),
                    footer!,
                  ],
                ],
              ),
            ),
          ]),
        ),
      );
}

class TimetableEmptyCard extends StatelessWidget {
  const TimetableEmptyCard({super.key, required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(TmsSpace.lg),
          child: Column(children: [
            const Icon(Icons.event_available_outlined,
                size: 42, color: kColorMutedText),
            const SizedBox(height: TmsSpace.sm),
            Text(message, textAlign: TextAlign.center),
          ]),
        ),
      );
}
