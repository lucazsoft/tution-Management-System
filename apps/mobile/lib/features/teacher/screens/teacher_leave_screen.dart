/// API-backed teacher leave screen.
///
/// History + status come from the workspace `leaves` array
/// (`GET /api/teacher/workspace`); new requests go to
/// `POST /api/leaves/request` via [TeacherLeaveViewModel].
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/sync/sync.dart';

import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';
import 'package:tms_mobile/features/teacher/viewmodels/teacher_leave_viewmodel.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_record_states.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

const _leaveTypes = [
  'CASUAL',
  'SICK',
  'LONG_SICK',
  'EARLY_OUT',
];

class TeacherLeaveScreen extends ConsumerWidget {
  const TeacherLeaveScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(teacherLeaveViewModelProvider);
    final vm = ref.read(teacherLeaveViewModelProvider.notifier);
    final connectivity = ref.watch(connectivityMonitorProvider);
    final offline = connectivity == ConnectivityState.offline;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Leave Requests',
          style:
              GoogleFonts.fraunces(fontWeight: FontWeight.w700, fontSize: 22),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (offline && state.leaves.isNotEmpty) const TeacherOfflineBar(),
            Expanded(child: _body(context, ref, state, vm)),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: state.branches.isEmpty
            ? null
            : () => _showNewLeaveDialog(context, ref),
        backgroundColor: kColorAccent,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('New Request'),
      ),
    );
  }

  Widget _body(
    BuildContext context,
    WidgetRef ref,
    TeacherLeaveState state,
    TeacherLeaveViewModel vm,
  ) {
    if (state.isLoading && state.leaves.isEmpty) {
      return const TeacherLoadingView(message: 'Loading leave requests…');
    }
    if (state.isDenied && state.leaves.isEmpty) {
      return TeacherDeniedView(message: state.error);
    }
    if (state.isOffline && state.leaves.isEmpty) {
      return TeacherOfflineView(onRetry: vm.load);
    }
    if (state.hasError && state.leaves.isEmpty) {
      return TeacherErrorView(
        message: state.error ?? 'Could not load leave requests.',
        onRetry: vm.load,
      );
    }
    if (state.leaves.isEmpty) {
      return const TeacherEmptyView(
        icon: Icons.event_available_rounded,
        title: 'No leave requests yet',
        message: 'Use New Request to submit your first leave.',
      );
    }
    return RefreshIndicator(
      onRefresh: vm.load,
      child: ListView.separated(
        padding: const EdgeInsets.all(20),
        itemCount: state.leaves.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, index) => _LeaveCard(leave: state.leaves[index]),
      ),
    );
  }

  void _showNewLeaveDialog(BuildContext context, WidgetRef ref) {
    final vm = ref.read(teacherLeaveViewModelProvider.notifier);
    final branches = ref.read(teacherLeaveViewModelProvider).branches;
    String type = _leaveTypes.first;
    String branchId = branches.first.id;
    final reasonController = TextEditingController();
    DateTime start = DateTime.now();
    DateTime end = DateTime.now();

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius:
            BorderRadius.vertical(top: Radius.circular(TmsRadius.r20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            Future<void> pickDate(bool isStart) async {
              final picked = await showDatePicker(
                context: ctx,
                initialDate: isStart ? start : end,
                firstDate: DateTime.now().subtract(const Duration(days: 30)),
                lastDate: DateTime.now().add(const Duration(days: 365)),
              );
              if (picked != null) {
                setSheetState(() {
                  if (isStart) {
                    start = picked;
                    if (end.isBefore(start)) end = start;
                  } else {
                    end = picked;
                  }
                });
              }
            }

            return Padding(
              padding: EdgeInsets.only(
                left: 24,
                right: 24,
                top: 24,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('New Leave Request',
                      style: GoogleFonts.fraunces(
                          fontWeight: FontWeight.w700, fontSize: 20)),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: type,
                    decoration: const InputDecoration(labelText: 'Leave type'),
                    items: [
                      for (final t in _leaveTypes)
                        DropdownMenuItem(value: t, child: Text(t)),
                    ],
                    onChanged: (v) =>
                        setSheetState(() => type = v ?? _leaveTypes.first),
                  ),
                  const SizedBox(height: 12),
                  if (branches.length > 1)
                    DropdownButtonFormField<String>(
                      initialValue: branchId,
                      decoration: const InputDecoration(labelText: 'Branch'),
                      items: [
                        for (final b in branches)
                          DropdownMenuItem(value: b.id, child: Text(b.name)),
                      ],
                      onChanged: (v) => setSheetState(
                          () => branchId = v ?? branches.first.id),
                    ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => pickDate(true),
                          child: Text(
                            'From ${_fmt(start)}',
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => pickDate(false),
                          child: Text('To ${_fmt(end)}'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: reasonController,
                    decoration: const InputDecoration(
                      labelText: 'Reason',
                      hintText: 'Why do you need leave?',
                    ),
                    maxLines: 3,
                  ),
                  const SizedBox(height: 16),
                  Consumer(
                    builder: (context, ref, _) {
                      final submitting =
                          ref.watch(teacherLeaveViewModelProvider).isSubmitting;
                      final submitError =
                          ref.watch(teacherLeaveViewModelProvider).submitError;
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (submitError != null) ...[
                            Text(submitError,
                                style: TextStyle(
                                    color:
                                        Theme.of(context).colorScheme.error)),
                            const SizedBox(height: 8),
                          ],
                          FilledButton(
                            onPressed: submitting
                                ? null
                                : () async {
                                    final reason = reasonController.text.trim();
                                    if (reason.isEmpty) {
                                      ScaffoldMessenger.of(context)
                                          .showSnackBar(const SnackBar(
                                              content: Text(
                                                  'A reason is required.')));
                                      return;
                                    }
                                    final ok = await vm.submitLeave(
                                      branchId: branchId,
                                      leaveType: type,
                                      startDate: start,
                                      endDate: end,
                                      reason: reason,
                                    );
                                    if (ctx.mounted && ok) {
                                      Navigator.of(ctx).pop();
                                      ScaffoldMessenger.of(context)
                                          .showSnackBar(const SnackBar(
                                              content: Text(
                                                  'Leave request submitted.')));
                                    }
                                  },
                            child: submitting
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2),
                                  )
                                : const Text('Submit Request'),
                          ),
                        ],
                      );
                    },
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  String _fmt(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

class _LeaveCard extends StatelessWidget {
  const _LeaveCard({required this.leave});

  final TeacherLeaveEntry leave;

  @override
  Widget build(BuildContext context) {
    final pending = leave.isPending;
    final rejected = leave.status == 'REJECTED';
    final statusColor = pending
        ? Colors.amber
        : rejected
            ? Theme.of(context).colorScheme.error
            : Colors.green;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    leave.leaveType,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                Chip(
                  label: Text(leave.status),
                  backgroundColor: statusColor.withValues(alpha: 0.2),
                ),
              ],
            ),
            if (leave.reason != null) ...[
              const SizedBox(height: 4),
              Text(leave.reason!),
            ],
            const SizedBox(height: 4),
            Text(
              '${leave.startDate?.toLocal().toString().split(' ').first ?? '?'} → ${leave.endDate?.toLocal().toString().split(' ').first ?? '?'}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
