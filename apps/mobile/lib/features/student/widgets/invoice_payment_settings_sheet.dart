import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import '../data/student_fees_repository.dart';

/// Read-only checkout instructions. Admin configuration stays on the web.
class InvoicePaymentSettingsSheet extends StatefulWidget {
  const InvoicePaymentSettingsSheet({
    super.key,
    required this.invoiceId,
    required this.onConnectIps,
    this.repository,
  });

  final String invoiceId;
  final VoidCallback onConnectIps;
  final StudentFeesRepository? repository;

  @override
  State<InvoicePaymentSettingsSheet> createState() =>
      _InvoicePaymentSettingsSheetState();
}

class _InvoicePaymentSettingsSheetState
    extends State<InvoicePaymentSettingsSheet> {
  late Future<Map<String, dynamic>> _settings;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _settings = (widget.repository ?? StudentFeesRepository())
        .fetchPaymentSettings(widget.invoiceId);
  }

  @override
  Widget build(BuildContext context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: FutureBuilder<Map<String, dynamic>>(
            future: _settings,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const SizedBox(
                    height: 260,
                    child: Center(
                        child: CircularProgressIndicator(
                            semanticsLabel: 'Loading payment instructions')));
              }
              if (snapshot.hasError) {
                final error = snapshot.error;
                return Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(error is ApiException
                      ? error.message
                      : 'Unable to load payment instructions.'),
                  const SizedBox(height: 16),
                  OutlinedButton(
                      onPressed: () => setState(_load),
                      child: const Text('Retry')),
                ]);
              }
              final settings = snapshot.data ?? const <String, dynamic>{};
              final url = settings['staticQrImageUrl']?.toString() ?? '';
              final hasQr =
                  settings['staticQrEnabled'] == true && url.isNotEmpty;
              final connectIps = settings['connectIpsEnabled'] == true;
              return Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Payment instructions',
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    Text(settings['source'] == 'branch'
                        ? 'Branch custom'
                        : 'Using tenant defaults'),
                    const Text('Configured by tenant admin'),
                    const SizedBox(height: 20),
                    if (hasQr) ...[
                      if (url.startsWith('data:image/'))
                        Image.memory(
                            base64Decode(url.substring(url.indexOf(',') + 1)),
                            width: 240,
                            height: 240,
                            fit: BoxFit.contain,
                            errorBuilder: (context, error, stackTrace) =>
                                const Text(
                                    'QR image unavailable. Contact admin.'))
                      else
                        Image.network(
                          url,
                          width: 240,
                          height: 240,
                          fit: BoxFit.contain,
                          semanticLabel:
                              'Payment QR for invoice ${widget.invoiceId}',
                          loadingBuilder: (context, child, progress) =>
                              progress == null
                                  ? child
                                  : const SizedBox(
                                      height: 240,
                                      child: Center(
                                          child: CircularProgressIndicator())),
                          errorBuilder: (context, error, stackTrace) => const Text(
                              'QR image unavailable. Contact admin for payment instructions.'),
                        ),
                      const SizedBox(height: 16),
                      for (final entry in {
                        'accountName': 'Account name',
                        'accountNumber': 'Account number',
                        'bankName': 'Bank'
                      }.entries)
                        Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: SelectableText(
                                '${entry.value}: ${settings[entry.key] ?? '—'}')),
                    ] else if (!connectIps)
                      const Text(
                          'Manual payment only. Contact admin for payment instructions.'),
                    if (settings['instructions']?.toString().isNotEmpty == true)
                      Padding(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          child: Text(settings['instructions'].toString())),
                    if (connectIps)
                      FilledButton(
                          onPressed: () {
                            Navigator.of(context).pop();
                            widget.onConnectIps();
                          },
                          child: const Text('Pay with connectIPS')),
                    const SizedBox(height: 8),
                    OutlinedButton(
                        onPressed: () => Navigator.of(context).pop(),
                        child: const Text('Close')),
                  ]);
            },
          ),
        ),
      );
}
