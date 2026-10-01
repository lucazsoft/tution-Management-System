/// Student certificates ViewModel (MVVM): API-backed certificate list +
/// authenticated PDF download.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/network/request_cancellation.dart';
import 'package:tms_mobile/core/viewmodel/base_viewmodel.dart';

import '../data/student_certificates_repository.dart';

@immutable
class StudentCertificatesState extends ViewModelState {
  const StudentCertificatesState({
    this.certificates = const [],
    this.isEmpty = false,
    this.isDenied = false,
    this.isOffline = false,
    this.downloadingId,
    this.downloadProgress = 0,
    this.savedPath,
    this.savedForId,
    super.error,
    super.isLoading,
  });

  final List<ApiStudentCertificate> certificates;
  final bool isEmpty;
  final bool isDenied;
  final bool isOffline;
  final String? downloadingId;
  final double downloadProgress;
  final String? savedPath;
  final String? savedForId;

  StudentCertificatesState copyWith({
    List<ApiStudentCertificate>? certificates,
    bool? isEmpty,
    bool? isDenied,
    bool? isOffline,
    String? downloadingId,
    bool clearDownloading = false,
    double? downloadProgress,
    String? savedPath,
    bool clearSaved = false,
    String? savedForId,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return StudentCertificatesState(
      certificates: certificates ?? this.certificates,
      isEmpty: isEmpty ?? this.isEmpty,
      isDenied: isDenied ?? this.isDenied,
      isOffline: isOffline ?? this.isOffline,
      downloadingId:
          clearDownloading ? null : (downloadingId ?? this.downloadingId),
      downloadProgress: downloadProgress ?? this.downloadProgress,
      savedPath: clearSaved ? null : (savedPath ?? this.savedPath),
      savedForId: clearSaved ? null : (savedForId ?? this.savedForId),
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class StudentCertificatesViewModel
    extends BaseViewModel<StudentCertificatesState> {
  StudentCertificatesViewModel({StudentCertificatesRepository? repository})
      : _repository = repository ?? StudentCertificatesRepository(),
        super(const StudentCertificatesState()) {
    load();
  }

  final StudentCertificatesRepository _repository;
  final RequestCanceller _canceller = RequestCanceller();

  @override
  void dispose() {
    _canceller.dispose();
    super.dispose();
  }

  Future<void> load() async {
    _canceller.cancel('certificates');
    final token = _canceller.tokenFor('certificates');
    state = state.copyWith(
      isLoading: true,
      clearError: true,
      isDenied: false,
      isOffline: false,
      isEmpty: false,
    );
    try {
      final certificates =
          await _repository.fetchCertificates(cancelToken: token);
      state = state.copyWith(
        isLoading: false,
        certificates: certificates,
        isEmpty: certificates.isEmpty,
      );
    } on ApiException catch (e) {
      if (e.kind == ApiErrorKind.cancelled) return;
      state = state.copyWith(
        isLoading: false,
        error: e.message,
        isDenied: e.kind == ApiErrorKind.forbidden,
        isOffline: e.kind == ApiErrorKind.noConnection,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: '$e');
    }
  }

  Future<void> refresh() => load();

  /// Downloads the certificate PDF over the authenticated session and saves
  /// it locally. Returns the saved file for the UI to open/share by path.
  Future<void> download(ApiStudentCertificate certificate) async {
    if (state.downloadingId != null) return;
    _canceller.cancel('download');
    final token = _canceller.tokenFor('download');
    state = state.copyWith(
      downloadingId: certificate.id,
      downloadProgress: 0,
      clearError: true,
      clearSaved: true,
    );
    try {
      final result = await _repository.downloadCertificate(
        certificate,
        cancelToken: token,
        onProgress: (received, total) {
          if (total > 0) {
            state = state.copyWith(
              downloadingId: certificate.id,
              downloadProgress: received / total,
            );
          }
        },
      );
      state = state.copyWith(
        downloadingId: null,
        clearDownloading: true,
        downloadProgress: 1,
        savedPath: result.path,
        savedForId: certificate.id,
      );
    } on ApiException catch (e) {
      if (e.kind == ApiErrorKind.cancelled) {
        state = state.copyWith(clearDownloading: true);
        return;
      }
      state = state.copyWith(
        clearDownloading: true,
        error: e.message,
        isOffline: e.kind == ApiErrorKind.noConnection,
      );
    } catch (e) {
      state = state.copyWith(clearDownloading: true, error: '$e');
    }
  }

  void clearSaved() => state = state.copyWith(clearSaved: true);
}

final studentCertificatesViewModelProvider = StateNotifierProvider<
    StudentCertificatesViewModel, StudentCertificatesState>((ref) {
  ref.watch(authProvider.select((state) => state.user?.id));
  return StudentCertificatesViewModel();
});
