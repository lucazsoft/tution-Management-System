/// API-backed ViewModel for the janitor home screen.
///
/// Reads `GET /api/resources/my-tasks` per load via
/// [JanitorPortalRepository] and maps the payload onto [JanitorTask].
/// Completion goes through
/// `POST /api/resources/tasks/complete/:taskId`; the assigned ->
/// in-progress ("start") step is local-only until the backend exposes a
/// dedicated transition endpoint (TODO).
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/network/request_cancellation.dart';
import 'package:tms_mobile/core/viewmodel/base_viewmodel.dart';
import 'package:tms_mobile/features/janitor/data/janitor_portal_repository.dart';
import 'package:tms_mobile/features/janitor/models/janitor_task.dart';

@immutable
class JanitorPortalState extends ViewModelState {
  const JanitorPortalState({
    this.tasks = const [],
    this.isRefreshing = false,
    this.completingTaskId,
    this.errorKind,
    super.error,
    super.isLoading,
  });

  final List<JanitorTask> tasks;
  final bool isRefreshing;
  final String? completingTaskId;
  final ApiErrorKind? errorKind;

  bool get hasData => tasks.isNotEmpty;
  bool get isOffline => errorKind == ApiErrorKind.noConnection;
  bool get isDenied => errorKind == ApiErrorKind.forbidden;

  JanitorPortalState copyWith({
    List<JanitorTask>? tasks,
    bool? isRefreshing,
    String? completingTaskId,
    bool clearCompletingTaskId = false,
    ApiErrorKind? errorKind,
    bool clearErrorKind = false,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return JanitorPortalState(
      tasks: tasks ?? this.tasks,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      completingTaskId: clearCompletingTaskId
          ? null
          : (completingTaskId ?? this.completingTaskId),
      errorKind: clearErrorKind ? null : (errorKind ?? this.errorKind),
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class JanitorPortalViewModel extends BaseViewModel<JanitorPortalState> {
  JanitorPortalViewModel({
    JanitorPortalRepository? repository,
    RequestCanceller? canceller,
  })  : _repository = repository ?? JanitorPortalRepository(),
        _canceller = canceller ?? RequestCanceller(),
        super(const JanitorPortalState(isLoading: true)) {
    load();
  }

  final JanitorPortalRepository _repository;
  final RequestCanceller _canceller;
  int _requestGeneration = 0;

  Future<void> load() async {
    final generation = ++_requestGeneration;
    state =
        state.copyWith(isLoading: true, clearError: true, clearErrorKind: true);
    try {
      final list = await _repository.fetchMyTasks(
        cancelToken: _canceller.tokenFor('my-tasks'),
      );
      if (generation != _requestGeneration) return;
      state = state.copyWith(
        isLoading: false,
        tasks: list.toTasks(),
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
      final list = await _repository.fetchMyTasks(
        cancelToken: _canceller.tokenFor('my-tasks'),
      );
      if (generation != _requestGeneration) return;
      state = state.copyWith(
        isRefreshing: false,
        tasks: list.toTasks(),
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

  /// Local-only assigned -> in-progress transition.
  ///
  /// TODO: replace with a dedicated backend transition endpoint when one
  /// exists (no `PATCH /api/resources/tasks/:id/start` today).
  void startTask(String taskId) {
    final tasks = [
      for (final task in state.tasks)
        if (task.id == taskId && task.status == JanitorTaskStatus.assigned)
          task.transitionTo(JanitorTaskStatus.inProgress)
        else
          task,
    ];
    state = state.copyWith(tasks: tasks);
  }

  /// Completes a task server-side, then refreshes the list.
  Future<bool> completeTask(String taskId, {String? note}) async {
    state = state.copyWith(
      completingTaskId: taskId,
      clearError: true,
      clearErrorKind: true,
    );
    try {
      await _repository.completeTask(
        taskId,
        cancelToken: _canceller.tokenFor('complete-task'),
      );
      final tasks = [
        for (final task in state.tasks)
          if (task.id == taskId && task.status != JanitorTaskStatus.completed)
            task.copyWith(
              status: JanitorTaskStatus.completed,
              completionNote: (note != null && note.isNotEmpty) ? note : null,
            )
          else
            task,
      ];
      state = state.copyWith(tasks: tasks, clearCompletingTaskId: true);
      await refresh();
      return true;
    } on ApiException catch (error) {
      if (error.kind == ApiErrorKind.cancelled) {
        state = state.copyWith(clearCompletingTaskId: true);
        return false;
      }
      state = state.copyWith(
        clearCompletingTaskId: true,
        error: error.message,
        errorKind: error.kind,
      );
      return false;
    }
  }

  /// Applies a task updated elsewhere (e.g. the detail screen) to state.
  void applyTaskUpdate(JanitorTask updated) {
    state = state.copyWith(
      tasks: [
        for (final task in state.tasks)
          if (task.id == updated.id) updated else task,
      ],
    );
  }

  @override
  void dispose() {
    _requestGeneration += 1;
    _canceller.cancelAll();
    super.dispose();
  }
}

final janitorPortalViewModelProvider =
    StateNotifierProvider<JanitorPortalViewModel, JanitorPortalState>((ref) {
  ref.watch(authProvider.select((state) => state.user?.id));
  return JanitorPortalViewModel();
});
