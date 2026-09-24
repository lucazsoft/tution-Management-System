/// Student Home ViewModel using MVVM pattern.
///
/// Backed by [StudentPortalRepository]: one authenticated
/// `GET /api/users/me/student-portal` call per load/refresh. Views stay thin;
/// all IO, parsing and error classification live in the repository layer.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/network/request_cancellation.dart';
import 'package:tms_mobile/core/viewmodel/base_viewmodel.dart';
import 'package:tms_mobile/features/student/data/student_portal_repository.dart';
import 'package:tms_mobile/features/student/models/student_portal_dto.dart';

/// Student home state.
@immutable
class StudentHomeState extends ViewModelState {
  const StudentHomeState({
    this.portal,
    this.currentTab = 0,
    this.isRefreshing = false,
    this.errorKind,
    super.error,
    super.isLoading,
  });

  final StudentPortal? portal;
  final int currentTab;
  final bool isRefreshing;
  final ApiErrorKind? errorKind;

  bool get hasData => portal != null;
  bool get isOffline => errorKind == ApiErrorKind.noConnection;
  bool get isDenied => errorKind == ApiErrorKind.forbidden;

  StudentHomeState copyWith({
    StudentPortal? portal,
    int? currentTab,
    bool? isRefreshing,
    ApiErrorKind? errorKind,
    bool clearErrorKind = false,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return StudentHomeState(
      portal: portal ?? this.portal,
      currentTab: currentTab ?? this.currentTab,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      errorKind: clearErrorKind ? null : (errorKind ?? this.errorKind),
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

/// Student Home ViewModel.
class StudentHomeViewModel extends BaseViewModel<StudentHomeState> {
  StudentHomeViewModel({
    StudentPortalRepository? repository,
    RequestCanceller? canceller,
  })  : _repository = repository ?? StudentPortalRepository(),
        _canceller = canceller ?? RequestCanceller(),
        super(const StudentHomeState(isLoading: true)) {
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
        cancelToken: _canceller.tokenFor('portal'),
      );
      state = state.copyWith(
        isLoading: false,
        portal: portal,
        clearError: true,
        clearErrorKind: true,
      );
    } on ApiException catch (error) {
      // A cancelled request means the screen is gone; keep existing state.
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
        error: 'Failed to load the student dashboard: $error',
        clearErrorKind: true,
      );
    }
  }

  Future<void> refresh() async {
    if (state.isRefreshing) return;
    state = state.copyWith(isRefreshing: true, clearError: true);
    try {
      final portal = await _repository.fetchPortal(
        cancelToken: _canceller.tokenFor('portal'),
      );
      state = state.copyWith(
        isRefreshing: false,
        portal: portal,
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
        error: 'Failed to refresh the student dashboard: $error',
        clearErrorKind: true,
      );
    }
  }

  void setCurrentTab(int index) {
    state = state.copyWith(currentTab: index);
  }

  @override
  void dispose() {
    _canceller.cancelAll();
    super.dispose();
  }
}

/// Provider for StudentHomeViewModel.
final studentHomeViewModelProvider =
    StateNotifierProvider<StudentHomeViewModel, StudentHomeState>((ref) {
  ref.watch(authProvider.select((state) => state.user?.id));
  return StudentHomeViewModel();
});
