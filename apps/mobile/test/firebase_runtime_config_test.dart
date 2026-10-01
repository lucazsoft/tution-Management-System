import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/notifications/firebase_runtime_config.dart';

void main() {
  test('Firebase runtime config rejects incomplete required values', () {
    expect(
      FirebaseRuntimeConfig.fromValues(
        apiKey: 'api-key',
        appId: '',
        messagingSenderId: 'sender-id',
        projectId: 'project-id',
      ),
      isNull,
    );
  });

  test('Firebase runtime config builds explicit platform options', () {
    final config = FirebaseRuntimeConfig.fromValues(
      apiKey: 'api-key',
      appId: 'app-id',
      messagingSenderId: 'sender-id',
      projectId: 'project-id',
      authDomain: 'project-id.firebaseapp.com',
      storageBucket: 'project-id.appspot.com',
      measurementId: 'G-TEST',
      webVapidKey: 'vapid-key',
      requireWebVapidKey: true,
    );

    expect(config, isNotNull);
    expect(config!.options.apiKey, 'api-key');
    expect(config.options.appId, 'app-id');
    expect(config.options.messagingSenderId, 'sender-id');
    expect(config.options.projectId, 'project-id');
    expect(config.options.authDomain, 'project-id.firebaseapp.com');
    expect(config.options.storageBucket, 'project-id.appspot.com');
    expect(config.options.measurementId, 'G-TEST');
    expect(config.webVapidKey, 'vapid-key');
  });

  test('web Firebase runtime config requires a VAPID key', () {
    expect(
      FirebaseRuntimeConfig.fromValues(
        apiKey: 'api-key',
        appId: 'app-id',
        messagingSenderId: 'sender-id',
        projectId: 'project-id',
        requireWebVapidKey: true,
      ),
      isNull,
    );
  });
}
