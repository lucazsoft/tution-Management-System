/// API-backed repository for the parent portal.
///
/// Wired endpoints (verified in `services/api/src`, read-only here):
/// - `GET /api/parent/portal` (+ optional `?studentId=`) — children,
///   selected child, today's sessions, attendance (latest 60), invoices
///   (latest 24), remarks + derived performance signals, leaves,
///   certificates, events, notifications. Identity comes from the Better
///   Auth session cookie; `studentId` is a *selector only* — the server
///   returns 404 unless the student is linked to the signed-in parent, so a
///   client-passed id is never authority for scope.
/// - `GET /api/performance/student/:studentId` — score/insight/remark
///   detail for a linked child. The id is always a portal `children[].id`,
///   never user input.
/// - `POST /api/finances/connectips/initiate/:invoiceId` — starts a
///   connectIPS payment for a child's invoice (parent-link authorized).
/// - `GET /api/finances/connectips/status/:txnId` — server-verified payment
///   status; the ONLY source of truth after the gateway return.
///
/// Missing server-side (typed [ApiException] + TODO, never demo data):
/// - No paginated `GET` for attendance history (portal caps at 60) —
///   [pageAttendance] windows the snapshot client-side.
/// - No `GET /api/finances/invoices/:id` — [invoiceDetail] resolves from the
///   portal snapshot cache; refresh when it misses.
/// - No parent-scoped receipt download — [receiptUrl] is a TODO against the
///   certificates download pattern.
/// - No per-class homework feed scoped to a parent — academics surfaces
///   portal remarks/signals plus performance detail only.
library;

import 'package:dio/dio.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/network/api_exception.dart';

import '../models/parent_portal.dart';

/// connectIPS handoff: post [fields] to [gatewayUrl] in an external browser.
class ParentPaymentHandoff {
  const ParentPaymentHandoff({
    required this.txnId,
    required this.invoiceId,
    required this.gatewayUrl,
    required this.fields,
  });

  final String txnId;
  final String invoiceId;
  final String gatewayUrl;
  final Map<String, String> fields;

  factory ParentPaymentHandoff.fromJson(Map<String, dynamic> json) {
    final payment = json['payment'] is Map<String, dynamic>
        ? json['payment'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final rawFields = json['fields'];
    return ParentPaymentHandoff(
      txnId: '${payment['txnId'] ?? json['txnId'] ?? json['TXNID'] ?? ''}',
      invoiceId: '${payment['invoiceId'] ?? json['invoiceId'] ?? ''}',
      gatewayUrl:
          '${json['gatewayUrl'] ?? json['url'] ?? json['gateway_url'] ?? ''}',
      fields: rawFields is Map
          ? rawFields.map((key, value) => MapEntry('$key', '$value'))
          : const {},
    );
  }
}

/// Server-verified payment outcome.
class ParentPaymentVerification {
  const ParentPaymentVerification({
    required this.txnId,
    required this.status,
    required this.raw,
  });

  final String txnId;
  final String status;
  final Map<String, dynamic> raw;

  bool get isPaid =>
      status.toUpperCase() == 'PAID' ||
      status.toUpperCase() == 'SUCCESS' ||
      status.toUpperCase() == 'COMPLETED';

  factory ParentPaymentVerification.fromJson(Map<String, dynamic> json) =>
      ParentPaymentVerification(
        txnId: '${json['txnId'] ?? json['TXNID'] ?? ''}',
        status: '${json['status'] ?? 'UNKNOWN'}',
        raw: json,
      );
}

/// Score/insight detail for one linked child.
class ParentPerformanceDetail {
  const ParentPerformanceDetail({
    required this.scores,
    required this.insights,
    required this.remarks,
  });

  final List<Map<String, dynamic>> scores;
  final List<Map<String, dynamic>> insights;
  final List<ParentRemark> remarks;

