import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/parent_portal.dart';
import '../viewmodels/parent_portal_viewmodel.dart';
import '../widgets/child_switcher_bar.dart';
import '../widgets/parent_navigation.dart';
import '../widgets/parent_portal_state_view.dart';

class ParentAppointmentsScreen extends ConsumerStatefulWidget {
  const ParentAppointmentsScreen({super.key});
  @override
  ConsumerState<ParentAppointmentsScreen> createState() =>
      _ParentAppointmentsScreenState();
}

class _ParentAppointmentsScreenState
    extends ConsumerState<ParentAppointmentsScreen> {
  final _remarks = TextEditingController();
  String? _contactId;
  DateTime? _scheduled;
  bool _sending = false;
  String? _formError;

  @override
  void dispose() {
    _remarks.dispose();
    super.dispose();
  }

  Future<void> _chooseDateTime(int minimumHours) async {
    final minimum = DateTime.now().add(Duration(hours: minimumHours));
    final date = await showDatePicker(
        context: context,
        firstDate: DateTime(minimum.year, minimum.month, minimum.day),
        lastDate: minimum.add(const Duration(days: 365)),
        initialDate: minimum);
    if (date == null || !mounted) return;
    final time = await showTimePicker(
        context: context, initialTime: TimeOfDay.fromDateTime(minimum));
    if (time != null) {
      final selected =
          DateTime(date.year, date.month, date.day, time.hour, time.minute);
      if (selected.isBefore(minimum)) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Choose a time at least $minimumHours hours from now.',
              ),
            ),
          );
        }
        return;
      }
      setState(() {
        _scheduled = selected;
        _formError = null;
      });
    }
  }

  Future<void> _respond(String appointmentId, String action) async {
    setState(() => _sending = true);
    try {
      await ref
          .read(parentPortalRepositoryProvider)
          .respondToAppointment(appointmentId, action);
      await ref.read(parentPortalProvider.notifier).refresh();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not update appointment: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _proposeAlternative(ParentAppointmentItem item) async {
    final minimum = DateTime.now().add(const Duration(hours: 24));
    final date = await showDatePicker(
      context: context,
      firstDate: DateTime(minimum.year, minimum.month, minimum.day),
      lastDate: minimum.add(const Duration(days: 365)),
      initialDate: minimum,
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(minimum),
    );
    if (time == null || !mounted) return;
    final proposed =
        DateTime(date.year, date.month, date.day, time.hour, time.minute);
    final note = TextEditingController();
    final send = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Propose another meeting time'),
        content: TextField(
          controller: note,
          maxLength: 500,
          maxLines: 3,
          decoration: InputDecoration(
            labelText: 'Message to teacher',
            helperText: proposed.toString(),
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
    final remarks = note.text;
    note.dispose();
    if (send != true || !mounted) return;
    setState(() => _sending = true);
    try {
      await ref.read(parentPortalRepositoryProvider).respondToAppointment(
            item.id,
            'PROPOSE_ALTERNATIVE',
            alternativeTime: proposed,
            remarks: remarks,
          );
      await ref.read(parentPortalProvider.notifier).refresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('New time proposed. The teacher was notified.'),
        ));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not propose another time: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _editAppointment(
      ParentAppointmentItem item, int minimumHours) async {
    var scheduled = item.scheduledAt?.toLocal() ??
        DateTime.now().add(Duration(hours: minimumHours));
    final reason = TextEditingController(text: item.subject);
    final formKey = GlobalKey<FormState>();
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
              20, 0, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
          child: Form(
            key: formKey,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Edit meeting request',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 16),
                  InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Meeting with',
                      prefixIcon: Icon(Icons.person_outline_rounded),
                    ),
                    child: Text(item.teacher),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () async {
                      final next = await _pickDateTime(scheduled, minimumHours,
                          pickerContext: sheetContext);
                      if (next != null) {
                        setSheetState(() => scheduled = next);
                      }
                    },
                    icon: const Icon(Icons.calendar_month_rounded),
                    label: Text(_dateTimeLabel(scheduled)),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: reason,
                    maxLength: 2000,
                    minLines: 3,
                    maxLines: 5,
                    decoration:
                        const InputDecoration(labelText: 'Reason for meeting'),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'Enter the reason for this meeting.'
                        : null,
                  ),
                  FilledButton.icon(
                    onPressed: () {
                      if (formKey.currentState!.validate()) {
                        Navigator.pop(sheetContext, true);
                      }
                    },
                    icon: const Icon(Icons.save_outlined),
                    label: const Text('Save changes'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    final note = reason.text;
    reason.dispose();
    if (saved != true || !mounted) return;
    setState(() => _sending = true);
    try {
      await ref.read(parentPortalRepositoryProvider).updateAppointment(
            appointmentId: item.id,
            scheduledTime: scheduled,
            remarks: note,
          );
      await ref.read(parentPortalProvider.notifier).refresh();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not update appointment: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<DateTime?> _pickDateTime(DateTime initial, int minimumHours,
      {BuildContext? pickerContext}) async {
    final host = pickerContext ?? context;
    final minimum = DateTime.now().add(Duration(hours: minimumHours));
    final safeInitial = initial.isBefore(minimum) ? minimum : initial;
    final date = await showDatePicker(
      context: host,
      firstDate: DateTime(minimum.year, minimum.month, minimum.day),
      lastDate: minimum.add(const Duration(days: 365)),
      initialDate: safeInitial,
    );
    if (date == null || !host.mounted) return null;
    final time = await showTimePicker(
      context: host,
      initialTime: TimeOfDay.fromDateTime(safeInitial),
    );
    if (time == null) return null;
    final result =
        DateTime(date.year, date.month, date.day, time.hour, time.minute);
    if (result.isBefore(minimum)) return null;
    return result;
  }

  String _dateTimeLabel(DateTime value) {
    final local = value.toLocal();
    final minute = local.minute.toString().padLeft(2, '0');
    return '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}  ${local.hour.toString().padLeft(2, '0')}:$minute';
  }

  Future<void> _cancelAppointment(ParentAppointmentItem item) async {
    final reason = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancel meeting?'),
        content: TextField(
          controller: reason,
          maxLength: 500,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Reason for cancellation (optional)',
          ),
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
    final note = reason.text;
    reason.dispose();
    if (confirmed != true || !mounted) return;
    setState(() => _sending = true);
    try {
      await ref
          .read(parentPortalRepositoryProvider)
          .cancelAppointment(item.id, remarks: note);
      await ref.read(parentPortalProvider.notifier).refresh();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not cancel meeting: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        drawer: ParentNavigation.drawer(context),
        appBar: AppBar(title: const Text('Meetings')),
        bottomNavigationBar: const ParentNavigationBar(selectedIndex: 3),
        body: ParentPortalStateView(
            wrapInScrollView: false,
            builder: (context, portal, child) {
              // The endpoint is already scoped to the selected child. Older
              // payloads may omit the redundant childId, so do not hide valid
              // contacts and leave the meeting page blank.
              final contacts = portal.contacts
                  .where((item) =>
                      item.childId.isEmpty || item.childId == child.id)
                  .toList();
              final selectedId = contacts.any((item) => item.id == _contactId)
                  ? _contactId
                  : (contacts.isEmpty ? null : contacts.first.id);
              return ListView(padding: const EdgeInsets.all(16), children: [
                Card(
                  color: Theme.of(context).colorScheme.primaryContainer,
                  child: const ListTile(
                    leading: Icon(Icons.handshake_outlined),
                    title: Text('Plan a school visit'),
                    subtitle: Text(
                      'Choose the relevant teacher, accounts staff, or branch administrator and request a suitable time.',
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Text('${child.name} · Current appointments',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 12),
                if (portal.appointments
                    .where((item) =>
                        item.childId.isEmpty || item.childId == child.id)
                    .isEmpty)
                  const Card(
                      child: Padding(
                          padding: EdgeInsets.all(20),
                          child: Text('No appointment requests yet.')))
                else
                  for (final item in portal.appointments.where((item) =>
                      item.childId.isEmpty || item.childId == child.id))
                    Card(
                        child: Column(children: [
                      ListTile(
                          leading: const Icon(Icons.event_available_rounded),
                          title: Text(item.teacher),
                          subtitle: Text(
                              '${item.subject}\n${item.requestedTime}${item.responseMessage == null ? '' : '\n${item.responseMessage}'}'),
                          isThreeLine: true,
                          trailing: Chip(label: Text(item.state)),
                          onTap: () => showModalBottomSheet<void>(
                                context: context,
                                isScrollControlled: true,
                                showDragHandle: true,
                                builder: (_) => _AppointmentDetails(item: item),
                              )),
                      if (item.state.toLowerCase() == 'alternative proposed' &&
                          item.proposalFrom == 'TEACHER')
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                          child: Row(children: [
                            Expanded(
                                child: OutlinedButton(
                                    onPressed: _sending
                                        ? null
                                        : () => _respond(
                                            item.id, 'REJECT_ALTERNATIVE'),
                                    child: const Text('Reject'))),
                            const SizedBox(width: 8),
                            Expanded(
                                child: FilledButton(
                                    onPressed: _sending
                                        ? null
                                        : () => _respond(
                                            item.id, 'ACCEPT_ALTERNATIVE'),
                                    child: const Text('Accept time'))),
                            const SizedBox(width: 8),
                            Expanded(
                                child: OutlinedButton(
                                    onPressed: _sending
                                        ? null
                                        : () => _proposeAlternative(item),
                                    child: const Text('Reschedule'))),
                          ]),
                        ),
                      if (item.state.toLowerCase() == 'requested')
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                          child: Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            alignment: WrapAlignment.end,
                            children: [
                              OutlinedButton.icon(
                                onPressed: _sending
                                    ? null
                                    : () => _editAppointment(
                                        item, portal.bookingWindowHours),
                                icon: const Icon(Icons.edit_outlined),
                                label: const Text('Edit request'),
                              ),
                              OutlinedButton.icon(
                                onPressed: _sending
                                    ? null
                                    : () => _cancelAppointment(item),
                                icon: const Icon(Icons.cancel_outlined),
                                label: const Text('Cancel'),
                              ),
                            ],
                          ),
                        ),
                      if (!['requested', 'rejected', 'cancelled']
                          .contains(item.state.toLowerCase()))
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                          child: Align(
                            alignment: Alignment.centerRight,
                            child: TextButton.icon(
                              onPressed: _sending
                                  ? null
                                  : () => _cancelAppointment(item),
                              icon: const Icon(Icons.cancel_outlined),
                              label: const Text('Cancel meeting'),
                            ),
                          ),
                        ),
                      if (item.state.toLowerCase() == 'alternative proposed' &&
                          item.proposalFrom == 'PARENT')
                        const Padding(
                          padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
                          child: Text('Waiting for the teacher to respond.'),
                        ),
                    ])),
                const SizedBox(height: 20),
                Text('Request a new meeting',
                    style: Theme.of(context).textTheme.titleLarge),
                Text(
                  'Requests must be made at least ${portal.bookingWindowHours} hours in advance.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 12),
                const ChildSwitcherBar(),
                const SizedBox(height: 12),
                if (contacts.isEmpty)
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(20),
                      child: Text(
                        'No teaching or accounts staff are currently assigned to this child’s branch.',
                      ),
                    ),
                  ),
                if (contacts.isNotEmpty) ...[
                  DropdownButtonFormField<String>(
                    initialValue: selectedId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Meeting with',
                      prefixIcon: Icon(Icons.person_outline_rounded),
                    ),
                    items: [
                      for (final contact in contacts)
                        DropdownMenuItem(
                          value: contact.id,
                          child: Text('${contact.name} - ${contact.subject}',
                              overflow: TextOverflow.ellipsis),
                        ),
                    ],
                    onChanged: _sending
                        ? null
                        : (value) => setState(() => _contactId = value),
                  ),
                ],
                const SizedBox(height: 12),
                FilledButton.tonalIcon(
                    onPressed: () => _chooseDateTime(portal.bookingWindowHours),
                    icon: const Icon(Icons.schedule_rounded),
                    label: Text(_scheduled == null
                        ? 'Choose preferred date and time'
                        : _scheduled.toString().substring(0, 16))),
                const SizedBox(height: 12),
                TextField(
                    controller: _remarks,
                    onChanged: (_) {
                      if (_formError != null) setState(() => _formError = null);
                    },
                    maxLength: 2000,
                    minLines: 3,
                    maxLines: 5,
                    decoration:
                        const InputDecoration(labelText: 'Reason for meeting')),
                if (_formError != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      _formError!,
                      style:
                          TextStyle(color: Theme.of(context).colorScheme.error),
                    ),
                  ),
                FilledButton.icon(
                    onPressed: selectedId == null ||
                            _scheduled == null ||
                            _sending
                        ? null
                        : () async {
                            if (_remarks.text.trim().isEmpty) {
                              setState(() => _formError =
                                  'Enter the reason for this meeting.');
                              return;
                            }
                            final contact = contacts
                                .firstWhere((item) => item.id == selectedId);
                            setState(() => _sending = true);
                            try {
                              await ref
                                  .read(parentPortalRepositoryProvider)
                                  .requestAppointment(
                                      child: child,
                                      contact: contact,
                                      scheduledTime: _scheduled!,
                                      remarks: _remarks.text);
                              _remarks.clear();
                              setState(() => _scheduled = null);
                              await ref
                                  .read(parentPortalProvider.notifier)
                                  .refresh();
                            } catch (error) {
                              if (mounted) {
                                ScaffoldMessenger.of(this.context).showSnackBar(
                                  SnackBar(
                                      content: Text(
                                          'Could not request appointment: $error')),
                                );
                              }
                            } finally {
                              if (mounted) setState(() => _sending = false);
                            }
                          },
                    icon: const Icon(Icons.event_available_rounded),
                    label: Text(
                        _sending ? 'Requesting…' : 'Send appointment request')),
              ]);
            }),
      );
}

class _AppointmentDetails extends StatelessWidget {
  const _AppointmentDetails({required this.item});
  final ParentAppointmentItem item;

  @override
  Widget build(BuildContext context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(item.teacher,
                  style: Theme.of(context).textTheme.headlineSmall),
              Text(item.subject),
              const SizedBox(height: 16),
              _detail(context, Icons.schedule_outlined, 'Requested time',
                  item.requestedTime),
              if (item.alternativeTime?.isNotEmpty == true)
                _detail(context, Icons.update_rounded, 'Alternative time',
                    item.alternativeTime!),
              _detail(context, Icons.info_outline_rounded, 'Current status',
                  item.state),
              if (item.responseMessage?.isNotEmpty == true)
                _detail(context, Icons.chat_outlined, 'Institution response',
                    item.responseMessage!),
              if (item.participants.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(item.isGroup ? 'Meeting participants' : 'Recipient',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                for (final participant in item.participants)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const CircleAvatar(
                        child: Icon(Icons.person_outline_rounded)),
                    title: Text(participant.name),
                    trailing: Chip(
                        label: Text(participant.approval.replaceAll('_', ' '))),
                  ),
              ],
            ],
          ),
        ),
      );

  Widget _detail(
          BuildContext context, IconData icon, String label, String value) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: Theme.of(context).textTheme.labelMedium),
                  Text(value),
                ],
              ),
            ),
          ],
        ),
      );
}
