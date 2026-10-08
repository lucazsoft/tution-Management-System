import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_navigation.dart';
import 'package:tms_mobile/shared/widgets/meeting_schedule_fields.dart';

class TeacherMeetingsScreen extends StatefulWidget {
  const TeacherMeetingsScreen({super.key});

  @override
  State<TeacherMeetingsScreen> createState() => _TeacherMeetingsScreenState();
}

class _TeacherMeetingsScreenState extends State<TeacherMeetingsScreen> {
  List<Map<String, dynamic>>? _meetings;
  String? _error;
  String? _busyId;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _load();
    _refreshTimer = Timer.periodic(const Duration(seconds: 15), (_) => _load());
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final response =
          await ApiClient.instance.dio.get<dynamic>('/api/appointments');
      final rows = response.data is Map<String, dynamic>
          ? response.data['appointments']
          : null;
      if (rows is! List) throw StateError('Invalid response');
      if (mounted) {
        setState(() {
          _meetings = rows.whereType<Map<String, dynamic>>().toList();
          _error = null;
        });
      }
    } on DioException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not load meetings.');
    }
  }

  Future<void> _respond(String id, String action,
      {DateTime? alternative, String? remarks}) async {
    setState(() => _busyId = id);
    try {
      await ApiClient.instance.dio
          .post<dynamic>('/api/appointments/respond/$id', data: {
        'action': action,
        if (alternative != null)
          'alternativeSlot': alternative.toUtc().toIso8601String(),
        if (remarks?.trim().isNotEmpty == true) 'remarks': remarks!.trim(),
      });
      await _load();
      if (mounted) {
        final message = switch (action) {
          'APPROVE' => 'Meeting confirmed. The parent was notified.',
          'REJECT' => 'Meeting declined. The parent was notified.',
          _ => 'A new time was proposed to the parent.',
        };
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(message)));
      }
    } on DioException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(error.message ?? 'Update failed.')));
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _editMeeting(Map<String, dynamic> item) async {
    final id = '${item['id'] ?? ''}';
    final scheduled = DateTime.tryParse(
                '${item['alternativeTime'] ?? item['scheduledTime'] ?? ''}')
            ?.toLocal() ??
        DateTime.now().add(const Duration(days: 1));
    final edit = await showModalBottomSheet<_MeetingEditResult>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => _MeetingEditSheet(
        studentName: _studentName(item),
        initialScheduled: scheduled,
        initialRemarks: '${item['responseRemarks'] ?? item['remarks'] ?? ''}',
      ),
    );
    if (edit == null || !mounted) return;
    setState(() => _busyId = id);
    try {
      await ApiClient.instance.dio
          .patch<dynamic>('/api/appointments/$id', data: {
        'scheduledTime': edit.scheduled.toUtc().toIso8601String(),
        'remarks': edit.remarks,
      });
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Meeting updated. The parent was notified.')));
      }
    } on DioException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(error.message ?? 'Update failed.')));
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _cancelMeeting(Map<String, dynamic> item) async {
    final id = '${item['id'] ?? ''}';
    final note = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancel meeting?'),
        content: TextField(
          controller: note,
          maxLength: 500,
          maxLines: 3,
          decoration: const InputDecoration(
              labelText: 'Reason for cancellation (optional)'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Keep meeting'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Cancel meeting'),
          ),
        ],
      ),
    );
    final remarks = note.text;
    note.dispose();
    if (confirmed != true || !mounted) return;
    setState(() => _busyId = id);
    try {
      await ApiClient.instance.dio
          .post<dynamic>('/api/appointments/cancel/$id', data: {
        if (remarks.trim().isNotEmpty) 'remarks': remarks.trim(),
      });
      await _load();
    } on DioException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(error.message ?? 'Cancellation failed.')));
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _completeMeeting(Map<String, dynamic> item) async {
    final id = '${item['id'] ?? ''}';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Complete this meeting?'),
        content: const Text(
          'This will mark the meeting as completed for both the teacher and parent.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Not yet'),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.pop(dialogContext, true),
            icon: const Icon(Icons.task_alt_rounded),
            label: const Text('Meeting completed'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busyId = id);
    try {
      await ApiClient.instance.dio
          .post<dynamic>('/api/appointments/complete/$id');
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Meeting completed. The parent was notified.'),
        ));
      }
    } on DioException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message ?? 'Update failed.')),
        );
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  String _studentName(Map<String, dynamic> item) {
    final student =
        item['student'] is Map ? item['student']['user'] as Map? : null;
    return student == null
        ? 'Student'
        : '${student['firstName'] ?? ''} ${student['lastName'] ?? ''}'.trim();
  }

  @override
  Widget build(BuildContext context) => TeacherPortalScaffold(
        title: 'Meetings',
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              Text('Parent meetings',
                  style: Theme.of(context).textTheme.headlineSmall),
              const Text(
                  'Review meeting requests, confirm suitable times, or decline requests that need rescheduling.'),
              const SizedBox(height: 16),
              if (_meetings == null && _error == null)
                const Center(child: CircularProgressIndicator())
              else if (_error != null)
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.error_outline),
                    title: const Text('Meetings unavailable'),
                    subtitle: Text(_error!),
                    trailing: IconButton(
                        onPressed: _load, icon: const Icon(Icons.refresh)),
                  ),
                )
              else if (_meetings!.isEmpty)
                const Card(
                  child: ListTile(
                    leading: Icon(Icons.event_available_outlined),
                    title: Text('No meeting requests'),
                    subtitle: Text(
                        'Requests from parents will appear here with the student, preferred time and notes.'),
                  ),
                )
              else
                for (final item in _meetings!) _meetingCard(item),
            ],
          ),
        ),
      );

  Widget _meetingCard(Map<String, dynamic> item) {
    final id = '${item['id'] ?? ''}';
    final name = _studentName(item);
    final status = '${item['status'] ?? 'REQUESTED'}';
    final requested = status == 'REQUESTED';
    final proposalFrom = '${item['proposalFrom'] ?? ''}';
    final parentProposed =
        status == 'ALTERNATIVE_PROPOSED' && proposalFrom == 'PARENT';
    final teacherProposed =
        status == 'ALTERNATIVE_PROPOSED' && proposalFrom == 'TEACHER';
    final completable = ['APPROVED', 'CONFIRMED'].contains(status);
    final active = !['REJECTED', 'CANCELLED', 'COMPLETED'].contains(status);
    final time = DateTime.tryParse('${item['scheduledTime'] ?? ''}')?.toLocal();
    final alternative =
        DateTime.tryParse('${item['alternativeTime'] ?? ''}')?.toLocal();
    return Card(
      child: Column(children: [
        ListTile(
          leading: const CircleAvatar(child: Icon(Icons.groups_outlined)),
          title: Text(name),
          subtitle: Text([
            if (time != null) '${time.toLocal()}',
            if (alternative != null)
              '${parentProposed ? 'Parent proposed' : 'Proposed'}: $alternative',
            if ('${item['remarks'] ?? ''}'.isNotEmpty) '${item['remarks']}',
            if ('${item['responseRemarks'] ?? ''}'.isNotEmpty)
              '${item['responseRemarks']}',
          ].join('\n')),
          trailing: Chip(label: Text(status.replaceAll('_', ' '))),
        ),
        if (teacherProposed)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Row(
              children: [
                const Expanded(
                    child: Text('Waiting for the parent to respond.')),
                OutlinedButton.icon(
                  onPressed: _busyId == id ? null : () => _editMeeting(item),
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Edit proposal'),
                ),
              ],
            ),
          ),
        if (requested || parentProposed)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.end,
              children: [
                OutlinedButton.icon(
                  onPressed:
                      _busyId == id ? null : () => _respond(id, 'REJECT'),
                  icon: const Icon(Icons.close),
                  label: const Text('Decline'),
                ),
                OutlinedButton.icon(
                  onPressed: _busyId == id ? null : () => _editMeeting(item),
                  icon: const Icon(Icons.edit_calendar_outlined),
                  label: const Text('Edit / reschedule'),
                ),
                FilledButton.icon(
                  onPressed:
                      _busyId == id ? null : () => _respond(id, 'APPROVE'),
                  icon: const Icon(Icons.check),
                  label: const Text('Confirm'),
                ),
              ],
            ),
          ),
        if (active)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.end,
              children: [
                if (!requested && !parentProposed && !teacherProposed)
                  OutlinedButton.icon(
                    onPressed: _busyId == id ? null : () => _editMeeting(item),
                    icon: const Icon(Icons.edit_calendar_outlined),
                    label: const Text('Reschedule'),
                  ),
                TextButton.icon(
                  onPressed: _busyId == id ? null : () => _cancelMeeting(item),
                  icon: const Icon(Icons.cancel_outlined),
                  label: const Text('Cancel meeting'),
                ),
                if (completable)
                  FilledButton.icon(
                    onPressed:
                        _busyId == id ? null : () => _completeMeeting(item),
                    icon: const Icon(Icons.task_alt_rounded),
                    label: const Text('Meeting completed'),
                  ),
              ],
            ),
          ),
      ]),
    );
  }
}