  factory ParentPerformanceDetail.fromJson(Map<String, dynamic> json) =>
      ParentPerformanceDetail(
        scores: [
          for (final row in (json['scores'] as List? ?? const []))
            if (row is Map<String, dynamic>) row,
        ],
        insights: [
          for (final row in (json['insights'] as List? ?? const []))
            if (row is Map<String, dynamic>) row,
        ],
        remarks: [
          for (final row in (json['remarks'] as List? ?? const []))
            if (row is Map<String, dynamic>)
              ParentRemark(
                id: '${row['id'] ?? ''}',
                subject: '${row['subject'] ?? ''}',
                author: row['author'] is Map
                    ? '${(row['author'] as Map)['firstName'] ?? ''} ${(row['author'] as Map)['lastName'] ?? ''}'
                        .trim()
                    : '${row['author'] ?? ''}',
                message: '${row['message'] ?? ''}',
                date: '${row['createdAt'] ?? ''}',
                signal: '${row['signal'] ?? 'Stable'}',
              ),
        ],
      );
}

class ParentPortalRepository {
  ParentPortalRepository({Dio? dio}) : _dio = dio ?? ApiClient.instance.dio;

  final Dio _dio;
  int _portalGeneration = 0;
  bool _disposed = false;

  /// Consolidated parent portal path (identity from session cookie).
  static const String portalPath = '/api/parent/portal';
  static const String performancePath = '/api/performance/student';
  static const String connectIpsInitiatePath =
      '/api/finances/connectips/initiate';
  static const String connectIpsStatusPath = '/api/finances/connectips/status';
  static const String messagesPath = '/api/communication/messages';
  static const String appointmentsPath = '/api/appointments';
  static const String leaveRequestPath = '/api/leaves/request';

  Future<void> requestLeave({
    required ParentChild child,
    required String leaveType,
    required DateTime startDate,
    required DateTime endDate,
    required String reason,
  }) async {
    try {
      await _dio.post<dynamic>(leaveRequestPath, data: {
        'studentId': child.id,
        'branchId': child.branchId,
        'leaveType': leaveType,
        'startDate': startDate.toIso8601String(),
        'endDate': endDate.toIso8601String(),
        'reason': reason,
      });
    } on DioException catch (error) {
      throw ApiException.from(error);
    }
  }

  final List<ParentInvoice> _invoiceCache = [];

  Future<void> sendMessage(
      {required String studentId,
      required String receiverId,
      required String text}) async {
    try {
      await _dio.post(messagesPath, data: {
        'studentId': studentId,
        'receiverId': receiverId,
        'messageText': text.trim()
      });
    } on DioException catch (error) {
      throw ApiException.from(error);
    }
  }

  Future<void> requestAppointment({
    required ParentChild child,
    required ParentContact contact,
    required DateTime scheduledTime,
    required String remarks,
  }) async {
    try {
      await _dio.post('$appointmentsPath/request', data: {
        'studentId': child.id,
        if (contact.role == 'BRANCH_ADMIN')
          'branchId': child.branchId
        else
          'teacherId': contact.id,
        'target': contact.role,
        'scheduledTime': scheduledTime.toUtc().toIso8601String(),
        'remarks': remarks.trim(),
        'isGroup': false,
        'participantIds': <String>[],
      });
    } on DioException catch (error) {
      throw ApiException.from(error);
    }
  }

  Future<void> respondToAppointment(String appointmentId, String action) async {
    try {
      await _dio.post(
        '$appointmentsPath/parent-respond/${Uri.encodeComponent(appointmentId)}',
        data: {'action': action},
      );
    } on DioException catch (error) {
      throw ApiException.from(error);
    }
  }

  /// Drops session-scoped snapshot data owned by this repository.
  void dispose() {
    _disposed = true;
    _portalGeneration++;
    _invoiceCache.clear();
  }

