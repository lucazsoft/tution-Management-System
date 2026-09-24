/// Attendance ViewModel: session record + approved-leave explanations.
///
/// Attendance history and leave decisions both come from the signed-in
/// student's portal snapshot (`GET /api/users/me/student-portal`).
/// Server rule (see `services/api/src/routes/attendance.ts`): an approved
/// leave overlapping a session forces that mark to `EXCUSED`, so excused
/// entries are explained inline with the matching leave decision.
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
class StudentAttendanceState extends ViewModelState {
  const StudentAttendanceState({
    this.records = const [],
    this.leaveExplanations = const [],
    this.presentCount = 0,
    this.absentCount = 0,
    this.excusedCount = 0,
    this.visibleCount = 20,
    this.offline = false,
    this.accessDenied = false,
    this.sessionExpired = false,
    super.error,
    super.isLoading,
  });

  final List<AttendanceEntry> records;
  final List<LeaveExplanation> leaveExplanations;
  final int presentCount;
  final int absentCount;
  final int excusedCount;
  final int visibleCount;
  final bool offline;
  final bool accessDenied;
  final bool sessionExpired;

  List<AttendanceEntry> get pagedRecords => records.take(visibleCount).toList();

  bool get hasMore => visibleCount < records.length;
  bool get hasData => records.isNotEmpty;
  bool get hasLoaded => !isLoading && error == null;

  double? get attendanceRate {
    final total = presentCount + absentCount + excusedCount;
    if (total == 0) return null;
    return presentCount / total;
  }

  /// Excused marks paired with their leave explanation, newest first.
  List<AttendanceExplanation> get explanations {
    final notes = leaveExplanations;
    return records.where((r) => r.isExcused).map((record) {
      LeaveExplanation? match;
      for (final note in notes) {
        if (note.message.isNotEmpty) {
          match ??= note;
          break;
        }
      }
      return AttendanceExplanation(record: record, leave: match);
    }).toList();
  }

  StudentAttendanceState copyWith({
    List<AttendanceEntry>? records,
    List<LeaveExplanation>? leaveExplanations,
    int? presentCount,
    int? absentCount,
    int? excusedCount,
    int? visibleCount,
    bool? offline,
    bool? accessDenied,
    bool? sessionExpired,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return StudentAttendanceState(
      records: records ?? this.records,
      leaveExplanations: leaveExplanations ?? this.leaveExplanations,
      presentCount: presentCount ?? this.presentCount,
      absentCount: absentCount ?? this.absentCount,
      excusedCount: excusedCount ?? this.excusedCount,
      visibleCount: visibleCount ?? this.visibleCount,
      offline: offline ?? this.offline,
      accessDenied: accessDenied ?? this.accessDenied,
      sessionExpired: sessionExpired ?? this.sessionExpired,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

/// One excused session plus the leave decision behind it, if known.
class AttendanceExplanation {
  const AttendanceExplanation({required this.record, this.leave});
  final AttendanceEntry record;
  final LeaveExplanation? leave;
}

class StudentAttendanceViewModel extends BaseViewModel<StudentAttendanceState> {
  StudentAttendanceViewModel({StudentAcademicsRepository? repository})
      : _repository = repository ?? StudentAcademicsRepository(),
        super(const StudentAttendanceState());

  final StudentAcademicsRepository _repository;

  static const int pageSize = 20;

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
        records: snapshot.attendance,
        leaveExplanations: snapshot.leaveExplanations,
        presentCount: snapshot.presentCount,
        absentCount: snapshot.absentCount,
        excusedCount: snapshot.excusedCount,
        visibleCount: pageSize,
      );
    } on ApiException catch (e) {
      state = state.copyWith(isLoading: false, error: e.message).copyWith(
            offline: e.kind == ApiErrorKind.noConnection ||
                e.kind == ApiErrorKind.timeout,
            accessDenied: e.kind == ApiErrorKind.forbidden,
            sessionExpired: e.kind == ApiErrorKind.unauthorized,
          );
    } catch (_) {
      state = state.copyWith(
        isLoading: false,
        error: 'Could not load attendance. Please try again.',
      );
    }
  }

  Future<void> refresh({CancelToken? cancelToken}) => load(
        cancelToken: cancelToken,
      );

  void loadMore() {
    if (!state.hasMore) return;
    state = state.copyWith(visibleCount: state.visibleCount + pageSize);
  }

  PagedResult<AttendanceEntry> recordsPage(PagedQuery query) =>
      _repository.slicePage(state.records, query);
}

final studentAttendanceViewModelProvider =
    StateNotifierProvider<StudentAttendanceViewModel, StudentAttendanceState>(
        (ref) {
  return StudentAttendanceViewModel();
});
