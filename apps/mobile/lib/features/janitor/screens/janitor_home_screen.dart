/// API-backed janitor home screen (MVVM).
///
/// Reads [JanitorPortalViewModel] (one `GET /api/resources/my-tasks` per
/// load). Covers loading / empty / error / denied / offline states; the
/// offline banner shows when connectivity drops but cached data exists.
///
/// Responsive layout is preserved: content is capped at 900 logical pixels
/// with wider padding on screens >= 700 logical pixels wide.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/sync/sync.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';

import '../models/janitor_task.dart';
import '../viewmodels/janitor_portal_viewmodel.dart';
import '../widgets/janitor_task_card.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

enum JanitorTaskFilter { today, upcoming, completed }

extension JanitorTaskFilterLabel on JanitorTaskFilter {
  String get label => switch (this) {
        JanitorTaskFilter.today => 'Today',
        JanitorTaskFilter.upcoming => 'Upcoming',
        JanitorTaskFilter.completed => 'Completed',
      };
}

class JanitorHomeScreen extends ConsumerStatefulWidget {
  const JanitorHomeScreen({super.key});

  @override
  ConsumerState<JanitorHomeScreen> createState() => _JanitorHomeScreenState();
}

class _JanitorHomeScreenState extends ConsumerState<JanitorHomeScreen> {
  JanitorTaskFilter _filter = JanitorTaskFilter.today;

  List<JanitorTask> _filteredTasks(List<JanitorTask> tasks) {
    final now = DateTime.now();
    final filtered = switch (_filter) {
      JanitorTaskFilter.today =>
        tasks.where((task) => !task.isCompleted && task.isDueOn(now)).toList(),
      JanitorTaskFilter.upcoming => tasks
          .where((task) =>
              !task.isCompleted &&
              task.dueAt.isAfter(DateTime(now.year, now.month, now.day + 1)))
          .toList(),
      JanitorTaskFilter.completed =>
        tasks.where((task) => task.isCompleted).toList(),
    };
    filtered.sort((first, second) => first.dueAt.compareTo(second.dueAt));
    return filtered;
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(janitorPortalViewModelProvider);
    final vm = ref.read(janitorPortalViewModelProvider.notifier);
    final connectivity = ref.watch(connectivityMonitorProvider);
    final offline = connectivity == ConnectivityState.offline;
    final wide = MediaQuery.sizeOf(context).width >= 700;
    final activeCount = state.tasks.where((task) => !task.isCompleted).length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('My tasks'),
        actions: [
          IconButton(
            tooltip: 'Change password',
            icon: const Icon(Icons.key_rounded),
            onPressed: () => context.push('/janitor/change-password'),
          ),
          IconButton(
            tooltip: 'Log out',
            icon: const Icon(Icons.logout_rounded),
            onPressed: () => ref.read(authProvider.notifier).logout(),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(child: Text('$activeCount active')),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 900),
            child: Column(
              children: [
                if (offline && state.hasData) const _OfflineBanner(),
                Expanded(
                  child: _body(context, state, vm, activeCount, wide, offline),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _body(
    BuildContext context,
    JanitorPortalState state,
    JanitorPortalViewModel vm,
    int activeCount,
    bool wide,
    bool offline,
  ) {
    if (state.isLoading && !state.hasData) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 12),
            Text('Loading your tasks…'),
          ],
        ),
      );
    }
    if (state.isDenied && !state.hasData) {
      return _MessageView(
        icon: Icons.lock_outline_rounded,
        title: 'Access denied',
        message:
            state.error ?? 'Only maintenance staff may access this task list.',
        actionLabel: 'Retry',
        onAction: vm.load,
      );
    }
    if (state.isOffline && !state.hasData) {
      return _MessageView(
        icon: Icons.wifi_off_rounded,
        title: 'You are offline',
        message: state.error ?? 'Could not reach the server.',
        actionLabel: 'Retry',
        onAction: vm.load,
      );
    }
    if (state.hasError && !state.hasData) {
      return _MessageView(
        icon: Icons.error_outline_rounded,
        title: 'Could not load tasks',
        message: state.error ?? 'Could not load the maintenance task list.',
        actionLabel: 'Retry',
        onAction: vm.load,
      );
    }

    final tasks = _filteredTasks(state.tasks);
    return RefreshIndicator(
      onRefresh: vm.refresh,
      child: ListView(
        padding: EdgeInsets.fromLTRB(wide ? 32 : 16, 16, wide ? 32 : 16, 28),
        children: [
          _WelcomeCard(activeCount: activeCount),
          const SizedBox(height: 24),
          Text('Assigned work', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SegmentedButton<JanitorTaskFilter>(
              segments: [
                for (final filter in JanitorTaskFilter.values)
                  ButtonSegment(value: filter, label: Text(filter.label)),
              ],
              selected: {_filter},
              onSelectionChanged: (selected) =>
                  setState(() => _filter = selected.first),
            ),
          ),
          const SizedBox(height: 16),
          if (offline && state.hasData)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Text(
                'Showing the last synced tasks while offline.',
                textAlign: TextAlign.center,
              ),
            ),
          if (tasks.isEmpty)
            const _EmptyTaskList()
          else
            for (final task in tasks) ...[
              JanitorTaskCard(
                task: task,
                onTap: () => context.push('/janitor/task', extra: task),
              ),
              const SizedBox(height: 12),
            ],
        ],
      ),
    );
  }
}

class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner();

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        color: kColorWarning.withValues(alpha: .15),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.wifi_off_rounded, size: 18),
            SizedBox(width: 8),
            Flexible(child: Text('Offline — showing synced tasks.')),
          ],
        ),
      );
}

class _MessageView extends StatelessWidget {
  const _MessageView({
    required this.icon,
    required this.title,
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 48),
              const SizedBox(height: 12),
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              ElevatedButton(onPressed: onAction, child: Text(actionLabel)),
            ],
          ),
        ),
      );
}

class _WelcomeCard extends StatelessWidget {
  const _WelcomeCard({required this.activeCount});

  final int activeCount;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: kColorPrimary,
          borderRadius: BorderRadius.circular(TmsRadius.r20),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Good morning',
              style: Theme.of(context)
                  .textTheme
                  .headlineMedium
                  ?.copyWith(color: Colors.white),
            ),
            const SizedBox(height: 8),
            Text(
              '$activeCount tasks need your attention.',
              style: Theme.of(context)
                  .textTheme
                  .bodyLarge
                  ?.copyWith(color: Colors.white70),
            ),
          ],
        ),
      );
}

class _EmptyTaskList extends StatelessWidget {
  const _EmptyTaskList();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 56),
        child: Column(
          children: [
            const Icon(Icons.task_alt_rounded, size: 48, color: kColorSuccess),
            const SizedBox(height: 12),
            Text('No tasks here',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            const Text('You are all caught up for this view.'),
          ],
        ),
      );
}
