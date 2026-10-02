import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';

class ChatAvatar extends StatelessWidget {
  const ChatAvatar({
    super.key,
    required this.name,
    this.size = 44,
    this.online = false,
  });

  final String name;
  final double size;
  final bool online;

  String get _initials {
    final words = name.trim().split(RegExp(r'\s+'));
    if (words.isEmpty || words.first.isEmpty) return '?';
    return words.take(2).map((word) => word[0].toUpperCase()).join();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        width: size,
        height: size,
        child: Stack(children: [
          CircleAvatar(
            radius: size / 2,
            backgroundColor: kColorPrimary.withValues(alpha: .1),
            foregroundColor: kColorPrimary,
            child: Text(_initials,
                style: TextStyle(
                    fontSize: size * .34, fontWeight: FontWeight.w700)),
          ),
          if (online)
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                width: size * .27,
                height: size * .27,
                decoration: BoxDecoration(
                  color: kColorSuccess,
                  shape: BoxShape.circle,
                  border: Border.all(color: kColorBg, width: 2),
                ),
              ),
            ),
        ]),
      );
}

class ConversationTile extends StatelessWidget {
  const ConversationTile({
    super.key,
    required this.name,
    required this.preview,
    required this.onTap,
    this.time,
    this.selected = false,
    this.unreadCount = 0,
  });

  final String name;
  final String preview;
  final String? time;
  final bool selected;
  final int unreadCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: selected
            ? kColorPrimary.withValues(alpha: .08)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(TmsRadius.r8),
        child: InkWell(
          borderRadius: BorderRadius.circular(TmsRadius.r8),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            child: Row(children: [
              ChatAvatar(name: name),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Expanded(
                        child: Text(name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style:
                                const TextStyle(fontWeight: FontWeight.w700)),
                      ),
                      if (time != null && time!.isNotEmpty)
                        Text(time!,
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(color: kColorMutedText)),
                    ]),
                    const SizedBox(height: 2),
                    Row(children: [
                      Expanded(
                        child: Text(preview,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(
                                    fontWeight: unreadCount > 0
                                        ? FontWeight.w700
                                        : FontWeight.w400)),
                      ),
                      if (unreadCount > 0) ...[
                        const SizedBox(width: 8),
                        Badge(label: Text('$unreadCount')),
                      ],
                    ]),
                  ],
                ),
              ),
            ]),
          ),
        ),
      );
}

class ChatBubble extends StatelessWidget {
  const ChatBubble({
    super.key,
    required this.text,
    required this.own,
    this.time,
    this.showAvatar = false,
    this.senderName = '',
    this.sent = true,
  });

  final String text;
  final bool own;
  final String? time;
  final bool showAvatar;
  final String senderName;
  final bool sent;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 3),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisAlignment:
              own ? MainAxisAlignment.end : MainAxisAlignment.start,
          children: [
            if (!own) ...[
              if (showAvatar)
                ChatAvatar(name: senderName, size: 28)
              else
                const SizedBox(width: 28),
              const SizedBox(width: 7),
            ],
            Flexible(
              child: Container(
                constraints: const BoxConstraints(maxWidth: 520),
                padding:
                    const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
                decoration: BoxDecoration(
                  color: own
                      ? kColorPrimary
                      : Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(18),
                    topRight: const Radius.circular(18),
                    bottomLeft: Radius.circular(!own && showAvatar ? 4 : 18),
                    bottomRight: Radius.circular(own && showAvatar ? 4 : 18),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(text,
                        style: TextStyle(
                            color: own ? Colors.white : kColorText,
                            height: 1.35)),
                    if (time != null && time!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(time!,
                          style: TextStyle(
                              color: own
                                  ? Colors.white.withValues(alpha: .75)
                                  : kColorMutedText,
                              fontSize: 10)),
                    ],
                  ],
                ),
              ),
            ),
            if (own) ...[
              const SizedBox(width: 5),
              Icon(sent ? Icons.done_all_rounded : Icons.schedule_rounded,
                  size: 15, color: sent ? kColorPrimary : kColorMutedText),
            ],
          ],
        ),
      );
}

class ChatComposer extends StatelessWidget {
  const ChatComposer({
    super.key,
    required this.controller,
    required this.onSend,
    this.enabled = true,
    this.sending = false,
    this.hintText = 'Message',
  });

  final TextEditingController controller;
  final VoidCallback onSend;
  final bool enabled;
  final bool sending;
  final String hintText;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(12, 9, 10, 10),
        decoration: const BoxDecoration(
          color: kColorBg,
          border: Border(top: BorderSide(color: kColorDivider)),
        ),
        child: SafeArea(
          top: false,
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Expanded(
              child: TextField(
                controller: controller,
                enabled: enabled && !sending,
                minLines: 1,
                maxLines: 5,
                maxLength: 4000,
                textCapitalization: TextCapitalization.sentences,
                textInputAction: TextInputAction.newline,
                decoration: InputDecoration(
                  hintText: hintText,
                  counterText: '',
                  filled: true,
                  fillColor: kColorSurface,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(TmsRadius.rFull),
                    borderSide: BorderSide.none,
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(TmsRadius.rFull),
                    borderSide: BorderSide.none,
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(TmsRadius.rFull),
                    borderSide: const BorderSide(color: kColorPrimary),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              tooltip: 'Send message',
              onPressed: enabled && !sending ? onSend : null,
              icon: sending
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.send_rounded),
            ),
          ]),
        ),
      );
}

String compactChatTime(DateTime? value) {
  if (value == null) return '';
  final local = value.toLocal();
  final now = DateTime.now();
  if (DateUtils.isSameDay(local, now)) return DateFormat.jm().format(local);
  if (now.difference(local).inDays < 7) return DateFormat.E().format(local);
  return DateFormat('MMM d').format(local);
}
