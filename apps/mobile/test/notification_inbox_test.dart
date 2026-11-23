import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/features/parent/screens/parent_notifications_screen.dart';
import 'package:tms_mobile/shared/widgets/notification_format.dart';

void main() {
  group('formatNotificationTime', () {
    final now = DateTime.utc(2026, 11, 14, 12);

    test('shows relative time for recent ISO timestamps', () {
      expect(formatNotificationTime('2026-11-14T11:59:40Z', now: now), 'Just now');
      expect(formatNotificationTime('2026-11-14T11:15:00Z', now: now), '45 min ago');
      expect(formatNotificationTime('2026-11-14T07:00:00Z', now: now), '5 h ago');
      expect(formatNotificationTime('2026-11-11T12:00:00Z', now: now), '3 d ago');
    });

    test('falls back to a date for older or future timestamps', () {
      expect(formatNotificationTime('2026-10-01T12:00:00Z', now: now),
          contains('Oct 2026'));
      expect(formatNotificationTime('2026-12-01T12:00:00Z', now: now),
          contains('Dec 2026'));
    });

    test('keeps already-formatted server text untouched', () {
      expect(formatNotificationTime('14 Nov 2026', now: now), '14 Nov 2026');
    });
  });

  test('calendar notifications use an event icon', () {
    expect(notificationCategoryIcon('CALENDAR'), Icons.event_outlined);
    expect(notificationCategoryIcon('unknown', unread: true),
        Icons.notifications_active);
  });

  test('parent notice destinations map only to real parent routes', () {
    expect(parentNoticeRoute('/parent/calendar'), '/parent/calendar');
    expect(parentNoticeRoute('calendar'), '/parent/calendar');
    expect(parentNoticeRoute('fees'), '/parent/fees');
    expect(parentNoticeRoute('certificates'), '/parent/academics');
    expect(parentNoticeRoute('/teacher/calendar'), isNull);
    expect(parentNoticeRoute('somewhere'), isNull);
  });
}
