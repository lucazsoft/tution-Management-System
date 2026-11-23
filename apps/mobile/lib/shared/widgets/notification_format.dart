import 'package:flutter/material.dart';

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// Human-friendly timestamp for inbox rows. Server rows carry ISO-8601
/// `createdAt`; anything unparseable (already formatted text) is shown as-is.
String formatNotificationTime(String raw, {DateTime? now}) {
  final parsed = DateTime.tryParse(raw);
  if (parsed == null) return raw;
  final local = parsed.toLocal();
  final diff = (now ?? DateTime.now()).difference(local);
  if (!diff.isNegative) {
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
    if (diff.inHours < 24) return '${diff.inHours} h ago';
    if (diff.inDays < 7) return '${diff.inDays} d ago';
  }
  return '${local.day} ${_months[local.month - 1]} ${local.year}';
}

/// Arranges an inbox as "New" (unread) followed by "Earlier" (read), keeping
/// each group's original newest-first order. A header is only emitted when
/// both groups are present, so an all-read or all-unread list stays plain.
List<Widget> groupedByReadState<T>(
  List<T> items, {
  required bool Function(T item) isUnread,
  required Widget Function(T item) build,
  required Widget Function(String label) header,
}) {
  final unread = items.where(isUnread).toList();
  final read = items.where((item) => !isUnread(item)).toList();
  final labelled = unread.isNotEmpty && read.isNotEmpty;
  return [
    if (labelled) header('New'),
    ...unread.map(build),
    if (labelled) header('Earlier'),
    ...read.map(build),
  ];
}

/// Small section label used between the "New" and "Earlier" groups.
class NotificationGroupHeader extends StatelessWidget {
  const NotificationGroupHeader(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 6, left: 4),
      child: Text(
        label.toUpperCase(),
        style: theme.textTheme.labelSmall?.copyWith(
          letterSpacing: .8,
          fontWeight: FontWeight.w700,
          color: theme.colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}

/// Icon for a persisted notification category (see the API's
/// `Notification.category`).
IconData notificationCategoryIcon(String category, {bool unread = false}) {
  return switch (category.toUpperCase()) {
    'CALENDAR' => Icons.event_outlined,
    'ATTENDANCE' => Icons.fact_check_outlined,
    'LEAVE' => Icons.event_note_outlined,
    'PAYROLL' => Icons.payments_outlined,
    'ANOMALY' => Icons.warning_amber_outlined,
    _ => unread ? Icons.notifications_active : Icons.notifications_none,
  };
}
