import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';
import 'package:tms_mobile/shared/widgets/messenger_chat.dart';

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
  final _searchController = TextEditingController();
  List<TeacherMessageContact>? _contacts;
  List<TeacherMessageItem>? _messages;
  TeacherMessageContact? _selected;
  String? _error;
  bool _sending = false;
  String _query = '';
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
    _searchController.dispose();
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
                .where((item) =>
                    item.parentName.toLowerCase().contains(query.toLowerCase()))
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
                        hintText: 'Search parents',
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
                                  subtitle: Text(item.studentId.isEmpty
                                      ? 'School colleague'
                                      : 'Parent of ${item.studentName}'),
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
        body: Padding(
          padding: const EdgeInsets.all(TmsSpace.md),
          child: _contacts == null
              ? const Center(child: CircularProgressIndicator())
              : LayoutBuilder(builder: (context, box) {
                  final compact = box.maxWidth < 760;
                  final contacts = _contactCard();
                  final thread = _selected == null
                      ? _empty(Icons.forum_outlined, 'Your messages',
                          'Choose a conversation or start a new chat.')
                      : _threadCard(compact: compact);
                  if (compact) return _selected == null ? contacts : thread;
                  return Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 1180),
                      child: Container(
                        decoration: BoxDecoration(
                          color: kColorBg,
                          border: Border.all(color: kColorDivider),
                          borderRadius: BorderRadius.circular(TmsRadius.r8),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: Row(children: [
                          SizedBox(width: 340, child: contacts),
                          const VerticalDivider(width: 1),
                          Expanded(child: thread),
                        ]),
                      ),
                    ),
                  );
                }),
        ),
      );

  Widget _contactCard() {
    final contacts = _contacts!.where((contact) {
      final value =
          '${contact.parentName} ${contact.studentName} ${contact.gradeName} ${contact.lastMessage}'
              .toLowerCase();
      return value.contains(_query.toLowerCase());
    }).toList();
    return ColoredBox(
      color: kColorBg,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 10, 10),
          child: Column(children: [
            Row(children: [
              Expanded(
                child: Text('Conversations',
                    style: Theme.of(context).textTheme.titleLarge),
              ),
              IconButton.filledTonal(
                tooltip: 'New chat',
                onPressed: _startNewChat,
                icon: const Icon(Icons.edit_rounded),
              ),
            ]),
            const SizedBox(height: 8),
            TextField(
              controller: _searchController,
              onChanged: (value) => setState(() => _query = value),
              decoration: const InputDecoration(
                hintText: 'Search conversations',
                prefixIcon: Icon(Icons.search_rounded),
                isDense: true,
              ),
            ),
          ]),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadContacts,
            child: contacts.isEmpty
                ? ListView(children: [
                    _empty(
                        Icons.forum_outlined,
                        'No conversations',
                        _query.isEmpty
                            ? 'Start a chat with a parent or colleague.'
                            : 'No conversations match your search.'),
                  ])
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    itemCount: contacts.length,
                    itemBuilder: (context, index) {
                      final contact = contacts[index];
                      final contextLabel = contact.studentId.isEmpty
                          ? 'School colleague'
                          : '${contact.studentName} - ${contact.gradeName}';
                      return ConversationTile(
                        name: contact.parentName,
                        preview: contact.lastMessage.isEmpty
                            ? contextLabel
                            : contact.lastMessage,
                        time: compactChatTime(contact.lastMessageAt),
                        unreadCount: contact.unreadCount,
                        selected: contact == _selected,
                        onTap: () => _select(contact),
                      );
                    },
                  ),
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(_error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ),
      ]),
    );
  }

  Widget _threadCard({required bool compact}) {
    final contact = _selected!;
    final ownId = ref.watch(authProvider).user?.id;
    final messages = _messages;
    return ColoredBox(
      color: kColorBg,
      child: Column(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
          decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: kColorDivider))),
          child: Row(children: [
            if (compact)
              IconButton(
                tooltip: 'Back to conversations',
                onPressed: () => setState(() {
                  _selected = null;
                  _messages = null;
                }),
                icon: const Icon(Icons.arrow_back_rounded),
              ),
            ChatAvatar(name: contact.parentName, size: 42),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(contact.parentName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(
                      contact.studentId.isEmpty
                          ? 'School colleague'
                          : 'Parent of ${contact.studentName}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Refresh conversation',
              onPressed: () => _select(contact),
              icon: const Icon(Icons.refresh_rounded),
            ),
          ]),
        ),
        Expanded(
          child: messages == null
              ? const Center(child: CircularProgressIndicator())
              : messages.isEmpty
                  ? _empty(Icons.waving_hand_outlined, 'Say hello',
                      'Start a private conversation with ${contact.parentName}.')
                  : ListView.builder(
                      reverse: true,
                      padding: const EdgeInsets.fromLTRB(14, 18, 14, 12),
                      itemCount: messages.length,
                      itemBuilder: (context, reverseIndex) {
                        final index = messages.length - 1 - reverseIndex;
                        final message = messages[index];
                        final own = message.senderId == ownId;
                        final nextIsSame = index < messages.length - 1 &&
                            (messages[index + 1].senderId == ownId) == own;
                        return ChatBubble(
                          text: message.text,
                          own: own,
                          time: compactChatTime(message.createdAt),
                          senderName: contact.parentName,
                          showAvatar: !nextIsSame,
                        );
                      },
                    ),
        ),
        ChatComposer(
          controller: _controller,
          sending: _sending,
          hintText: 'Message ${contact.parentName}',
          onSend: _send,
        ),
      ]),
    );
  }

  Widget _empty(IconData icon, String title, String message) => Center(
      child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 40, color: kColorPrimary),
            const SizedBox(height: 8),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(message,
                textAlign: TextAlign.center,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: kColorMutedText))
          ])));
}
