import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/shared/payments/invoice_payment_repository.dart';
import 'package:tms_mobile/shared/payments/invoice_payment_sheet.dart';

// 1x1 transparent PNG.
const _png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

Map<String, dynamic> branchSettings({bool connectIps = false, bool qr = true}) => {
      'connectIpsEnabled': connectIps,
      'staticQrEnabled': qr,
      'staticQrImageUrl': qr ? 'data:image/png;base64,$_png' : null,
      'accountName': 'Sanskar Dip Damak',
      'accountNumber': '0012345678',
      'bankName': 'Nabil Bank',
      'instructions': 'Mention the student name in remarks.',
      'source': 'branch',
      'branchId': 'branch-damak',
    };

class Recorder {
  final List<RequestOptions> posts = [];
}

Dio stubDio(Map<String, dynamic> settings, Recorder recorder,
    {int postStatus = 201, Map<String, dynamic>? postBody}) {
  return ApiClient.buildDio(
    baseUrl: 'https://test.invalid',
    extraInterceptors: [
      InterceptorsWrapper(onRequest: (options, handler) {
        if (options.method == 'GET' &&
            options.path == '/api/finances/invoices/inv-1/payment-settings') {
          handler.resolve(Response<dynamic>(
              requestOptions: options, statusCode: 200, data: settings));
          return;
        }
        if (options.method == 'POST' &&
            options.path == '/api/finances/manual-payment/inv-1') {
          recorder.posts.add(options);
          if (postStatus >= 400) {
            handler.reject(DioException(
              requestOptions: options,
              type: DioExceptionType.badResponse,
              response: Response<dynamic>(
                  requestOptions: options,
                  statusCode: postStatus,
                  data: postBody ?? {'error': 'Rejected'}),
            ));
            return;
          }
          handler.resolve(Response<dynamic>(
              requestOptions: options,
              statusCode: postStatus,
              data: {'status': 'PENDING'}));
          return;
        }
        handler.reject(DioException(
            requestOptions: options, message: 'unexpected ${options.path}'));
      }),
    ],
  );
}

