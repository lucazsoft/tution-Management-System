import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:nepali_utils/nepali_utils.dart';
import 'package:tms_mobile/core/providers/feature_flags_provider.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/features/parent/data/parent_portal_repository.dart';
import 'package:tms_mobile/features/parent/models/parent_portal.dart';
import 'package:tms_mobile/features/parent/viewmodels/parent_portal_viewmodel.dart';
import 'package:tms_mobile/features/parent/widgets/parent_navigation.dart';
import 'package:tms_mobile/features/parent/widgets/parent_portal_state_view.dart';
import 'package:tms_mobile/features/student/widgets/nepal_date_time.dart';
import 'package:tms_mobile/shared/models/app_models.dart';
import 'package:tms_mobile/shared/widgets/academic_calendar.dart';
import 'package:tms_mobile/shared/widgets/status_chip.dart';

class ParentAcademicsScreen extends ConsumerStatefulWidget {
  const ParentAcademicsScreen({super.key, this.initialTab = 0});

  final int initialTab;

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
    _tabController = TabController(
      length: 3,
      initialIndex: widget.initialTab.clamp(0, 2),
      vsync: this,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(parentPortalProvider.notifier).refresh();
    });
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
      drawer: ParentNavigation.drawer(context),
      appBar: AppBar(
        title: Text(
          '$childName\'s Academics',
          style:
              GoogleFonts.fraunces(fontWeight: FontWeight.w700, fontSize: 22),
        ),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(icon: Icon(Icons.show_chart_rounded), text: 'Progress'),
            Tab(icon: Icon(Icons.assignment_outlined), text: 'Homework'),
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
                _HomeworkTab(homework: portal.homework),
                _EventsTab(portal: portal),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _featureDisabled(BuildContext context, String childName) => Scaffold(
        drawer: ParentNavigation.drawer(context),
        appBar: AppBar(
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

class _HomeworkTab extends StatelessWidget {
  const _HomeworkTab({required this.homework});

  final List<ParentHomeworkItem> homework;

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Homework', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          if (homework.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text('No homework has been assigned.'),
              ),
            )
          else
            for (final item in homework)
              Card(
                child: ListTile(
                  leading: Icon(
                    item.completed
                        ? Icons.task_alt_rounded
                        : Icons.assignment_outlined,
                    color: item.completed ? kColorSuccess : kColorPrimary,
                  ),
                  title: Text(item.title),
                  subtitle: Text(
                    '${item.subject} · ${item.teacher}\nDue ${item.dueDate}',
                  ),
                  isThreeLine: true,
                  trailing: Text(item.completed ? 'Completed' : 'Due'),
                ),
              ),
        ],
      );
}

class _ProgressTab extends ConsumerStatefulWidget {
  const _ProgressTab({required this.portal, required this.child});

  final ParentPortal portal;
  final ParentChild child;

  @override
  ConsumerState<_ProgressTab> createState() => _ProgressTabState();
}

class _ProgressTabState extends ConsumerState<_ProgressTab> {
  late Future<ParentPerformanceDetail> _performance;

  @override
  void initState() {
    super.initState();
    _performance = _load();
  }

  @override
  void didUpdateWidget(covariant _ProgressTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.child.id != widget.child.id) _performance = _load();
  }

  Future<ParentPerformanceDetail> _load() => ref
      .read(parentPortalRepositoryProvider)
      .fetchPerformance(widget.child.id);

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.all(20),
        children: [
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
                    value: widget.child.name,
                  ),
                  _Summary(label: 'Grade', value: widget.child.grade),
                  _Summary(
                    label: 'Progress signals',
                    value: '${widget.portal.remarks.length}',
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
          FutureBuilder<ParentPerformanceDetail>(
            future: _performance,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Card(
                  child: Padding(
                    padding: EdgeInsets.all(28),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                );
              }
              if (snapshot.hasError) {
                return Card(
                  child: ListTile(
                    leading: const Icon(Icons.error_outline_rounded),
                    title: const Text('Progress chart unavailable'),
                    subtitle: const Text(
                        'Published remarks are still available below.'),
                    trailing: IconButton(
                      tooltip: 'Retry',
                      onPressed: () => setState(() => _performance = _load()),
                      icon: const Icon(Icons.refresh_rounded),
                    ),
                  ),
                );
              }
              return _ParentProgressAnalytics(
                  scores: snapshot.data?.scores ?? const []);
            },
          ),
          const SizedBox(height: 24),
          Text(
            'Academic progress',
            style: GoogleFonts.fraunces(
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          if (widget.portal.remarks.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: Text('No academic remarks are available.'),
              ),
            )
          else
            for (final remark in widget.portal.remarks) ...[
              _RemarkCard(remark: remark),
              const SizedBox(height: 12),
            ],
        ],
      );
}

