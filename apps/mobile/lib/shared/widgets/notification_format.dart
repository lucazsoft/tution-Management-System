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
