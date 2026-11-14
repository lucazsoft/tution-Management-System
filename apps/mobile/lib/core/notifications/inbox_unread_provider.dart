import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';

/// Unread count of the server-persisted inbox (`GET /api/notifications`).
///
/// Session-scoped via the auth user id; [pushSessionBindingProvider]
/// invalidates it whenever a push arrives in the foreground so badges update
/// without a manual refresh. Fails soft to 0 — a badge never blocks a screen.
final inboxUnreadCountProvider = FutureProvider.autoDispose<int>((ref) async {
  ref.watch(authProvider.select((state) => state.user?.id));
  try {
    final response = await ApiClient.instance.dio.get<dynamic>(
      '/api/notifications',
      queryParameters: {'pageSize': 1},
    );
    final body = response.data;
    if (body is Map && body['unreadCount'] is num) {
      return (body['unreadCount'] as num).toInt();
    }
  } catch (_) {}
  return 0;
});
