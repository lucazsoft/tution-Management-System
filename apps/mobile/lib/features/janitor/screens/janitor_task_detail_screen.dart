/// API-backed janitor task detail screen (MVVM).
///
/// Renders the task passed via the `/janitor/task` route (`state.extra`)
/// and keeps it in sync with [JanitorPortalViewModel]: "Start task" performs
/// the local-only assigned -> in-progress transition, "Mark complete" posts
/// `POST /api/resources/tasks/complete/:taskId` and refreshes the list.
///
/// Responsive layout is preserved: content is capped at 720 logical pixels
/// with wider padding on screens >= 700 logical pixels wide.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';

import '../models/janitor_task.dart';
import '../viewmodels/janitor_portal_viewmodel.dart';
import '../widgets/janitor_task_card.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

class JanitorTaskDetailScreen extends ConsumerStatefulWidget {
  const JanitorTaskDetailScreen({
    super.key,
    required this.task,
  });

  final JanitorTask task;

  @override
  ConsumerState<JanitorTaskDetailScreen> createState() =>
      _JanitorTaskDetailScreenState();
}

class _JanitorTaskDetailScreenState
    extends ConsumerState<JanitorTaskDetailScreen> {
  final _completionNoteController = TextEditingController();

  @override
  void dispose() {
    _completionNoteController.dispose();
    super.dispose();
  }

  JanitorTask _currentTask(JanitorPortalState state) {
    for (final task in state.tasks) {
      if (task.id == widget.task.id) return task;
    }
    return widget.task;
  }

  void _startTask(JanitorPortalViewModel vm) {
    vm.startTask(widget.task.id);
  }

  Future<void> _completeTask(
    BuildContext context,
    JanitorPortalViewModel vm,
  ) async {
    final ok = await vm.completeTask(widget.task.id);
    if (!context.mounted) return;
    if (!ok) {
      final message = ref.read(janitorPortalViewModelProvider).error ??
          'Could not complete the task.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(janitorPortalViewModelProvider);
    final vm = ref.read(janitorPortalViewModelProvider.notifier);
    final task = _currentTask(state);
    final completing = state.completingTaskId == task.id;
    final wide = MediaQuery.sizeOf(context).width >= 700;

    if (_completionNoteController.text.isEmpty &&
        (task.completionNote?.isNotEmpty ?? false)) {
      _completionNoteController.text = task.completionNote!;
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Task details')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: ListView(
              padding: EdgeInsets.all(wide ? 32 : 20),
              children: [
                Text(task.title,
                    style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 8),
                Text(task.location,
                    style: Theme.of(context).textTheme.bodyLarge),
                const SizedBox(height: 20),
                JanitorTaskCard(task: task, onTap: () {}),
                const SizedBox(height: 24),
                Text('Instructions',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Text(
                  task.description.isEmpty
                      ? 'Complete this task following the site cleaning procedure.'
                      : task.description,
                ),
                const SizedBox(height: 24),
                if (task.status == JanitorTaskStatus.inProgress) ...[
                  Text('Completion note',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _completionNoteController,
                    minLines: 3,
                    maxLines: 5,
                    textInputAction: TextInputAction.done,
                    decoration: const InputDecoration(
                      labelText: 'Completion note (optional)',
                      hintText:
                          'Add supplies used, issues found, or a handoff note.',
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
                if (task.status == JanitorTaskStatus.completed) ...[
                  _CompletedBanner(note: task.completionNote),
                  const SizedBox(height: 24),
                ],
                if (task.nextStatus != null)
                  ElevatedButton.icon(
                    onPressed: completing
                        ? null
                        : () => task.status == JanitorTaskStatus.assigned
                            ? _startTask(vm)
                            : _completeTask(context, vm),
                    icon: completing
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(task.status == JanitorTaskStatus.assigned
                            ? Icons.play_arrow_rounded
                            : Icons.check_rounded),
                    label: Text(task.status == JanitorTaskStatus.assigned
                        ? 'Start task'
                        : 'Mark complete'),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CompletedBanner extends StatelessWidget {
  const _CompletedBanner({this.note});

  final String? note;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: kColorSuccess.withValues(alpha: .1),
          borderRadius: BorderRadius.circular(TmsRadius.r16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.check_circle_rounded, color: kColorSuccess),
                const SizedBox(width: 8),
                Text(
                  'Task completed',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: kColorSuccess,
                      ),
                ),
              ],
            ),
            if (note != null && note!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(note!),
            ],
          ],
        ),
      );
}
