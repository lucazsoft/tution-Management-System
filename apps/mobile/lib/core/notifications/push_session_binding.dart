import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/notifications/inbox_unread_provider.dart';
import 'package:tms_mobile/core/notifications/push_notification_service.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/features/parent/viewmodels/parent_portal_viewmodel.dart';
import 'package:tms_mobile/features/student/viewmodels/student_calendar_viewmodel.dart';
import 'package:tms_mobile/features/student/viewmodels/student_home_viewmodel.dart';
import 'package:tms_mobile/features/student/viewmodels/student_notifications_viewmodel.dart';

/// Push category the API uses for academic-calendar events.
const calendarPushCategory = 'CALENDAR';

/// Binds push delivery to the auth session for the app's lifetime:
///
/// * registers this device's FCM token once a user is fully signed in (and
///   re-binds it when the account is switched), so the API can reach them;
/// * when a push arrives in the foreground, refreshes the inbox badge and any
///   live screen that shows the affected data, so a newly published calendar
///   event is visible without pull-to-refresh.
///
/// Only providers that are already alive are refreshed — a push never
/// triggers loads for screens the user has not opened.
final pushSessionBindingProvider = Provider<void>((ref) {
  ref.listen<AuthState>(authProvider, (previous, next) {
    final user = next.user;
    if (next.isAuthenticated && !next.isTwoFactorPending && user != null) {
      unawaited(PushNotifications.startAuthenticatedSession(user.id));
    }
  }, fireImmediately: true);

  final subscription = PushNotifications.received.listen((message) {
    ref.invalidate(inboxUnreadCountProvider);
    if (ref.exists(studentNotificationsViewModelProvider)) {
      unawaited(ref.read(studentNotificationsViewModelProvider.notifier).refresh());
    }
    if (message.data['category'] != calendarPushCategory) return;
    if (ref.exists(parentPortalProvider)) {
      unawaited(ref.read(parentPortalProvider.notifier).refresh());
    }
    if (ref.exists(studentCalendarViewModelProvider)) {
      unawaited(ref.read(studentCalendarViewModelProvider.notifier).refresh());
    }
    if (ref.exists(studentHomeViewModelProvider)) {
      unawaited(ref.read(studentHomeViewModelProvider.notifier).refresh());
    }
  });
  ref.onDispose(subscription.cancel);
});
