/// API-backed models for student fees, payments, and blocked status.
///
/// Shapes mirror the verified server contracts (read-only, services/api/src):
/// - `GET /api/users/me/student-portal` → `invoices[]`, `studentProfile`
///   (`blocked`, `outstanding`, `enrollmentId`), `certificates[]`
/// - `GET /api/finances/students/:studentId/invoices` → `invoices[]`
/// - `POST /api/finances/connectips/initiate/:invoiceId` →
///   `{ payment, gatewayUrl, fields }`
/// - `GET /api/finances/connectips/status/:txnId` → server-verified status
library;

/// Deadline state of an invoice, mapped from the server `state` strings
/// (`Paid`, `Overdue`, `Due soon`, `Upcoming`).
enum ApiFeeState { upcoming, dueSoon, overdue, paid }

ApiFeeState apiFeeStateFrom(String? raw) => switch (raw?.toLowerCase()) {
      'paid' => ApiFeeState.paid,
      'overdue' => ApiFeeState.overdue,
      'due soon' || 'due_soon' || 'duesoon' => ApiFeeState.dueSoon,
      _ => ApiFeeState.upcoming,
    };

/// One line of an invoice breakdown.
class ApiInvoiceLine {
  const ApiInvoiceLine({required this.label, required this.amount});

  final String label;
  final double amount;

  factory ApiInvoiceLine.fromJson(Map<String, dynamic> json) => ApiInvoiceLine(
        label: (json['label'] ?? '').toString(),
        amount: (json['amount'] as num?)?.toDouble() ?? 0,
      );
}

/// Invoice from the student portal / finances endpoints.
class ApiStudentInvoice {
  const ApiStudentInvoice({
    required this.id,
    required this.cycle,
    required this.dueDate,
    required this.dueDateLabel,
    required this.state,
    required this.netPayable,
    required this.lines,
    this.qrAvailable = true,
    this.paymentReference,
    this.overdue = false,
  });

  final String id;
  final String cycle;
  final DateTime dueDate;
  final String dueDateLabel;
  final ApiFeeState state;
  final double netPayable;
  final List<ApiInvoiceLine> lines;
  final bool qrAvailable;
  final String? paymentReference;
  final bool overdue;

  /// Detail for a single invoice is derived from the fetched list: the
  /// server exposes no dedicated single-invoice GET, so the repository
  /// resolves detail from the cached list (never demo data).
  factory ApiStudentInvoice.fromJson(Map<String, dynamic> json) {
    final lines = (json['lines'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => ApiInvoiceLine.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    final net = (json['netPayable'] as num?)?.toDouble() ??
        lines.fold<double>(0, (sum, l) => sum + l.amount);
    final parsedDue = DateTime.tryParse((json['dueDate'] ?? '').toString());
    return ApiStudentInvoice(
      id: (json['id'] ?? '').toString(),
      cycle: (json['cycle'] ?? '').toString(),
      dueDate: parsedDue ?? DateTime.fromMillisecondsSinceEpoch(0),
      dueDateLabel: (json['dueDate'] ?? '').toString(),
      state: apiFeeStateFrom(json['state']?.toString()),
      netPayable: net,
      lines: lines,
      qrAvailable: json['qrAvailable'] as bool? ?? true,
      paymentReference: json['paymentReference']?.toString() ??
          json['transactionId']?.toString(),
      overdue: json['overdue'] as bool? ?? false,
    );
  }
}

/// Blocked status surfaced from `studentProfile` (enrollment BLOCKED or an
/// OVERDUE invoice on the server).
class FeeBlockedStatus {
  const FeeBlockedStatus({required this.blocked, required this.outstanding});

  final bool blocked;
  final double outstanding;
}

/// connectIPS handoff: post [fields] to [gatewayUrl] in an external browser.
/// The redirect back is NEVER trusted — the caller must re-query
/// [PaymentVerification] via the status endpoint after return.
class ConnectIpsHandoff {
  const ConnectIpsHandoff({
    required this.txnId,
    required this.invoiceId,
    required this.amountPaisa,
    required this.status,
    required this.gatewayUrl,
    required this.fields,
  });

  final String txnId;
  final String invoiceId;
  final String amountPaisa;
  final String status;
  final String gatewayUrl;
  final Map<String, String> fields;

  factory ConnectIpsHandoff.fromJson(Map<String, dynamic> json) {
    final payment = json['payment'] is Map
        ? Map<String, dynamic>.from(json['payment'] as Map)
        : json;
    final rawFields = json['fields'] is Map
        ? Map<String, dynamic>.from(json['fields'] as Map)
        : const <String, dynamic>{};
    return ConnectIpsHandoff(
      txnId: (payment['txnId'] ?? '').toString(),
      invoiceId: (payment['invoiceId'] ?? '').toString(),
      amountPaisa: (payment['amountPaisa'] ?? '').toString(),
      status: (payment['status'] ?? '').toString(),
      gatewayUrl: (json['gatewayUrl'] ?? '').toString(),
      fields: rawFields.map((k, v) => MapEntry(k.toString(), v.toString())),
    );
  }
}

/// Server-verified payment status. Only `status == SUCCESS` (as confirmed by
/// this endpoint) counts as paid.
class PaymentVerification {
  const PaymentVerification({
    required this.txnId,
    required this.invoiceId,
    required this.status,
    this.gatewayStatus,
    this.confirmedAt,
  });

  final String txnId;
  final String invoiceId;
  final String status;
  final String? gatewayStatus;
  final String? confirmedAt;

  bool get isSuccess => status.toUpperCase() == 'SUCCESS';

  factory PaymentVerification.fromJson(Map<String, dynamic> json) =>
      PaymentVerification(
        txnId: (json['txnId'] ?? '').toString(),
        invoiceId: (json['invoiceId'] ?? '').toString(),
        status: (json['status'] ?? '').toString(),
        gatewayStatus: json['gatewayStatus']?.toString(),
        confirmedAt: json['confirmedAt']?.toString(),
      );
}
