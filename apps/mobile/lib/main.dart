import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/database/app_database.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/notifications/firebase_push_bootstrap.dart';
import 'package:tms_mobile/core/notifications/push_notification_service.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/router/app_router.dart';
import 'package:tms_mobile/core/sync/sync_queue.dart';
import 'package:tms_mobile/core/sync/sync_status_provider.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiClient.instance.init();
  PushNotifications.install(await initializeFirebasePushNotifications());
  final db = AppDatabase();
  await registerOfflineDatabase(db);
  runApp(
    ProviderScope(
      overrides: [
        syncQueueServiceProvider.overrideWith((ref) {
          final service = SyncQueueService(DriftSyncQueueStore(db));
          ref.onDispose(service.dispose);
          return service;
        }),
        syncCurrentUserIdProvider.overrideWith((ref) {
          final auth = ref.watch(authProvider);
          if (!auth.isAuthenticated) return null;
          final userId = auth.user?.id;
          return () => userId;
        }),
      ],
      child: const TMSApp(),
    ),
  );
}

class TMSApp extends ConsumerWidget {
  const TMSApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'TMS',
      theme: buildTmsTheme(),
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
