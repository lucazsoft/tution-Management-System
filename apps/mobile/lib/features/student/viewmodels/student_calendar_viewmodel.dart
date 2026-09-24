/// Student calendar ViewModel (MVVM, MOB-104).
///
/// Events come from the portal payload (`events`: backend `academicEvent`
/// rows scoped to the student's branches). Filtering is client-side over the
/// live list by event kind; the ViewModel never invents events.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/network/request_cancellation.dart';
import 'package:tms_mobile/core/viewmodel/base_viewmodel.dart';

import '../data/student_id_calendar_notifications_repository.dart';
import '../models/student_portal_dto.dart';

@immutable
class StudentCalendarState extends ViewModelState {
  const StudentCalendarState({
    this.events = const [],
    this.selectedKind = 'All',
    this.isDenied = false,
    this.isOffline = false,
    super.error,
    super.isLoading,
  });

  final List<PortalEvent> events;

  /// Active kind filter; 'All' disables filtering.
  final String selectedKind;
  final bool isDenied;
  final bool isOffline;

  /// Distinct kinds present in the live payload, for filter chips.
  List<String> get kinds {
    final kinds = <String>{};
    for (final event in events) {
      if (event.kind.trim().isNotEmpty) kinds.add(event.kind);
    }
    return [...kinds]..sort();
  }

  List<PortalEvent> get visible => selectedKind == 'All'
      ? events
      : events.where((event) => event.kind == selectedKind).toList();

  bool get isEmpty => events.isEmpty;

  StudentCalendarState copyWith({
    List<PortalEvent>? events,
    String? selectedKind,
    bool? isDenied,
    bool? isOffline,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return StudentCalendarState(
      events: events ?? this.events,
      selectedKind: selectedKind ?? this.selectedKind,
      isDenied: isDenied ?? this.isDenied,
      isOffline: isOffline ?? this.isOffline,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class StudentCalendarViewModel extends BaseViewModel<StudentCalendarState> {
  StudentCalendarViewModel({
    StudentIdCalendarNotificationsRepository? repository,
  })  : _repository = repository ?? StudentIdCalendarNotificationsRepository(),
        super(const StudentCalendarState(isLoading: true)) {
    load();
  }

  final StudentIdCalendarNotificationsRepository _repository;
  final RequestCanceller _canceller = RequestCanceller();

  Future<void> load() async {
    _canceller.cancel('calendar');
    final token = _canceller.tokenFor('calendar');
    state = state.copyWith(
      isLoading: true,
      clearError: true,
      isDenied: false,
      isOffline: false,
    );
    try {
      final events = await _repository.fetchEvents(cancelToken: token);
      final kinds = {
        for (final event in events)
          if (event.kind.trim().isNotEmpty) event.kind,
      };
      state = state.copyWith(
        isLoading: false,
        events: events,
        selectedKind:
            kinds.contains(state.selectedKind) ? state.selectedKind : 'All',
        clearError: true,
      );
    } on ApiException catch (e) {
      if (e.kind == ApiErrorKind.cancelled) return;
      state = state.copyWith(
        isLoading: false,
        error: e.message,
        isDenied: e.kind == ApiErrorKind.forbidden,
        isOffline: e.kind == ApiErrorKind.noConnection,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Failed to load the calendar: $e',
      );
    }
  }

  Future<void> refresh() => load();

  void selectKind(String kind) {
    state = state.copyWith(selectedKind: kind);
  }

  @override
  void dispose() {
    _canceller.cancelAll();
    super.dispose();
  }
}

final studentCalendarViewModelProvider =
    StateNotifierProvider<StudentCalendarViewModel, StudentCalendarState>(
        (ref) {
  return StudentCalendarViewModel();
});
