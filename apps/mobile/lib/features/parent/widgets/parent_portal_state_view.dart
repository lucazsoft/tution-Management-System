import 'package:flutter/material.dart';
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
      return Column(children: [
        if (errorCard != null) errorCard,
        Expanded(child: content),
      ]);
    }
    return RefreshIndicator(
      onRefresh: notifier.refresh,
      child: ListView(
        padding: padding,
        children: [if (errorCard != null) errorCard, content],
      ),
    );
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
