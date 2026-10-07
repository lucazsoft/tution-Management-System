import 'package:flutter/material.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';

class TodayTimetableTile extends StatelessWidget {
  const TodayTimetableTile({
    super.key,
    required this.startTime,
    required this.endTime,
    required this.subject,
    required this.details,
    this.onTap,
  });

  final String startTime;
  final String endTime;
  final String subject;
  final String details;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(TmsRadius.r8),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(children: [
            SizedBox(
              width: 58,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(startTime,
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                  Text(endTime, style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            Container(
              width: 3,
              height: 42,
              decoration: BoxDecoration(
                color: kColorAccent,
                borderRadius: BorderRadius.circular(TmsRadius.pill),
              ),
            ),
            const SizedBox(width: TmsSpace.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(subject,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(details,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: kColorMutedText)),
                ],
              ),
            ),
            if (onTap != null)
              const Icon(Icons.chevron_right_rounded,
                  size: 20, color: kColorMutedText),
          ]),
        ),
      );
}
