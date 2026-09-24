/// Student fees ViewModel (MVVM): API-backed invoice list/detail,
/// blocked-status handling, NepalPay QR, connectIPS handoff with
/// server-verified return refresh.
///
/// PAYMENT RULE: a gateway redirect/return alone NEVER marks a payment
/// successful — [confirmReturn] always re-queries the invoice status from
/// the server (`GET /api/finances/connectips/status/:txnId`) and only a
/// server-confirmed `SUCCESS` updates state.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/network/request_cancellation.dart';
import 'package:tms_mobile/core/viewmodel/base_viewmodel.dart';

import '../data/student_fees_models.dart';
import '../data/student_fees_repository.dart';

/// Server-verified payment outcome after a gateway return.
enum PaymentOutcome { pending, success, failed, unknown }

@immutable
class StudentFeesState extends ViewModelState {
  const StudentFeesState({
    this.invoices = const [],
    this.selectedId,
    this.blocked = false,
    this.outstanding = 0,
    this.isEmpty = false,
    this.isDenied = false,
    this.isOffline = false,
    this.qr,
    this.isQrLoading = false,
    this.handoff,
    this.isHandoffLoading = false,
    this.paymentOutcome = PaymentOutcome.pending,
    this.isVerifying = false,
    this.verifiedTxnId,
    this.notice,
    super.error,
    super.isLoading,
  });

  final List<ApiStudentInvoice> invoices;
  final String? selectedId;
  final bool blocked;
  final double outstanding;
  final bool isEmpty;
  final bool isDenied;
  final bool isOffline;
  final NepalPayQr? qr;
  final bool isQrLoading;
  final ConnectIpsHandoff? handoff;
  final bool isHandoffLoading;
  final PaymentOutcome paymentOutcome;
  final bool isVerifying;
  final String? verifiedTxnId;
  final String? notice;

  ApiStudentInvoice? get selected {
    for (final invoice in invoices) {
      if (invoice.id == selectedId) return invoice;
    }
    return null;
  }

