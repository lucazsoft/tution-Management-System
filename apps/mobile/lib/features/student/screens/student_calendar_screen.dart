/// API-backed academic calendar screen (MOB-104).
///
/// Events are the live portal `events` list via [StudentCalendarViewModel];
/// filter chips are built from the kinds present in the payload. States:
/// loading, empty, error with retry, denied (403), offline.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/student_portal_dto.dart';
import '../student_design.dart';
import '../viewmodels/student_calendar_viewmodel.dart';
import '../widgets/student_record_states.dart';
import '../widgets/student_scaffold.dart';

class StudentCalendarScreen extends ConsumerWidget {
  const StudentCalendarScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(studentCalendarViewModelProvider);
    final viewModel = ref.read(studentCalendarViewModelProvider.notifier);

    return StudentScaffold(
      title: 'Academic calendar',
      selectedIndex: 3,
      body: Builder(
        builder: (context) {
          if (state.isLoading && state.events.isEmpty) {
            return const StudentLoadingView(
              message: 'Loading the academic calendar…',
            );
          }
          if (!state.hasError && state.isEmpty) {
            return const StudentEmptyView(
              icon: Icons.event_available_outlined,
              title: 'No events scheduled',
              message:
                  'There are no academic events for your branches right now.',
            );
          }
          if (state.hasError && state.events.isEmpty) {
            if (state.isDenied) {
              return StudentErrorView(
                icon: Icons.lock_outline_rounded,
                title: 'Access denied',
                message:
                    state.error ?? 'Your account cannot view the calendar.',
                retryLabel: 'Retry',
                onRetry: viewModel.load,
              );
            }
            if (state.isOffline) {
              return StudentErrorView(
                icon: Icons.wifi_off_rounded,
                title: 'You are offline',
                message: state.error ??
                    'Connect to the internet to load the calendar.',
                retryLabel: 'Retry',
                onRetry: viewModel.load,
              );
            }
            return StudentErrorView(
              icon: Icons.event_busy_outlined,
              title: 'Could not load calendar',
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
    StudentCalendarState state,
    StudentCalendarViewModel viewModel,
  ) {
    final visible = state.visible;
    return RefreshIndicator(
      onRefresh: viewModel.refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(TmsSpace.md),
        children: [
          Wrap(
            spacing: TmsSpace.xs,
            runSpacing: TmsSpace.xs,
            children: [
              _FilterChip(
                label: 'All',
                selected: state.selectedKind == 'All',
                onSelected: () => viewModel.selectKind('All'),
              ),
              for (final kind in state.kinds)
                _FilterChip(
                  label: kind,
                  selected: state.selectedKind == kind,
                  onSelected: () => viewModel.selectKind(kind),
                ),
            ],
          ),
          const SizedBox(height: TmsSpace.lg),
          Text(
            state.selectedKind == 'All'
                ? 'Upcoming events (${visible.length})'
                : '${state.selectedKind} (${visible.length})',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: TmsSpace.sm),
          if (visible.isEmpty)
            const StudentEmptyView(
              icon: Icons.filter_list_off_outlined,
              title: 'No events in this filter',
              message: 'Try a different event type.',
            )
          else
            for (final event in visible) ...[
              _EventCard(event: event),
              const SizedBox(height: TmsSpace.sm),
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

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event});

  final PortalEvent event;

  @override
  Widget build(BuildContext context) {
    final color = _typeColor(event.kind);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(TmsRadius.card),
        onTap: () => showModalBottomSheet<void>(
          context: context,
          showDragHandle: true,
          builder: (context) => Padding(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                StudentStatusPill(
                  label: event.kind.isEmpty ? 'Event' : event.kind,
                  icon: _typeIcon(event.kind),
                  color: color,
                ),
                const SizedBox(height: TmsSpace.md),
                Text(
                  event.title,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: TmsSpace.xs),
                Text(event.dateLabel),
                const SizedBox(height: TmsSpace.md),
                Text(
                  event.details.isEmpty
                      ? 'No further details were provided.'
                      : event.details,
                ),
              ],
            ),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(TmsSpace.md),
          child: Row(
            children: [
              Container(
                width: 52,
                height: 58,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: .10),
                  borderRadius: BorderRadius.circular(TmsRadius.control),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      event.day.isEmpty ? '–' : event.day,
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(color: color),
                    ),
                    Text(
                      event.month.isEmpty ? '' : event.month,
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: color),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: TmsSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      event.title,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: TmsSpace.xxs),
                    Text(
                      event.details.isEmpty ? event.dateLabel : event.details,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      ),
    );
  }
}

IconData _typeIcon(String kind) {
  switch (kind.toLowerCase()) {
    case 'holiday':
      return Icons.celebration_outlined;
    case 'exam':
      return Icons.edit_note_rounded;
    case 'ceremony':
      return Icons.emoji_events_outlined;
    case 'fee due':
      return Icons.receipt_long_outlined;
    default:
      return Icons.event_outlined;
  }
}

Color _typeColor(String kind) {
  switch (kind.toLowerCase()) {
    case 'holiday':
      return StudentColors.success;
    case 'exam':
      return StudentColors.error;
    case 'ceremony':
      return StudentColors.primary;
    case 'fee due':
      return StudentColors.warning;
    default:
      return StudentColors.primary;
  }
}
