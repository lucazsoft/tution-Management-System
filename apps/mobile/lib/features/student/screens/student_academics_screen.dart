/// API-backed student academics screen (MOB-102).
///
/// Segments: Results, Syllabus, Homework, Analytics. Data comes from
/// `GET /api/users/me/student-portal` through
/// [StudentAcademicsViewModel]; detail insights can be refreshed from
/// `GET /api/performance/student/:studentId`. Screens handle loading,
/// empty, error, denied (403), offline, and session-expired (401) states.
/// Route guard (`/student/*` requires the student role) plus
/// server-resolved identity keeps records restricted to the signed-in
/// student.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/student_academics_api.dart';
import '../student_design.dart';
import '../viewmodels/student_academics_viewmodel.dart';
import '../widgets/student_record_states.dart';
import '../widgets/student_scaffold.dart';

class StudentAcademicsScreen extends ConsumerStatefulWidget {
  const StudentAcademicsScreen({super.key});

  @override
  ConsumerState<StudentAcademicsScreen> createState() =>
      _StudentAcademicsScreenState();
}

class _StudentAcademicsScreenState
    extends ConsumerState<StudentAcademicsScreen> {
  int _segment = 0;

  @override
  void initState() {
    super.initState();
    Future.microtask(
        () => ref.read(studentAcademicsViewModelProvider.notifier).load());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(studentAcademicsViewModelProvider);
    final viewModel = ref.read(studentAcademicsViewModelProvider.notifier);

    return StudentScaffold(
      title: 'My academics',
      selectedIndex: 1,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: SizedBox(
              width: double.infinity,
              child: SegmentedButton<int>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: 0, label: Text('Results')),
                  ButtonSegment(value: 1, label: Text('Syllabus')),
                  ButtonSegment(value: 2, label: Text('Homework')),
                  ButtonSegment(value: 3, label: Text('Analytics')),
                ],
                selected: {_segment},
                onSelectionChanged: (selection) =>
                    setState(() => _segment = selection.first),
              ),
            ),
          ),
          Expanded(child: _buildBody(state, viewModel)),
        ],
      ),
    );
  }

  Widget _buildBody(
    StudentAcademicsState state,
    StudentAcademicsViewModel viewModel,
  ) {
    if (state.isLoading && !state.hasData) {
      return const StudentLoadingView(message: 'Loading your academics…');
    }
    if (state.sessionExpired) {
      return StudentErrorView(
        icon: Icons.lock_outline_rounded,
        title: 'Session expired',
        message: 'Please sign in again to view your academics.',
        retryLabel: 'Reload',
        onRetry: viewModel.refresh,
      );
    }
    if (state.accessDenied) {
      return StudentErrorView(
        icon: Icons.block_rounded,
        title: 'Not available',
        message:
            state.error ?? 'Your account cannot view these academic records.',
        retryLabel: 'Try again',
        onRetry: viewModel.refresh,
      );
    }
    if (state.offline && !state.hasData) {
      return StudentErrorView(
        icon: Icons.wifi_off_rounded,
        title: 'You are offline',
        message: 'Check your connection and try again.',
        retryLabel: 'Retry',
        onRetry: viewModel.refresh,
      );
    }
    if (state.error != null && !state.hasData) {
      return StudentErrorView(
        icon: Icons.error_outline_rounded,
        title: 'Could not load academics',
        message: state.error!,
        retryLabel: 'Retry',
        onRetry: viewModel.refresh,
      );
    }
    return IndexedStack(
      index: _segment,
      children: [
        _ResultsView(state: state, viewModel: viewModel),
        _SyllabusView(state: state, viewModel: viewModel),
        _HomeworkView(state: state, viewModel: viewModel),
        _InsightsView(state: state, viewModel: viewModel),
      ],
    );
  }
}

class _ResultsView extends StatelessWidget {
  const _ResultsView({required this.state, required this.viewModel});

