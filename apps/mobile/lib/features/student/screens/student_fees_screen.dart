import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart' as url_launcher;

import '../data/student_fees_models.dart';
import '../student_design.dart';
import '../viewmodels/student_fees_viewmodel.dart';
import '../widgets/student_scaffold.dart';
import '../widgets/invoice_payment_settings_sheet.dart';
import 'package:tms_mobile/core/providers/feature_flags_provider.dart';

/// Injectable gateway launcher so widget tests can substitute a fake
/// instead of calling url_launcher directly.
typedef GatewayLauncher = Future<bool> Function(Uri uri);

/// Default launcher: opens [uri] in the external browser.
Future<bool> defaultGatewayLauncher(Uri uri) => url_launcher.launchUrl(uri,
    mode: url_launcher.LaunchMode.externalApplication);

class StudentFeesScreen extends ConsumerWidget {
  const StudentFeesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final billingEnabled =
        ref.watch(featureFlagsProvider).isEnabled(FeatureFlags.studentBilling);

    if (!billingEnabled) {
      return StudentScaffold(
        title: 'Fees & Payment',
        selectedIndex: 2,
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.lock_outline_rounded,
                  size: 64,
                  color: StudentColors.mutedText,
                ),
                const SizedBox(height: 16),
                Text(
                  'Billing Access Restricted',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        color: StudentColors.text,
                      ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Fee management is handled by parents. Please contact your parent/guardian for payment information.',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: StudentColors.mutedText,
                      ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: () => context.go('/student/home'),
                  icon: const Icon(Icons.home_outlined),
                  label: const Text('Back to Dashboard'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final state = ref.watch(studentFeesViewModelProvider);
    final viewModel = ref.read(studentFeesViewModelProvider.notifier);

    if (state.isLoading && state.invoices.isEmpty) {
      return const StudentScaffold(
        title: 'Fees & payment',
        selectedIndex: 2,
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (state.isDenied && state.invoices.isEmpty) {
      return StudentScaffold(
        title: 'Fees & payment',
        selectedIndex: 2,
        body: _MessageBody(
          icon: Icons.lock_outline_rounded,
          title: 'Access Denied',
          message: state.error ?? 'You do not have access to fee records.',
          actionLabel: 'Back to Dashboard',
          onAction: () => context.go('/student/home'),
        ),
      );
    }

    if (state.isOffline && state.invoices.isEmpty) {
      return StudentScaffold(
        title: 'Fees & payment',
        selectedIndex: 2,
        body: _MessageBody(
          icon: Icons.wifi_off_rounded,
          title: 'You are offline',
          message: state.error ?? 'Check your connection and try again.',
          actionLabel: 'Retry',
          onAction: viewModel.refresh,
        ),
      );
    }

    if (state.error != null && state.invoices.isEmpty) {
      return StudentScaffold(
        title: 'Fees & payment',
        selectedIndex: 2,
        body: _MessageBody(
          icon: Icons.error_outline_rounded,
          title: 'Could not load fees',
          message: state.error!,
          actionLabel: 'Retry',
          onAction: viewModel.refresh,
        ),
      );
    }

    if (state.isEmpty) {
      return StudentScaffold(
        title: 'Fees & payment',
        selectedIndex: 2,
        body: _MessageBody(
          icon: Icons.receipt_long_outlined,
          title: 'No invoices yet',
          message: 'Your fee invoices will appear here once issued.',
          actionLabel: 'Refresh',
          onAction: viewModel.refresh,
        ),
      );
    }

    final current = state.selected ?? state.invoices.first;
    return _StudentFeesContent(
      state: state,
      current: current,
      onSelect: viewModel.selectInvoice,
      onRefresh: viewModel.refresh,
      onShowQr: () {
        showModalBottomSheet<void>(
          context: context,
          showDragHandle: true,
          isScrollControlled: true,
          builder: (context) => InvoicePaymentSettingsSheet(
            invoiceId: current.id,
            onConnectIps: viewModel.startPayment,
          ),
        );
      },
      onStartPayment: viewModel.startPayment,
      onConfirmReturn: viewModel.confirmReturn,
      onDismissNotice: viewModel.dismissNotice,
    );
  }

<<<<<<< HEAD
  static void _showQr(
    BuildContext context,
    NepalPayQr qr,
    ApiStudentInvoice invoice,
  ) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => NepalPayQrSheet(qr: qr, invoice: invoice),
    );
  }
}

/// Bottom-sheet content rendering the NepalPay payload as a scannable QR
/// code, keeping the amount/merchant/reference text and the copy-payload
/// fallback. An empty payload shows a message instead of a broken code.
class NepalPayQrSheet extends StatelessWidget {
  const NepalPayQrSheet({super.key, required this.qr, required this.invoice});

  final NepalPayQr qr;
  final ApiStudentInvoice invoice;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Nepal Pay', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: StudentSpace.xs),
          Text('Scan to pay NPR ${qr.amount.toStringAsFixed(0)}'),
          const SizedBox(height: StudentSpace.lg),
          Container(
            width: 220,
            alignment: Alignment.center,
            padding: const EdgeInsets.all(StudentSpace.md),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: StudentColors.border),
              borderRadius: BorderRadius.circular(StudentRadius.card),
            ),
            child: qr.qrString.isEmpty
                ? SelectableText(
                    'QR payload unavailable',
                    style: Theme.of(context).textTheme.bodySmall,
                    textAlign: TextAlign.center,
                  )
                : QrImageView(
                    data: qr.qrString,
                    version: QrVersions.auto,
                    size: 200,
                    semanticsLabel:
                        'NepalPay QR for NPR ${qr.amount.toStringAsFixed(0)}',
                  ),
          ),
          const SizedBox(height: StudentSpace.md),
          Text(
            '${qr.merchantName} · Ref ${invoice.paymentReference ?? invoice.id}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: StudentSpace.xs),
          Text(
            'Verify the merchant and amount in your payment app before confirming.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: StudentSpace.md),
          OutlinedButton.icon(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: qr.qrString));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('QR payload copied.')),
              );
            },
            icon: const Icon(Icons.copy_rounded),
            label: const Text('Copy payload'),
          ),
        ],
      ),
    );
  }
