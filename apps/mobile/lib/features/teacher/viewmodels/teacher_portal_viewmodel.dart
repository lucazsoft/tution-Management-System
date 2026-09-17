/// API-backed ViewModels for the teacher home + timetable screens.
///
/// Both read from one `GET /api/teacher/workspace` call per load via
/// [TeacherPortalRepository]. Timetable tabs are derived client-side:
/// today from `todayClasses`, weekly from `classes[].schedule`.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/network/request_cancellation.dart';
import 'package:tms_mobile/core/viewmodel/base_viewmodel.dart';
import 'package:tms_mobile/features/teacher/data/teacher_portal_repository.dart';
import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';

@immutable
class TeacherPortalState extends ViewModelState {
  const TeacherPortalState({
    this.workspace,
    this.isRefreshing = false,
    this.updatingSessionId,
    this.savingClassAttendance = false,
    this.errorKind,
    super.error,
    super.isLoading,
  });

  final TeacherWorkspace? workspace;
  final bool isRefreshing;
  final String? updatingSessionId;
  final bool savingClassAttendance;
  final ApiErrorKind? errorKind;

  bool get hasData => workspace != null;
  bool get isOffline => errorKind == ApiErrorKind.noConnection;
  bool get isDenied => errorKind == ApiErrorKind.forbidden;

  TeacherPortalState copyWith({
    TeacherWorkspace? workspace,
    bool? isRefreshing,
    String? updatingSessionId,
    bool clearUpdatingSessionId = false,
    bool? savingClassAttendance,
    ApiErrorKind? errorKind,
    bool clearErrorKind = false,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return TeacherPortalState(
      workspace: workspace ?? this.workspace,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      updatingSessionId: clearUpdatingSessionId
          ? null
          : (updatingSessionId ?? this.updatingSessionId),
      savingClassAttendance:
          savingClassAttendance ?? this.savingClassAttendance,
      errorKind: clearErrorKind ? null : (errorKind ?? this.errorKind),
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class TeacherPortalViewModel extends BaseViewModel<TeacherPortalState> {
  TeacherPortalViewModel({
    TeacherPortalRepository? repository,
    RequestCanceller? canceller,
  })  : _repository = repository ?? TeacherPortalRepository(),
        _canceller = canceller ?? RequestCanceller(),
        super(const TeacherPortalState(isLoading: true)) {
    load();
  }

  final TeacherPortalRepository _repository;
  final RequestCanceller _canceller;
  int _requestGeneration = 0;

  Future<void> load() async {
    final generation = ++_requestGeneration;
    state =
        state.copyWith(isLoading: true, clearError: true, clearErrorKind: true);
    try {
      final workspace = await _repository.fetchWorkspace(
        cancelToken: _canceller.tokenFor('workspace'),
      );
      if (generation != _requestGeneration) return;
      state = state.copyWith(
        isLoading: false,
        workspace: workspace,
        clearError: true,
        clearErrorKind: true,
      );
    } on ApiException catch (error) {
      if (generation != _requestGeneration) return;
      if (error.kind == ApiErrorKind.cancelled) return;
      state = state.copyWith(
        isLoading: false,
        error: error.message,
        errorKind: error.kind,
      );
    }
  }

  Future<void> refresh() async {
    final generation = ++_requestGeneration;
    state = state.copyWith(isRefreshing: true);
    try {
      final workspace = await _repository.fetchWorkspace(
        cancelToken: _canceller.tokenFor('workspace'),
      );
      if (generation != _requestGeneration) return;
      state = state.copyWith(
        isRefreshing: false,
        workspace: workspace,
        clearError: true,
        clearErrorKind: true,
      );
    } on ApiException catch (error) {
      if (generation != _requestGeneration) return;
      if (error.kind == ApiErrorKind.cancelled) {
        state = state.copyWith(isRefreshing: false);
        return;
      }
      state = state.copyWith(
        isRefreshing: false,
        error: error.message,
        errorKind: error.kind,
      );
    }
  }

  Future<bool> submitSessionUpdate({
    required String sessionId,
    required String updateContent,
  }) async {
    final content = updateContent.trim();
    if (content.isEmpty) {
      state = state.copyWith(error: 'Daily update content is required.');
      return false;
    }
    state = state.copyWith(
      updatingSessionId: sessionId,
      clearError: true,
      clearErrorKind: true,
    );
    try {
      await _repository.submitSessionUpdate(
        sessionId: sessionId,
        updateContent: content,
        cancelToken: _canceller.tokenFor('session-update'),
      );
      await refresh();
      state = state.copyWith(clearUpdatingSessionId: true);
      return true;
    } on ApiException catch (error) {
      if (error.kind == ApiErrorKind.cancelled) {
        state = state.copyWith(clearUpdatingSessionId: true);
        return false;
      }
      state = state.copyWith(
        clearUpdatingSessionId: true,
        error: error.message,
        errorKind: error.kind,
      );
      return false;
    }
  }

  Future<bool> saveClassAttendance({
    required String classId,
    required Map<String, String> records,
  }) async {
    if (records.isEmpty) {
      state =
          state.copyWith(error: 'Add at least one student attendance record.');
      return false;
    }
    state = state.copyWith(
      savingClassAttendance: true,
      clearError: true,
      clearErrorKind: true,
    );
    try {
      await _repository.saveClassAttendance(
        classId: classId,
        date: DateTime.now(),
        records: records,
        cancelToken: _canceller.tokenFor('class-attendance'),
      );
      await refresh();
      state = state.copyWith(savingClassAttendance: false);
      return true;
    } on ApiException catch (error) {
      state = state.copyWith(
        savingClassAttendance: false,
        error: error.message,
        errorKind: error.kind,
      );
      return false;
    }
  }

  @override
  void dispose() {
    _requestGeneration += 1;
    _canceller.cancelAll();
    super.dispose();
  }
}

final teacherPortalViewModelProvider =
    StateNotifierProvider<TeacherPortalViewModel, TeacherPortalState>((ref) {
  return TeacherPortalViewModel();
});