  /// Loads the portal snapshot. When [studentId] is given it is sent as a
  /// selector only (`?studentId=`); the server authorizes the link.
  Future<ParentPortal> fetchPortal({
    String? studentId,
    CancelToken? cancelToken,
  }) async {
    final generation = ++_portalGeneration;
    try {
      final response = await _dio.get<dynamic>(
        portalPath,
        queryParameters: {
          if (studentId != null && studentId.isNotEmpty) 'studentId': studentId,
        },
        cancelToken: cancelToken,
      );
      final body = response.data;
      if (body is! Map<String, dynamic>) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'The parent portal returned an unexpected response.',
        );
      }
      final portal = ParentPortal.fromJson(body);
      if (!_disposed && generation == _portalGeneration) {
        _invoiceCache
          ..clear()
          ..addAll(portal.invoices);
      }
      return portal;
    } on DioException catch (error) {
      throw ApiException.from(error);
    }
  }

  /// Score/insight/remark detail for a linked child id from the portal.
  Future<ParentPerformanceDetail> fetchPerformance(
    String studentId, {
    CancelToken? cancelToken,
  }) async {
    if (studentId.isEmpty) {
      throw const ApiException(
        kind: ApiErrorKind.unknown,
        message: 'Child record is not linked yet.',
      );
    }
    try {
      final response = await _dio.get<dynamic>(
        '$performancePath/$studentId',
        cancelToken: cancelToken,
      );
      final body = response.data;
      if (body is! Map<String, dynamic>) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'Performance detail returned an unexpected response.',
        );
      }
      return ParentPerformanceDetail.fromJson(body);
    } on DioException catch (error) {
      throw ApiException.from(error);
    }
  }

  /// Windows the snapshot attendance list into pages.
  ///
  /// TODO(api): switch to server-side pagination once the parent portal
  /// exposes a paged attendance `GET` (snapshot caps at 60).
  List<ParentAttendanceRecord> pageAttendance(
    List<ParentAttendanceRecord> all, {
    int page = 1,
    int pageSize = 20,
  }) {
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 20;
    final start = (page - 1) * pageSize;
    if (start >= all.length) return const [];
    final end = (start + pageSize).clamp(0, all.length);
    return all.sublist(start, end);
  }

  /// Invoice detail resolved from the portal snapshot cache.
  ///
  /// TODO(api): add `GET /api/finances/invoices/:id` (parent-scoped) so
  /// detail no longer depends on a prior portal fetch.
  ParentInvoice invoiceDetail(String id) {
    for (final invoice in _invoiceCache) {
      if (invoice.id == id) return invoice;
    }
    throw const ApiException(
      kind: ApiErrorKind.notFound,
      message: 'Invoice not found. Refresh the list and try again.',
    );
  }

  /// Receipt download URL for an invoice.
  ///
  /// TODO(api): add a parent-scoped invoice receipt/download endpoint;
  /// there is currently no server route serving parent invoice receipts.
  String receiptUrl(String invoiceId) {
    throw ApiException(
      kind: ApiErrorKind.notFound,
      message: 'Receipt download for invoice $invoiceId is not available yet.',
    );
  }

  /// Starts a connectIPS payment for a child's invoice.
  Future<ParentPaymentHandoff> initiateConnectIps(
    String invoiceId, {
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _dio.post<dynamic>(
        '$connectIpsInitiatePath/$invoiceId',
        cancelToken: cancelToken,
      );
      final body = response.data;
      if (body is! Map<String, dynamic>) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'Payment initiation returned an unexpected response.',
        );
      }
      return ParentPaymentHandoff.fromJson(body);
    } on DioException catch (error) {
      throw ApiException.from(error);
    }
  }

  /// Server-verified payment status — the ONLY source of truth after the
  /// gateway return; a client redirect alone never marks success.
  Future<ParentPaymentVerification> verifyPaymentStatus(
    String txnId, {
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _dio.get<dynamic>(
        '$connectIpsStatusPath/$txnId',
        cancelToken: cancelToken,
      );
      final body = response.data;
      if (body is! Map<String, dynamic>) {
        throw const ApiException(
          kind: ApiErrorKind.unknown,
          message: 'Payment status returned an unexpected response.',
        );
      }
      return ParentPaymentVerification.fromJson(body);
    } on DioException catch (error) {
      throw ApiException.from(error);
    }
  }
}
