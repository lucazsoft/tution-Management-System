import 'package:flutter/material.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';

import '../models/janitor_task.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

class JanitorTaskCard extends StatelessWidget {
  const JanitorTaskCard({super.key, required this.task, required this.onTap});

  final JanitorTask task;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor(task.status);
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(TmsRadius.r20),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: .12),
                  borderRadius: BorderRadius.circular(TmsRadius.r14),
                ),
                child: Icon(_statusIcon(task.status), color: statusColor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(task.title,
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text(task.location,
                        style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _TaskPill(
                          label: task.priority.label,
                          color: _priorityColor(task.priority),
                        ),
                        _TaskPill(label: task.status.label, color: statusColor),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('Due', style: Theme.of(context).textTheme.bodySmall),
                  Text(_time(task.dueAt),
                      style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 8),
                  const Icon(Icons.chevron_right_rounded),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TaskPill extends StatelessWidget {
  const _TaskPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: color.withValues(alpha: .12),
          borderRadius: BorderRadius.circular(TmsRadius.r99),
        ),
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: color,
                fontWeight: FontWeight.w700,
              ),
        ),
      );
}

Color _statusColor(JanitorTaskStatus status) => switch (status) {
      JanitorTaskStatus.assigned => kColorPrimaryLight,
      JanitorTaskStatus.inProgress => kColorWarning,
      JanitorTaskStatus.completed => kColorSuccess,
    };

Color _priorityColor(JanitorTaskPriority priority) => switch (priority) {
      JanitorTaskPriority.low => kColorInfo,
      JanitorTaskPriority.medium => kColorWarning,
      JanitorTaskPriority.high => kColorError,
    };

IconData _statusIcon(JanitorTaskStatus status) => switch (status) {
      JanitorTaskStatus.assigned => Icons.assignment_outlined,
      JanitorTaskStatus.inProgress => Icons.play_circle_outline_rounded,
      JanitorTaskStatus.completed => Icons.check_circle_outline_rounded,
    };

String _time(DateTime value) {
  final hour = value.hour % 12 == 0 ? 12 : value.hour % 12;
  final minute = value.minute.toString().padLeft(2, '0');
  return '$hour:$minute ${value.hour < 12 ? 'AM' : 'PM'}';
}
