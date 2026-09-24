/// Shared child selection state for Parent portal.
///
/// Provides a centralized way to manage which child is currently selected
/// across all parent screens (Dashboard, Fees, Attendance, Academics).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Provider for the currently selected child name.
///
/// Uses StateNotifier for testability and to allow complex logic later.
final childSelectionProvider =
    StateNotifierProvider<ChildSelectionNotifier, String>(
  (ref) => ChildSelectionNotifier(),
);

/// Provider for the list of available children
final availableChildrenProvider = Provider<List<String>>((ref) {
  return ChildSelectionNotifier.availableChildren;
});

/// Notifier managing the selected child state.
class ChildSelectionNotifier extends StateNotifier<String> {
  ChildSelectionNotifier() : super(_defaultChild);

  /// Default child name
  static const String _defaultChild = 'Aarav';

  /// Available children for this parent
  static const List<String> availableChildren = ['Aarav', 'Mira'];

  /// Select a different child
  void selectChild(String childName) {
    if (availableChildren.contains(childName)) {
      state = childName;
    }
  }

  /// Get the currently selected child
  String get selectedChild => state;

  /// Get all available children
  List<String> get children => availableChildren;

  /// Check if a child is currently selected
  bool isSelected(String childName) => state == childName;

  /// Reset to default child
  void reset() => state = _defaultChild;
}

/// Convenience extension for widgets
extension ChildSelectionExt on WidgetRef {
  String get selectedChild => watch(childSelectionProvider);

  ChildSelectionNotifier get childSelectionNotifier =>
      read(childSelectionProvider.notifier);

  List<String> get availableChildren =>
      ChildSelectionNotifier.availableChildren;
}
