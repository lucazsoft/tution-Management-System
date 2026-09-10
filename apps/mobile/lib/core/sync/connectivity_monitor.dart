import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'connectivity_check.dart';
import 'sync_models.dart';

/// Socket-check connectivity monitor, exposed as a Riverpod provider.
class ConnectivityMonitor extends StateNotifier<ConnectivityState> {
  final Future<bool> Function() _check;
  final Duration interval;
  Timer? _timer;
  bool _disposed = false;

  ConnectivityMonitor({
    Future<bool> Function()? check,
    this.interval = const Duration(seconds: 15),
    bool autostart = true,
  })  : _check = check ?? _defaultCheck,
        super(ConnectivityState.online) {
    if (autostart) start();
  }

  /// Default check: TCP connect to the API host on native platforms, 3s timeout.
  static Future<bool> _defaultCheck() async {
    if (kIsWeb) return true;
    const host = String.fromEnvironment('API_BASE_URL',
        defaultValue: 'http://127.0.0.1:3001');
    final uri = Uri.tryParse(host);
    final target = (uri != null && uri.hasAuthority) ? uri.host : host;
    final port = (uri != null && uri.hasAuthority)
        ? (uri.hasPort ? uri.port : (uri.scheme == 'https' ? 443 : 80))
        : 3001;
    return checkTcpSocket(target, port);
  }

  void start() {
    _timer ??= Timer.periodic(interval, (_) => refresh());
  }

  /// Run one check now and publish the result.
  Future<ConnectivityState> refresh() async {
    final ok = await _check();
    if (!_disposed)
      state = ok ? ConnectivityState.online : ConnectivityState.offline;
    return state;
  }

  /// Test/app hook: force a state (e.g. from AppLifecycle or a manual toggle).
  void setForTest(ConnectivityState value) {
    if (!_disposed) state = value;
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    super.dispose();
  }
}

/// Test hook to stub socket checks without mocking sockets.
final connectivityCheckOverride =
    Provider<Future<bool> Function()?>((ref) => null);

final connectivityMonitorProvider =
    StateNotifierProvider<ConnectivityMonitor, ConnectivityState>((ref) {
  final check = ref.watch(connectivityCheckOverride);
  final monitor = ConnectivityMonitor(check: check);
  ref.onDispose(monitor.dispose);
  return monitor;
});

