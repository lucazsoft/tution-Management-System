import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:tms_mobile/core/network/api_exception.dart';

import 'invoice_payment_repository.dart';

/// A picked receipt image.
typedef PickedReceipt = ({Uint8List bytes, String name});

/// Picks a receipt image; injectable for tests.
typedef ReceiptPicker = Future<PickedReceipt?> Function();

Future<PickedReceipt?> _pickFromGallery() async {
  final image = await ImagePicker().pickImage(
    source: ImageSource.gallery,
    imageQuality: 80,
    maxWidth: 1600,
    maxHeight: 1600,
  );
  if (image == null) return null;
  return (bytes: await image.readAsBytes(), name: image.name);
}

/// Opens the checkout for one invoice as a bottom sheet.
Future<void> showInvoicePaymentSheet(
  BuildContext context, {
  required String invoiceId,
  required double amount,
  required String title,
  String? subtitle,
  VoidCallback? onConnectIps,
  VoidCallback? onSubmitted,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (context) => InvoicePaymentSheet(
      invoiceId: invoiceId,
      amount: amount,
      title: title,
      subtitle: subtitle,
      onConnectIps: onConnectIps,
      onSubmitted: onSubmitted,
    ),
  );
}

/// Checkout for one invoice, shared by the student and parent apps.
///
/// Shows the static QR the Tenant Admin set for the invoice's branch in
/// Payment settings, lets the payer submit their transaction reference and
/// a receipt for verification, and offers connectIPS only when the server
/// reports it enabled.
class InvoicePaymentSheet extends StatefulWidget {
  const InvoicePaymentSheet({
    super.key,
    required this.invoiceId,
    required this.amount,
    required this.title,
    this.subtitle,
    this.onConnectIps,
    this.onSubmitted,
    this.repository,
    this.pickReceipt,
  });

  final String invoiceId;
  final double amount;
  final String title;
  final String? subtitle;

  /// Starts connectIPS; the option is hidden when null or disabled server-side.
  final VoidCallback? onConnectIps;

  /// Called after a receipt was accepted for verification.
  final VoidCallback? onSubmitted;
  final InvoicePaymentRepository? repository;
  final ReceiptPicker? pickReceipt;

  @override
  State<InvoicePaymentSheet> createState() => _InvoicePaymentSheetState();
}

class _InvoicePaymentSheetState extends State<InvoicePaymentSheet> {
  late final InvoicePaymentRepository _repository =
      widget.repository ?? InvoicePaymentRepository();
  late Future<InvoicePaymentSettings> _settings;
  final _reference = TextEditingController();
  PickedReceipt? _receipt;
  String? _formError;
  bool _submitting = false;
  bool _submitted = false;

  @override
  void initState() {
    super.initState();
    _settings = _repository.fetchSettings(widget.invoiceId);
  }

  @override
  void dispose() {
    _reference.dispose();
    super.dispose();
  }

  void _retry() =>
      setState(() => _settings = _repository.fetchSettings(widget.invoiceId));

  Future<void> _chooseReceipt() async {
    final picked = await (widget.pickReceipt ?? _pickFromGallery)();
    if (picked == null || !mounted) return;
    setState(() {
      if (picked.bytes.lengthInBytes > kMaxReceiptBytes) {
        _formError = 'Choose a receipt image under 1 MB.';
      } else {
        _receipt = picked;
        _formError = null;
      }
    });
  }

