import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_navigation.dart';

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

  Future<void> _reschedule(String id) async {
    final earliest = DateTime.now().add(const Duration(hours: 24));
    final day = await showDatePicker(
      context: context,
      firstDate: DateTime(earliest.year, earliest.month, earliest.day),
      lastDate: earliest.add(const Duration(days: 365)),
      initialDate: earliest,
    );
    if (day == null || !mounted) return;
    final clock = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(earliest),
    );
    if (clock == null || !mounted) return;
    final selected =
        DateTime(day.year, day.month, day.day, clock.hour, clock.minute);
    if (!selected.isAfter(DateTime.now())) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose a future meeting time.')),
      );
      return;
    }
    final remarks = TextEditingController();
    final proceed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Propose another time'),
        content: TextField(
          controller: remarks,
          maxLength: 500,
          maxLines: 3,
          decoration: InputDecoration(
            labelText: 'Message to parent',
            hintText: 'Explain why this time works better',
            helperText: selected.toString(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Send proposal'),
          ),
        ],
      ),
    );
    final note = remarks.text;
    remarks.dispose();
    if (proceed == true && mounted) {
      await _respond(id, 'PROPOSE_ALTERNATIVE',
          alternative: selected, remarks: note);
    }
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
    final student =
        item['student'] is Map ? item['student']['user'] as Map? : null;
    final name = student == null
        ? 'Student'
        : '${student['firstName'] ?? ''} ${student['lastName'] ?? ''}'.trim();
    final status = '${item['status'] ?? 'REQUESTED'}';
    final requested = status == 'REQUESTED';
    final proposalFrom = '${item['proposalFrom'] ?? ''}';
    final parentProposed =
        status == 'ALTERNATIVE_PROPOSED' && proposalFrom == 'PARENT';
    final teacherProposed =
        status == 'ALTERNATIVE_PROPOSED' && proposalFrom == 'TEACHER';
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
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Align(
              alignment: Alignment.centerRight,
              child: Text('Waiting for the parent to respond.'),
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
                  onPressed: _busyId == id ? null : () => _reschedule(id),
                  icon: const Icon(Icons.update),
                  label: const Text('Reschedule'),
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
      ]),
    );
  }
}
