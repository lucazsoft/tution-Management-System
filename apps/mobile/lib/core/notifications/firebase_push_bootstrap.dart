import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'push_notification_service.dart';

class FirebaseMessagingGateway implements PushMessagingGateway {
  FirebaseMessagingGateway(this._messaging);

  final FirebaseMessaging _messaging;

  PushMessage _convert(RemoteMessage message) => PushMessage(
        title: message.notification?.title,
        body: message.notification?.body,
        data: message.data.map(
          (key, value) => MapEntry(key, value.toString()),
        ),
      );

  @override
  Future<String?> getToken() => _messaging.getToken();

  @override
  Future<PushMessage?> getInitialMessage() async {
    final message = await _messaging.getInitialMessage();
    return message == null ? null : _convert(message);
  }

  @override
  Stream<PushMessage> get onMessage =>
      FirebaseMessaging.onMessage.map(_convert);

  @override
  Stream<PushMessage> get onMessageOpenedApp =>
      FirebaseMessaging.onMessageOpenedApp.map(_convert);

  @override
  Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;

  @override
  Future<void> requestPermission() async {
    await _messaging.requestPermission(alert: true, badge: true, sound: true);
  }
}

class FlutterLocalNotificationPresenter implements LocalNotificationPresenter {
  FlutterLocalNotificationPresenter({required this.onDeepLink});

  final void Function(String deepLink) onDeepLink;
  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  var _nextId = 1;

  @override
  Future<void> initialize() async {
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(),
      macOS: DarwinInitializationSettings(),
    );
    await _plugin.initialize(
      settings: settings,
      onDidReceiveNotificationResponse: (response) {
        final deepLink = PushNotificationService.parseDeepLink(
          {'deepLink': response.payload ?? ''},
        );
        if (deepLink != null) onDeepLink(deepLink);
      },
    );
  }

  @override
  Future<void> show(PushMessage message) async {
    await _plugin.show(
      id: _nextId++,
      title: message.title ?? 'TMS notification',
      body: message.body ?? '',
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'tms_updates',
          'TMS updates',
          channelDescription: 'School and account updates',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
        macOS: DarwinNotificationDetails(),
      ),
      payload: PushNotificationService.parseDeepLink(message.data),
    );
  }
}

Future<PushNotificationService?> initializeFirebasePushNotifications() async {
  final platform = kIsWeb
      ? 'web'
      : switch (defaultTargetPlatform) {
          TargetPlatform.android => 'android',
          TargetPlatform.iOS => 'ios',
          _ => null,
        };
  if (platform == null) return null;

  try {
    await Firebase.initializeApp();
    void openDeepLink(String deepLink) {
      PushNotifications.deepLinkHandler?.call(deepLink);
    }

    return PushNotificationService(
      messaging: FirebaseMessagingGateway(FirebaseMessaging.instance),
      api: const ApiPushTokenApi(),
      localNotifications:
          FlutterLocalNotificationPresenter(onDeepLink: openDeepLink),
      platform: platform,
      onDeepLink: openDeepLink,
    );
  } catch (error) {
    debugPrint(
      'Firebase push notifications unavailable; continuing without push.',
    );
    return null;
  }
}