  StudentFeesState copyWith({
    List<ApiStudentInvoice>? invoices,
    String? selectedId,
    bool? blocked,
    double? outstanding,
    bool? isEmpty,
    bool? isDenied,
    bool? isOffline,
    NepalPayQr? qr,
    bool clearQr = false,
    bool? isQrLoading,
    ConnectIpsHandoff? handoff,
    bool clearHandoff = false,
    bool? isHandoffLoading,
    PaymentOutcome? paymentOutcome,
    bool? isVerifying,
    String? verifiedTxnId,
    String? notice,
    bool clearNotice = false,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return StudentFeesState(
      invoices: invoices ?? this.invoices,
      selectedId: selectedId ?? this.selectedId,
      blocked: blocked ?? this.blocked,
      outstanding: outstanding ?? this.outstanding,
      isEmpty: isEmpty ?? this.isEmpty,
      isDenied: isDenied ?? this.isDenied,
      isOffline: isOffline ?? this.isOffline,
      qr: clearQr ? null : (qr ?? this.qr),
      isQrLoading: isQrLoading ?? this.isQrLoading,
      handoff: clearHandoff ? null : (handoff ?? this.handoff),
      isHandoffLoading: isHandoffLoading ?? this.isHandoffLoading,
      paymentOutcome: paymentOutcome ?? this.paymentOutcome,
      isVerifying: isVerifying ?? this.isVerifying,
      verifiedTxnId: verifiedTxnId ?? this.verifiedTxnId,
      notice: clearNotice ? null : (notice ?? this.notice),
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class StudentFeesViewModel extends BaseViewModel<StudentFeesState> {
  StudentFeesViewModel({StudentFeesRepository? repository})
      : _repository = repository ?? StudentFeesRepository(),
        super(const StudentFeesState()) {
    load();
  }

  final StudentFeesRepository _repository;
  final RequestCanceller _canceller = RequestCanceller();

  @override
  void dispose() {
    _canceller.dispose();
    super.dispose();
  }

  /// Loads invoices + blocked status from the student portal.
  Future<void> load() async {
    _canceller.cancel('fees');
    final token = _canceller.tokenFor('fees');
    state = state.copyWith(
      isLoading: true,
      clearError: true,
      isDenied: false,
      isOffline: false,
      isEmpty: false,
    );
    try {
      final result = await _repository.fetchPortal(cancelToken: token);
      state = state.copyWith(
        isLoading: false,
        invoices: result.invoices,
        blocked: result.blocked.blocked,
        outstanding: result.blocked.outstanding,
        isEmpty: result.invoices.isEmpty,
        selectedId: result.invoices.isEmpty
            ? null
            : (state.selectedId ?? result.invoices.first.id),
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

  void selectInvoice(String id) {
    state = state.copyWith(
      selectedId: id,
      clearQr: true,
      clearHandoff: true,
      paymentOutcome: PaymentOutcome.pending,
      clearNotice: true,
    );
  }

  /// Loads the NepalPay QR payload for the selected invoice.
  Future<void> loadQr() async {
    final id = state.selectedId;
    if (id == null || state.isQrLoading) return;
    state = state.copyWith(isQrLoading: true, clearError: true, clearQr: true);
    try {
      final qr = await _repository.fetchNepalPayQr(id);
      state = state.copyWith(isQrLoading: false, qr: qr);
    } on ApiException catch (e) {
      if (e.kind == ApiErrorKind.cancelled) {
        state = state.copyWith(isQrLoading: false);
        return;
      }
      state = state.copyWith(
        isQrLoading: false,
        error: e.message,
        isOffline: e.kind == ApiErrorKind.noConnection,
      );
    } catch (e) {
      state = state.copyWith(isQrLoading: false, error: '$e');
    }
  }

  /// Starts a connectIPS payment and exposes the gateway handoff.
  Future<void> startPayment() async {
    final id = state.selectedId;
    if (id == null || state.isHandoffLoading) return;
    state = state.copyWith(
      isHandoffLoading: true,
      clearError: true,
      clearHandoff: true,
      paymentOutcome: PaymentOutcome.pending,
    );
    try {
      final handoff = await _repository.initiateConnectIps(id);
      state = state.copyWith(isHandoffLoading: false, handoff: handoff);
    } on ApiException catch (e) {
      if (e.kind == ApiErrorKind.cancelled) {
        state = state.copyWith(isHandoffLoading: false);
        return;
      }
      state = state.copyWith(
        isHandoffLoading: false,
        error: e.message,
        isOffline: e.kind == ApiErrorKind.noConnection,
      );
    } catch (e) {
      state = state.copyWith(isHandoffLoading: false, error: '$e');
    }
  }

  /// Handles the gateway return for [txnId].
  ///
  /// Always re-queries the server for the verified status and refreshes the
  /// invoice list on success. A redirect alone never flips the outcome.
  Future<void> confirmReturn(String txnId) async {
    if (txnId.isEmpty || state.isVerifying) return;
    state = state.copyWith(
      isVerifying: true,
      clearError: true,
      paymentOutcome: PaymentOutcome.pending,
      verifiedTxnId: txnId,
    );
    try {
      final verification = await _repository.verifyPaymentStatus(txnId);
      if (verification.isSuccess) {
        await _repository.fetchInvoices();
        final invoices = _repository.cachedInvoices;
        state = state.copyWith(
          isVerifying: false,
          paymentOutcome: PaymentOutcome.success,
          invoices: invoices,
          isEmpty: invoices.isEmpty,
          notice: 'Payment verified by the server. Invoice is paid.',
        );
      } else {
        state = state.copyWith(
          isVerifying: false,
          paymentOutcome: PaymentOutcome.failed,
          notice:
              'Server reports payment status "${verification.status}". No amount was marked paid.',
        );
      }
    } on ApiException catch (e) {
      if (e.kind == ApiErrorKind.cancelled) {
        state = state.copyWith(isVerifying: false);
        return;
      }
      state = state.copyWith(
        isVerifying: false,
        paymentOutcome: PaymentOutcome.unknown,
        error: e.message,
        isOffline: e.kind == ApiErrorKind.noConnection,
        notice: 'Could not verify the payment yet. Retry verification.',
      );
    } catch (e) {
      state = state.copyWith(
        isVerifying: false,
        paymentOutcome: PaymentOutcome.unknown,
        error: '$e',
      );
    }
  }

  void dismissNotice() => state = state.copyWith(clearNotice: true);
}

final studentFeesViewModelProvider =
    StateNotifierProvider<StudentFeesViewModel, StudentFeesState>((ref) {
  return StudentFeesViewModel();
});
