import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
    if (time != null)
      setState(() => _scheduled =
          DateTime(date.year, date.month, date.day, time.hour, time.minute));
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

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Appointments')),
        bottomNavigationBar: const ParentNavigationBar(selectedIndex: 3),
        body: ParentPortalStateView(builder: (context, portal, child) {
          final contacts = portal.contacts
              .where((item) => item.childId == child.id)
              .toList();
          final selectedId = contacts.any((item) => item.id == _contactId)
              ? _contactId
              : (contacts.isEmpty ? null : contacts.first.id);
          return ListView(padding: const EdgeInsets.all(16), children: [
            Text('${child.name} appointments',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            if (portal.appointments
                .where((item) => item.childId == child.id)
                .isEmpty)
              const Card(
                  child: Padding(
                      padding: EdgeInsets.all(20),
                      child: Text('No appointment requests yet.')))
            else
              for (final item in portal.appointments
                  .where((item) => item.childId == child.id))
                Card(
                    child: Column(children: [
                  ListTile(
                      leading: const Icon(Icons.event_available_rounded),
                      title: Text(item.teacher),
                      subtitle: Text(
                          '${item.subject}\n${item.requestedTime}${item.responseMessage == null ? '' : '\n${item.responseMessage}'}'),
                      isThreeLine: true,
                      trailing: Chip(label: Text(item.state))),
                  if (item.state.toLowerCase() == 'alternative proposed')
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: Row(children: [
                        Expanded(
                            child: OutlinedButton(
                                onPressed: _sending
                                    ? null
                                    : () =>
                                        _respond(item.id, 'REJECT_ALTERNATIVE'),
                                child: const Text('Reject'))),
                        const SizedBox(width: 8),
                        Expanded(
                            child: FilledButton(
                                onPressed: _sending
                                    ? null
                                    : () =>
                                        _respond(item.id, 'ACCEPT_ALTERNATIVE'),
                                child: const Text('Accept time'))),
                      ]),
                    ),
                ])),
            const SizedBox(height: 20),
            Text('Request an appointment',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
                initialValue: selectedId,
                decoration: const InputDecoration(labelText: 'Meet with'),
                items: contacts
                    .map((item) => DropdownMenuItem(
                        value: item.id, child: Text(item.name)))
                    .toList(),
                onChanged: (value) => setState(() => _contactId = value)),
            const SizedBox(height: 12),
            OutlinedButton.icon(
                onPressed: () => _chooseDateTime(portal.bookingWindowHours),
                icon: const Icon(Icons.schedule_rounded),
                label: Text(_scheduled == null
                    ? 'Choose preferred time'
                    : _scheduled.toString().substring(0, 16))),
            const SizedBox(height: 12),
            TextField(
                controller: _remarks,
                maxLength: 2000,
                minLines: 3,
                maxLines: 5,
                decoration:
                    const InputDecoration(labelText: 'Reason for meeting')),
            FilledButton.icon(
                onPressed: selectedId == null || _scheduled == null || _sending
                    ? null
                    : () async {
                        if (_remarks.text.trim().isEmpty) return;
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
                            ScaffoldMessenger.of(context).showSnackBar(
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
