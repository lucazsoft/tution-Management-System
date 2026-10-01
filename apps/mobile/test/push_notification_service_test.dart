import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/notifications/push_notification_service.dart';

class _FakeMessaging implements PushMessagingGateway {
  _FakeMessaging({this.token});

  final String? token;
  int permissionRequests = 0;
  final refreshes = StreamController<String>.broadcast();
  final messages = StreamController<PushMessage>.broadcast();
  final opens = StreamController<PushMessage>.broadcast();

  @override
  Future<void> requestPermission() async => permissionRequests++;

  @override
  Future<String?> getToken() async => token;

  @override
  Stream<String> get onTokenRefresh => refreshes.stream;

  @override
  Stream<PushMessage> get onMessage => messages.stream;

  @override
  Stream<PushMessage> get onMessageOpenedApp => opens.stream;

  @override
  Future<PushMessage?> getInitialMessage() async => null;

  Future<void> close() async {
    await refreshes.close();
    await messages.close();
    await opens.close();
  }
}

class _FakeApi implements PushTokenApi {
  final registrations = <({String token, String platform})>[];
  final unregistrations = <String>[];

  @override
  Future<void> register(
      {required String token, required String platform}) async {
    registrations.add((token: token, platform: platform));
  }

  @override
  Future<void> unregister(String token) async => unregistrations.add(token);
}

class _FakeLocalNotifications implements LocalNotificationPresenter {
  final shown = <PushMessage>[];

  @override
  Future<void> initialize() async {}

  @override
  Future<void> show(PushMessage message) async => shown.add(message);
}

void main() {
  test('does not request or register a token before authentication', () async {
    final messaging = _FakeMessaging(token: 'device-token');
    addTearDown(messaging.close);
    final api = _FakeApi();
    final service = PushNotificationService(
      messaging: messaging,
      api: api,
      localNotifications: _FakeLocalNotifications(),
      platform: 'android',
    );

    await service.initialize(authenticated: false);

    expect(messaging.permissionRequests, 0);
    expect(api.registrations, isEmpty);
    await service.dispose();
  });

  test('registers after auth and follows token refresh', () async {
    final messaging = _FakeMessaging(token: 'initial-token');
    addTearDown(messaging.close);
    final api = _FakeApi();
    final service = PushNotificationService(
      messaging: messaging,
      api: api,
      localNotifications: _FakeLocalNotifications(),
      platform: 'ios',
    );

    await service.initialize(authenticated: true);
    messaging.refreshes.add('refreshed-token');
    await Future<void>.delayed(Duration.zero);

    expect(messaging.permissionRequests, 1);
    expect(api.registrations, [
      (token: 'initial-token', platform: 'ios'),
      (token: 'refreshed-token', platform: 'ios'),
    ]);
    expect(api.unregistrations, ['initial-token']);
    await service.dispose();
  });

  test('unregisters the current token while the auth session still exists',
      () async {
    final messaging = _FakeMessaging(token: 'device-token');
    addTearDown(messaging.close);
    final api = _FakeApi();
    final service = PushNotificationService(
      messaging: messaging,
      api: api,
      localNotifications: _FakeLocalNotifications(),
      platform: 'android',
    );
    await service.initialize(authenticated: true);

    await service.unregisterForLogout();

    expect(api.unregistrations, ['device-token']);
    await service.dispose();
  });

  test('foreground messages display locally and parse safe app deep links',
      () async {
    final messaging = _FakeMessaging(token: 'device-token');
    addTearDown(messaging.close);
    final local = _FakeLocalNotifications();
    final opened = <String>[];
    final service = PushNotificationService(
      messaging: messaging,
      api: _FakeApi(),
      localNotifications: local,
      platform: 'android',
      onDeepLink: opened.add,
    );
    await service.initialize(authenticated: true);

    const message = PushMessage(
      title: 'Class update',
      body: 'Room changed',
      data: {'deepLink': '/teacher/timetable?day=monday'},
    );
    messaging.messages.add(message);
    messaging.opens.add(message);
    await Future<void>.delayed(Duration.zero);

    expect(local.shown, [message]);
    expect(opened, ['/teacher/timetable?day=monday']);
    expect(
        PushNotificationService.parseDeepLink(
          const {'deepLink': 'https://evil.example'},
        ),
        isNull);
    expect(
        PushNotificationService.parseDeepLink(
          const {'deepLink': '//evil.example/path'},
        ),
        isNull);
    await service.dispose();
  });
}
