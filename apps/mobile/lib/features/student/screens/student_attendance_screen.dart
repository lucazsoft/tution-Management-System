/// API-backed student attendance screen (MOB-102).
///
/// Session records and approved-leave explanations come from
/// `GET /api/users/me/student-portal` through
/// [StudentAttendanceViewModel]. An approved leave overlapping a session
/// is recorded server-side as `Absent (Excused)`; excused sessions are
/// explained inline with the matching leave decision. Handles loading,
/// empty, error, denied (403), offline, and session-expired (401) states,
/// with a paginated session-record list.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/student_academics_api.dart';
import '../student_design.dart';
import '../viewmodels/student_attendance_viewmodel.dart';
import '../widgets/student_record_states.dart';
import '../widgets/student_scaffold.dart';

class StudentAttendanceScreen extends ConsumerStatefulWidget {
  const StudentAttendanceScreen({super.key});

  @override
  ConsumerState<StudentAttendanceScreen> createState() =>
      _StudentAttendanceScreenState();
}

class _StudentAttendanceScreenState
    extends ConsumerState<StudentAttendanceScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(
        () => ref.read(studentAttendanceViewModelProvider.notifier).load());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(studentAttendanceViewModelProvider);
    final viewModel = ref.read(studentAttendanceViewModelProvider.notifier);

    return StudentScaffold(
      title: 'Attendance',
      body: _buildBody(context, state, viewModel),
    );
  }

  Widget _buildBody(
    BuildContext context,
    StudentAttendanceState state,
    StudentAttendanceViewModel viewModel,
  ) {
    if (state.isLoading && !state.hasData) {
      return const StudentLoadingView(message: 'Loading your attendance…');
    }
    if (state.sessionExpired) {
      return StudentErrorView(
        icon: Icons.lock_outline_rounded,
        title: 'Session expired',
        message: 'Please sign in again to view your attendance.',
        retryLabel: 'Reload',
        onRetry: viewModel.refresh,
      );
    }
    if (state.accessDenied) {
      return StudentErrorView(
        icon: Icons.block_rounded,
        title: 'Not available',
        message:
            state.error ?? 'Your account cannot view these attendance records.',
        retryLabel: 'Try again',
        onRetry: viewModel.refresh,
      );
    }
    if (state.offline && !state.hasData) {
      return StudentErrorView(
        icon: Icons.wifi_off_rounded,
        title: 'You are offline',
        message: 'Check your connection and try again.',
        retryLabel: 'Retry',
        onRetry: viewModel.refresh,
      );
    }
    if (state.error != null && !state.hasData) {
      return StudentErrorView(
        icon: Icons.error_outline_rounded,
        title: 'Could not load attendance',
        message: state.error!,
        retryLabel: 'Retry',
        onRetry: viewModel.refresh,
      );
    }
    if (!state.hasData) {
      return const StudentEmptyView(
        icon: Icons.fact_check_outlined,
        title: 'No attendance yet',
        message:
            'Your teachers record attendance every session; it shows up here.',
      );
    }

    final ratio = state.attendanceRate ?? 0.0;
    final explanations = state.explanations;
    final records = state.pagedRecords;

    return RefreshIndicator(
      onRefresh: viewModel.refresh,
      child: ListView(
        padding: const EdgeInsets.all(TmsSpace.md),
        children: [
          Container(
            padding: const EdgeInsets.all(TmsSpace.lg),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [StudentColors.primaryDark, StudentColors.primary],
              ),
              borderRadius: BorderRadius.circular(TmsRadius.card),
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 76,
                  height: 76,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      CircularProgressIndicator(
                        value: ratio,
                        strokeWidth: 7,
                        color: StudentColors.accent,
                        backgroundColor: Colors.white24,
                      ),
                      Center(
                        child: Text(
                          '${(ratio * 100).round()}%',
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: TmsSpace.lg),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Overall',
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: Colors.white70),
                      ),
                      const SizedBox(height: TmsSpace.xs),
                      Text(
                        '${state.presentCount} present · '
                        '${state.absentCount} absent · '
                        '${state.excusedCount} excused',
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(color: Colors.white),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (explanations.isNotEmpty) ...[
            const SizedBox(height: TmsSpace.lg),
            Text('Approved leave',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: TmsSpace.sm),
            for (final explanation in explanations) ...[
              _LeaveExplanationCard(explanation: explanation),
              const SizedBox(height: TmsSpace.sm),
            ],
          ],
          const SizedBox(height: TmsSpace.lg),
          Text('Session record', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: TmsSpace.sm),
          for (final record in records) ...[
            _AttendanceTile(record: record),
            const SizedBox(height: TmsSpace.sm),
          ],
          StudentLoadMoreFooter(
            hasMore: state.hasMore,
            remaining: state.records.length - records.length,
            onLoadMore: viewModel.loadMore,
          ),
          const SizedBox(height: TmsSpace.xs),
          Text(
            'Attendance is recorded by your teacher. Approved leave appears as Absent (Excused).',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _LeaveExplanationCard extends StatelessWidget {
  const _LeaveExplanationCard({required this.explanation});

  final AttendanceExplanation explanation;

  @override
  Widget build(BuildContext context) {
    final leave = explanation.leave;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(TmsSpace.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.event_available_rounded,
                color: StudentColors.warning),
            const SizedBox(width: TmsSpace.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${explanation.record.subject} · ${explanation.record.date}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: TmsSpace.xxs),
                  Text(
                    leave == null
                        ? 'Excused: approved leave on record.'
                        : '${leave.title}: ${leave.message}',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AttendanceTile extends StatelessWidget {
  const _AttendanceTile({required this.record});

  final AttendanceEntry record;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        minTileHeight: 72,
        leading: Icon(
          _icon(record),
          color: _color(record),
        ),
        title: Text(record.subject),
        subtitle: Text('${record.date} · ${record.session}'),
        trailing: StudentStatusPill(
          label: record.state,
          icon: _icon(record),
          color: _color(record),
        ),
      ),
    );
  }

  static IconData _icon(AttendanceEntry record) {
    if (record.isExcused) return Icons.event_available_rounded;
    if (record.isPresent) return Icons.check_circle_rounded;
    return Icons.cancel_rounded;
  }

  static Color _color(AttendanceEntry record) {
    if (record.isExcused) return StudentColors.warning;
    if (record.isPresent) return StudentColors.success;
    return StudentColors.error;
  }
}
