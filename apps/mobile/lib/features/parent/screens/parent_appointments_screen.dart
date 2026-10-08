import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/shared/widgets/meeting_schedule_fields.dart';

import '../models/parent_portal.dart';
import '../viewmodels/parent_portal_viewmodel.dart';
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
  bool _showHistory = false;
  String? _formError;

  @override
  void dispose() {
    _remarks.dispose();
    super.dispose();
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
    final scheduled = item.scheduledAt?.toLocal() ??
        DateTime.now().add(Duration(hours: minimumHours));
    final edit = await showModalBottomSheet<_ParentMeetingEdit>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => _ParentMeetingEditSheet(
        teacher: item.teacher,
        initialScheduled: scheduled,
        initialReason: item.subject,
        earliest: DateTime.now().add(Duration(hours: minimumHours)),
      ),
    );
    if (edit == null || !mounted) return;
    setState(() => _sending = true);
    try {
      await ref.read(parentPortalRepositoryProvider).updateAppointment(
            appointmentId: item.id,
            scheduledTime: edit.scheduled,
            remarks: edit.reason,
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
        appBar: AppBar(
          leading: _showHistory
              ? BackButton(
                  onPressed: () => setState(() => _showHistory = false))
              : null,
          title: Text(_showHistory ? 'Meeting history' : 'Meetings'),
          actions: [
            if (!_showHistory)
              IconButton(
                tooltip: 'Meeting history',
                onPressed: () => setState(() => _showHistory = true),
                icon: const Icon(Icons.history_rounded),
              ),
          ],
        ),
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
              final selectedContact = selectedId == null
                  ? null
                  : contacts.firstWhere((item) => item.id == selectedId);
              return ListView(padding: const EdgeInsets.all(16), children: [
                if (!_showHistory) ...[
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
                ],
                if (_showHistory) ...[
                  Text('${child.name} · Meeting history',
                      style: Theme.of(context).textTheme.titleLarge),
                  Text(
                    'Approved, pending, completed, and past meeting requests.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
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
                                  builder: (_) =>
                                      _AppointmentDetails(item: item),
                                )),
                        if (item.state.toLowerCase() ==
                                'alternative proposed' &&
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
                                  icon:
                                      const Icon(Icons.edit_calendar_outlined),
                                  label: const Text('Reschedule'),
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
                        if (!['requested', 'rejected', 'cancelled', 'completed']
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
                        if (item.state.toLowerCase() ==
                                'alternative proposed' &&
                            item.proposalFrom == 'PARENT')
                          const Padding(
                            padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
                            child: Text('Waiting for the teacher to respond.'),
                          ),
                      ])),
                ],
                if (!_showHistory) ...[
                  Text('Request a meeting for ${child.name}',
                      style: Theme.of(context).textTheme.titleLarge),
                  Text(
                    'Requests must be made at least ${portal.bookingWindowHours} hours in advance.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
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
                    InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: _sending
                          ? null
                          : () async {
                              final contactId =
                                  await showModalBottomSheet<String>(
                                context: context,
                                isScrollControlled: true,
                                showDragHandle: true,
                                useSafeArea: true,
                                builder: (_) => _MeetingContactPicker(
                                  contacts: contacts,
                                  selectedId: selectedId,
                                ),
                              );
                              if (contactId != null && mounted) {
                                setState(() => _contactId = contactId);
                              }
                            },
                      child: InputDecorator(
                        decoration: const InputDecoration(
                          labelText: 'Meeting with',
                          prefixIcon: Icon(Icons.person_outline_rounded),
                          suffixIcon: Icon(Icons.search_rounded),
                        ),
                        child: Text(
                          '${selectedContact!.name} - ${selectedContact.subject}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  MeetingScheduleFields(
                    reasonController: _remarks,
                    scheduled: _scheduled,
                    earliest: DateTime.now()
                        .add(Duration(hours: portal.bookingWindowHours)),
                    onScheduledChanged: (value) => setState(() {
                      _scheduled = value;
                      _formError = null;
                    }),
                    actionLabel: 'Book',
                    busy: _sending,
                    reasonError: _formError,
                    onReasonChanged: (_) {
                      if (_formError != null) {
                        setState(() => _formError = null);
                      }
                    },
                    onAction: selectedId == null || _scheduled == null
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
                  ),
                ],
              ]);
            }),
      );
}