class _ParentProgressAnalytics extends StatefulWidget {
  const _ParentProgressAnalytics({required this.scores});

  final List<Map<String, dynamic>> scores;

  @override
  State<_ParentProgressAnalytics> createState() =>
      _ParentProgressAnalyticsState();
}

class _ParentProgressAnalyticsState extends State<_ParentProgressAnalytics> {
  String? _subject;

  @override
  Widget build(BuildContext context) {
    final all = widget.scores.map(_ParentScorePoint.fromJson).where((item) {
      return item.subject.isNotEmpty && item.maximum > 0;
    }).toList()
      ..sort((a, b) => a.date.compareTo(b.date));
    if (all.isEmpty) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
              'No published results are available yet. The progress graph will appear after results are published.'),
        ),
      );
    }
    final subjects = all.map((item) => item.subject).toSet().toList()..sort();
    final selected = subjects.contains(_subject) ? _subject! : subjects.first;
    final points = all.where((item) => item.subject == selected).toList();
    final latest = points.last.percentage;
    final previous =
        points.length > 1 ? points[points.length - 2].percentage : null;
    final change = previous == null ? null : latest - previous;
    final average =
        points.fold<double>(0, (sum, item) => sum + item.percentage) /
            points.length;
    final trend = change == null
        ? 'More results are needed to identify a trend'
        : change > 3
            ? 'Improving by ${change.toStringAsFixed(1)} points'
            : change < -3
                ? 'Needs attention: ${change.abs().toStringAsFixed(1)} points lower'
                : 'Performance is stable';
    final trendColor = change == null
        ? kColorMutedText
        : change > 3
            ? kColorSuccess
            : change < -3
                ? kColorWarning
                : kColorPrimary;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
              child: Text('Score trend',
                  style: Theme.of(context).textTheme.titleLarge),
            ),
            DropdownButton<String>(
              value: selected,
              underline: const SizedBox.shrink(),
              items: [
                for (final subject in subjects)
                  DropdownMenuItem(value: subject, child: Text(subject)),
              ],
              onChanged: (value) => setState(() => _subject = value),
            ),
          ]),
          const SizedBox(height: 4),
          Text(trend,
              style: TextStyle(color: trendColor, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(
                child: _ProgressMetric(
                    label: 'Latest', value: '${latest.toStringAsFixed(0)}%')),
            Expanded(
                child: _ProgressMetric(
                    label: 'Average', value: '${average.toStringAsFixed(0)}%')),
            Expanded(
              child: _ProgressMetric(
                label: 'Change',
                value: change == null
                    ? '--'
                    : '${change >= 0 ? '+' : ''}${change.toStringAsFixed(1)}',
              ),
            ),
          ]),
          const SizedBox(height: 18),
          SizedBox(
            height: 210,
            width: double.infinity,
            child: points.length < 2
                ? Center(
                    child: Text(
                        '${points.first.assessment}: ${latest.toStringAsFixed(0)}%\nA second result will create the progress line.',
                        textAlign: TextAlign.center),
                  )
                : CustomPaint(
                    painter: _ParentProgressChartPainter(
                      values: points.map((item) => item.percentage).toList(),
                    ),
                  ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final point in points)
                Chip(
                  label: Text(
                      '${point.assessment} ${point.percentage.toStringAsFixed(0)}%'),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text('Based on teacher-published results only.',
              style: Theme.of(context).textTheme.bodySmall),
        ]),
      ),
    );
  }
}