  final StudentAcademicsState state;
  final StudentAcademicsViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final results = state.pagedResults;
    if (state.results.isEmpty) {
      return const StudentEmptyView(
        icon: Icons.grade_outlined,
        title: 'No results yet',
        message: 'Scores appear here as soon as your teacher publishes them.',
      );
    }
    return RefreshIndicator(
      onRefresh: viewModel.refresh,
      child: ListView(
        padding: const EdgeInsets.all(TmsSpace.md),
        children: [
          Container(
            padding: const EdgeInsets.all(TmsSpace.md),
            decoration: BoxDecoration(
              color: StudentColors.primary.withValues(alpha: .08),
              borderRadius: BorderRadius.circular(TmsRadius.card),
            ),
            child: const Row(
              children: [
                Icon(Icons.bolt_rounded, color: StudentColors.primary),
                SizedBox(width: TmsSpace.sm),
                Expanded(
                  child: Text(
                    'Scores appear here as soon as your teacher publishes them.',
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: TmsSpace.lg),
          Text('Latest results', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: TmsSpace.sm),
          for (final result in results) ...[
            _ResultCard(result: result),
            const SizedBox(height: TmsSpace.sm),
          ],
          StudentLoadMoreFooter(
            hasMore: state.hasMoreResults,
            remaining: state.results.length - results.length,
            onLoadMore: viewModel.loadMoreResults,
          ),
        ],
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.result});
  final AcademicResult result;

  @override
  Widget build(BuildContext context) {
    final classAverage = result.classAverage;
    final aboveAverage = classAverage == null || result.score >= classAverage;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(TmsSpace.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(result.subject,
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: TmsSpace.xxs),
                      Text(result.assessment,
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
                Text(
                  '${result.score.toStringAsFixed(0)}/${result.maximum.toStringAsFixed(0)}',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: StudentColors.primaryDark,
                      ),
                ),
              ],
            ),
            const SizedBox(height: TmsSpace.md),
            ClipRRect(
              borderRadius: BorderRadius.circular(TmsRadius.pill),
              child: LinearProgressIndicator(
                minHeight: 8,
                value: (result.percentage / 100).clamp(0.0, 1.0).toDouble(),
                backgroundColor: StudentColors.border,
              ),
            ),
            const SizedBox(height: TmsSpace.sm),
            Row(
              children: [
                StudentStatusPill(
                  label: aboveAverage
                      ? 'Above class average'
                      : 'Below class average',
                  icon: aboveAverage
                      ? Icons.trending_up_rounded
                      : Icons.trending_down_rounded,
                  color: aboveAverage
                      ? StudentColors.success
                      : StudentColors.warning,
                ),
                const Spacer(),
                if (result.publishedLabel != null)
                  Text(
                    result.publishedLabel!,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SyllabusView extends StatelessWidget {
  const _SyllabusView({required this.state, required this.viewModel});

  final StudentAcademicsState state;
  final StudentAcademicsViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    if (state.syllabi.isEmpty) {
      return const StudentEmptyView(
        icon: Icons.menu_book_outlined,
        title: 'No syllabus shared yet',
        message: 'Your teachers share the term syllabus here once it is ready.',
      );
    }
    return RefreshIndicator(
      onRefresh: viewModel.refresh,
      child: ListView(
        padding: const EdgeInsets.all(TmsSpace.md),
        children: [
          Text('Term syllabus', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: TmsSpace.xs),
          Text(
            'Follow the current topics and your class progress.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: StudentColors.mutedText,
                ),
          ),
          const SizedBox(height: TmsSpace.lg),
          for (final syllabus in state.syllabi) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(TmsSpace.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.menu_book_outlined,
                            color: StudentColors.primary),
                        const SizedBox(width: TmsSpace.sm),
                        Expanded(
                          child: Text(syllabus.subject,
                              style: Theme.of(context).textTheme.titleMedium),
                        ),
                        Text('${syllabus.topicCount} topics'),
                      ],
                    ),
                    const SizedBox(height: TmsSpace.xs),
                    Text(
                      syllabus.className,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: StudentColors.mutedText,
                          ),
                    ),
                    const SizedBox(height: TmsSpace.sm),
                    for (final chapter in syllabus.chapters)
                      Padding(
                        padding: const EdgeInsets.only(top: TmsSpace.xs),
                        child: Text(
                          '• ${chapter.title} (${chapter.topics.length})',
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: TmsSpace.sm),
          ],
        ],
      ),
    );
  }
}

class _HomeworkView extends StatelessWidget {
  const _HomeworkView({required this.state, required this.viewModel});

  final StudentAcademicsState state;
  final StudentAcademicsViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    if (state.homework.isEmpty) {
      return const StudentEmptyView(
        icon: Icons.assignment_outlined,
        title: 'No homework assigned',
        message: 'New homework from your teachers will show up here.',
      );
    }
    return RefreshIndicator(
      onRefresh: viewModel.refresh,
      child: ListView(
        padding: const EdgeInsets.all(TmsSpace.md),
        children: [
          Text('Pending homework',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: TmsSpace.sm),
          for (final item in state.pagedHomework) ...[
            Card(
              child: ListTile(
                minTileHeight: 84,
                leading: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: (item.isOverdue
                            ? StudentColors.error
                            : StudentColors.primary)
                        .withValues(alpha: .10),
                    borderRadius: BorderRadius.circular(TmsRadius.control),
                  ),
                  child: Icon(
                    item.isOverdue
                        ? Icons.priority_high_rounded
                        : Icons.assignment_outlined,
                    color: item.isOverdue
                        ? StudentColors.error
                        : StudentColors.primary,
                  ),
                ),
                title: Text(item.title),
                subtitle: Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    '${item.subject} · ${item.dueLabel}',
                    style: TextStyle(
                      color: item.isOverdue
                          ? StudentColors.error
                          : StudentColors.mutedText,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                trailing: item.completed
                    ? const Icon(Icons.check_circle_rounded,
                        color: StudentColors.success)
                    : null,
              ),
            ),
            const SizedBox(height: TmsSpace.sm),
          ],
          StudentLoadMoreFooter(
            hasMore: state.hasMoreHomework,
            remaining: state.homework.length - state.pagedHomework.length,
            onLoadMore: viewModel.loadMoreHomework,
          ),
        ],
      ),
    );
  }
}

class _InsightsView extends StatelessWidget {
  const _InsightsView({required this.state, required this.viewModel});

