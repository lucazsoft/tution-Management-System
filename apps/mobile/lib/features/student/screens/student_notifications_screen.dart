/// Student notification sources remain distinct to preserve event history and
/// portal read states. The screen shows load/sync warnings instead of claiming
/// local-only read changes have reached the server.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/shared/widgets/notification_format.dart';

import '../student_design.dart';
import '../viewmodels/student_notifications_viewmodel.dart';
import '../widgets/student_record_states.dart';
import '../widgets/student_scaffold.dart';

class StudentNotificationsScreen extends ConsumerWidget {
  const StudentNotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(studentNotificationsViewModelProvider);
    final viewModel = ref.read(studentNotificationsViewModelProvider.notifier);

    return StudentScaffold(
      title: state.unreadCount > 0
          ? 'Notifications (${state.unreadCount})'
          : 'Notifications',
      actions: [
        if (MediaQuery.sizeOf(context).width < 360)
          IconButton(
            tooltip: 'Mark all read',
            onPressed: state.isEmpty ? null : () => viewModel.markAllRead(),
            icon: const Icon(Icons.done_all_rounded),
          )
        else
          TextButton(
            onPressed: state.isEmpty ? null : () => viewModel.markAllRead(),
            child: const Text('Mark all read'),
          ),
      ],
      body: Builder(
        builder: (context) {
          if (state.isLoading && state.isEmpty) {
            return const StudentLoadingView(
              message: 'Loading notifications…',
            );
          }
          if (!state.hasError && state.isEmpty) {
            return const StudentEmptyView(
              icon: Icons.notifications_none_rounded,
              title: 'No notifications',
              message:
                  'Fee, homework, result and attendance notices will appear here.',
            );
          }
          if (state.hasError && state.isEmpty) {
            if (state.isDenied) {
              return StudentErrorView(
                icon: Icons.lock_outline_rounded,
                title: 'Access denied',
                message:
                    state.error ?? 'Your account cannot view notifications.',
                retryLabel: 'Retry',
                onRetry: viewModel.load,
              );
            }
            if (state.isOffline) {
              return StudentErrorView(
                icon: Icons.wifi_off_rounded,
                title: 'You are offline',
                message: state.error ??
                    'Connect to the internet to load notifications.',
                retryLabel: 'Retry',
                onRetry: viewModel.load,
              );
            }
            return StudentErrorView(
              icon: Icons.notifications_off_outlined,
              title: 'Could not load notifications',
              message: state.error ?? 'Something went wrong.',
              retryLabel: 'Retry',
              onRetry: viewModel.load,
            );
          }
          return _buildList(context, state, viewModel);
        },
      ),
    );
  }

  Widget _buildList(
    BuildContext context,
    StudentNotificationsState state,
    StudentNotificationsViewModel viewModel,
  ) {
    final visible = state.visible;
    return RefreshIndicator(
      onRefresh: viewModel.refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(TmsSpace.md),
        children: [
          Row(
            children: [
              _FilterChip(
                label: 'All',
                selected: !state.unreadOnly,
                onSelected: () => viewModel.setUnreadOnly(false),
              ),
              const SizedBox(width: TmsSpace.xs),
              _FilterChip(
                label: 'Unread (${state.unreadCount})',
                selected: state.unreadOnly,
                onSelected: () => viewModel.setUnreadOnly(true),
              ),
            ],
          ),
          const SizedBox(height: TmsSpace.sm),
          if (state.hasError) Padding(
            padding: const EdgeInsets.only(bottom: TmsSpace.sm),
            child: Text(state.error ?? 'Some updates could not be synchronized.'),
          ),
          if (visible.isEmpty)
            const StudentEmptyView(
              icon: Icons.mark_email_read_outlined,
              title: 'All caught up',
              message: 'No unread notifications.',
            )
          else
            for (final source in NotificationSource.values) ...[
              if (visible.any((notice) => notice.source == source)) Padding(
                padding: const EdgeInsets.symmetric(vertical: TmsSpace.sm),
                child: Text(source == NotificationSource.account ? 'Account updates' : 'Current student alerts',
                  style: Theme.of(context).textTheme.titleSmall),
              ),
              for (final notice in visible.where((notice) => notice.source == source)) ...[
              Card(
                color: notice.isRead
                    ? StudentColors.background
                    : StudentColors.primary.withValues(alpha: .04),
                child: InkWell(
                  borderRadius: BorderRadius.circular(TmsRadius.card),
                  onTap: () {
                    viewModel.markRead(notice.raw.id, source: notice.source);
                    final destination = notice.raw.destination;
                    if (destination.isNotEmpty) {
                      context.push(destination);
                    }
                  },
                  child: Padding(
                    padding: const EdgeInsets.all(TmsSpace.md),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 10,
                          height: 10,
                          margin: const EdgeInsets.only(top: 6),
                          decoration: BoxDecoration(
                            color: notice.isRead
                                ? StudentColors.border
                                : StudentColors.primary,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: TmsSpace.sm),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                notice.raw.title,
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(
                                      fontWeight: notice.isRead
                                          ? FontWeight.w600
                                          : FontWeight.w800,
                                    ),
                              ),
                              const SizedBox(
                                height: TmsSpace.xxs,
                              ),
                              Text(notice.raw.message),
                              const SizedBox(height: TmsSpace.xs),
                              Text(
                                formatNotificationTime(notice.raw.time),
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                        const Icon(
                          Icons.chevron_right_rounded,
                          size: 20,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: TmsSpace.sm),
              ],
            ],
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onSelected,
  });

  final String label;
  final bool selected;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onSelected(),
    );
  }
}
