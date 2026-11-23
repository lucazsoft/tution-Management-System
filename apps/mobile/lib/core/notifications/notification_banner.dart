import 'package:flutter/material.dart';
import 'push_notification_service.dart';

/// Shared with MaterialApp. Browser foreground messages use an in-app banner,
/// not the native local-notification plugin.
final notificationMessengerKey = GlobalKey<ScaffoldMessengerState>();

void showBrowserPushBanner(PushMessage message) {
  final messenger = notificationMessengerKey.currentState;
  if (messenger == null) return;
  final link = PushNotificationService.parseDeepLink(message.data);
  messenger.showSnackBar(SnackBar(
    content: const Text('New TMS update. Open your inbox to read it.'),
    action: link == null ? null : SnackBarAction(
      label: 'Open',
      onPressed: () => PushNotifications.deepLinkHandler?.call(link),
    ),
  ));
}
