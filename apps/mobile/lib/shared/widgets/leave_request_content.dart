import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tms_mobile/core/network/api_exception.dart';

class LeaveHistoryItem {
  const LeaveHistoryItem(
    this.dates,
    this.reason,
    this.state,
    this.detail, {
    this.startDate,
    this.endDate,
  });
  final String dates;
  final String reason;
  final String state;
  final String detail;
  final DateTime? startDate;
  final DateTime? endDate;
}

DateTime _dateOnly(DateTime value) =>
    DateTime(value.year, value.month, value.day);

bool leaveDateRangeOverlaps(
  List<LeaveHistoryItem> history,
  DateTime start,
  DateTime end,
) {
  final requestedStart = _dateOnly(start);
  final requestedEnd = _dateOnly(end);
  return history.any((item) {
    final state = item.state.toLowerCase();
    final active = state == 'pending' || state == 'approved';
    final existingStart = item.startDate;
    final existingEnd = item.endDate;
    if (!active || existingStart == null || existingEnd == null) return false;
    return !_dateOnly(existingStart).isAfter(requestedEnd) &&
        !_dateOnly(existingEnd).isBefore(requestedStart);
  });
}

String leaveSubmissionErrorMessage(Object error) {
  if (error is ApiException) return error.message;
  if (error is StateError) return error.message.toString();
  return 'Could not submit the leave request. Please try again.';
}

class LeaveRequestContent extends StatefulWidget {
  const LeaveRequestContent({
    super.key,
    required this.subjectName,
    required this.history,
    required this.onSubmit,
  });

  final String subjectName;
  final List<LeaveHistoryItem> history;
  final Future<void> Function(
      String type, DateTime start, DateTime end, String reason) onSubmit;

  @override
  State<LeaveRequestContent> createState() => _LeaveRequestContentState();
}

class _LeaveRequestContentState extends State<LeaveRequestContent> {
  DateTime? _start;
  DateTime? _end;
  String? _reason;
  final _details = TextEditingController();
  bool _submitting = false;
  String? _dateError;

  bool _isCovered(DateTime day) {
    return leaveDateRangeOverlaps(widget.history, day, day);
  }