  final StudentAcademicsState state;
  final StudentAcademicsViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final insights = state.detail?.insights.isNotEmpty == true
        ? state.detail!.insights
        : state.insights;
    if (insights.isEmpty) {
      return const StudentEmptyView(
        icon: Icons.insights_outlined,
        title: 'No insights yet',
        message: 'Insights are calculated from your published scores.',
      );
    }
    final strongest = [...insights]
      ..sort((a, b) => b.average.compareTo(a.average));
    final weakest = [...insights]
      ..sort((a, b) => a.average.compareTo(b.average));
    return RefreshIndicator(
      onRefresh: viewModel.refresh,
      child: ListView(
        padding: const EdgeInsets.all(TmsSpace.md),
        children: [
          Row(
            children: [
              Expanded(
                child: _InsightSummary(
                  label: 'Strongest',
                  subject: strongest.first.subject,
                  value: strongest.first.average,
                  color: StudentColors.success,
                  icon: Icons.workspace_premium_outlined,
                ),
              ),
              const SizedBox(width: TmsSpace.sm),
              Expanded(
                child: _InsightSummary(
                  label: 'Needs focus',
                  subject: weakest.first.subject,
                  value: weakest.first.average,
                  color: StudentColors.warning,
                  icon: Icons.track_changes_rounded,
                ),
              ),
            ],
          ),
          const SizedBox(height: TmsSpace.lg),
          Text('Subject trends', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: TmsSpace.sm),
          for (final insight in insights) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(TmsSpace.md),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(insight.subject,
                              style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: TmsSpace.xs),
                          LinearProgressIndicator(
                            minHeight: 7,
                            value: (insight.average / 100)
                                .clamp(0.0, 1.0)
                                .toDouble(),
                            borderRadius: BorderRadius.circular(TmsRadius.pill),
                            backgroundColor: StudentColors.border,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: TmsSpace.md),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('${insight.average.toStringAsFixed(0)}%',
                            style: Theme.of(context).textTheme.titleMedium),
                        Text(
                          '${insight.trend} ${insight.change >= 0 ? '+' : ''}${insight.change.toStringAsFixed(0)}%',
                          style:
                              Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: insight.change >= 0
                                        ? StudentColors.success
                                        : StudentColors.error,
                                  ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: TmsSpace.sm),
          ],
          const SizedBox(height: TmsSpace.xs),
          if (state.detailLoading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: TmsSpace.sm),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (state.detail == null && state.snapshot != null)
            Center(
              child: TextButton.icon(
                onPressed: viewModel.loadDetail,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Refresh detailed insights'),
              ),
            ),
          for (final remark in state.detail?.remarks ?? const []) ...[
            Card(
              child: ListTile(
                leading: const Icon(Icons.comment_outlined,
                    color: StudentColors.primary),
                title: Text(remark.subject),
                subtitle: Text(remark.message),
              ),
            ),
            const SizedBox(height: TmsSpace.sm),
          ],
          Text(
            'Insights use averages across published tests and are read-only.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _InsightSummary extends StatelessWidget {
  const _InsightSummary({
    required this.label,
    required this.subject,
    required this.value,
    required this.color,
    required this.icon,
  });

  final String label;
  final String subject;
  final double value;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(TmsSpace.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color),
            const SizedBox(height: TmsSpace.md),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: TmsSpace.xxs),
            Text(subject, style: Theme.of(context).textTheme.titleMedium),
            Text('${value.toStringAsFixed(0)}%',
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: color, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}
