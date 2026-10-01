import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';

import '../data/teacher_portal_repository.dart';
import '../models/teacher_portal_dto.dart';
import '../widgets/teacher_navigation.dart';

class TeacherMessagesScreen extends ConsumerStatefulWidget {
  const TeacherMessagesScreen({super.key});
  @override
  ConsumerState<TeacherMessagesScreen> createState() =>
      _TeacherMessagesScreenState();
}

class _TeacherMessagesScreenState extends ConsumerState<TeacherMessagesScreen> {
  final _repository = TeacherPortalRepository();
  final _controller = TextEditingController();
  List<TeacherMessageContact>? _contacts;
  List<TeacherMessageItem>? _messages;
  TeacherMessageContact? _selected;
  String? _error;
  bool _sending = false;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _loadContacts();
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _loadContacts(),
    );
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _loadContacts() async {
    try {
      final contacts = await _repository.fetchMessageContacts();
      contacts.sort((a, b) => (b.lastMessageAt ?? DateTime(1970))
          .compareTo(a.lastMessageAt ?? DateTime(1970)));
      if (!mounted) return;
      final selectedId = _selected == null
          ? null
          : '${_selected!.studentId}:${_selected!.parentId}';
      setState(() {
        _contacts = contacts;
        _error = null;
        _selected = selectedId == null || contacts.isEmpty
            ? null
            : contacts.firstWhere(
                (item) => '${item.studentId}:${item.parentId}' == selectedId,
                orElse: () => contacts.first,
              );
      });
      if (_selected != null) {
        await _select(_selected!);
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _contacts = const [];
          _error = '$error';
        });
      }
    }
  }

  Future<void> _select(TeacherMessageContact contact) async {
    setState(() {
      _selected = contact;
      _messages = null;
      _error = null;
    });
    try {
      final messages = await _repository.fetchMessageThread(contact);
      if (mounted && _selected == contact) {
        setState(() => _messages = messages);
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _messages = const [];
          _error = '$error';
        });
      }
    }
  }

  Future<void> _send() async {
    final contact = _selected;
    final text = _controller.text.trim();
    if (contact == null || text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await _repository.sendMessage(contact, text);
      _controller.clear();
      await _select(contact);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Could not send message: $error')));
      }
    } finally {
      if (mounted) {
        setState(() => _sending = false);
      }
    }
  }

  Future<void> _startNewChat() async {
    try {
      final recipients = await _repository.fetchMessageRecipients();
      if (!mounted) return;
      var query = '';
      final selected = await showModalBottomSheet<TeacherMessageContact>(
        context: context,
        isScrollControlled: true,
        builder: (sheetContext) => StatefulBuilder(
          builder: (context, setSheetState) {
            final filtered = recipients
                .where((item) => item.parentName
                    .toLowerCase()
                    .contains(query.toLowerCase()))
                .toList();
            return SafeArea(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                    20, 16, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
                child: SizedBox(
                  height: MediaQuery.sizeOf(context).height * .65,
                  child: Column(children: [
                    Text('New chat',
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 12),
                    TextField(
                      autofocus: true,
                      decoration: const InputDecoration(
                        prefixIcon: Icon(Icons.search_rounded),
                        hintText: 'Search teachers',
                        border: OutlineInputBorder(),
                      ),
                      onChanged: (value) => setSheetState(() => query = value),
                    ),
                    const SizedBox(height: 8),
                    Expanded(
                      child: filtered.isEmpty
                          ? const Center(
                              child: Text('No eligible teachers found.'))
                          : ListView.builder(
                              itemCount: filtered.length,
                              itemBuilder: (_, index) {
                                final item = filtered[index];
                                return ListTile(
                                  leading: const CircleAvatar(
                                      child: Icon(Icons.person_outline)),
                                  title: Text(item.parentName),
                                  subtitle: const Text('Teacher'),
                                  onTap: () =>
                                      Navigator.pop(sheetContext, item),
                                );
                              },
                            ),
                    ),
                  ]),
                ),
              ),
            );
          },
        ),
      );
      if (selected != null && mounted) await _select(selected);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not load new-chat contacts: $error')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) => TeacherPortalScaffold(
        title: 'Messages',
        body: RefreshIndicator(
          onRefresh: _loadContacts,
          child:
              ListView(padding: const EdgeInsets.all(TmsSpace.md), children: [
            Text('Messages',
                style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 4),
            const Text(
                'Recent conversations stay here. Start a new chat with another teacher when needed.'),
            const SizedBox(height: TmsSpace.md),
            if (_contacts == null)
              const Center(
                  child: Padding(
                      padding: EdgeInsets.all(32),
                      child: CircularProgressIndicator()))
            else
              LayoutBuilder(builder: (context, box) {
                final contacts = _contactCard();
                final thread = _selected == null
                    ? _empty(Icons.forum_outlined, 'Select a conversation',
                        'Choose a recent chat or start a new one.')
                    : _threadCard();
                return box.maxWidth < 760
                    ? (_selected == null ? contacts : thread)
                    : Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                            SizedBox(width: 330, child: contacts),
                            const SizedBox(width: 16),
                            Expanded(child: thread)
                          ]);
              }),
            if (_error != null)
              Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(_error!,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error))),
          ]),
        ),
      );

  Widget _contactCard() => Card(
      child: Padding(
          padding: const EdgeInsets.all(12),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Text('Conversations',
                    style: Theme.of(context).textTheme.titleLarge),
              ),
              IconButton.filledTonal(
                tooltip: 'New chat',
                onPressed: _startNewChat,
                icon: const Icon(Icons.edit_square),
              ),
            ]),
            if (_contacts!.isEmpty)
              _empty(Icons.forum_outlined, 'No recent conversations',
                  'Tap New chat to message another teacher.'),
            for (final contact in _contacts!)
              ListTile(
                selected: contact == _selected,
                leading: const CircleAvatar(child: Icon(Icons.person_outline)),
                title: Text(contact.parentName),
                subtitle: Text('${contact.studentName} · ${contact.gradeName}',
                    maxLines: 2, overflow: TextOverflow.ellipsis),
                trailing: contact.unreadCount > 0
                    ? Badge(label: Text('${contact.unreadCount}'))
                    : null,
                onTap: () => _select(contact),
              ),
          ])));

  Widget _threadCard() {
    final contact = _selected!;
    final ownId = ref.watch(authProvider).user?.id;
    return Card(
        child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(children: [
                    IconButton(
                      tooltip: 'Back to conversations',
                      onPressed: () => setState(() {
                        _selected = null;
                        _messages = null;
                      }),
                      icon: const Icon(Icons.arrow_back_rounded),
                    ),
                    Expanded(
                      child: Text(contact.parentName,
                          style: Theme.of(context).textTheme.titleLarge),
                    ),
                  ]),
                  Text(contact.studentId.isEmpty
                      ? 'Direct teacher conversation'
                      : 'Regarding ${contact.studentName}',
                      style: Theme.of(context).textTheme.bodySmall),
                  const Divider(height: 28),
                  if (_messages == null)
                    const Center(child: CircularProgressIndicator())
                  else if (_messages!.isEmpty)
                    _empty(Icons.chat_bubble_outline, 'No messages yet',
                        'Start a private conversation with this parent.')
                  else
                    for (final message in _messages!)
                      Align(
                        alignment: message.senderId == ownId
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                            constraints: const BoxConstraints(maxWidth: 520),
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                                color: message.senderId == ownId
                                    ? Theme.of(context)
                                        .colorScheme
                                        .primaryContainer
                                    : Theme.of(context)
                                        .colorScheme
                                        .surfaceContainerHighest,
                                borderRadius: BorderRadius.circular(14)),
                            child: Text(message.text)),
                      ),
                  const Divider(height: 28),
                  TextField(
                      controller: _controller,
                      enabled: !_sending,
                      minLines: 2,
                      maxLines: 5,
                      maxLength: 4000,
                      decoration: const InputDecoration(
                          labelText: 'Message',
                          hintText: 'Write a message to the parent…',
                          border: OutlineInputBorder())),
                  Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton.icon(
                          onPressed: _sending ? null : _send,
                          icon: const Icon(Icons.send_rounded),
                          label: Text(_sending ? 'Sending…' : 'Send message'))),
                ])));
  }

  Widget _empty(IconData icon, String title, String message) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 28),
      child: Column(children: [
        Icon(icon, size: 40),
        const SizedBox(height: 8),
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        Text(message, textAlign: TextAlign.center)
      ]));
}
