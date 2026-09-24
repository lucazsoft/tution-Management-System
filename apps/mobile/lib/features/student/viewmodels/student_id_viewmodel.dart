/// Student digital-ID ViewModel (MVVM, MOB-104).
///
/// Backed by [StudentIdCalendarNotificationsRepository.fetchIdCard]: one
/// authenticated `GET /api/users/me/student-portal` call per load/refresh.
/// Status/expiry rules live in [buildIdCard]; the ViewModel only maps
/// [ApiException] kinds to denied/offline flags.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/network/request_cancellation.dart';
import 'package:tms_mobile/core/viewmodel/base_viewmodel.dart';

import '../data/student_id_calendar_notifications_repository.dart';

@immutable
class StudentIdState extends ViewModelState {
  const StudentIdState({
    this.card,
    this.isDenied = false,
    this.isOffline = false,
    super.error,
    super.isLoading,
  });

  final StudentIdCard? card;
  final bool isDenied;
  final bool isOffline;

  bool get hasData => card != null;

  StudentIdState copyWith({
    StudentIdCard? card,
    bool? isDenied,
    bool? isOffline,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return StudentIdState(
      card: card ?? this.card,
      isDenied: isDenied ?? this.isDenied,
      isOffline: isOffline ?? this.isOffline,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class StudentIdViewModel extends BaseViewModel<StudentIdState> {
  StudentIdViewModel({
    StudentIdCalendarNotificationsRepository? repository,
  })  : _repository = repository ?? StudentIdCalendarNotificationsRepository(),
        super(const StudentIdState(isLoading: true)) {
    load();
  }

  final StudentIdCalendarNotificationsRepository _repository;
  final RequestCanceller _canceller = RequestCanceller();

  Future<void> load() async {
    _canceller.cancel('id');
    final token = _canceller.tokenFor('id');
    state = state.copyWith(
      isLoading: true,
      clearError: true,
      isDenied: false,
      isOffline: false,
    );
    try {
      final card = await _repository.fetchIdCard(cancelToken: token);
      state = state.copyWith(isLoading: false, card: card, clearError: true);
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
        error: 'Failed to load the digital ID: $e',
      );
    }
  }

  Future<void> refresh() => load();

  @override
  void dispose() {
    _canceller.cancelAll();
    super.dispose();
  }
}

final studentIdViewModelProvider =
    StateNotifierProvider<StudentIdViewModel, StudentIdState>((ref) {
  return StudentIdViewModel();
});
