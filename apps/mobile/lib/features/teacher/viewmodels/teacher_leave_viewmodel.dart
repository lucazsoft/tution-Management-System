/// API-backed ViewModel for teacher leave requests.
///
/// Leave history comes from the workspace `leaves` array
/// (`GET /api/teacher/workspace`); new requests go to
/// `POST /api/leaves/request`. There is no standalone leave-status
/// endpoint (TODO when the backend adds one), so status refreshes by
/// re-fetching the workspace.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/network/request_cancellation.dart';
import 'package:tms_mobile/core/viewmodel/base_viewmodel.dart';
import 'package:tms_mobile/features/teacher/data/teacher_portal_repository.dart';
import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';

@immutable
class TeacherLeaveState extends ViewModelState {
  const TeacherLeaveState({
    this.leaves = const [],
    this.branches = const [],
    this.isSubmitting = false,
    this.submitError,
    this.errorKind,
    super.error,
    super.isLoading,
  });

  final List<TeacherLeaveEntry> leaves;
  final List<TeacherBranchRef> branches;
  final bool isSubmitting;
  final String? submitError;
  final ApiErrorKind? errorKind;

  bool get isOffline => errorKind == ApiErrorKind.noConnection;
  bool get isDenied => errorKind == ApiErrorKind.forbidden;

  TeacherLeaveState copyWith({
    List<TeacherLeaveEntry>? leaves,
    List<TeacherBranchRef>? branches,
    bool? isSubmitting,
    String? submitError,
    bool clearSubmitError = false,
    ApiErrorKind? errorKind,
    bool clearErrorKind = false,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return TeacherLeaveState(
      leaves: leaves ?? this.leaves,
      branches: branches ?? this.branches,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      submitError: clearSubmitError ? null : (submitError ?? this.submitError),
      errorKind: clearErrorKind ? null : (errorKind ?? this.errorKind),
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class TeacherLeaveViewModel extends BaseViewModel<TeacherLeaveState> {
  TeacherLeaveViewModel({
    TeacherPortalRepository? repository,
    RequestCanceller? canceller,
  })  : _repository = repository ?? TeacherPortalRepository(),
        _canceller = canceller ?? RequestCanceller(),
        super(const TeacherLeaveState(isLoading: true)) {
    load();
  }

  final TeacherPortalRepository _repository;
  final RequestCanceller _canceller;

  Future<void> load() async {
    state =
        state.copyWith(isLoading: true, clearError: true, clearErrorKind: true);
    try {
      final workspace = await _repository.fetchWorkspace(
        cancelToken: _canceller.tokenFor('leaves'),
      );
      state = state.copyWith(
        isLoading: false,
        leaves: workspace.leaves,
        branches: workspace.branches,
        clearError: true,
        clearErrorKind: true,
      );
    } on ApiException catch (error) {
      if (error.kind == ApiErrorKind.cancelled) return;
      state = state.copyWith(
        isLoading: false,
        error: error.message,
        errorKind: error.kind,
      );
    }
  }

  Future<bool> submitLeave({
    required String branchId,
    required String leaveType,
    required DateTime startDate,
    required DateTime endDate,
    required String reason,
  }) async {
    state = state.copyWith(isSubmitting: true, clearSubmitError: true);
    try {
      await _repository.submitLeave(
        branchId: branchId,
        leaveType: leaveType,
        startDate: startDate,
        endDate: endDate,
        reason: reason,
        cancelToken: _canceller.tokenFor('leave-submit'),
      );
      state = state.copyWith(isSubmitting: false);
      await load();
      return true;
    } on ApiException catch (error) {
      if (error.kind == ApiErrorKind.cancelled) {
        state = state.copyWith(isSubmitting: false);
        return false;
      }
      state = state.copyWith(isSubmitting: false, submitError: error.message);
      return false;
    }
  }

  @override
  void dispose() {
    _canceller.cancelAll();
    super.dispose();
  }
}

final teacherLeaveViewModelProvider =
    StateNotifierProvider<TeacherLeaveViewModel, TeacherLeaveState>((ref) {
  ref.watch(authProvider.select((state) => state.user?.id));
  return TeacherLeaveViewModel();
});