  DateTime? _firstAvailable(DateTime from, DateTime last) {
    for (var day = _dateOnly(from);
        !day.isAfter(last);
        day = day.add(const Duration(days: 1))) {
      if (!_isCovered(day)) return day;
    }
    return null;
  }

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _pick(bool start) async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final firstAllowed = start ? today : (_start ?? today);
    final candidate = (start ? _start : _end) ?? _start ?? today;
    final lastAllowed = today.add(const Duration(days: 730));
    final preferred =
        candidate.isBefore(firstAllowed) ? firstAllowed : candidate;
    final initial = _isCovered(preferred)
        ? _firstAvailable(preferred, lastAllowed)
        : preferred;
    if (initial == null) {
      setState(() => _dateError =
          'No available leave dates were found in the selectable period.');
      return;
    }
    final value = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: firstAllowed,
      lastDate: lastAllowed,
      selectableDayPredicate: (day) => !_isCovered(day),
    );
    if (value != null) {
      setState(() {
        if (start) {
          _start = value;
          if (_end != null && _end!.isBefore(value)) _end = null;
        } else {
          _end = value;
        }
        _dateError = null;
      });
    }
  }

  Future<void> _submit() async {
    if (_start == null ||
        _end == null ||
        _reason == null ||
        _details.text.trim().length < 10) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Select both dates and a reason, then provide at least 10 characters of details.')));
      return;
    }
    if (_end!.isBefore(_start!)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('End date must be on or after the start date.')));
      return;
    }
    if (leaveDateRangeOverlaps(widget.history, _start!, _end!)) {
      setState(() => _dateError =
          'These dates overlap a pending or approved leave request. Choose an available date range.');
      return;
    }
    setState(() => _submitting = true);
    try {
      await widget.onSubmit(_reason == 'Sick leave' ? 'SICK' : 'CASUAL',
          _start!, _end!, '${_reason!}: ${_details.text.trim()}');
      if (!mounted) return;
      setState(() {
        _start = null;
        _end = null;
        _reason = null;
        _dateError = null;
        _details.clear();
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Leave request submitted for approval.')));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(leaveSubmissionErrorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Leave history', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 8),
      if (widget.history.isEmpty)
        const Card(
            child: Padding(
                padding: EdgeInsets.all(18),
                child: Text('No leave requests have been submitted yet.')))
      else
        ...widget.history.map((item) => Card(
                child: ListTile(
              leading: Icon(item.state == 'Approved'
                  ? Icons.event_available
                  : item.state == 'Rejected'
                      ? Icons.event_busy
                      : Icons.schedule),
              title: Text(item.reason),
              subtitle: Text('${item.dates}\n${item.detail}'),
              isThreeLine: true,
              trailing: Chip(label: Text(item.state)),
            ))),
      const SizedBox(height: 20),
      Card(
          child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Apply for planned leave',
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.copyWith(color: colors.primary)),
                    const SizedBox(height: 4),
                    const Text(
                        'Branch Admin and assigned teachers are notified.'),
                    const SizedBox(height: 18),
                    LayoutBuilder(builder: (context, constraints) {
                      final fields = [
                        _DateField(
                            label: 'Start date',
                            value: _start,
                            onTap: () => _pick(true)),
                        _DateField(
                            label: 'End date',
                            value: _end,
                            onTap: () => _pick(false)),
                      ];
                      return constraints.maxWidth >= 600
                          ? Row(children: [
                              Expanded(child: fields[0]),
                              const SizedBox(width: 14),
                              Expanded(child: fields[1])
                            ])
                          : Column(children: [
                              fields[0],
                              const SizedBox(height: 12),
                              fields[1]
                            ]);
                    }),
                    if (_dateError != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        _dateError!,
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: colors.error),
                      ),
                    ],
                    const SizedBox(height: 14),
                    DropdownButtonFormField<String>(
                      initialValue: _reason,
                      decoration: const InputDecoration(
                          labelText: 'Reason', border: OutlineInputBorder()),
                      hint: const Text('Choose a reason'),
                      items: const [
                        'Sick leave',
                        'Family event',
                        'Travel',
                        'Other'
                      ]
                          .map((value) => DropdownMenuItem(
                              value: value, child: Text(value)))
                          .toList(),
                      onChanged: (value) => setState(() => _reason = value),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                        controller: _details,
                        maxLines: 4,
                        maxLength: 1900,
                        decoration: InputDecoration(
                            labelText: 'Details',
                            helperText:
                                'Required: clearly explain why leave is needed.',
                            hintText:
                                'For example: ${widget.subjectName} has a medical appointment',
                            alignLabelWithHint: true,
                            border: const OutlineInputBorder())),
                    const SizedBox(height: 8),
                    FilledButton.icon(
                        onPressed: _submitting ? null : _submit,
                        icon: _submitting
                            ? const SizedBox.square(
                                dimension: 18,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.send_outlined),
                        label: const Text('Submit leave request')),
                  ]))),
      const SizedBox(height: 14),
      Card(
          color: colors.primaryContainer,
          child: const Padding(
              padding: EdgeInsets.all(16),
              child: Row(children: [
                Icon(Icons.fact_check_outlined),
                SizedBox(width: 12),
                Expanded(
                    child: Text(
                        'Once approved, covered attendance is automatically recorded as Absent (Excused).'))
              ]))),
    ]);
  }
}

class _DateField extends StatelessWidget {
  const _DateField(
      {required this.label, required this.value, required this.onTap});
  final String label;
  final DateTime? value;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => InkWell(
      onTap: onTap,
      child: InputDecorator(
          decoration: InputDecoration(
              labelText: label,
              border: const OutlineInputBorder(),
              suffixIcon: const Icon(Icons.calendar_today_outlined)),
          child: Text(value == null
              ? 'mm/dd/yyyy'
              : DateFormat.yMMMd().format(value!))));
}
