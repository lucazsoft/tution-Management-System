/// Student Timetable ViewModel using MVVM pattern.
///
/// Primary source: `todaySessions` / `weeklySessions` from the authenticated
/// `GET /api/users/me/student-portal` payload. When the portal carries no
/// weekly sessions but an enrollment id is known, the ViewModel falls back to
/// the raw `GET /api/courses/timetable/student/:studentId` endpoint
/// (day/start/end only — no teacher or course-type detail).
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/network/request_cancellation.dart';
import 'package:tms_mobile/core/viewmodel/base_viewmodel.dart';
import 'package:tms_mobile/features/student/data/student_portal_repository.dart';
import 'package:tms_mobile/features/student/models/student_portal_dto.dart';

/// Student timetable state.
@immutable
class StudentTimetableState extends ViewModelState {
  const StudentTimetableState({
    this.days = const [],
    this.todaySessions = const [],
    this.selectedIndex = 0,
    this.isRefreshing = false,
    this.usedFallback = false,
    this.errorKind,
    super.error,
    super.isLoading,
  });

  final List<PortalDaySchedule> days;
  final List<PortalSession> todaySessions;
  final int selectedIndex;
  final bool isRefreshing;
  final bool usedFallback;
  final ApiErrorKind? errorKind;

  bool get hasData => days.isNotEmpty || todaySessions.isNotEmpty;
  bool get isOffline => errorKind == ApiErrorKind.noConnection;
  bool get isDenied => errorKind == ApiErrorKind.forbidden;

  PortalDaySchedule? get selectedDay =>
      days.isEmpty ? null : days[selectedIndex.clamp(0, days.length - 1)];

  StudentTimetableState copyWith({
    List<PortalDaySchedule>? days,
    List<PortalSession>? todaySessions,
    int? selectedIndex,
    bool? isRefreshing,
    bool? usedFallback,
    ApiErrorKind? errorKind,
    bool clearErrorKind = false,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return StudentTimetableState(
      days: days ?? this.days,
      todaySessions: todaySessions ?? this.todaySessions,
      selectedIndex: selectedIndex ?? this.selectedIndex,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      usedFallback: usedFallback ?? this.usedFallback,
      errorKind: clearErrorKind ? null : (errorKind ?? this.errorKind),
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

/// Student Timetable ViewModel.
class StudentTimetableViewModel extends BaseViewModel<StudentTimetableState> {
  StudentTimetableViewModel({
    StudentPortalRepository? repository,
    RequestCanceller? canceller,
  })  : _repository = repository ?? StudentPortalRepository(),
        _canceller = canceller ?? RequestCanceller(),
        super(const StudentTimetableState(isLoading: true)) {
    load();
  }

  final StudentPortalRepository _repository;
  final RequestCanceller _canceller;

  Future<void> load() async {
    state = state.copyWith(
      isLoading: true,
      clearError: true,
      clearErrorKind: true,
    );
    try {
      final portal = await _repository.fetchPortal(
        cancelToken: _canceller.tokenFor('timetable'),
      );
      var days = portal.weeklyByDay;
      var usedFallback = false;
      if (days.isEmpty && portal.profile.enrollmentId.isNotEmpty) {
        days = await _fallbackDays(portal.profile.enrollmentId);
        usedFallback = days.isNotEmpty;
      }
      state = state.copyWith(
        isLoading: false,
        days: days,
        todaySessions: portal.todaySessions,
        selectedIndex: _todayIndex(days),
        usedFallback: usedFallback,
        clearError: true,
        clearErrorKind: true,
      );
    } on ApiException catch (error) {
      if (error.kind == ApiErrorKind.cancelled) return;
      state = state.copyWith(
        isLoading: false,
        isRefreshing: false,
        error: error.message,
        errorKind: error.kind,
      );
    } catch (error) {
      state = state.copyWith(
        isLoading: false,
        isRefreshing: false,
        error: 'Failed to load the timetable: $error',
        clearErrorKind: true,
      );
    }
  }

  Future<void> refresh() async {
    if (state.isRefreshing) return;
    state = state.copyWith(isRefreshing: true, clearError: true);
    try {
      final portal = await _repository.fetchPortal(
        cancelToken: _canceller.tokenFor('timetable'),
      );
      var days = portal.weeklyByDay;
      var usedFallback = false;
      if (days.isEmpty && portal.profile.enrollmentId.isNotEmpty) {
        days = await _fallbackDays(portal.profile.enrollmentId);
        usedFallback = days.isNotEmpty;
      }
      state = state.copyWith(
        isRefreshing: false,
        days: days,
        todaySessions: portal.todaySessions,
        selectedIndex: _todayIndex(days),
        usedFallback: usedFallback,
        clearError: true,
        clearErrorKind: true,
      );
    } on ApiException catch (error) {
      if (error.kind == ApiErrorKind.cancelled) {
        state = state.copyWith(isRefreshing: false);
        return;
      }
      state = state.copyWith(
        isRefreshing: false,
        error: error.message,
        errorKind: error.kind,
      );
    } catch (error) {
      state = state.copyWith(
        isRefreshing: false,
        error: 'Failed to refresh the timetable: $error',
        clearErrorKind: true,
      );
    }
  }

  void selectDay(int index) {
    if (index < 0 || index >= state.days.length) return;
    state = state.copyWith(selectedIndex: index);
  }

  /// Raw per-student timetable fallback, normalised into day schedules.
  Future<List<PortalDaySchedule>> _fallbackDays(String enrollmentId) async {
    final classes = await _repository.fetchStudentTimetable(
      enrollmentId,
      cancelToken: _canceller.tokenFor('timetable-fallback'),
    );
    final sessions = classes.expand((c) => c.toPortalSessions()).toList();
    if (sessions.isEmpty) return const [];
    final groups = <String, List<PortalSession>>{};
    for (final session in sessions) {
      groups.putIfAbsent(session.dayGroupKey, () => []).add(session);
    }
    final days = groups.entries
        .map((entry) => PortalDaySchedule(
              key: entry.key,
              label: dayLabel(entry.key),
              sessions: List.unmodifiable(entry.value),
            ))
        .toList()
      ..sort((a, b) => dayRank(a.key).compareTo(dayRank(b.key)));
    return days;
  }

  /// Defaults the selected tab to today's weekday when present in [days].
  static int _todayIndex(List<PortalDaySchedule> days) {
    if (days.isEmpty) return 0;
    const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    final today = keys[(DateTime.now().weekday - 1).clamp(0, 6)];
    final index = days.indexWhere((day) => day.key == today);
    return index == -1 ? 0 : index;
  }

  @override
  void dispose() {
    _canceller.cancelAll();
    super.dispose();
  }
}

/// Provider for StudentTimetableViewModel.
final studentTimetableViewModelProvider =
    StateNotifierProvider<StudentTimetableViewModel, StudentTimetableState>(
        (ref) {
  return StudentTimetableViewModel();
});
