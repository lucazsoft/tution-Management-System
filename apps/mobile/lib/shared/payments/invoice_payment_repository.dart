/// Invoice checkout shared by the student and parent apps.
///
/// Server contracts (services/api/src/routes/finances.ts), both authorized
/// per invoice for the student, a linked parent, or branch/tenant staff:
/// - `GET /api/finances/invoices/:invoiceId/payment-settings` → the static
///   QR and bank details configured for the invoice's branch in Payment
///   settings, falling back to the institution default. The branch is
///   resolved from the invoice server-side, never chosen by the client.
/// - `POST /api/finances/manual-payment/:invoiceId`
///   `{ referenceId, receiptProof }` → records a QR/bank payment for staff
///   verification. `receiptProof` is a PNG/JPEG/WebP data URI under 1 MB.
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/network/api_exception.dart';

/// Payment instructions for one invoice.
class InvoicePaymentSettings {
  const InvoicePaymentSettings({
    required this.connectIpsEnabled,
    required this.staticQrEnabled,
    required this.fromBranch,
    this.staticQrImageUrl,
    this.accountName,
    this.accountNumber,
    this.bankName,
    this.instructions,
  });

  final bool connectIpsEnabled;
  final bool staticQrEnabled;

  /// True when the invoice's branch has its own QR; false for the
  /// institution-wide default.
  final bool fromBranch;
  final String? staticQrImageUrl;
  final String? accountName;
  final String? accountNumber;
  final String? bankName;
  final String? instructions;

  bool get hasQr => staticQrEnabled && (staticQrImageUrl ?? '').isNotEmpty;

  factory InvoicePaymentSettings.fromJson(Map<String, dynamic> json) {
    String? text(String key) {
      final value = json[key]?.toString().trim() ?? '';
      return value.isEmpty ? null : value;
    }

    return InvoicePaymentSettings(
      connectIpsEnabled: json['connectIpsEnabled'] == true,
      staticQrEnabled: json['staticQrEnabled'] == true,
      fromBranch: json['source'] == 'branch',
      staticQrImageUrl: text('staticQrImageUrl'),
      accountName: text('accountName'),
      accountNumber: text('accountNumber'),
      bankName: text('bankName'),
      instructions: text('instructions'),
    );
  }
}

/// Receipt image limits mirror the server's validation.
const int kMaxReceiptBytes = 1000000;

/// Builds the `data:` URI the API expects. The picker re-encodes with
/// `imageQuality`, so anything that is not PNG/WebP is sent as JPEG.
String receiptDataUri(Uint8List bytes, String fileName) {
  final lower = fileName.toLowerCase();
  final mime = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg';
  return 'data:$mime;base64,${base64Encode(bytes)}';
}

class InvoicePaymentRepository {
  InvoicePaymentRepository({Dio? dio}) : _dio = dio ?? ApiClient.instance.dio;

  final Dio _dio;

  Future<InvoicePaymentSettings> fetchSettings(String invoiceId) async {
    for (var attempt = 0;; attempt++) {
      try {
        final response = await _dio.get<Map<String, dynamic>>(
          '/api/finances/invoices/${Uri.encodeComponent(invoiceId)}/payment-settings',
        );
        return InvoicePaymentSettings.fromJson(response.data ?? const {});
      } on DioException catch (error) {
        final transient = const [
          DioExceptionType.connectionError,
          DioExceptionType.connectionTimeout,
          DioExceptionType.receiveTimeout,
        ].contains(error.type);
        if (attempt >= 2 || !transient) throw ApiException.from(error);
        await Future<void>.delayed(
            Duration(milliseconds: 300 * (1 << attempt)));
      }
    }
  }

  /// Submits the payer's transaction reference and receipt for verification.
  Future<void> submitManualPayment(
    String invoiceId, {
    required String referenceId,
    required String receiptDataUri,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/api/finances/manual-payment/${Uri.encodeComponent(invoiceId)}',
        data: {'referenceId': referenceId, 'receiptProof': receiptDataUri},
      );
    } on DioException catch (error) {
      throw ApiException.from(error);
    }
  }
}