Future<void> pumpSheet(
  WidgetTester tester, {
  required Map<String, dynamic> settings,
  Recorder? recorder,
  VoidCallback? onConnectIps,
  VoidCallback? onSubmitted,
  ReceiptPicker? pickReceipt,
  int postStatus = 201,
  Map<String, dynamic>? postBody,
}) async {
  await tester.binding.setSurfaceSize(const Size(600, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: InvoicePaymentSheet(
        invoiceId: 'inv-1',
        amount: 4500,
        title: 'Pay Kartik 2083',
        subtitle: 'Reference inv-1',
        onConnectIps: onConnectIps,
        onSubmitted: onSubmitted,
        pickReceipt: pickReceipt,
        repository: InvoicePaymentRepository(
            dio: stubDio(settings, recorder ?? Recorder(),
                postStatus: postStatus, postBody: postBody)),
      ),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  test('settings parse branch vs institution default', () {
    final branch = InvoicePaymentSettings.fromJson(branchSettings());
    expect(branch.hasQr, isTrue);
    expect(branch.fromBranch, isTrue);
    final fallback = InvoicePaymentSettings.fromJson(
        {...branchSettings(), 'source': 'tenant_default'});
    expect(fallback.fromBranch, isFalse);
    expect(
        InvoicePaymentSettings.fromJson({'staticQrEnabled': true}).hasQr, isFalse,
        reason: 'enabled without an image is not a usable QR');
  });

  test('receiptDataUri keeps PNG/WebP and sends anything else as JPEG', () {
    final bytes = Uint8List.fromList([1, 2, 3]);
    expect(receiptDataUri(bytes, 'a.PNG'), startsWith('data:image/png;base64,'));
    expect(receiptDataUri(bytes, 'a.webp'), startsWith('data:image/webp;base64,'));
    expect(receiptDataUri(bytes, 'a.heic'), startsWith('data:image/jpeg;base64,'));
  });

  testWidgets('shows the branch QR, amount and bank details', (tester) async {
    await pumpSheet(tester, settings: branchSettings());

    expect(find.text('NPR 4,500'), findsOneWidget);
    expect(find.text('Scan the branch payment QR'), findsOneWidget);
    expect(find.bySemanticsLabel('Payment QR'), findsOneWidget);
    expect(find.text('Nabil Bank'), findsOneWidget);
    expect(find.text('0012345678'), findsOneWidget);
    expect(find.text('Mention the student name in remarks.'), findsOneWidget);
  });

  testWidgets('connectIPS is hidden while disabled on the server',
      (tester) async {
    await pumpSheet(tester,
        settings: branchSettings(connectIps: false), onConnectIps: () {});
    expect(find.text('Pay online with connectIPS'), findsNothing);
  });

  testWidgets('connectIPS appears once the server enables it',
      (tester) async {
    var started = false;
    await pumpSheet(tester,
        settings: branchSettings(connectIps: true),
        onConnectIps: () => started = true);
    await tester.tap(find.text('Pay online with connectIPS'));
    await tester.pumpAndSettle();
    expect(started, isTrue);
  });

  testWidgets('branch without a QR tells the payer to pay at the branch',
      (tester) async {
    await pumpSheet(tester, settings: branchSettings(qr: false));
    expect(find.textContaining('has not been set up for this branch'),
        findsOneWidget);
    expect(find.text('Submit for verification'), findsNothing);
  });

  testWidgets('submitting needs a reference and a receipt, then posts both',
      (tester) async {
    final recorder = Recorder();
    var submitted = false;
    await pumpSheet(
      tester,
      settings: branchSettings(),
      recorder: recorder,
      onSubmitted: () => submitted = true,
      pickReceipt: () async =>
          (bytes: Uint8List.fromList(base64Decode(_png)), name: 'receipt.png'),
    );

    await tester.tap(find.text('Submit for verification'));
    await tester.pump();
    expect(find.textContaining('Enter the transaction reference'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'NB-2083-001');
    await tester.tap(find.text('Submit for verification'));
    await tester.pump();
    expect(find.text('Attach a screenshot or photo of the receipt.'),
        findsOneWidget);
    expect(recorder.posts, isEmpty);

    await tester.tap(find.text('Attach receipt'));
    await tester.pumpAndSettle();
    expect(find.text('Receipt attached · receipt.png'), findsOneWidget);

    await tester.tap(find.text('Submit for verification'));
    await tester.pumpAndSettle();

    expect(recorder.posts, hasLength(1));
    final body = recorder.posts.single.data as Map;
    expect(body['referenceId'], 'NB-2083-001');
    expect(body['receiptProof'], startsWith('data:image/png;base64,'));
    expect(find.text('Receipt submitted'), findsOneWidget);
    expect(submitted, isTrue);
  });

  testWidgets('receipts over 1 MB are refused before upload', (tester) async {
    await pumpSheet(
      tester,
      settings: branchSettings(),
      pickReceipt: () async =>
          (bytes: Uint8List(kMaxReceiptBytes + 1), name: 'big.jpg'),
    );
    await tester.tap(find.text('Attach receipt'));
    await tester.pumpAndSettle();
    expect(find.text('Choose a receipt image under 1 MB.'), findsOneWidget);
    expect(find.text('Attach receipt'), findsOneWidget);
  });

  testWidgets('server errors are shown and the form stays open',
      (tester) async {
    await pumpSheet(
      tester,
      settings: branchSettings(),
      postStatus: 409,
      postBody: {'error': 'This payment reference was already submitted.'},
      pickReceipt: () async =>
          (bytes: Uint8List.fromList(base64Decode(_png)), name: 'r.png'),
    );
    await tester.enterText(find.byType(TextField), 'DUP-1');
    await tester.tap(find.text('Attach receipt'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Submit for verification'));
    await tester.pumpAndSettle();
    expect(find.text('This payment reference was already submitted.'),
        findsOneWidget);
    expect(find.text('Receipt submitted'), findsNothing);
  });
}
