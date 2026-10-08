import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/features/parent/models/parent_portal.dart';
import 'package:tms_mobile/features/parent/viewmodels/parent_portal_viewmodel.dart';

/// Common loading/error/empty handling for API-backed parent screens.
class ParentPortalStateView extends ConsumerWidget {
  const ParentPortalStateView({
    super.key,
    required this.builder,
    this.padding = const EdgeInsets.all(20),
    this.wrapInScrollView = true,
  });

  final Widget Function(
    BuildContext context,
    ParentPortal portal,
    ParentChild child,
  ) builder;
  final EdgeInsetsGeometry padding;
  final bool wrapInScrollView;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(parentPortalProvider);
    final notifier = ref.read(parentPortalProvider.notifier);

    if (state.isLoading && !state.hasData) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.error != null && !state.hasData) {
      final title = state.isOffline
          ? 'You are offline'
          : state.isDenied
              ? 'Access denied'
              : state.isMissingLink
                  ? 'No linked child'
                  : 'Could not load parent portal';
      return _PortalMessage(
        title: title,
        message: state.error!,
        actionLabel: 'Retry',
        onAction: notifier.load,
      );
    }

    final portal = state.portal;
    final child = state.selectedChild;
    if (portal == null || child == null) {
      return const _PortalMessage(
        title: 'No linked child',
        message:
            'No student record is linked to this authenticated parent account.',
      );
    }

    final content = builder(context, portal, child);
    final errorCard = state.error == null
        ? null
        : Card(
            color: Theme.of(context).colorScheme.errorContainer,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(state.error!),
            ),
          );
    if (!wrapInScrollView) {
      return _ChildScopeGesture(
        portal: portal,
        selectedChild: child,
        child: Column(children: [
          if (errorCard != null) errorCard,
          Expanded(child: content),
        ]),
      );
    }
    return _ChildScopeGesture(
      portal: portal,
      selectedChild: child,
      child: RefreshIndicator(
        onRefresh: notifier.refresh,
        child: ListView(
          padding: padding,
          children: [if (errorCard != null) errorCard, content],
        ),
      ),
    );
  }
}

class _ChildScopeGesture extends ConsumerStatefulWidget {
  const _ChildScopeGesture({
    required this.portal,
    required this.selectedChild,
    required this.child,
  });

  final ParentPortal portal;
  final ParentChild selectedChild;
  final Widget child;

  @override
  ConsumerState<_ChildScopeGesture> createState() => _ChildScopeGestureState();
}

class _ChildScopeGestureState extends ConsumerState<_ChildScopeGesture> {
  static const _holdDuration = Duration(seconds: 1);
  static const _movementTolerance = 18.0;
  Timer? _holdTimer;
  int? _pointer;
  Offset? _origin;
  bool _opening = false;

  void _startHold(PointerDownEvent event) {
    if (_pointer != null || _opening) return;
    _pointer = event.pointer;
    _origin = event.position;
    _holdTimer = Timer(_holdDuration, () async {
      if (!mounted || _pointer != event.pointer || _opening) return;
      _opening = true;
      _holdTimer = null;
      _pointer = null;
      _origin = null;
      HapticFeedback.mediumImpact();
      await _showChildPicker();
      if (mounted) _opening = false;
    });
  }

  void _trackHold(PointerMoveEvent event) {
    if (event.pointer != _pointer || _origin == null) return;
    if ((event.position - _origin!).distance > _movementTolerance) {
      _cancelHold(event.pointer);
    }
  }

  void _cancelHold(int pointer) {
    if (pointer != _pointer) return;
    _holdTimer?.cancel();
    _holdTimer = null;
    _pointer = null;
    _origin = null;
  }

  @override
  void dispose() {
    _holdTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Listener(
        behavior: HitTestBehavior.translucent,
        onPointerDown: _startHold,
        onPointerMove: _trackHold,
        onPointerUp: (event) => _cancelHold(event.pointer),
        onPointerCancel: (event) => _cancelHold(event.pointer),
        child: widget.child,
      );

  Future<void> _showChildPicker() async {
    final selectedId = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      builder: (sheetContext) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Switch child',
                style: Theme.of(sheetContext).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(
              widget.portal.children.length > 1
                  ? 'The parent portal will update to the selected child.'
                  : 'This is the child currently linked to your account.',
              style: Theme.of(sheetContext).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            for (final linkedChild in widget.portal.children)
              ListTile(
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                selected: linkedChild.id == widget.selectedChild.id,
                leading: CircleAvatar(
                  child: Text(linkedChild.initials.isEmpty
                      ? linkedChild.name.substring(0, 1).toUpperCase()
                      : linkedChild.initials),
                ),
                title: Text(linkedChild.name),
                subtitle: Text('${linkedChild.grade} · ${linkedChild.branch}'),
                trailing: linkedChild.id == widget.selectedChild.id
                    ? const Icon(Icons.check_circle_rounded)
                    : null,
                onTap: () => Navigator.pop(sheetContext, linkedChild.id),
              ),
          ],
        ),
      ),
    );
    if (selectedId != null && selectedId != widget.selectedChild.id) {
      await ref.read(parentPortalProvider.notifier).selectChild(selectedId);
    }
  }
}

class _PortalMessage extends StatelessWidget {
  const _PortalMessage({
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.info_outline_rounded, size: 48),
            const SizedBox(height: 12),
            Text(title, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(message, textAlign: TextAlign.center),
            if (onAction != null) ...[
              const SizedBox(height: 20),
              OutlinedButton(
                onPressed: onAction,
                child: Text(actionLabel ?? 'Try again'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