class _ParentMeetingEdit {
  const _ParentMeetingEdit({required this.scheduled, required this.reason});
  final DateTime scheduled;
  final String reason;
}

class _MeetingContactPicker extends StatefulWidget {
  const _MeetingContactPicker({
    required this.contacts,
    required this.selectedId,
  });

  final List<ParentContact> contacts;
  final String? selectedId;

  @override
  State<_MeetingContactPicker> createState() => _MeetingContactPickerState();
}

class _MeetingContactPickerState extends State<_MeetingContactPicker> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = _query.trim().toLowerCase();
    final matches = widget.contacts.where((contact) {
      if (query.isEmpty) return true;
      return '${contact.name} ${contact.subject} ${contact.role}'
          .toLowerCase()
          .contains(query);
    }).toList();
    return FractionallySizedBox(
      heightFactor: .72,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          16,
          0,
          16,
          MediaQuery.viewInsetsOf(context).bottom + 16,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Select a person',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            TextField(
              controller: _search,
              autofocus: true,
              onChanged: (value) => setState(() => _query = value),
              decoration: InputDecoration(
                labelText: 'Search by name, subject, or role',
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: _query.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        onPressed: () {
                          _search.clear();
                          setState(() => _query = '');
                        },
                        icon: const Icon(Icons.close_rounded),
                      ),
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: matches.isEmpty
                  ? const Center(child: Text('No matching people found.'))
                  : ListView.separated(
                      itemCount: matches.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final contact = matches[index];
                        final selected = contact.id == widget.selectedId;
                        return ListTile(
                          selected: selected,
                          leading: CircleAvatar(
                            child: Text(contact.initials.isEmpty
                                ? (contact.name.isEmpty
                                    ? '?'
                                    : contact.name
                                        .substring(0, 1)
                                        .toUpperCase())
                                : contact.initials),
                          ),
                          title: Text(contact.name),
                          subtitle:
                              Text('${contact.subject} · ${contact.role}'),
                          trailing: selected
                              ? const Icon(Icons.check_circle_rounded)
                              : null,
                          onTap: () => Navigator.pop(context, contact.id),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ParentMeetingEditSheet extends StatefulWidget {
  const _ParentMeetingEditSheet({
    required this.teacher,
    required this.initialScheduled,
    required this.initialReason,
    required this.earliest,
  });

  final String teacher;
  final DateTime initialScheduled;
  final String initialReason;
  final DateTime earliest;

  @override
  State<_ParentMeetingEditSheet> createState() =>
      _ParentMeetingEditSheetState();
}

class _ParentMeetingEditSheetState extends State<_ParentMeetingEditSheet> {
  late final TextEditingController _reason;
  late DateTime _scheduled;
  String? _error;

  @override
  void initState() {
    super.initState();
    _reason = TextEditingController(text: widget.initialReason);
    _scheduled = widget.initialScheduled.isBefore(widget.earliest)
        ? widget.earliest
        : widget.initialScheduled;
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  void _save() {
    if (_reason.text.trim().isEmpty) {
      setState(() => _error = 'Enter the reason for this meeting.');
      return;
    }
    Navigator.pop(
      context,
      _ParentMeetingEdit(
        scheduled: _scheduled,
        reason: _reason.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          0,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 20,
        ),
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
              child: Text(widget.teacher),
            ),
            const SizedBox(height: 12),
            MeetingScheduleFields(
              reasonController: _reason,
              scheduled: _scheduled,
              earliest: widget.earliest,
              onScheduledChanged: (value) => setState(() => _scheduled = value),
              actionLabel: 'Save',
              onAction: _save,
              reasonError: _error,
              onReasonChanged: (_) {
                if (_error != null) setState(() => _error = null);
              },
            ),
          ],
        ),
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
