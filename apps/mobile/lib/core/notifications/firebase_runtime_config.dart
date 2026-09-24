import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Build-time Firebase configuration supplied through `--dart-define` values.
///
/// No Firebase project credentials are committed to source control. Native and
/// web builds use the same explicit [FirebaseOptions], while web additionally
/// requires a public VAPID key for FCM token registration.
class FirebaseRuntimeConfig {
  const FirebaseRuntimeConfig({
    required this.options,
    this.webVapidKey,
  });

  final FirebaseOptions options;
  final String? webVapidKey;

  static FirebaseRuntimeConfig? fromValues({
    required String apiKey,
    required String appId,
    required String messagingSenderId,
    required String projectId,
    String authDomain = '',
    String storageBucket = '',
    String measurementId = '',
    String webVapidKey = '',
    bool requireWebVapidKey = false,
  }) {
    final requiredValues = [apiKey, appId, messagingSenderId, projectId];
    if (requiredValues.any((value) => value.trim().isEmpty) ||
        (requireWebVapidKey && webVapidKey.trim().isEmpty)) {
      return null;
    }

    String? optional(String value) =>
        value.trim().isEmpty ? null : value.trim();

    return FirebaseRuntimeConfig(
      options: FirebaseOptions(
        apiKey: apiKey.trim(),
        appId: appId.trim(),
        messagingSenderId: messagingSenderId.trim(),
        projectId: projectId.trim(),
        authDomain: optional(authDomain),
        storageBucket: optional(storageBucket),
        measurementId: optional(measurementId),
      ),
      webVapidKey: optional(webVapidKey),
    );
  }

  static FirebaseRuntimeConfig? get current => fromValues(
        apiKey: const String.fromEnvironment('FIREBASE_API_KEY'),
        appId: const String.fromEnvironment('FIREBASE_APP_ID'),
        messagingSenderId:
            const String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID'),
        projectId: const String.fromEnvironment('FIREBASE_PROJECT_ID'),
        authDomain: const String.fromEnvironment('FIREBASE_AUTH_DOMAIN'),
        storageBucket: const String.fromEnvironment('FIREBASE_STORAGE_BUCKET'),
        measurementId: const String.fromEnvironment('FIREBASE_MEASUREMENT_ID'),
        webVapidKey: const String.fromEnvironment('FIREBASE_WEB_VAPID_KEY'),
        requireWebVapidKey: kIsWeb,
      );
}