=======
>>>>>>> 098eb48f17beed38cc61a89d5bb59465519d5988
}

class _MessageBody extends StatelessWidget {
  const _MessageBody({
    required this.icon,
    required this.title,
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return StudentScaffold(
      title: 'Fees & payment',
      selectedIndex: 2,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 64, color: StudentColors.mutedText),
              const SizedBox(height: 16),
              Text(title,
                  style: Theme.of(context).textTheme.headlineSmall,
                  textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 24),
              FilledButton(onPressed: onAction, child: Text(actionLabel)),
            ],
          ),
        ),
      ),
    );
  }
}

class _StudentFeesContent extends StatelessWidget {
  const _StudentFeesContent({
    required this.state,
    required this.current,
    required this.onSelect,
    required this.onRefresh,
    required this.onShowQr,
    required this.onStartPayment,
    required this.onConfirmReturn,
    required this.onDismissNotice,
  });

  final StudentFeesState state;
  final ApiStudentInvoice current;
  final ValueChanged<String> onSelect;
  final VoidCallback onRefresh;
  final VoidCallback onShowQr;
  final VoidCallback onStartPayment;
  final ValueChanged<String> onConfirmReturn;
  final VoidCallback onDismissNotice;

  @override
  Widget build(BuildContext context) {
    return StudentScaffold(
      title: 'Fees & payment',
      selectedIndex: 2,
      body: RefreshIndicator(
        onRefresh: () async => onRefresh(),
        child: ListView(
          padding: const EdgeInsets.all(StudentSpace.md),
          children: [
            if (state.blocked)
              Container(
                padding: const EdgeInsets.all(StudentSpace.md),
                decoration: BoxDecoration(
                  color: StudentColors.error.withValues(alpha: .08),
                  border: Border.all(color: StudentColors.error),
                  borderRadius: BorderRadius.circular(StudentRadius.card),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.lock_rounded, color: StudentColors.error),
                    const SizedBox(width: StudentSpace.sm),
                    Expanded(
                      child: Text(
                        'Account blocked — NPR ${state.outstanding.toStringAsFixed(0)} outstanding. Clear overdue dues to restore access.',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ),
                  ],
                ),
              ),
            if (state.blocked) const SizedBox(height: StudentSpace.md),
            Container(
              padding: const EdgeInsets.all(StudentSpace.lg),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [StudentColors.primaryDark, StudentColors.primary],
                ),
                borderRadius: BorderRadius.circular(StudentRadius.card),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  StudentStatusPill(
                    label: state.blocked ? 'Blocked' : 'Active',
                    icon: state.blocked
                        ? Icons.lock_rounded
                        : Icons.check_circle_rounded,
                    color: StudentColors.accent,
                  ),
                  const SizedBox(height: StudentSpace.lg),
                  Text(
                    'NPR ${current.netPayable.toStringAsFixed(0)}',
                    style: Theme.of(context)
                        .textTheme
                        .displaySmall
                        ?.copyWith(color: Colors.white),
                  ),
                  const SizedBox(height: StudentSpace.xs),
                  Text(
                    'Outstanding for ${current.cycle} · Due ${current.dueDateLabel}',
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(color: Colors.white70),
                  ),
                ],
              ),
            ),
            if (state.error != null) ...[
              const SizedBox(height: StudentSpace.sm),
              Container(
                padding: const EdgeInsets.all(StudentSpace.sm),
                decoration: BoxDecoration(
                  color: StudentColors.error.withValues(alpha: .08),
                  borderRadius: BorderRadius.circular(StudentRadius.control),
                ),
                child: Row(
                  children: [
                    Expanded(child: Text(state.error!)),
                    IconButton(
                      icon: const Icon(Icons.refresh_rounded),
                      onPressed: onRefresh,
                    ),
                  ],
                ),
              ),
            ],
            if (state.notice != null) ...[
              const SizedBox(height: StudentSpace.sm),
              Container(
                padding: const EdgeInsets.all(StudentSpace.sm),
                decoration: BoxDecoration(
                  color: StudentColors.info.withValues(alpha: .1),
                  borderRadius: BorderRadius.circular(StudentRadius.control),
                ),
                child: Row(
                  children: [
                    Expanded(child: Text(state.notice!)),
                    IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: onDismissNotice,
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: StudentSpace.lg),
            Text('Payment calendar',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: StudentSpace.sm),
            SizedBox(
              height: 94,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: state.invoices.length,
                separatorBuilder: (_, __) =>
                    const SizedBox(width: StudentSpace.sm),
                itemBuilder: (context, index) {
                  final invoice = state.invoices[index];
                  final selected = invoice.id == current.id;
                  return GestureDetector(
                    onTap: () => onSelect(invoice.id),
                    child: Container(
                      width: 142,
                      padding: const EdgeInsets.all(StudentSpace.sm),
                      decoration: BoxDecoration(
                        color: selected
                            ? StudentColors.primary.withValues(alpha: .08)
                            : StudentColors.background,
                        border: Border.all(
                          color: _stateColor(invoice.state),
                          width: selected ? 2 : 1,
                        ),
                        borderRadius: BorderRadius.circular(StudentRadius.card),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(invoice.cycle,
                              style: Theme.of(context).textTheme.titleMedium),
                          StudentStatusPill(
                            label: _stateLabel(invoice.state),
                            icon: _stateIcon(invoice.state),
                            color: _stateColor(invoice.state),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: StudentSpace.lg),
            Text('Current invoice',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: StudentSpace.sm),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(StudentSpace.md),
                child: Column(
                  children: [
                    for (final line in current.lines) ...[
                      Row(
                        children: [
                          Expanded(child: Text(line.label)),
                          Text(
                            '${line.amount < 0 ? '−' : ''}NPR ${line.amount.abs().toStringAsFixed(0)}',
                            style: TextStyle(
                              color: line.amount < 0
                                  ? StudentColors.success
                                  : StudentColors.text,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: StudentSpace.sm),
                    ],
                    const Divider(),
                    Row(
                      children: [
                        Expanded(
                          child: Text('Net payable',
                              style: Theme.of(context).textTheme.titleMedium),
                        ),
                        Text(
                          'NPR ${current.netPayable.toStringAsFixed(0)}',
                          style:
                              Theme.of(context).textTheme.titleMedium?.copyWith(
                                    color: StudentColors.primaryDark,
                                  ),
                        ),
                      ],
                    ),
                    const SizedBox(height: StudentSpace.md),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(48),
                          backgroundColor: StudentColors.accent,
                          foregroundColor: StudentColors.primaryDark,
                          shape: RoundedRectangleBorder(
                            borderRadius:
                                BorderRadius.circular(StudentRadius.control),
                          ),
                        ),
                        onPressed: state.isQrLoading || !current.qrAvailable
                            ? null
                            : onShowQr,
                        icon: state.isQrLoading
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.qr_code_2_rounded),
                        label: Text(current.qrAvailable
                            ? 'Show payment instructions'
                            : 'Already paid'),
                      ),
                    ),
                    const SizedBox(height: StudentSpace.sm),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: state.isHandoffLoading ||
                                current.state == ApiFeeState.paid
                            ? null
                            : onStartPayment,
                        icon: state.isHandoffLoading
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.account_balance_rounded),
                        label: const Text('Pay with connectIPS'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (state.handoff != null) ...[
              const SizedBox(height: StudentSpace.sm),
              ConnectIpsHandoffCard(
                handoff: state.handoff!,
                isVerifying: state.isVerifying,
                paymentOutcome: state.paymentOutcome,
                onConfirmReturn: onConfirmReturn,
              ),
            ],
            const SizedBox(height: StudentSpace.lg),
            Text('Invoice history',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: StudentSpace.sm),
            for (final invoice in state.invoices.skip(1)) ...[
              Card(
                child: ListTile(
                  minTileHeight: 72,
                  title: Text(invoice.cycle),
                  subtitle:
                      Text('NPR ${invoice.netPayable.toStringAsFixed(0)}'),
                  trailing: StudentStatusPill(
                    label: _stateLabel(invoice.state),
                    icon: _stateIcon(invoice.state),
                    color: _stateColor(invoice.state),
                  ),
                  onTap: () => onSelect(invoice.id),
                ),
              ),
              const SizedBox(height: StudentSpace.sm),
            ],
          ],
        ),
      ),
    );
  }
}

class ConnectIpsHandoffCard extends StatefulWidget {
  const ConnectIpsHandoffCard({
    super.key,
    required this.handoff,
    required this.isVerifying,
    required this.paymentOutcome,
    required this.onConfirmReturn,
    this.launchUrl = defaultGatewayLauncher,
  });

  final ConnectIpsHandoff handoff;
  final bool isVerifying;
  final PaymentOutcome paymentOutcome;
  final ValueChanged<String> onConfirmReturn;
  final GatewayLauncher launchUrl;

  @override
  State<ConnectIpsHandoffCard> createState() => ConnectIpsHandoffCardState();
}

class ConnectIpsHandoffCardState extends State<ConnectIpsHandoffCard> {
  late final TextEditingController _txnController;

  @override
  void initState() {
    super.initState();
    _txnController = TextEditingController(text: widget.handoff.txnId);
  }

  @override
  void didUpdateWidget(covariant ConnectIpsHandoffCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.handoff.txnId != widget.handoff.txnId) {
      _txnController.text = widget.handoff.txnId;
    }
  }

  @override
  void dispose() {
    _txnController.dispose();
    super.dispose();
  }

  Future<void> _openInBrowser(BuildContext context) async {
    final uri = Uri.tryParse(widget.handoff.gatewayUrl);
    if (uri == null || !uri.hasScheme) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Could not open the payment page. Copy the gateway URL instead.',
            ),
          ),
        );
      }
      return;
    }
    final launched = await widget.launchUrl(uri);
    if (!launched && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Could not open the browser. Copy the gateway URL below.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(StudentSpace.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('connectIPS handoff',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: StudentSpace.xs),
            Text(
              'Complete the payment in your browser, then verify below. The app marks success only after the server confirms it.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: StudentSpace.sm),
            SelectableText('Gateway: ${widget.handoff.gatewayUrl}'),
            SelectableText('TXNID: ${widget.handoff.txnId}'),
            const SizedBox(height: StudentSpace.sm),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => _openInBrowser(context),
                icon: const Icon(Icons.open_in_browser_rounded),
                label: const Text('Open in browser'),
              ),
            ),
            const SizedBox(height: StudentSpace.sm),
            TextField(
              controller: _txnController,
              decoration: const InputDecoration(
                labelText: 'TXNID from the gateway return',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: StudentSpace.sm),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: widget.isVerifying
                    ? null
                    : () => widget.onConfirmReturn(_txnController.text.trim()),
                icon: widget.isVerifying
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.verified_rounded),
                label: Text(
                  switch (widget.paymentOutcome) {
                    PaymentOutcome.success => 'Verified — paid',
                    PaymentOutcome.failed => 'Re-check status',
                    PaymentOutcome.unknown => 'Retry verification',
                    PaymentOutcome.pending => 'I completed payment — verify',
                  },
                ),
              ),
            ),
            if (widget.paymentOutcome == PaymentOutcome.failed)
              Padding(
                padding: const EdgeInsets.only(top: StudentSpace.xs),
                child: Text(
                  'Server has not confirmed this payment. No amount was marked paid.',
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: StudentColors.error),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

String _stateLabel(ApiFeeState state) => switch (state) {
      ApiFeeState.upcoming => 'Upcoming',
      ApiFeeState.dueSoon => 'Due soon',
      ApiFeeState.overdue => 'Overdue',
      ApiFeeState.paid => 'Paid',
    };

IconData _stateIcon(ApiFeeState state) => switch (state) {
      ApiFeeState.upcoming => Icons.schedule_rounded,
      ApiFeeState.dueSoon => Icons.notifications_active_outlined,
      ApiFeeState.overdue => Icons.error_rounded,
      ApiFeeState.paid => Icons.check_circle_rounded,
    };

Color _stateColor(ApiFeeState state) => switch (state) {
      ApiFeeState.upcoming => StudentColors.info,
      ApiFeeState.dueSoon => StudentColors.warning,
      ApiFeeState.overdue => StudentColors.error,
      ApiFeeState.paid => StudentColors.success,
    };
