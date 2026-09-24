import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';

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
  String? _contactId;
  bool _sending = false;

  @override
  void dispose() {
    _text.dispose();
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
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Message sent.')),
        );
      }
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

  @override
  Widget build(BuildContext context) => Scaffold(
        drawer: ParentNavigation.drawer(context),
        appBar: AppBar(title: const Text('Messages')),
        bottomNavigationBar: const ParentNavigationBar(selectedIndex: 2),
        body: ParentPortalStateView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          builder: (context, portal, child) {
            // The parent endpoint is already scoped to the selected child.
            // Do not discard contacts/messages when older payloads omit the
            // redundant childId field.
            final sourceContacts = portal.contacts;
            final contacts = [...sourceContacts]
              ..sort((a, b) => a.role.compareTo(b.role));
            final selected =
                sourceContacts.where((item) => item.id == _contactId);
            final contact = selected.isNotEmpty
                ? selected.first
                : (sourceContacts.isEmpty ? null : sourceContacts.first);
            final thread = contact == null
                ? const <ParentMessageItem>[]
                : portal.messages
                    .where((message) => message.teacherId == contact.id)
                    .toList();
            return Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1180),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const ChildSwitcherBar(),
                    const SizedBox(height: TmsSpace.md),
                    _PrivacyNotice(child: child),
                    const SizedBox(height: TmsSpace.md),
                    LayoutBuilder(builder: (context, constraints) {
                      final contactList = _ContactList(
                        contacts: contacts,
                        selectedId: contact?.id,
                        onSelect: (id) => setState(() => _contactId = id),
                      );
                      final conversation = _Conversation(
                        child: child,
                        contact: contact,
                        messages: thread,
                        controller: _text,
                        sending: _sending,
                        onSend: contact == null
                            ? null
                            : () => _send(child, contact),
                      );
                      if (constraints.maxWidth < 760) {
                        return Column(children: [
                          contactList,
                          const SizedBox(height: TmsSpace.md),
                          conversation,
                        ]);
                      }
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SizedBox(width: 330, child: contactList),
                          const SizedBox(width: TmsSpace.md),
                          Expanded(child: conversation),
                        ],
                      );
                    }),
                  ],
                ),
              ),
            );
          },
        ),
      );
}

class _PrivacyNotice extends StatelessWidget {
  const _PrivacyNotice({required this.child});
  final ParentChild child;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(TmsSpace.md),
        decoration: BoxDecoration(
          color: kColorPrimary.withValues(alpha: .07),
          borderRadius: BorderRadius.circular(TmsRadius.card),
        ),
        child: Row(children: [
          const Icon(Icons.shield_outlined, color: kColorPrimary),
          const SizedBox(width: TmsSpace.sm),
          Expanded(
            child: Text(
              'Privacy scoped to ${child.name}. Only authorized teaching, accounts, and branch staff are available; sibling conversations stay separate.',
            ),
          ),
        ]),
      );
}

class _ContactList extends StatelessWidget {
  const _ContactList({
    required this.contacts,
    required this.selectedId,
    required this.onSelect,
  });
  final List<ParentContact> contacts;
  final String? selectedId;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final teachers = contacts.where((item) => item.role == 'TEACHER').length;
    final admins = contacts.where((item) => item.role == 'BRANCH_ADMIN').length;
    final staff = contacts.where((item) => item.role == 'STAFF').length;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(TmsSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Authorized contacts',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 3),
          Text(
              '$teachers assigned teacher${teachers == 1 ? '' : 's'} · $staff staff · $admins branch support',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: kColorMutedText)),
          const SizedBox(height: TmsSpace.sm),
          if (contacts.isEmpty)
            const _MessageEmpty(
              icon: Icons.person_off_outlined,
              title: 'No authorized contacts',
              message:
                  'Teacher and branch contacts appear after class assignment.',
            )
          else
            for (final contact in contacts)
              Material(
                color: contact.id == selectedId
                    ? kColorPrimary.withValues(alpha: .07)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(TmsRadius.control),
                child: ListTile(
                  selected: contact.id == selectedId,
                  leading: CircleAvatar(
                    backgroundColor: kColorPrimary.withValues(alpha: .1),
                    foregroundColor: kColorPrimary,
                    child: Text(contact.initials.isEmpty
                        ? (contact.name.isEmpty ? '?' : contact.name[0])
                        : contact.initials),
                  ),
                  title: Text(contact.name),
                  subtitle: Text(contact.role == 'BRANCH_ADMIN'
                      ? 'Branch support'
                      : contact.role == 'STAFF'
                          ? contact.subject
                          : 'Assigned teacher · ${contact.subject}'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => onSelect(contact.id),
                ),
              ),
        ]),
      ),
    );
  }
}

class _Conversation extends StatelessWidget {
  const _Conversation({
    required this.child,
    required this.contact,
    required this.messages,
    required this.controller,
    required this.sending,
    required this.onSend,
  });
  final ParentChild child;
  final ParentContact? contact;
  final List<ParentMessageItem> messages;
  final TextEditingController controller;
  final bool sending;
  final VoidCallback? onSend;

  @override
  Widget build(BuildContext context) => Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(TmsSpace.md),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(contact?.name ?? 'Conversation',
                style: Theme.of(context).textTheme.titleLarge),
            if (contact != null)
              Text('${contact!.subject} · regarding ${child.name}',
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: kColorMutedText)),
            const SizedBox(height: TmsSpace.md),
            if (messages.isEmpty)
              const _MessageEmpty(
                icon: Icons.forum_outlined,
                title: 'No messages yet',
                message: 'Messages remain in this child-and-contact thread.',
              )
            else
              for (final message in messages)
                _MessageBubble(message: message, contact: contact),
            const Divider(height: TmsSpace.lg),
            Text('Message about ${child.name}',
                style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: TmsSpace.xs),
            TextField(
              controller: controller,
              enabled: contact != null && !sending,
              maxLength: 4000,
              minLines: 3,
              maxLines: 6,
              decoration: InputDecoration(
                hintText: contact == null
                    ? 'No eligible contact selected'
                    : 'Write a private message…',
                border: const OutlineInputBorder(),
              ),
            ),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(
                onPressed: onSend == null || sending ? null : onSend,
                icon: const Icon(Icons.send_rounded),
                label: Text(sending ? 'Sending…' : 'Send message'),
              ),
            ),
          ]),
        ),
      );
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, required this.contact});
  final ParentMessageItem message;
  final ParentContact? contact;

  @override
  Widget build(BuildContext context) {
    final own = message.sender == 'Parent';
    return Align(
      alignment: own ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 520),
        margin: const EdgeInsets.only(bottom: TmsSpace.sm),
        padding: const EdgeInsets.all(TmsSpace.sm),
        decoration: BoxDecoration(
          color: own ? kColorPrimary.withValues(alpha: .1) : kColorSurface,
          borderRadius: BorderRadius.circular(TmsRadius.card),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(own ? 'You' : contact?.name ?? message.sender,
              style: Theme.of(context).textTheme.labelMedium),
          const SizedBox(height: 3),
          Text(message.text),
          const SizedBox(height: 3),
          Text(message.time,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: kColorMutedText)),
        ]),
      ),
    );
  }
}

class _MessageEmpty extends StatelessWidget {
  const _MessageEmpty({
    required this.icon,
    required this.title,
    required this.message,
  });
  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: TmsSpace.lg),
        child: Column(children: [
          Icon(icon, size: 38, color: kColorPrimary),
          const SizedBox(height: TmsSpace.xs),
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 3),
          Text(message,
              textAlign: TextAlign.center,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: kColorMutedText)),
        ]),
      );
}
