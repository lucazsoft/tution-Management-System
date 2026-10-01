/// API-backed ViewModel for the branch manager home screen.
///
/// Loads one `GET /api/branch-admin/dashboard` plus the L1 leave queue
/// (`GET /api/leaves?level=L1`) per load via [BranchPortalRepository].
/// Petty cash is read-only here (no branch-side decision endpoint exists;
/// funding decisions are tenant-admin-only).
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/network/request_cancellation.dart';
import 'package:tms_mobile/core/viewmodel/base_viewmodel.dart';
import 'package:tms_mobile/features/branch_manager/data/branch_portal_repository.dart';
import 'package:tms_mobile/features/branch_manager/models/branch_portal_dto.dart';

final branchPortalRepositoryProvider = Provider<BranchPortalRepository>((ref) {
  ref.watch(authProvider.select((state) => state.user?.id));
  return BranchPortalRepository();
});

final branchPortalViewModelProvider =
    StateNotifierProvider<BranchPortalViewModel, BranchPortalState>(
  (ref) => BranchPortalViewModel(
    repository: ref.watch(branchPortalRepositoryProvider),
  ),
);

@immutable
class BranchPortalState extends ViewModelState {
  const BranchPortalState({
    this.dashboard,
    this.leaves = const [],
    this.isRefreshing = false,
    this.decidingLeaveId,
    this.notice,
    this.errorKind,
    super.error,
    super.isLoading,
  });

  final BranchDashboard? dashboard;
  final List<BranchLeaveRequest> leaves;
  final bool isRefreshing;
  final String? decidingLeaveId;
  final String? notice;
  final ApiErrorKind? errorKind;

  bool get hasData => dashboard != null;
  bool get isOffline => errorKind == ApiErrorKind.noConnection;
  bool get isDenied => errorKind == ApiErrorKind.forbidden;

  List<BranchLeaveRequest> get pendingLeaves =>
      leaves.where((leave) => leave.isPending).toList();

  List<BranchPettyCashEntry> get pendingCash =>
      (dashboard?.pettyCash ?? const [])
          .where((entry) => entry.status == 'PENDING')
          .toList();

  BranchPortalState copyWith({
    BranchDashboard? dashboard,
    List<BranchLeaveRequest>? leaves,
    bool? isRefreshing,
    String? decidingLeaveId,
    bool clearDecidingLeaveId = false,
    String? notice,
    bool clearNotice = false,
    ApiErrorKind? errorKind,
    bool clearErrorKind = false,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return BranchPortalState(
      dashboard: dashboard ?? this.dashboard,
      leaves: leaves ?? this.leaves,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      decidingLeaveId: clearDecidingLeaveId
          ? null
          : (decidingLeaveId ?? this.decidingLeaveId),
      notice: clearNotice ? null : (notice ?? this.notice),
      errorKind: clearErrorKind ? null : (errorKind ?? this.errorKind),
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class BranchPortalViewModel extends BaseViewModel<BranchPortalState> {
  BranchPortalViewModel({
    BranchPortalRepository? repository,
    RequestCanceller? canceller,
  })  : _repository = repository ?? BranchPortalRepository(),
        _canceller = canceller ?? RequestCanceller(),
        super(const BranchPortalState(isLoading: true)) {
    load();
  }

  final BranchPortalRepository _repository;
  final RequestCanceller _canceller;
  int _requestGeneration = 0;

  String? get selectedBranchId => state.dashboard?.selectedBranch?.id;

  Future<void> load({String? branchId}) async {
    final generation = ++_requestGeneration;
    state = state.copyWith(
      isLoading: true,
      clearError: true,
      clearErrorKind: true,
      clearNotice: true,
    );
    try {
      final results = await Future.wait([
        _repository.fetchDashboard(
          branchId: branchId ?? selectedBranchId,
          cancelToken: _canceller.tokenFor('dashboard'),
        ),
        _repository.fetchLeaveQueue(
          cancelToken: _canceller.tokenFor('leaves'),
        ),
      ]);
      if (generation != _requestGeneration) return;
      state = state.copyWith(
        isLoading: false,
        dashboard: results[0] as BranchDashboard,
        leaves: results[1] as List<BranchLeaveRequest>,
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
      final results = await Future.wait([
        _repository.fetchDashboard(
          branchId: selectedBranchId,
          cancelToken: _canceller.tokenFor('dashboard'),
        ),
        _repository.fetchLeaveQueue(
          cancelToken: _canceller.tokenFor('leaves'),
        ),
      ]);
      if (generation != _requestGeneration) return;
      state = state.copyWith(
        isRefreshing: false,
        dashboard: results[0] as BranchDashboard,
        leaves: results[1] as List<BranchLeaveRequest>,
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

  Future<void> selectBranch(String branchId) => load(branchId: branchId);

  /// Records an L1 leave decision and refreshes the queue row in place.
  Future<void> decideLeave(
    BranchLeaveRequest leave, {
    required bool approve,
    String? remarks,
  }) async {
    if (!approve && (remarks == null || remarks.trim().isEmpty)) {
      state = state.copyWith(error: 'A rejection reason is required.');
      return;
    }
    state = state.copyWith(decidingLeaveId: leave.id, clearNotice: true);
    try {
      final decided = await _repository.decideLeave(
        leaveId: leave.id,
        approve: approve,
        remarks: remarks?.trim().isEmpty == true ? null : remarks?.trim(),
      );
      final updated = state.leaves
          .map((entry) => entry.id == leave.id
              ? entry.copyWith(status: decided.status, remarks: decided.remarks)
              : entry)
          .toList();
      state = state.copyWith(
        clearDecidingLeaveId: true,
        leaves: updated,
        notice: approve ? 'Leave request approved.' : 'Leave request rejected.',
      );
    } on ApiException catch (error) {
      if (error.kind == ApiErrorKind.cancelled) {
        state = state.copyWith(clearDecidingLeaveId: true);
        return;
      }
      state = state.copyWith(
        clearDecidingLeaveId: true,
        error: error.message,
        errorKind: error.kind,
      );
    }
  }

  void clearNotice() => state = state.copyWith(clearNotice: true);

  @override
  void dispose() {
    _canceller.cancelAll();
    super.dispose();
  }
}