class _MeetingEditResult {
  const _MeetingEditResult({required this.scheduled, required this.remarks});

  final DateTime scheduled;
  final String remarks;
}

class _MeetingEditSheet extends StatefulWidget {
  const _MeetingEditSheet({
    required this.studentName,
    required this.initialScheduled,
    required this.initialRemarks,
  });

  final String studentName;
  final DateTime initialScheduled;
  final String initialRemarks;

  @override
  State<_MeetingEditSheet> createState() => _MeetingEditSheetState();
}

class _MeetingEditSheetState extends State<_MeetingEditSheet> {
  late final TextEditingController _remarks;
  late DateTime _scheduled;
  late final DateTime _earliest;
  String? _error;

  @override
  void initState() {
    super.initState();
    _earliest = DateTime.now().add(const Duration(hours: 1));
    _scheduled = widget.initialScheduled.isBefore(_earliest)
        ? _earliest
        : widget.initialScheduled;
    _remarks = TextEditingController(text: widget.initialRemarks);
  }

  @override
  void dispose() {
    _remarks.dispose();
    super.dispose();
  }

  void _save() {
    if (_remarks.text.trim().isEmpty) {
      setState(() => _error = 'Add a message for the parent.');
      return;
    }
    Navigator.pop(
      context,
      _MeetingEditResult(
        scheduled: _scheduled,
        remarks: _remarks.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          0,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Edit meeting',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 16),
              InputDecorator(
                decoration: const InputDecoration(
                  labelText: 'Student',
                  prefixIcon: Icon(Icons.school_outlined),
                ),
                child: Text(widget.studentName),
              ),
              const SizedBox(height: 12),
              MeetingScheduleFields(
                reasonController: _remarks,
                scheduled: _scheduled,
                earliest: _earliest,
                onScheduledChanged: (value) =>
                    setState(() => _scheduled = value),
                actionLabel: 'Save',
                onAction: _save,
                reasonError: _error,
                onReasonChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                },
              ),
            ],
          ),
        ),
      );
}
