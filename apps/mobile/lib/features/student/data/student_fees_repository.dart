/// API-backed repository for student invoices, blocked status, NepalPay QR,
/// and the connectIPS handoff + server-verified return flow.
///
/// Verified server contracts (read-only, services/api/src):
/// - `GET /api/users/me/student-portal` (auth, session cookie) →
///   `studentProfile { blocked, outstanding, enrollmentId }`, `invoices[]`
/// - `GET /api/finances/students/:studentId/invoices` (auth) → `invoices[]`
///   with `status`, `overdue`, `dueDate`, amounts
/// - `GET /api/finances/nepalpay-qr/:invoiceId` (auth) → QR payload
/// - `POST /api/finances/connectips/initiate/:invoiceId` (auth) →
///   `{ payment, gatewayUrl, fields }`
/// - `GET /api/finances/connectips/status/:txnId` (auth) → verified status
///
/// Missing on the server (typed [ApiException] + TODO, never demo data):
/// - TODO(api): no dedicated single-invoice GET — detail is resolved from
///   the fetched invoice list via [invoiceDetail].
library;

import 'package:dio/dio.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/network/api_exception.dart';

import 'student_fees_models.dart';

/// Repository for student fees and payments. All calls go through the shared
/// [ApiClient.dio] so the Better Auth session cookie is attached.
class StudentFeesRepository {
  StudentFeesRepository({Dio? dio})
      : _dio = dio ?? ApiClient.instance.dio;

  final Dio _dio;

  /// Payment instructions are scoped by the authorized invoice's branch.
  Future<Map<String, dynamic>> fetchPaymentSettings(String invoiceId) async {
    for (var attempt = 0; ; attempt++) {
      try {
        final response = await _dio.get<Map<String, dynamic>>(
          '/api/finances/invoices/${Uri.encodeComponent(invoiceId)}/payment-settings',
        );
        return response.data ?? const {};
      } on DioException catch (error) {
        if (attempt >= 2 || ![
          DioExceptionType.connectionError,
          DioExceptionType.connectionTimeout,
          DioExceptionType.receiveTimeout,
        ].contains(error.type)) {
          throw ApiException.from(error);
        }
        await Future<void>.delayed(Duration(milliseconds: 300 * (1 << attempt)));
      }
    }
  }

  List<ApiStudentInvoice> _cache = const [];
  String? _enrollmentId;

  /// Cached invoices from the last fetch (detail resolves from this).
  List<ApiStudentInvoice> get cachedInvoices => _cache;

