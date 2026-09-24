import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/features/parent/models/parent_portal.dart';
import 'package:tms_mobile/features/parent/widgets/child_switcher_bar.dart';
import 'package:tms_mobile/features/parent/widgets/parent_navigation.dart';
import 'package:tms_mobile/features/parent/widgets/parent_portal_state_view.dart';
import 'package:tms_mobile/shared/models/app_models.dart';
import 'package:tms_mobile/shared/widgets/status_chip.dart';

class ParentFeesScreen extends ConsumerWidget {
  const ParentFeesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      drawer: ParentNavigation.drawer(context),
      appBar: AppBar(
        title: Text(
          'Child Fee Portal',
          style:
              GoogleFonts.fraunces(fontWeight: FontWeight.w700, fontSize: 22),
        ),
      ),
      bottomNavigationBar: const ParentNavigationBar(selectedIndex: 0),
      body: SafeArea(
        child: ParentPortalStateView(
          builder: (context, portal, child) {
            final outstanding = portal.outstandingTotal;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const ChildSwitcherBar(),
                const SizedBox(height: 20),
                Card(
                  color: outstanding > 0 ? kColorPrimary : kColorSuccess,
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Outstanding Balance',
                              style: GoogleFonts.roboto(
                                color: Colors.white.withValues(alpha: 0.85),
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            Flexible(
                              child: Text(
                                child.name,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _money(outstanding),
                          style: GoogleFonts.fraunces(
                            color: Colors.white,
                            fontSize: 32,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (outstanding == 0) ...[
                          const SizedBox(height: 12),
                          const Text(
                            'All dues are cleared.',
                            style: TextStyle(color: Colors.white),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  'Fee Statements & Invoices',
                  style: GoogleFonts.fraunces(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                if (portal.invoices.isEmpty)
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(20),
                      child: Text('No invoices are available for this child.'),
                    ),
                  )
                else
                  for (final invoice in portal.invoices) ...[
                    _InvoiceCard(invoice: invoice),
                    const SizedBox(height: 12),
                  ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.invoice});

  final ParentInvoice invoice;

  @override
  Widget build(BuildContext context) => Card(
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
          childrenPadding: const EdgeInsets.fromLTRB(18, 0, 18, 16),
          title: Text(
            invoice.cycle,
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              'Due ${invoice.dueDate} · ${_money(invoice.netPayable)}',
            ),
          ),
          trailing: StatusChip(
            label: invoice.state,
            variant: invoice.isPaid
                ? StatusChipVariant.success
                : invoice.state.toLowerCase() == 'overdue'
                    ? StatusChipVariant.error
                    : StatusChipVariant.warning,
          ),
          children: [
            const Divider(),
            for (final line in invoice.lines)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(child: Text(line.label)),
                    Text(
                      _money(line.amount),
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            if (invoice.reference.isNotEmpty) ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: Text('Reference: ${invoice.reference}'),
              ),
            ],
            if (invoice.qrAvailable && !invoice.isPaid) ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'Online payment handoff is not available in this build.',
                    ),
                  ),
                ),
                icon: const Icon(Icons.open_in_new_rounded, size: 18),
                label: const Text('Online payment'),
              ),
            ],
          ],
        ),
      );
}

String _money(double amount) {
  final negative = amount < 0;
  final digits = amount.abs().round().toString();
  final formatted = digits.replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => ',',
  );
  return '${negative ? '-' : ''}NPR $formatted';
}