class _ProgressMetric extends StatelessWidget {
  const _ProgressMetric({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(children: [
        Text(value, style: Theme.of(context).textTheme.titleMedium),
        Text(label, style: Theme.of(context).textTheme.bodySmall),
      ]);
}

class _ParentScorePoint {
  const _ParentScorePoint({
    required this.subject,
    required this.assessment,
    required this.score,
    required this.maximum,
    required this.date,
  });

  factory _ParentScorePoint.fromJson(Map<String, dynamic> json) =>
      _ParentScorePoint(
        subject: '${json['subject'] ?? ''}',
        assessment: '${json['assessment'] ?? 'Assessment'}',
        score: (json['score'] as num?)?.toDouble() ?? 0,
        maximum: (json['maximum'] as num?)?.toDouble() ?? 100,
        date: DateTime.tryParse('${json['testDate'] ?? ''}') ?? DateTime(1970),
      );

  final String subject;
  final String assessment;
  final double score;
  final double maximum;
  final DateTime date;
  double get percentage => (score / maximum * 100).clamp(0, 100).toDouble();
}

class _ParentProgressChartPainter extends CustomPainter {
  const _ParentProgressChartPainter({required this.values});
  final List<double> values;

  @override
  void paint(Canvas canvas, Size size) {
    const left = 34.0;
    const top = 12.0;
    const bottom = 24.0;
    final height = size.height - top - bottom;
    final width = size.width - left - 8;
    final labels = TextPainter(textDirection: TextDirection.ltr);
    final grid = Paint()
      ..color = kColorDivider
      ..strokeWidth = 1;
    for (final score in [0, 25, 50, 75, 100]) {
      final y = top + height * (1 - score / 100);
      canvas.drawLine(Offset(left, y), Offset(size.width, y), grid);
      labels
        ..text = TextSpan(
            text: '$score%',
            style: const TextStyle(fontSize: 9, color: kColorMutedText))
        ..layout();
      labels.paint(canvas, Offset(0, y - labels.height / 2));
    }
    final path = Path();
    final points = <Offset>[];
    for (var i = 0; i < values.length; i++) {
      final point = Offset(
        left + width * i / (values.length - 1),
        top + height * (1 - values[i].clamp(0, 100) / 100),
      );
      points.add(point);
      i == 0
          ? path.moveTo(point.dx, point.dy)
          : path.lineTo(point.dx, point.dy);
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = kColorPrimary
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke,
    );
    for (final point in points) {
      canvas.drawCircle(point, 5, Paint()..color = kColorPrimary);
      canvas.drawCircle(point, 2, Paint()..color = Colors.white);
    }
  }

  @override
  bool shouldRepaint(covariant _ParentProgressChartPainter oldDelegate) =>
      oldDelegate.values != values;
}

class _EventsTab extends StatelessWidget {
  const _EventsTab({required this.portal});

  final ParentPortal portal;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final upcoming = portal.events.where((event) {
      final date = parsePortalEventDate(event.date);
      return date != null && !date.isBefore(today);
    }).toList()
      ..sort((a, b) => parsePortalEventDate(a.date)!
          .compareTo(parsePortalEventDate(b.date)!));

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Upcoming academic events',
          style: GoogleFonts.fraunces(
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 12),
        if (upcoming.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Text('No upcoming academic events are available.'),
            ),
          )
        else
          for (final event in upcoming)
            Card(
              child: ListTile(
                leading: CircleAvatar(
                  child: Text(
                    '${parsePortalEventDate(event.date)!.toNepaliDateTime().day}',
                  ),
                ),
                title: Text(event.title),
                subtitle: Text(
                  '${nepaliDateLabel(parsePortalEventDate(event.date)!)} · ${event.details}',
                ),
                trailing: Text(event.kind),
              ),
            ),
      ],
    );
  }
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