  /// Loads the student portal: invoice list + blocked status + enrollment id.
  Future<({List<ApiStudentInvoice> invoices, FeeBlockedStatus blocked})>
      fetchPortal({CancelToken? cancelToken}) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/users/me/student-portal',
        cancelToken: cancelToken,
      );
      final data = res.data ?? const {};
      final profile = data['studentProfile'] is Map
          ? Map<String, dynamic>.from(data['studentProfile'] as Map)
          : const <String, dynamic>{};
      _enrollmentId = profile['enrollmentId']?.toString();
      final invoices = (data['invoices'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => ApiStudentInvoice.fromJson(Map<String, dynamic>.from(e)))
          .toList();
      _cache = invoices;
      final blocked = FeeBlockedStatus(
        blocked: profile['blocked'] as bool? ??
            invoices.any((i) => i.state == ApiFeeState.overdue),
        outstanding: (profile['outstanding'] as num?)?.toDouble() ??
            invoices
                .where((i) => i.state != ApiFeeState.paid)
                .fold<double>(0, (sum, i) => sum + i.netPayable),
      );
      return (invoices: invoices, blocked: blocked);
    } on DioException catch (e) {
      throw ApiException.from(e);
    }
  }

  /// Full invoice list for one student (uses the portal `enrollmentId` when
  /// [studentId] is omitted).
  Future<List<ApiStudentInvoice>> fetchInvoices({
    String? studentId,
    CancelToken? cancelToken,
  }) async {
    final id = studentId ?? _enrollmentId;
    if (id == null || id.isEmpty) {
      // Resolve the id from the portal first; the server keys invoices by
      // student record id, which the client only learns from the portal.
      await fetchPortal(cancelToken: cancelToken);
    }
    final resolved = studentId ?? _enrollmentId;
    if (resolved == null || resolved.isEmpty) {
      throw const ApiException(
        kind: ApiErrorKind.unknown,
        message: 'Could not resolve your student record.',
      );
    }
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/finances/students/$resolved/invoices',
        cancelToken: cancelToken,
      );
      final raw = (res.data?['invoices'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      final invoices = raw.map(_financesInvoiceFromJson).toList();
      _cache = invoices;
      return invoices;
    } on DioException catch (e) {
      throw ApiException.from(e);
    }
  }

  /// Invoice detail resolved from the fetched list.
  ///
  /// TODO(api): add `GET /api/finances/invoices/:id` (student-scoped) so
  /// detail no longer depends on a prior list fetch.
  ApiStudentInvoice invoiceDetail(String id) {
    for (final invoice in _cache) {
      if (invoice.id == id) return invoice;
    }
    throw const ApiException(
      kind: ApiErrorKind.notFound,
      message: 'Invoice not found. Refresh the list and try again.',
    );
  }

  /// NepalPay QR payload for one invoice.
  Future<NepalPayQr> fetchNepalPayQr(
    String invoiceId, {
    CancelToken? cancelToken,
  }) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/finances/nepalpay-qr/$invoiceId',
        cancelToken: cancelToken,
      );
      return NepalPayQr.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw ApiException.from(e);
    }
  }

  /// Starts a connectIPS payment; returns the handoff (post `fields` to
  /// `gatewayUrl` in an external browser).
  Future<ConnectIpsHandoff> initiateConnectIps(
    String invoiceId, {
    CancelToken? cancelToken,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/finances/connectips/initiate/$invoiceId',
        cancelToken: cancelToken,
      );
      return ConnectIpsHandoff.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw ApiException.from(e);
    }
  }

  /// Server-verified payment status. This is the ONLY source of truth after
  /// the gateway return — a client redirect alone never marks success.
  Future<PaymentVerification> verifyPaymentStatus(
    String txnId, {
    CancelToken? cancelToken,
  }) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/finances/connectips/status/$txnId',
        cancelToken: cancelToken,
      );
      return PaymentVerification.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw ApiException.from(e);
    }
  }

  /// Maps the finances invoice shape (`status` UNPAID/OVERDUE/PAID,
  /// `billingCycleStart`, amounts) onto [ApiStudentInvoice].
  ApiStudentInvoice _financesInvoiceFromJson(Map<String, dynamic> json) {
    final status = (json['status'] ?? '').toString().toUpperCase();
    final dueRaw = json['dueDate']?.toString() ?? '';
    final due = DateTime.tryParse(dueRaw);
    final overdue = json['overdue'] as bool? ??
        status == 'OVERDUE' ||
        (status == 'UNPAID' &&
            due != null &&
            due.isBefore(DateTime.now()));
    final state = status == 'PAID'
        ? ApiFeeState.paid
        : overdue
            ? ApiFeeState.overdue
            : ApiFeeState.upcoming;
    final cycleStart = DateTime.tryParse(
      json['billingCycleStart']?.toString() ?? '',
    );
    const months = [
      '', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    final cycle = cycleStart == null
        ? dueRaw
        : '${months[cycleStart.month]} ${cycleStart.year}';
    final amount = (json['amount'] as num?)?.toDouble() ?? 0;
    final discount = (json['discount'] as num?)?.toDouble() ?? 0;
    final fine = (json['fine'] as num?)?.toDouble() ?? 0;
    final net = (json['netPayable'] as num?)?.toDouble() ??
        amount - discount + fine;
    final type =
        (json['invoiceType'] ?? 'Tuition').toString().toLowerCase();
    final typeLabel =
        '${type[0].toUpperCase()}${type.substring(1)} dues';
    return ApiStudentInvoice(
      id: (json['id'] ?? '').toString(),
      cycle: cycle,
      dueDate: due ?? DateTime.fromMillisecondsSinceEpoch(0),
      dueDateLabel: dueRaw,
      state: state,
      netPayable: net,
      lines: [
        ApiInvoiceLine(label: typeLabel, amount: amount),
        if (discount != 0) ApiInvoiceLine(label: 'Discount', amount: -discount),
        if (fine != 0) ApiInvoiceLine(label: 'Fine', amount: fine),
      ],
      qrAvailable: status != 'PAID',
      paymentReference: json['transactionId']?.toString() ??
          json['paymentDate']?.toString(),
      overdue: overdue,
    );
  }
}
