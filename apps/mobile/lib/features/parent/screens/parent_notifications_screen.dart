import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/notifications/push_notification_service.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';
import 'package:tms_mobile/features/student/data/student_id_calendar_notifications_repository.dart';
import 'package:tms_mobile/shared/widgets/notification_format.dart';

import '../models/parent_portal.dart';
import '../viewmodels/parent_portal_viewmodel.dart';
import '../widgets/parent_navigation.dart';

/// Maps a parent-portal notice destination (`fees`, `calendar`, …) to its
/// mobile route, or null when the app has no matching screen.
String? parentNoticeRoute(String destination) {
  if (destination.startsWith('/parent/')) return destination;
  return switch (destination) {
    'fees' => '/parent/fees',
    'attendance' => '/parent/attendance',
    'leave' => '/parent/leave',
    'appointments' => '/parent/appointments',
    'calendar' => '/parent/calendar',
    'messages' => '/parent/messages',
    'certificates' || 'academics' => '/parent/academics',
    _ => null,
  };
}

/// Parent inbox: institution updates pushed to this account (calendar
/// events, announcements) plus alerts generated for the selected child.
class ParentNotificationsScreen extends ConsumerStatefulWidget {
  const ParentNotificationsScreen({super.key});

  @override
  ConsumerState<ParentNotificationsScreen> createState() =>
      _ParentNotificationsScreenState();
}

