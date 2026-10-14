import 'dart:async';

import 'package:flutter/foundation.dart';
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

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const _BootstrapApp());

  // Push notifications are not required for the first frame. Initializing
  // Firebase after runApp keeps Android startup responsive while preserving
  // the same notification service once initialization completes.
  WidgetsBinding.instance.addPostFrameCallback((_) {
    unawaited(_initializeDeferredServices());
  });
}

class _BootstrapApp extends StatefulWidget {
  const _BootstrapApp();

  @override
  State<_BootstrapApp> createState() => _BootstrapAppState();
}

class _BootstrapAppState extends State<_BootstrapApp> {
  late Future<AppDatabase> _initialization = _initializeCoreServices();

  Future<AppDatabase> _initializeCoreServices() async {
    await ApiClient.instance.init();
    final db = AppDatabase();
    await registerOfflineDatabase(db);
    return db;
  }

  void _retry() => setState(() {
        _initialization = _initializeCoreServices();
      });

  @override
  Widget build(BuildContext context) => FutureBuilder<AppDatabase>(
        future: _initialization,
        builder: (context, snapshot) {
          final db = snapshot.data;
          if (db != null) return _buildApplication(db);
          if (snapshot.hasError) return _StartupFailure(onRetry: _retry);
          return const _StartupScreen();
        },
      );

  Widget _buildApplication(AppDatabase db) => ProviderScope(
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
      );
}

class _StartupScreen extends StatelessWidget {
  const _StartupScreen();

  bool get _isAndroid =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        home: Scaffold(
          backgroundColor:
              _isAndroid ? Colors.white : const Color(0xFFF8FAFC),
          body: _isAndroid
              ? const _AndroidStartupContent()
              : const Center(
                  child: SizedBox.square(
                    dimension: 28,
                    child: CircularProgressIndicator(strokeWidth: 3),
                  ),
                ),
        ),
      );
}

class _AndroidStartupContent extends StatelessWidget {
  const _AndroidStartupContent();

  @override
  Widget build(BuildContext context) => SafeArea(
        child: Stack(
          alignment: Alignment.center,
          children: [
            Image.asset(
              'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png',
              width: 88,
              height: 88,
              filterQuality: FilterQuality.high,
            ),
            const Positioned(
              left: 24,
              right: 24,
              bottom: 38,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'TMS',
                    style: TextStyle(
                      color: Color(0xFF2457A7),
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.2,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Tuition Management System',
                    style: TextStyle(
                      color: Color(0xFF64748B),
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}

class _StartupFailure extends StatelessWidget {
  const _StartupFailure({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        home: Scaffold(
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline_rounded, size: 48),
                  const SizedBox(height: 12),
                  const Text(
                    'Could not start TMS',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Check the application configuration and try again.',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  FilledButton(onPressed: onRetry, child: const Text('Retry')),
                ],
              ),
            ),
          ),
        ),
      );
}

Future<void> _initializeDeferredServices() async {
  final pushService = await initializeFirebasePushNotifications();
  PushNotifications.install(pushService);
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
