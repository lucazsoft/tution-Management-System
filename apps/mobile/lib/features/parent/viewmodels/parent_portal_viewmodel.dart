/// Parent portal ViewModel (MVVM): one authenticated portal load per
/// child selection, shared by the home, attendance, fees and academics
/// screens. Views stay thin; all IO, parsing and error classification live
/// in [ParentPortalRepository].
///
/// Child scope: [selectChild] sends the portal `children[].id` as a
/// `?studentId=` *selector only*. The server authorizes the parent link
/// (404 when unlinked), so a client-passed id is never authority.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/network/request_cancellation.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/viewmodel/base_viewmodel.dart';

import '../data/parent_portal_repository.dart';
import '../models/parent_portal.dart';

/// Shared parent portal state.
@immutable
class ParentPortalState extends ViewModelState {
  const ParentPortalState({
    this.portal,
    this.selectedChildId,
    this.isRefreshing = false,
    this.errorKind,
    super.error,
    super.isLoading,
  });

  final ParentPortal? portal;
  final String? selectedChildId;
  final bool isRefreshing;
  final ApiErrorKind? errorKind;

  bool get hasData => portal != null;
  bool get isOffline => errorKind == ApiErrorKind.noConnection;
  bool get isDenied =>
      errorKind == ApiErrorKind.forbidden ||
      errorKind == ApiErrorKind.unauthorized;
  bool get isMissingLink => errorKind == ApiErrorKind.notFound && !hasData;

  ParentChild? get selectedChild {
    final snapshot = portal;
    if (snapshot == null) return null;
    if (selectedChildId == null) return snapshot.selected;
    for (final child in snapshot.children) {
      if (child.id == selectedChildId) return child;
    }
    return snapshot.selected;
  }

  ParentPortalState copyWith({
    ParentPortal? portal,
    bool clearPortal = false,
    String? selectedChildId,
    bool? isRefreshing,
    ApiErrorKind? errorKind,
    bool clearErrorKind = false,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return ParentPortalState(
      portal: clearPortal ? null : (portal ?? this.portal),
      selectedChildId: selectedChildId ?? this.selectedChildId,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      errorKind: clearErrorKind ? null : (errorKind ?? this.errorKind),
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

/// Parent portal ViewModel shared across the parent screens.
class ParentPortalViewModel extends BaseViewModel<ParentPortalState> {
  ParentPortalViewModel({
    ParentPortalRepository? repository,
    RequestCanceller? canceller,
  })  : _repository = repository ?? ParentPortalRepository(),
        _canceller = canceller ?? RequestCanceller(),
        super(const ParentPortalState(isLoading: true)) {
    load();
  }

  final ParentPortalRepository _repository;
  final RequestCanceller _canceller;
  int _requestGeneration = 0;
  bool _disposed = false;

  ParentPortalRepository get repository => _repository;

  Future<void> load() async {
    final generation = ++_requestGeneration;
    final studentId = state.selectedChildId;
    _canceller.cancel('portal', 'Superseded by a newer portal request.');
    state = state.copyWith(
      isLoading: true,
      isRefreshing: false,
      clearError: true,
      clearErrorKind: true,
    );
    try {
      final portal = await _repository.fetchPortal(
        studentId: studentId,
        cancelToken: _canceller.tokenFor('portal'),
      );
      if (!_isCurrent(generation)) return;
      state = state.copyWith(
        isLoading: false,
        portal: portal,
        selectedChildId: portal.selected?.id ?? studentId,
        clearError: true,
        clearErrorKind: true,
      );
    } on ApiException catch (error) {
      if (!_isCurrent(generation) || error.kind == ApiErrorKind.cancelled) {
        return;
      }
      state = state.copyWith(
        isLoading: false,
        isRefreshing: false,
        error: error.message,
        errorKind: error.kind,
      );
    } catch (error) {
      if (!_isCurrent(generation)) return;
      state = state.copyWith(
        isLoading: false,
        isRefreshing: false,
        error: 'Failed to load the parent dashboard: $error',
        clearErrorKind: true,
      );
    }
  }

  /// Switches the selected child (session-scoped). The id is sent as a
  /// selector only; the server authorizes the parent link.
  Future<void> selectChild(String childId) async {
    if (childId.isEmpty || childId == state.selectedChildId) return;
    state = state.copyWith(
      selectedChildId: childId,
      clearPortal: true,
      isLoading: true,
      isRefreshing: false,
      clearError: true,
      clearErrorKind: true,
    );
    await load();
  }

  Future<void> refresh() async {
    if (state.isRefreshing) return;
    final generation = ++_requestGeneration;
    final studentId = state.selectedChildId;
    _canceller.cancel('portal', 'Superseded by a newer portal request.');
    state = state.copyWith(isRefreshing: true, clearError: true);
    try {
      final portal = await _repository.fetchPortal(
        studentId: studentId,
        cancelToken: _canceller.tokenFor('portal'),
      );
      if (!_isCurrent(generation)) return;
      state = state.copyWith(
        isLoading: false,
        isRefreshing: false,
        portal: portal,
        selectedChildId: portal.selected?.id ?? studentId,
        clearError: true,
        clearErrorKind: true,
      );
    } on ApiException catch (error) {
      if (!_isCurrent(generation)) return;
      if (error.kind == ApiErrorKind.cancelled) {
        state = state.copyWith(isLoading: false, isRefreshing: false);
        return;
      }
      state = state.copyWith(
        isLoading: false,
        isRefreshing: false,
        error: error.message,
        errorKind: error.kind,
      );
    } catch (error) {
      if (!_isCurrent(generation)) return;
      state = state.copyWith(
        isLoading: false,
        isRefreshing: false,
        error: 'Failed to refresh the parent dashboard: $error',
        clearErrorKind: true,
      );
    }
  }

  bool _isCurrent(int generation) =>
      !_disposed && generation == _requestGeneration;

  @override
  void dispose() {
    _disposed = true;
    _requestGeneration++;
    _canceller.cancelAll();
    _repository.dispose();
    super.dispose();
  }
}

String? _authenticatedParentSession(AuthState auth) =>
    auth.isAuthenticated ? auth.user?.id : null;

/// Session-scoped repository so invoice snapshots cannot cross users.
final parentPortalRepositoryProvider = Provider<ParentPortalRepository>((ref) {
  ref.watch(authProvider.select(_authenticatedParentSession));
  final repository = ParentPortalRepository();
  ref.onDispose(repository.dispose);
  return repository;
});

/// Session-scoped so the selected child survives navigation between parent
/// pages. Watching the authenticated user still resets it on logout/switch.
final parentPortalProvider =
    StateNotifierProvider<ParentPortalViewModel, ParentPortalState>(
  (ref) {
    ref.watch(authProvider.select(_authenticatedParentSession));
    return ParentPortalViewModel(
      repository: ref.watch(parentPortalRepositoryProvider),
    );
  },
);
