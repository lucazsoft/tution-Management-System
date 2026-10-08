import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

/// Android-only fallback for consistent system Back behavior.
class AndroidBackCoordinator extends StatefulWidget {
  const AndroidBackCoordinator({
    super.key,
    required this.router,
    required this.child,
  });

  final GoRouter router;
  final Widget child;

  @override
  State<AndroidBackCoordinator> createState() => _AndroidBackCoordinatorState();
}

class _AndroidBackCoordinatorState extends State<AndroidBackCoordinator> {
  DateTime? _lastHomeBack;

  static const _homeRoutes = {
    '/student/home',
    '/parent/home',
    '/teacher/home',
    '/branch/home',
    '/janitor/home',
    '/tenant/home',
  };

  bool get _isAndroid =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  String? _portalHome(String location) {
    for (final prefix in const [
      '/student/',
      '/parent/',
      '/teacher/',
      '/branch/',
      '/janitor/',
      '/tenant/',
    ]) {
      if (location.startsWith(prefix)) return '${prefix}home';
    }
    return null;
  }

  void _handleBack(bool didPop, Object? result) {
    if (didPop || !_isAndroid) return;
    final router = widget.router;
    final uri = router.routeInformationProvider.value.uri;
    final location = uri.path;

    // Dashboard tabs encoded in the query string are still sub-pages. Back
    // returns to the dashboard before enabling the double-back exit gesture.
    if (_homeRoutes.contains(location) && uri.hasQuery) {
      router.go(location);
      return;
    }

    if (!_homeRoutes.contains(location)) {
      if (router.canPop()) {
        router.pop();
      } else {
        final home = _portalHome(location);
        if (home != null) router.go(home);
      }
      return;
    }

    final now = DateTime.now();
    if (_lastHomeBack != null &&
        now.difference(_lastHomeBack!) <= const Duration(seconds: 2)) {
      SystemNavigator.pop();
      return;
    }
    _lastHomeBack = now;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(
        content: Text('Press again to close the application'),
        duration: Duration(seconds: 2),
      ));
  }

  @override
  Widget build(BuildContext context) {
    if (!_isAndroid) return widget.child;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: _handleBack,
      child: widget.child,
    );
  }
}
