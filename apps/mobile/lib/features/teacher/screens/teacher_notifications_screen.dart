import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/features/student/data/student_id_calendar_notifications_repository.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_navigation.dart';

class TeacherNotificationsScreen extends StatefulWidget {
  const TeacherNotificationsScreen({super.key});

  @override
  State<TeacherNotificationsScreen> createState() =>
      _TeacherNotificationsScreenState();
}

class _TeacherNotificationsScreenState
    extends State<TeacherNotificationsScreen> {
  List<PersistentNotification>? _items;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final response = await ApiClient.instance.dio.get<dynamic>(
          '/api/notifications',
          queryParameters: {'pageSize': 50});
      final body = response.data;
      if (body is! Map<String, dynamic>) throw StateError('Invalid response');
      final page = PersistentNotificationPage.fromJson(body);
      if (mounted) setState(() => _items = page.items);
    } on DioException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not load notifications.');
    }
  }

  Future<void> _markRead(PersistentNotification item) async {
    if (!item.unread) return;
    await ApiClient.instance.dio.post<dynamic>(
        '/api/notifications/${Uri.encodeComponent(item.id)}/read');
    await _load();
  }

  Future<void> _markAllRead() async {
    await ApiClient.instance.dio.post<dynamic>('/api/notifications/read-all');
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    return TeacherPortalScaffold(
      title: 'Notifications',
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Row(children: [
              Expanded(
                child: Text('School updates',
                    style: Theme.of(context).textTheme.headlineSmall),
              ),
              TextButton.icon(
                onPressed: items?.any((item) => item.unread) == true
                    ? _markAllRead
                    : null,
                icon: const Icon(Icons.done_all),
                label: const Text('Mark all read'),
              ),
            ]),
            const Text(
                'Meeting requests, messages, class updates and institution announcements appear here.'),
            const SizedBox(height: 16),
            if (items == null && _error == null)
              const Center(child: CircularProgressIndicator())
            else if (_error != null)
              Card(
                child: ListTile(
                  leading: const Icon(Icons.cloud_off_outlined),
                  title: const Text('Could not load notifications'),
                  subtitle: Text(_error!),
                  trailing: IconButton(
                    onPressed: _load,
                    icon: const Icon(Icons.refresh),
                  ),
                ),
              )
            else if (items!.isEmpty)
              const Card(
                child: ListTile(
                  leading: Icon(Icons.notifications_none),
                  title: Text('You are all caught up'),
                  subtitle:
                      Text('New push notifications will also be saved here.'),
                ),
              )
            else
              for (final item in items)
                Card(
                  color: item.unread
                      ? Theme.of(context).colorScheme.primaryContainer
                      : null,
                  child: ListTile(
                    leading: Icon(item.unread
                        ? Icons.notifications_active
                        : Icons.notifications_none),
                    title: Text(item.title),
                    subtitle: Text('${item.body}\n${item.createdAt}'),
                    isThreeLine: true,
                    onTap: () async {
                      await _markRead(item);
                      if (context.mounted &&
                          item.destination.startsWith('/teacher/')) {
                        context.push(item.destination);
                      }
                    },
                  ),
                ),
          ],
        ),
      ),
    );
  }
}
