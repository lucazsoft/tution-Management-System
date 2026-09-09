import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:tms_mobile/features/student/data/student_fees_models.dart';
import 'package:tms_mobile/features/student/screens/student_fees_screen.dart';
import 'package:tms_mobile/features/student/viewmodels/student_fees_viewmodel.dart';

ApiStudentInvoice testInvoice() => ApiStudentInvoice(
      id: 'inv-aug',
      cycle: 'August 2026',
      dueDate: DateTime(2026, 8, 1),
      dueDateLabel: '1 Aug 2026',
      state: ApiFeeState.overdue,
      netPayable: 4500,
      lines: const [ApiInvoiceLine(label: 'Tuition dues', amount: 4500)],
      paymentReference: 'inv-aug',
    );

ConnectIpsHandoff testHandoff() => const ConnectIpsHandoff(
      txnId: 'TXN123',
      invoiceId: 'inv-aug',
      amountPaisa: '450000',
      status: 'PENDING',
      gatewayUrl: 'https://gateway.test/pay',
      fields: {'TXNID': 'TXN123'},
    );

Future<void> pumpSheet(WidgetTester tester, Widget child) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(child: child),
      ),
    ),
  );
}

void main() {
  group('NepalPayQrSheet', () {
    testWidgets('renders a scannable QrImageView with the payload',
        (tester) async {
      const qr = NepalPayQr(
        invoiceId: 'inv-aug',
        amount: 4500,
        qrString: '00020101021226580012np.nepalpay',
        merchantName: 'TMS Tuition',
      );
      await pumpSheet(
        tester,
        NepalPayQrSheet(qr: qr, invoice: testInvoice()),
      );

      expect(find.byType(QrImageView), findsOneWidget);
      expect(
        tester.widget<QrImageView>(find.byType(QrImageView)).semanticsLabel,
        contains('4500'),
      );
      // Amount / merchant / ref text stays visible.
      expect(find.text('Scan to pay NPR 4500'), findsOneWidget);
      expect(find.textContaining('TMS Tuition'), findsOneWidget);
      expect(find.textContaining('inv-aug'), findsOneWidget);
      // Copy button remains as fallback.
      expect(find.text('Copy payload'), findsOneWidget);
    });

    testWidgets('empty payload shows fallback text, not a broken code',
        (tester) async {
      const qr = NepalPayQr(
        invoiceId: 'inv-aug',
        amount: 4500,
        qrString: '',
        merchantName: 'TMS Tuition',
      );
      await pumpSheet(
        tester,
        NepalPayQrSheet(qr: qr, invoice: testInvoice()),
      );

      expect(find.text('QR payload unavailable'), findsOneWidget);
      expect(find.byType(QrImageView), findsNothing);
    });
  });

  group('ConnectIpsHandoffCard', () {
    testWidgets('Open in browser launches gatewayUrl via injected launcher',
        (tester) async {
      Uri? launched;
      await pumpSheet(
        tester,
        ConnectIpsHandoffCard(
          handoff: testHandoff(),
          isVerifying: false,
          paymentOutcome: PaymentOutcome.pending,
          onConfirmReturn: (_) {},
          launchUrl: (uri) async {
            launched = uri;
            return true;
          },
        ),
      );

      expect(find.text('Open in browser'), findsOneWidget);
      // Selectable URL text stays as fallback.
      expect(find.textContaining('https://gateway.test/pay'), findsOneWidget);

      await tester.tap(find.text('Open in browser'));
      await tester.pumpAndSettle();

      expect(launched, Uri.parse('https://gateway.test/pay'));
    });

    testWidgets('launch failure keeps URL fallback and shows a snackbar',
        (tester) async {
      await pumpSheet(
        tester,
        ConnectIpsHandoffCard(
          handoff: testHandoff(),
          isVerifying: false,
          paymentOutcome: PaymentOutcome.pending,
          onConfirmReturn: (_) {},
          launchUrl: (_) async => false,
        ),
      );

      await tester.tap(find.text('Open in browser'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(
        find.text('Could not open the browser. Copy the gateway URL below.'),
        findsOneWidget,
      );
      expect(find.textContaining('https://gateway.test/pay'), findsOneWidget);
    });

    testWidgets('manual TXNID verify flow is unchanged', (tester) async {
      String? confirmed;
      await pumpSheet(
        tester,
        ConnectIpsHandoffCard(
          handoff: testHandoff(),
          isVerifying: false,
          paymentOutcome: PaymentOutcome.pending,
          onConfirmReturn: (value) => confirmed = value,
          launchUrl: (_) async => true,
        ),
      );

      expect(find.text('TXNID from the gateway return'), findsOneWidget);
      expect(find.text('I completed payment \u2014 verify'), findsOneWidget);

      await tester.tap(find.text('I completed payment \u2014 verify'));
      await tester.pump();

      expect(confirmed, 'TXN123');
    });
  });
}
