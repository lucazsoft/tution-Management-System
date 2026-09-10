import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';
import 'package:tms_mobile/features/parent/viewmodels/parent_portal_viewmodel.dart';

/// Switches between children returned by the authenticated parent portal.
///
/// The selected value is the server-issued student id. Selecting a chip asks
/// the consolidated portal endpoint to authorize and load that child; names
/// are presentation only and are never used as scope.
class ChildSwitcherBar extends ConsumerWidget {
  const ChildSwitcherBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(parentPortalProvider);
    final children = state.portal?.children ?? const [];
    if (children.isEmpty) return const SizedBox.shrink();

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: children.map((child) {
          final selected = child.id == state.selectedChildId;
          return Padding(
            padding: const EdgeInsets.only(right: 10),
            child: Material(
              color: selected ? kColorPrimary : Colors.white,
              borderRadius: BorderRadius.circular(TmsRadius.rFull),
              child: InkWell(
                borderRadius: BorderRadius.circular(TmsRadius.rFull),
                onTap: state.isLoading
                    ? null
                    : () => ref
                        .read(parentPortalProvider.notifier)
                        .selectChild(child.id),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        child.name,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: selected ? Colors.white : kColorText,
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      if (selected && state.isLoading) ...[
                        const SizedBox(width: 8),
                        const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
