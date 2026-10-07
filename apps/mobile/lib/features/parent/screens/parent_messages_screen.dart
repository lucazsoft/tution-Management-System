import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';
import 'package:tms_mobile/shared/widgets/messenger_chat.dart';

import '../models/parent_portal.dart';
import '../viewmodels/parent_portal_viewmodel.dart';
import '../widgets/child_switcher_bar.dart';
import '../widgets/parent_navigation.dart';
import '../widgets/parent_portal_state_view.dart';

class ParentMessagesScreen extends ConsumerStatefulWidget {
  const ParentMessagesScreen({super.key});

  @override
  ConsumerState<ParentMessagesScreen> createState() =>
      _ParentMessagesScreenState();
}

class _ParentMessagesScreenState extends ConsumerState<ParentMessagesScreen> {
  final _text = TextEditingController();
  final _search = TextEditingController();
  String? _contactId;
  String _query = '';
  bool _sending = false;

  @override
  void dispose() {
    _text.dispose();
    _search.dispose();
    super.dispose();
  }

  Future<void> _send(ParentChild child, ParentContact contact) async {
    final text = _text.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(parentPortalRepositoryProvider).sendMessage(
            studentId: child.id,
            receiverId: contact.id,
            text: text,
          );
      _text.clear();
      await ref.read(parentPortalProvider.notifier).refresh();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not send message: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _startNewChat(List<ParentContact> contacts) async {
    var query = '';
    final selected = await showModalBottomSheet<ParentContact>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          final filtered = contacts.where((contact) {
            final value = '${contact.name} ${contact.subject}'.toLowerCase();
            return value.contains(query.toLowerCase());
          }).toList();
          return SafeArea(
            child: SizedBox(
              height: MediaQuery.sizeOf(context).height * .65,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
                child: Column(children: [
                  Text('New chat',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 12),
                  TextField(
                    autofocus: true,
                    onChanged: (value) => setSheetState(() => query = value),
                    decoration: const InputDecoration(
                      hintText: 'Search contacts',
                      prefixIcon: Icon(Icons.search_rounded),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Expanded(
                    child: filtered.isEmpty
                        ? const Center(child: Text('No contacts found.'))
                        : ListView.builder(
                            itemCount: filtered.length,
                            itemBuilder: (context, index) {
                              final contact = filtered[index];
                              return ListTile(
                                leading: ChatAvatar(name: contact.name),
                                title: Text(contact.name),
                                subtitle: Text(contact.subject),
                                onTap: () =>
                                    Navigator.pop(sheetContext, contact),
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
    if (selected != null && mounted) {
      setState(() => _contactId = selected.id);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        drawer: ParentNavigation.drawer(context),
        appBar: AppBar(title: const Text('Messages')),
        bottomNavigationBar: const ParentNavigationBar(selectedIndex: 2),
        body: ParentPortalStateView(
          wrapInScrollView: false,
          builder: (context, portal, child) {
            final latestByContact = <String, ParentMessageItem>{};
            for (final message in portal.messages) {
              final current = latestByContact[message.teacherId];
              if (current == null ||
                  (message.occurredAt ?? DateTime(1970))
                      .isAfter(current.occurredAt ?? DateTime(1970))) {
                latestByContact[message.teacherId] = message;
              }
            }
            final contacts = portal.contacts.toList()
              ..sort((a, b) {
                final aTime =
                    latestByContact[a.id]?.occurredAt ?? DateTime(1970);
                final bTime =
                    latestByContact[b.id]?.occurredAt ?? DateTime(1970);
                return bTime.compareTo(aTime);
              });
            final selected = contacts.where((item) => item.id == _contactId);
            final contact = selected.isNotEmpty ? selected.first : null;
            final thread = contact == null
                ? <ParentMessageItem>[]
                : portal.messages
                    .where((message) => message.teacherId == contact.id)
                    .toList();
            thread.sort((a, b) => (a.occurredAt ?? DateTime(1970))
                .compareTo(b.occurredAt ?? DateTime(1970)));

            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1180),
                  child: Column(children: [
                    const ChildSwitcherBar(),
                    const SizedBox(height: 10),
                    Expanded(
                      child: LayoutBuilder(builder: (context, constraints) {
                        final isCompact = constraints.maxWidth < 760;
                        final list = _conversationList(
                          contacts,
                          latestByContact,
                          contact?.id,
                        );
                        final conversation = _conversation(
                          child,
                          contact,
                          thread,
                          compact: isCompact,
                        );
                        if (isCompact) {
                          return contact == null ? list : conversation;
                        }
                        final desktopContact = contact ??
                            (contacts.isEmpty ? null : contacts.first);
                        final desktopThread = desktopContact == null
                            ? <ParentMessageItem>[]
                            : portal.messages
                                .where((m) => m.teacherId == desktopContact.id)
                                .toList();
                        desktopThread.sort((a, b) =>
                            (a.occurredAt ?? DateTime(1970))
                                .compareTo(b.occurredAt ?? DateTime(1970)));
                        return Container(
                          decoration: BoxDecoration(
                            color: kColorBg,
                            border: Border.all(color: kColorDivider),
                            borderRadius: BorderRadius.circular(TmsRadius.r8),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: Row(children: [
                            SizedBox(width: 340, child: list),
                            const VerticalDivider(width: 1),
                            Expanded(
                              child: _conversation(
                                child,
                                desktopContact,
                                desktopThread,
                                compact: false,
                              ),
                            ),
                          ]),
                        );
                      }),
                    ),
                  ]),
                ),
              ),
            );
          },
        ),
      );

  Widget _conversationList(
    List<ParentContact> contacts,
    Map<String, ParentMessageItem> latest,
    String? selectedId,
  ) {
    final filtered = contacts.where((contact) {
      final haystack = '${contact.name} ${contact.subject}'.toLowerCase();
      return haystack.contains(_query.toLowerCase());
    }).toList();
    return ColoredBox(
      color: kColorBg,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Text('Recent chats',
                    style: Theme.of(context).textTheme.titleLarge),
              ),
              FilledButton.tonalIcon(
                onPressed: () => _startNewChat(contacts),
                icon: const Icon(Icons.edit_rounded, size: 18),
                label: const Text('New chat'),
              ),
            ]),
            const SizedBox(height: 10),
            TextField(
              controller: _search,
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
          child: filtered.isEmpty
              ? _empty(
                  Icons.forum_outlined,
                  'No conversations',
                  _query.isEmpty
                      ? 'Teacher conversations appear here after the first message.'
                      : 'No conversations match your search.')
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  itemCount: filtered.length,
                  itemBuilder: (context, index) {
                    final contact = filtered[index];
                    final message = latest[contact.id];
                    return ConversationTile(
                      name: contact.name,
                      preview: message?.text ?? contact.subject,
                      time: compactChatTime(message?.occurredAt),
                      selected: contact.id == selectedId,
                      onTap: () => setState(() => _contactId = contact.id),
                    );
                  },
                ),
        ),
      ]),
    );
  }

  Widget _conversation(
    ParentChild child,
    ParentContact? contact,
    List<ParentMessageItem> messages, {
    required bool compact,
  }) {
    if (contact == null) {
      return ColoredBox(
        color: kColorBg,
        child: _empty(Icons.chat_bubble_outline_rounded, 'Your messages',
            'Select a conversation to start chatting.'),
      );
    }
    return ColoredBox(
      color: kColorBg,
      child: Column(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: kColorDivider)),
          ),
          child: Row(children: [
            if (compact)
              IconButton(
                tooltip: 'Back to conversations',
                onPressed: () => setState(() => _contactId = null),
                icon: const Icon(Icons.arrow_back_rounded),
              ),
            ChatAvatar(name: contact.name, size: 42),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(contact.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text('${contact.subject} - regarding ${child.name}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: kColorMutedText)),
                ],
              ),
            ),
          ]),
        ),
        Expanded(
          child: messages.isEmpty
              ? _empty(Icons.waving_hand_outlined, 'Say hello',
                  'Send a message about ${child.name}.')
              : ListView.builder(
                  reverse: true,
                  padding: const EdgeInsets.fromLTRB(14, 18, 14, 12),
                  itemCount: messages.length,
                  itemBuilder: (context, reverseIndex) {
                    final index = messages.length - 1 - reverseIndex;
                    final message = messages[index];
                    final own = message.sender.toLowerCase() == 'parent';
                    final nextIsSame = index < messages.length - 1 &&
                        (messages[index + 1].sender.toLowerCase() ==
                                'parent') ==
                            own;
                    return ChatBubble(
                      text: message.text,
                      own: own,
                      time: message.time,
                      senderName: contact.name,
                      showAvatar: !nextIsSame,
                    );
                  },
                ),
        ),
        ChatComposer(
          controller: _text,
          sending: _sending,
          hintText: 'Message about ${child.name}',
          onSend: () => _send(child, contact),
        ),
      ]),
    );
  }

  Widget _empty(IconData icon, String title, String message) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 38, color: kColorPrimary),
            const SizedBox(height: 10),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(message,
                textAlign: TextAlign.center,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: kColorMutedText)),
          ]),
        ),
      );
}