class _ParentNotificationsScreenState
    extends ConsumerState<ParentNotificationsScreen> {
  List<PersistentNotification>? _updates;
  String? _error;
  StreamSubscription<PushMessage>? _pushes;

  @override
  void initState() {
    super.initState();
    _load();
    // A push arriving while this screen is open shows up immediately.
    _pushes = PushNotifications.received.listen((_) => _load());
  }

  @override
  void dispose() {
    _pushes?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final response = await ApiClient.instance.dio.get<dynamic>(
          StudentNotificationsRepositoryPaths.list,
          queryParameters: {'pageSize': 50});
      final body = response.data;
      if (body is! Map<String, dynamic>) throw StateError('Invalid response');
      final page = PersistentNotificationPage.fromJson(body);
      if (mounted) {
        setState(() {
          _updates = page.items;
          _error = null;
        });
      }
    } on DioException catch (error) {
      if (mounted) {
        setState(() => _error = error.message ?? 'Could not load updates.');
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not load updates.');
    }
  }

  Future<void> _refreshAll() async {
    await Future.wait([
      _load(),
      ref.read(parentPortalProvider.notifier).refresh(),
    ]);
  }

  Future<void> _openUpdate(PersistentNotification item) async {
    if (item.unread) {
      try {
        await ApiClient.instance.dio
            .post<dynamic>(StudentNotificationsRepositoryPaths.read(item.id));
      } catch (_) {
        // Navigation still proceeds; read state syncs on the next refresh.
      }
      unawaited(_load());
    }
    final route = parentNoticeRoute(item.destination);
    if (mounted && route != null) context.push(route);
  }

  Future<void> _openChildNotice(ParentNotification notice) async {
    if (notice.unread) {
      try {
        await ApiClient.instance.dio.post<dynamic>(
            '/api/portal-notifications/read',
            data: {
              'ids': [notice.id]
            });
        unawaited(ref.read(parentPortalProvider.notifier).refresh());
      } catch (_) {}
    }
    final route = parentNoticeRoute(notice.destination);
    if (mounted && route != null) context.push(route);
  }

  Future<void> _markAllRead(List<ParentNotification> childNotices) async {
    final unreadChild =
        childNotices.where((n) => n.unread).map((n) => n.id).toList();
    await Future.wait<void>([
      ApiClient.instance.dio
          .post<dynamic>(StudentNotificationsRepositoryPaths.readAll)
          .then((_) {}),
      if (unreadChild.isNotEmpty)
        ApiClient.instance.dio.post<dynamic>('/api/portal-notifications/read',
            data: {'ids': unreadChild}).then((_) {}),
    ]).catchError((_) => <void>[]);
    await _refreshAll();
  }

  @override
  Widget build(BuildContext context) {
    final portalState = ref.watch(parentPortalProvider);
    final childName = portalState.selectedChild?.name;
    final childNotices =
        portalState.portal?.notifications ?? const <ParentNotification>[];
    final updates = _updates;
    final hasUnread = (updates?.any((item) => item.unread) ?? false) ||
        childNotices.any((item) => item.unread);
    final theme = Theme.of(context);

    return Scaffold(
      drawer: ParentNavigation.drawer(context),
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          IconButton(
            tooltip: 'Mark all read',
            onPressed: hasUnread ? () => _markAllRead(childNotices) : null,
            icon: const Icon(Icons.done_all),
          ),
        ],
      ),
      bottomNavigationBar: const ParentNavigationBar(selectedIndex: 0),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refreshAll,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(TmsSpace.md),
            children: [
              Text('School updates', style: theme.textTheme.titleMedium),
              const SizedBox(height: TmsSpace.xs),
              Text(
                'Events, holidays, exams and announcements from the institution.',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: TmsSpace.sm),
              if (updates == null && _error == null)
                const Padding(
                  padding: EdgeInsets.all(TmsSpace.md),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_error != null && updates == null)
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.cloud_off_outlined),
                    title: const Text('Could not load school updates'),
                    subtitle: Text(_error!),
                    trailing: IconButton(
                      tooltip: 'Retry',
                      onPressed: _load,
                      icon: const Icon(Icons.refresh),
                    ),
                  ),
                )
              else if (updates!.isEmpty)
                const Card(
                  child: ListTile(
                    leading: Icon(Icons.notifications_none),
                    title: Text('No school updates yet'),
                    subtitle: Text(
                        'New calendar events will appear here and as a phone notification.'),
                  ),
                )
              else
                for (final item in updates)
                  _NoticeCard(
                    icon: notificationCategoryIcon(item.category,
                        unread: item.unread),
                    title: item.title,
                    body: item.body,
                    time: formatNotificationTime(item.createdAt),
                    unread: item.unread,
                    onTap: () => _openUpdate(item),
                  ),
              const SizedBox(height: TmsSpace.lg),
              Text(childName == null ? 'About your child' : 'About $childName',
                  style: theme.textTheme.titleMedium),
              const SizedBox(height: TmsSpace.sm),
              if (portalState.isLoading && portalState.portal == null)
                const Padding(
                  padding: EdgeInsets.all(TmsSpace.md),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (childNotices.isEmpty)
                const Card(
                  child: ListTile(
                    leading: Icon(Icons.check_circle_outline),
                    title: Text('Nothing needs your attention'),
                    subtitle: Text(
                        'Fee reminders, attendance and meeting updates appear here.'),
                  ),
                )
              else
                for (final notice in childNotices)
                  _NoticeCard(
                    icon: notice.urgent
                        ? Icons.priority_high
                        : Icons.child_care_outlined,
                    title: notice.title,
                    body: notice.message,
                    time: formatNotificationTime(notice.time),
                    unread: notice.unread,
                    urgent: notice.urgent,
                    onTap: () => _openChildNotice(notice),
                  ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NoticeCard extends StatelessWidget {
  const _NoticeCard({
    required this.icon,
    required this.title,
    required this.body,
    required this.time,
    required this.unread,
    required this.onTap,
    this.urgent = false,
  });

  final IconData icon;
  final String title;
  final String body;
  final String time;
  final bool unread;
  final bool urgent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: unread ? 'Unread notification' : null,
      child: Card(
        color: unread ? scheme.primaryContainer : null,
        child: ListTile(
          leading: Icon(icon, color: urgent ? scheme.error : null),
          title: Text(
            title,
            style: unread ? const TextStyle(fontWeight: FontWeight.w600) : null,
          ),
          subtitle: Text(body.isEmpty ? time : '$body\n$time'),
          isThreeLine: body.isNotEmpty,
          onTap: onTap,
        ),
      ),
    );
  }
}
