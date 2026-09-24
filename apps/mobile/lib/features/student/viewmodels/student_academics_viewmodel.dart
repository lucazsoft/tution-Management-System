/// Academics ViewModel: results, syllabus, homework, insights (MOB-102).
///
/// Loads [StudentPortalSnapshot] for the signed-in student via
/// [StudentAcademicsRepository] and exposes client-paginated windows
/// (`pageSize` items at a time) for the paginated detail views.
library;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/network/pagination.dart';
import 'package:tms_mobile/core/viewmodel/base_viewmodel.dart';

import '../data/student_academics_repository.dart';
import '../models/student_academics_api.dart';

@immutable
class StudentAcademicsState extends ViewModelState {
  const StudentAcademicsState({
    this.snapshot,
    this.detail,
    this.visibleResults = 10,
    this.visibleHomework = 10,
    this.detailLoading = false,
    this.offline = false,
    this.accessDenied = false,
    this.sessionExpired = false,
    super.error,
    super.isLoading,
  });

  final StudentPortalSnapshot? snapshot;
  final StudentPerformanceDetail? detail;
  final int visibleResults;
  final int visibleHomework;
  final bool detailLoading;
  final bool offline;
  final bool accessDenied;
  final bool sessionExpired;

  List<AcademicResult> get results => snapshot?.results ?? const [];
  List<HomeworkTask> get homework => snapshot?.homework ?? const [];
  List<PerformanceInsight> get insights => snapshot?.insights ?? const [];
  List<SyllabusSummary> get syllabi => snapshot?.syllabi ?? const [];

  List<AcademicResult> get pagedResults =>
      results.take(visibleResults).toList();
  List<HomeworkTask> get pagedHomework =>
      homework.take(visibleHomework).toList();

  bool get hasMoreResults => visibleResults < results.length;
  bool get hasMoreHomework => visibleHomework < homework.length;

  bool get hasData => snapshot != null;

  StudentAcademicsState copyWith({
    StudentPortalSnapshot? snapshot,
    StudentPerformanceDetail? detail,
    int? visibleResults,
    int? visibleHomework,
    bool? detailLoading,
    bool? offline,
    bool? accessDenied,
    bool? sessionExpired,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return StudentAcademicsState(
      snapshot: snapshot ?? this.snapshot,
      detail: detail ?? this.detail,
      visibleResults: visibleResults ?? this.visibleResults,
      visibleHomework: visibleHomework ?? this.visibleHomework,
      detailLoading: detailLoading ?? this.detailLoading,
      offline: offline ?? this.offline,
      accessDenied: accessDenied ?? this.accessDenied,
      sessionExpired: sessionExpired ?? this.sessionExpired,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class StudentAcademicsViewModel extends BaseViewModel<StudentAcademicsState> {
  StudentAcademicsViewModel({StudentAcademicsRepository? repository})
      : _repository = repository ?? StudentAcademicsRepository(),
        super(const StudentAcademicsState());

  final StudentAcademicsRepository _repository;

  static const int pageSize = 10;

  Future<void> load({CancelToken? cancelToken}) async {
    state = state.copyWith(
      isLoading: true,
      clearError: true,
      offline: false,
      accessDenied: false,
      sessionExpired: false,
    );
    try {
      final snapshot = await _repository.fetchPortal(cancelToken: cancelToken);
      state = state.copyWith(
        isLoading: false,
        snapshot: snapshot,
        visibleResults: pageSize,
        visibleHomework: pageSize,
      );
    } on ApiException catch (e) {
      state =
          state.copyWith(isLoading: false, error: e.message)._applyFailure(e);
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Could not load academics. Please try again.',
      );
    }
  }

  Future<void> refresh({CancelToken? cancelToken}) => load(
        cancelToken: cancelToken,
      );

  void loadMoreResults() {
    if (!state.hasMoreResults) return;
    state = state.copyWith(
      visibleResults: state.visibleResults + pageSize,
    );
  }

  void loadMoreHomework() {
    if (!state.hasMoreHomework) return;
    state = state.copyWith(
      visibleHomework: state.visibleHomework + pageSize,
    );
  }

  /// Pulls score/insight/remark detail for the student's own record.
  Future<void> loadDetail({CancelToken? cancelToken}) async {
    final enrollmentId = state.snapshot?.enrollmentId ?? '';
    if (enrollmentId.isEmpty || state.detailLoading) return;
    state = state.copyWith(detailLoading: true, clearError: true);
    try {
      final detail = await _repository.fetchPerformance(
        enrollmentId,
        cancelToken: cancelToken,
      );
      state = state.copyWith(detailLoading: false, detail: detail);
    } on ApiException catch (e) {
      state = state
          .copyWith(detailLoading: false, error: e.message)
          ._applyFailure(e);
    } catch (_) {
      state = state.copyWith(
        detailLoading: false,
        error: 'Could not load performance detail. Please try again.',
      );
    }
  }

  /// Windows the loaded results through the shared [PagedResult] type so
  /// detail views paginate one way even before server pagination lands.
  PagedResult<AcademicResult> resultsPage(PagedQuery query) =>
      _repository.slicePage(state.results, query);

  PagedResult<HomeworkTask> homeworkPage(PagedQuery query) =>
      _repository.slicePage(state.homework, query);
}

extension on StudentAcademicsState {
  StudentAcademicsState _applyFailure(ApiException e) {
    return copyWith(
      offline:
          e.kind == ApiErrorKind.noConnection || e.kind == ApiErrorKind.timeout,
      accessDenied: e.kind == ApiErrorKind.forbidden,
      sessionExpired: e.kind == ApiErrorKind.unauthorized,
    );
  }
}

final studentAcademicsViewModelProvider =
    StateNotifierProvider<StudentAcademicsViewModel, StudentAcademicsState>(
        (ref) {
  return StudentAcademicsViewModel();
});
