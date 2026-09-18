import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/providers/feature_flags_provider.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/features/parent/models/parent_portal.dart';
import 'package:tms_mobile/features/parent/viewmodels/parent_portal_viewmodel.dart';
import 'package:tms_mobile/features/parent/widgets/child_switcher_bar.dart';
import 'package:tms_mobile/features/parent/widgets/parent_navigation.dart';
import 'package:tms_mobile/features/parent/widgets/parent_portal_state_view.dart';
import 'package:tms_mobile/shared/models/app_models.dart';
import 'package:tms_mobile/shared/widgets/status_chip.dart';

class ParentAcademicsScreen extends ConsumerStatefulWidget {
  const ParentAcademicsScreen({super.key});

  static const String routeName = '/parent/academics';

  @override
  ConsumerState<ParentAcademicsScreen> createState() =>
      _ParentAcademicsScreenState();
}

class _ParentAcademicsScreenState extends ConsumerState<ParentAcademicsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final enabled =
        ref.watch(featureFlagsProvider).isEnabled(FeatureFlags.parentAcademics);
    final childName =
        ref.watch(parentPortalProvider).selectedChild?.name ?? 'your child';
    if (!enabled) return _featureDisabled(context, childName);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => ParentNavigation.back(context),
          tooltip: 'Back',
        ),
        title: Text(
          '$childName\'s Academics',
          style:
              GoogleFonts.fraunces(fontWeight: FontWeight.w700, fontSize: 22),
        ),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(icon: Icon(Icons.show_chart_rounded), text: 'Progress'),
            Tab(icon: Icon(Icons.event_note_rounded), text: 'Events'),
          ],
        ),
      ),
      bottomNavigationBar: const ParentNavigationBar(selectedIndex: 1),
      body: SafeArea(
        child: ParentPortalStateView(
          padding: EdgeInsets.zero,
          builder: (context, portal, child) => SizedBox(
            height: MediaQuery.sizeOf(context).height -
                kToolbarHeight -
                kTextTabBarHeight -
                MediaQuery.paddingOf(context).top,
            child: TabBarView(
              controller: _tabController,
              children: [
                _ProgressTab(portal: portal, child: child),
                _EventsTab(portal: portal),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _featureDisabled(BuildContext context, String childName) => Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: () => ParentNavigation.back(context),
          ),
          title: const Text('Academics'),
        ),
        bottomNavigationBar: const ParentNavigationBar(selectedIndex: 1),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(
              'The academics view for $childName is currently disabled.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
}

class _ProgressTab extends StatelessWidget {
  const _ProgressTab({required this.portal, required this.child});

  final ParentPortal portal;
  final ParentChild child;

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const ChildSwitcherBar(),
          const SizedBox(height: 20),
          Card(
            color: kColorPrimary,
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Wrap(
                alignment: WrapAlignment.spaceBetween,
                spacing: 20,
                runSpacing: 12,
                children: [
                  _Summary(
                    label: 'Student',
                    value: child.name,
                  ),
                  _Summary(label: 'Grade', value: child.grade),
                  _Summary(
                    label: 'Progress signals',
                    value: '${portal.remarks.length}',
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Teacher remarks & performance signals',
            style: GoogleFonts.fraunces(
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          if (portal.remarks.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: Text('No academic remarks are available.'),
              ),
            )
          else
            for (final remark in portal.remarks) ...[
              _RemarkCard(remark: remark),
              const SizedBox(height: 12),
            ],
        ],
      );
}

class _EventsTab extends StatelessWidget {
  const _EventsTab({required this.portal});

  final ParentPortal portal;

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const ChildSwitcherBar(),
          const SizedBox(height: 20),
          Text(
            'Academic events',
            style: GoogleFonts.fraunces(
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          if (portal.events.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: Text('No academic events are available.'),
              ),
            )
          else
            for (final event in portal.events)
              Card(
                child: ListTile(
                  leading: CircleAvatar(child: Text(event.day)),
                  title: Text(event.title),
                  subtitle: Text('${event.date} · ${event.details}'),
                  trailing: Text(event.kind),
                ),
              ),
        ],
      );
}

class _Summary extends StatelessWidget {
  const _Summary({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(color: Colors.white.withValues(alpha: 0.75)),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      );
}

class _RemarkCard extends StatelessWidget {
  const _RemarkCard({required this.remark});

  final ParentRemark remark;

  @override
  Widget build(BuildContext context) {
    final normalized = remark.signal.toLowerCase();
    final variant = normalized == 'improving'
        ? StatusChipVariant.success
        : normalized.contains('support')
            ? StatusChipVariant.warning
            : StatusChipVariant.info;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    remark.subject,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                StatusChip(label: remark.signal, variant: variant),
              ],
            ),
            const SizedBox(height: 10),
            Text(remark.message),
            const SizedBox(height: 10),
            Text(
              '${remark.author} · ${remark.date}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
