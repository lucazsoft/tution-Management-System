import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/features/parent/viewmodels/parent_portal_viewmodel.dart';

/// Dropdown selector for children linked to the authenticated parent.
class ChildSwitcherBar extends ConsumerWidget {
  const ChildSwitcherBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(parentPortalProvider);
    final children = state.portal?.children ?? const [];
    if (children.isEmpty) return const SizedBox.shrink();

    return DropdownButtonFormField<String>(
      initialValue: state.selectedChildId,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: 'Viewing child',
        prefixIcon: const Icon(Icons.family_restroom_rounded),
        suffixIcon: state.isLoading
            ? const Padding(
                padding: EdgeInsets.all(14),
                child: SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              )
            : null,
      ),
      items: [
        for (final child in children)
          DropdownMenuItem(
            value: child.id,
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    child.name,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  child.grade,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
      ],
      onChanged: state.isLoading
          ? null
          : (childId) {
              if (childId != null) {
                ref.read(parentPortalProvider.notifier).selectChild(childId);
              }
            },
    );
  }
}