  Future<void> _submit() async {
    final reference = _reference.text.trim();
    if (!RegExp(r'^[A-Za-z0-9._/-]{1,80}$').hasMatch(reference)) {
      setState(() => _formError =
          'Enter the transaction reference from your payment app (letters, numbers, . _ / -).');
      return;
    }
    final receipt = _receipt;
    if (receipt == null) {
      setState(() => _formError = 'Attach a screenshot or photo of the receipt.');
      return;
    }
    setState(() {
      _submitting = true;
      _formError = null;
    });
    try {
      await _repository.submitManualPayment(
        widget.invoiceId,
        referenceId: reference,
        receiptDataUri: receiptDataUri(receipt.bytes, receipt.name),
      );
      if (!mounted) return;
      setState(() => _submitted = true);
      widget.onSubmitted?.call();
    } on ApiException catch (error) {
      if (mounted) setState(() => _formError = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _formError = 'Could not submit the receipt. Try again.');
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: FutureBuilder<InvoicePaymentSettings>(
            future: _settings,
            builder: (context, snapshot) {
              final header = <Widget>[
                Text(widget.title, style: theme.textTheme.titleLarge),
                if (widget.subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(widget.subtitle!, style: theme.textTheme.bodyMedium),
                ],
                const SizedBox(height: 12),
                Text(
                  _money(widget.amount),
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: theme.colorScheme.primary,
                  ),
                ),
                const SizedBox(height: 16),
              ];
              if (snapshot.connectionState != ConnectionState.done) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ...header,
                    const SizedBox(
                      height: 240,
                      child: Center(
                        child: CircularProgressIndicator(
                            semanticsLabel: 'Loading payment QR'),
                      ),
                    ),
                  ],
                );
              }
              if (snapshot.hasError) {
                final error = snapshot.error;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ...header,
                    Text(error is ApiException
                        ? error.message
                        : 'Unable to load payment instructions.'),
                    const SizedBox(height: 16),
                    OutlinedButton(
                        onPressed: _retry, child: const Text('Retry')),
                  ],
                );
              }
              final settings = snapshot.data!;
              if (_submitted) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ...header,
                    Icon(Icons.verified_outlined,
                        size: 48, color: theme.colorScheme.primary),
                    const SizedBox(height: 12),
                    Text('Receipt submitted',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.titleMedium),
                    const SizedBox(height: 6),
                    const Text(
                      'The branch will verify your payment. The invoice is marked paid once it is approved.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('Done'),
                    ),
                  ],
                );
              }
              final connectIps =
                  settings.connectIpsEnabled && widget.onConnectIps != null;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ...header,
                  if (settings.hasQr) ...[
                    Text(
                      settings.fromBranch
                          ? 'Scan the branch payment QR'
                          : 'Scan the institution payment QR',
                      style: theme.textTheme.titleSmall,
                    ),
                    const SizedBox(height: 12),
                    Center(child: _QrImage(url: settings.staticQrImageUrl!)),
                    const SizedBox(height: 16),
                    for (final row in [
                      ('Account name', settings.accountName),
                      ('Account number', settings.accountNumber),
                      ('Bank', settings.bankName),
                    ])
                      if (row.$2 != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(child: Text(row.$1)),
                              Flexible(
                                child: SelectableText(
                                  row.$2!,
                                  textAlign: TextAlign.end,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600),
                                ),
                              ),
                            ],
                          ),
                        ),
                    if (settings.instructions != null) ...[
                      const SizedBox(height: 8),
                      Text(settings.instructions!),
                    ],
                    const Divider(height: 32),
                    Text('After paying', style: theme.textTheme.titleSmall),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _reference,
                      enabled: !_submitting,
                      maxLength: 80,
                      textInputAction: TextInputAction.done,
                      decoration: const InputDecoration(
                        labelText: 'Transaction reference',
                        hintText: 'From your banking or wallet app',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _submitting ? null : _chooseReceipt,
                      icon: Icon(_receipt == null
                          ? Icons.add_photo_alternate_outlined
                          : Icons.check_circle_outline),
                      label: Text(_receipt == null
                          ? 'Attach receipt'
                          : 'Receipt attached · ${_receipt!.name}'),
                    ),
                    if (_formError != null) ...[
                      const SizedBox(height: 8),
                      Text(_formError!,
                          style: TextStyle(color: theme.colorScheme.error)),
                    ],
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _submitting ? null : _submit,
                      child: Text(_submitting
                          ? 'Submitting…'
                          : 'Submit for verification'),
                    ),
                  ] else ...[
                    const Text(
                      'A payment QR has not been set up for this branch yet. Please pay at the branch office.',
                    ),
                    if (settings.instructions != null) ...[
                      const SizedBox(height: 8),
                      Text(settings.instructions!),
                    ],
                  ],
                  if (connectIps) ...[
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () {
                        Navigator.of(context).pop();
                        widget.onConnectIps!();
                      },
                      icon: const Icon(Icons.account_balance_rounded),
                      label: const Text('Pay online with connectIPS'),
                    ),
                  ],
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Close'),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _QrImage extends StatelessWidget {
  const _QrImage({required this.url});

  final String url;

  static const _fallback = Text(
    'QR image unavailable. Please contact the branch.',
    textAlign: TextAlign.center,
  );

  @override
  Widget build(BuildContext context) {
    const size = 240.0;
    if (url.startsWith('data:image/')) {
      Uint8List? bytes;
      try {
        bytes = base64Decode(url.substring(url.indexOf(',') + 1));
      } on FormatException {
        bytes = null;
      }
      if (bytes == null) return _fallback;
      return Image.memory(
        bytes,
        width: size,
        height: size,
        fit: BoxFit.contain,
        semanticLabel: 'Payment QR',
        errorBuilder: (context, error, stackTrace) => _fallback,
      );
    }
    return Image.network(
      url,
      width: size,
      height: size,
      fit: BoxFit.contain,
      semanticLabel: 'Payment QR',
      loadingBuilder: (context, child, progress) => progress == null
          ? child
          : const SizedBox(
              width: size,
              height: size,
              child: Center(child: CircularProgressIndicator()),
            ),
      errorBuilder: (context, error, stackTrace) => _fallback,
    );
  }
}

String _money(double amount) {
  final digits = amount.round().abs().toString().replaceAllMapped(
        RegExp(r'\B(?=(\d{3})+(?!\d))'),
        (_) => ',',
      );
  return 'NPR $digits';
}
