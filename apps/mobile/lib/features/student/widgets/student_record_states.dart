/// Shared loading / empty / error / denied / offline state widgets for
/// the student academic-record screens (MOB-102).
library;

import 'package:flutter/material.dart';

import '../student_design.dart';

class StudentLoadingView extends StatelessWidget {
  const StudentLoadingView({super.key, this.message = 'Loading…'});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(TmsSpace.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: TmsSpace.md),
            Text(message, style: Theme.of(context).textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }
}

class StudentEmptyView extends StatelessWidget {
  const StudentEmptyView({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(TmsSpace.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 48, color: StudentColors.mutedText.withValues(alpha: .6)),
            const SizedBox(height: TmsSpace.md),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: TmsSpace.xs),
            Text(
              message,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: StudentColors.mutedText,
                  ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class StudentErrorView extends StatelessWidget {
  const StudentErrorView({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    required this.retryLabel,
    required this.onRetry,
  });

  final IconData icon;
  final String title;
  final String message;
  final String retryLabel;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(TmsSpace.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: StudentColors.error),
            const SizedBox(height: TmsSpace.md),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: TmsSpace.xs),
            Text(
              message,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: StudentColors.mutedText,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: TmsSpace.md),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: Text(retryLabel),
            ),
          ],
        ),
      ),
    );
  }
}

/// "Load more" footer for paginated detail views.
class StudentLoadMoreFooter extends StatelessWidget {
  const StudentLoadMoreFooter({
    super.key,
    required this.hasMore,
    required this.remaining,
    required this.onLoadMore,
  });

  final bool hasMore;
  final int remaining;
  final VoidCallback onLoadMore;

  @override
  Widget build(BuildContext context) {
    if (!hasMore) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: TmsSpace.md),
        child: Center(
          child: Text(
            'You are all caught up.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: StudentColors.mutedText,
                ),
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: TmsSpace.sm),
      child: Center(
        child: OutlinedButton.icon(
          onPressed: onLoadMore,
          icon: const Icon(Icons.expand_more_rounded),
          label: Text('Show more ($remaining remaining)'),
        ),
      ),
    );
  }
}
