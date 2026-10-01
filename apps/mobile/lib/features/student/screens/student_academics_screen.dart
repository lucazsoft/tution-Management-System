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
import 'package:url_launcher/url_launcher.dart';
import 'package:tms_mobile/core/network/api_client.dart';

import '../models/student_academics_api.dart';
import '../student_design.dart';
import '../viewmodels/student_academics_viewmodel.dart';
import '../widgets/student_record_states.dart';
import '../widgets/student_scaffold.dart';

Future<void> _openStudentFile(BuildContext context, String path) async {
  final raw = path.trim();
  final parsed = Uri.tryParse(raw);
  final uri = parsed?.hasScheme == true
      ? parsed!
      : Uri.parse(ApiClient.baseUrl).resolve(raw);
  if (!await launchUrl(uri, mode: LaunchMode.externalApplication) &&
      context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Could not open this file.')),
    );
  }
}

class StudentAcademicsScreen extends ConsumerStatefulWidget {
  const StudentAcademicsScreen({super.key, this.initialSegment = 0});

  final int initialSegment;

  @override
  ConsumerState<StudentAcademicsScreen> createState() =>
      _StudentAcademicsScreenState();
}

class _StudentAcademicsScreenState
    extends ConsumerState<StudentAcademicsScreen> {
  late int _segment;

  @override
  void initState() {
    super.initState();
    _segment = widget.initialSegment.clamp(0, 3);
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
          _AcademicsTabBar(
            selectedIndex: _segment,
            onSelected: (index) => setState(() => _segment = index),
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
        _ResultsView(
          state: state,
          viewModel: viewModel,
          onSeeInsights: () => setState(() => _segment = 3),
        ),
        _SyllabusView(state: state, viewModel: viewModel),
        _HomeworkView(state: state, viewModel: viewModel),
        _InsightsView(state: state, viewModel: viewModel),
      ],
    );
  }
}

class _AcademicsTabBar extends StatelessWidget {
  const _AcademicsTabBar({
    required this.selectedIndex,
    required this.onSelected,
  });

  static const _labels = ['Results', 'Syllabus', 'Homework', 'Analytics'];

  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: TmsSpace.sm),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(
          bottom: BorderSide(
            color: Theme.of(context).dividerColor.withValues(alpha: .55),
          ),
        ),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: TmsSpace.sm),
        child: Row(
          children: [
            for (var index = 0; index < _labels.length; index++)
              _AcademicsTab(
                label: _labels[index],
                selected: selectedIndex == index,
                onTap: () => onSelected(index),
              ),
          ],
        ),
      ),
    );
  }
}

class _AcademicsTab extends StatelessWidget {
  const _AcademicsTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected
        ? StudentColors.primary
        : Theme.of(context).colorScheme.onSurfaceVariant;
    return Semantics(
      selected: selected,
      button: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(TmsRadius.r10),
        ),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
          decoration: BoxDecoration(
            color: selected
                ? StudentColors.primary.withValues(alpha: .07)
                : Colors.transparent,
            border: Border(
              bottom: BorderSide(
                color: selected ? StudentColors.primary : Colors.transparent,
                width: 3,
              ),
            ),
          ),
          child: Text(
            label,
            maxLines: 1,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: color,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                ),
          ),
        ),
      ),
    );
  }
}

class _ResultsView extends StatefulWidget {
  const _ResultsView({
    required this.state,
    required this.viewModel,
    required this.onSeeInsights,
  });

  final StudentAcademicsState state;
  final StudentAcademicsViewModel viewModel;
  final VoidCallback onSeeInsights;

  @override
  State<_ResultsView> createState() => _ResultsViewState();
}

class _ResultsViewState extends State<_ResultsView> {
  String? _selection;

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final viewModel = widget.viewModel;
    if (state.results.isEmpty) {
      return const StudentEmptyView(
        icon: Icons.grade_outlined,
        title: 'No results yet',
        message: 'Scores appear here as soon as your teacher publishes them.',
      );
    }
    final assessments = state.results.map((item) => item.assessment).toSet();
    final years = state.results
        .map((item) => item.academicYear)
        .whereType<int>()
        .toSet()
        .toList()
      ..sort((a, b) => b.compareTo(a));
    final options = <String, String>{
      for (final assessment in assessments)
        'assessment:$assessment': assessment,
      for (final year in years) 'year:$year': '$year yearly improvement',
    };
    _selection ??= options.keys.first;
    if (!options.containsKey(_selection)) _selection = options.keys.first;
    final results = state.results.where((item) {
      final selection = _selection!;
      if (selection.startsWith('year:')) {
        return item.academicYear.toString() == selection.substring(5);
      }
      return item.assessment == selection.substring('assessment:'.length);
    }).toList();
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
          Text('Published results',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: TmsSpace.sm),
          DropdownButtonFormField<String>(
            initialValue: _selection,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Assessment or academic year',
              prefixIcon: Icon(Icons.fact_check_outlined),
            ),
            items: options.entries
                .map((entry) => DropdownMenuItem(
                      value: entry.key,
                      child: Text(entry.value, overflow: TextOverflow.ellipsis),
                    ))
                .toList(),
            onChanged: (value) => setState(() => _selection = value),
          ),
          const SizedBox(height: TmsSpace.md),
          Text(
            'Only results published by your teacher or administrator are available.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: TmsSpace.sm),
          _GradeSheetTable(results: results),
          const SizedBox(height: TmsSpace.sm),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.tonalIcon(
              onPressed: widget.onSeeInsights,
              icon: const Icon(Icons.insights_outlined),
              label: const Text('See insights'),
            ),
          ),
          if (results
              .any((result) => result.teacherRemarks?.isNotEmpty == true)) ...[
            const SizedBox(height: TmsSpace.lg),
            Text('Teacher comments',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: TmsSpace.sm),
            for (final result in results
                .where((result) => result.teacherRemarks?.isNotEmpty == true))
              Card(
                child: ListTile(
                  leading: const Icon(Icons.comment_outlined,
                      color: StudentColors.primary),
                  title: Text(result.subject),
                  subtitle: Text(result.teacherRemarks!),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _GradeSheetTable extends StatelessWidget {
  const _GradeSheetTable({required this.results});
  final List<AcademicResult> results;

  String _grade(double percentage) => switch (percentage) {
        >= 90 => 'A+',
        >= 80 => 'A',
        >= 70 => 'B+',
        >= 60 => 'B',
        >= 50 => 'C+',
        >= 40 => 'C',
        >= 35 => 'D',
        _ => 'NG',
      };

  bool _passed(AcademicResult result) {
    final passMarks = result.passMarks;
    return passMarks == null
        ? result.percentage >= 35
        : result.score >= passMarks;
  }

  String _marks(double value) => value == value.roundToDouble()
      ? value.toStringAsFixed(0)
      : value.toStringAsFixed(1);

  void _openDetails(BuildContext context, AcademicResult result) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ResultDetails(result: result),
    );
  }

  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(TmsSpace.md),
            color: StudentColors.primary.withValues(alpha: .07),
            child: Row(children: [
              const Icon(Icons.table_chart_outlined,
                  color: StudentColors.primary),
              const SizedBox(width: TmsSpace.sm),
              Expanded(
                child: Text('Grade sheet',
                    style: Theme.of(context).textTheme.titleMedium),
              ),
              Text('${results.length} subjects',
                  style: Theme.of(context).textTheme.bodySmall),
            ]),
          ),
          LayoutBuilder(builder: (context, constraints) {
            return SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: ConstrainedBox(
                constraints: BoxConstraints(minWidth: constraints.maxWidth),
                child: DataTable(
                  headingRowColor: WidgetStatePropertyAll(
                    StudentColors.surface.withValues(alpha: .8),
                  ),
                  columnSpacing: 24,
                  horizontalMargin: TmsSpace.md,
                  columns: const [
                    DataColumn(label: Text('Subject')),
                    DataColumn(label: Text('Full marks'), numeric: true),
                    DataColumn(label: Text('Obtained'), numeric: true),
                    DataColumn(label: Text('Grade')),
                    DataColumn(label: Text('Result')),
                  ],
                  rows: [
                    for (final result in results)
                      DataRow(
                        onSelectChanged: (_) => _openDetails(context, result),
                        cells: [
                          DataCell(SizedBox(
                            width: 130,
                            child: Text(result.subject,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700)),
                          )),
                          DataCell(Text(_marks(result.maximum))),
                          DataCell(Text(_marks(result.score))),
                          DataCell(Text(_grade(result.percentage),
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800))),
                          DataCell(StudentStatusPill(
                            label: _passed(result) ? 'Pass' : 'Needs support',
                            icon: _passed(result)
                                ? Icons.check_circle_outline
                                : Icons.info_outline,
                            color: _passed(result)
                                ? StudentColors.success
                                : StudentColors.error,
                          )),
                        ],
                      ),
                  ],
                ),
              ),
            );
          }),
          Padding(
            padding: const EdgeInsets.fromLTRB(
                TmsSpace.md, 0, TmsSpace.md, TmsSpace.sm),
            child: Text(
                'Tap any row to view remarks and the shared result sheet.',
                style: Theme.of(context).textTheme.bodySmall),
          ),
        ]),
      );
}

class _ResultDetails extends StatelessWidget {
  const _ResultDetails({required this.result});
  final AcademicResult result;

  @override
  Widget build(BuildContext context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            TmsSpace.lg,
            0,
            TmsSpace.lg,
            TmsSpace.lg,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(result.subject,
                  style: Theme.of(context)
                      .textTheme
                      .labelLarge
                      ?.copyWith(color: StudentColors.primary)),
              Text(result.assessment,
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: TmsSpace.md),
              Text(
                '${result.score.toStringAsFixed(0)} / ${result.maximum.toStringAsFixed(0)}  ·  ${result.percentage.toStringAsFixed(1)}%',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              if (result.classAverage != null) ...[
                const SizedBox(height: TmsSpace.xs),
                Text(
                  'Class average: ${result.classAverage!.toStringAsFixed(1)} / ${result.maximum.toStringAsFixed(0)}',
                ),
              ],
              if (result.publishedLabel?.isNotEmpty == true) ...[
                const SizedBox(height: TmsSpace.xs),
                Text(result.publishedLabel!),
              ],
              const Divider(height: TmsSpace.xl),
              Text('Result description',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: TmsSpace.xs),
              Text(result.teacherRemarks?.isNotEmpty == true
                  ? result.teacherRemarks!
                  : 'No description or teacher feedback was provided.'),
              if (result.resultSheetUrl?.isNotEmpty == true) ...[
                const SizedBox(height: TmsSpace.lg),
                FilledButton.tonalIcon(
                  onPressed: () =>
                      _openStudentFile(context, result.resultSheetUrl!),
                  icon: const Icon(Icons.description_outlined),
                  label: const Text('Open result sheet'),
                ),
              ],
            ],
          ),
        ),
      );
}

class _SyllabusView extends StatefulWidget {
  const _SyllabusView({required this.state, required this.viewModel});

  final StudentAcademicsState state;
  final StudentAcademicsViewModel viewModel;

  @override
  State<_SyllabusView> createState() => _SyllabusViewState();
}

class _SyllabusViewState extends State<_SyllabusView> {
  String? selectedId;

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    if (state.syllabi.isEmpty) {
      return const StudentEmptyView(
        icon: Icons.menu_book_outlined,
        title: 'No syllabus shared yet',
        message: 'Your teachers share the term syllabus here once it is ready.',
      );
    }
    if (!state.syllabi.any((item) => item.id == selectedId)) {
      selectedId = state.syllabi.first.id;
    }
    final selected = state.syllabi.firstWhere((item) => item.id == selectedId);

    return RefreshIndicator(
      onRefresh: widget.viewModel.refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(
            TmsSpace.md, TmsSpace.md, TmsSpace.md, TmsSpace.xl),
        children: [
          Text('Syllabus progress',
              style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: TmsSpace.xs),
          Text(
            'Chapter plans and daily progress shared by your teachers.',
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(color: StudentColors.mutedText),
          ),
          const SizedBox(height: TmsSpace.lg),
          SizedBox(
            height: 50,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: state.syllabi.length,
              separatorBuilder: (_, __) => const SizedBox(width: TmsSpace.sm),
              itemBuilder: (context, index) {
                final syllabus = state.syllabi[index];
                final isSelected = syllabus.id == selectedId;
                return ChoiceChip(
                  selected: isSelected,
                  showCheckmark: false,
                  avatar: Icon(
                    isSelected
                        ? Icons.menu_book_rounded
                        : Icons.menu_book_outlined,
                    size: 19,
                    color: isSelected ? Colors.white : StudentColors.primary,
                  ),
                  label: Text(syllabus.subject),
                  labelStyle: TextStyle(
                    color: isSelected ? Colors.white : StudentColors.text,
                    fontWeight: FontWeight.w700,
                  ),
                  selectedColor: StudentColors.primary,
                  backgroundColor: StudentColors.background,
                  side: BorderSide(
                    color: isSelected
                        ? StudentColors.primary
                        : StudentColors.border,
                  ),
                  onSelected: (_) => setState(() => selectedId = syllabus.id),
                );
              },
            ),
          ),
          const SizedBox(height: TmsSpace.md),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 250),
            child: _SyllabusDetails(
              key: ValueKey(selected.id),
              syllabus: selected,
            ),
          ),
        ],
      ),
    );
  }
}

class _SyllabusDetails extends StatelessWidget {
  const _SyllabusDetails({super.key, required this.syllabus});
  final SyllabusSummary syllabus;

  Color _color(String status) => status == 'COMPLETED'
      ? StudentColors.success
      : status == 'IN_PROGRESS'
          ? StudentColors.warning
          : StudentColors.mutedText;
  String _label(String status) => status == 'COMPLETED'
      ? 'Completed'
      : status == 'IN_PROGRESS'
          ? 'In progress'
          : 'Left to start';

  @override
  Widget build(BuildContext context) {
    final completed =
        syllabus.chapters.where((item) => item.status == 'COMPLETED').length;
    final progress =
        syllabus.chapters.isEmpty ? 0.0 : completed / syllabus.chapters.length;
    final inProgress =
        syllabus.chapters.where((item) => item.status == 'IN_PROGRESS').length;
    final remaining = syllabus.chapters.length - completed - inProgress;
    final topics = syllabus.chapters.expand((item) => item.topics).toList();
    final completedTopics =
        topics.where((item) => item.status == 'COMPLETED').length;
    return Column(children: [
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(TmsSpace.lg),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [StudentColors.primaryDark, StudentColors.primary],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(TmsRadius.card),
          boxShadow: [
            BoxShadow(
              color: StudentColors.primary.withValues(alpha: .18),
              blurRadius: 22,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: .14),
                borderRadius: BorderRadius.circular(14),
              ),
              child:
                  const Icon(Icons.auto_stories_rounded, color: Colors.white),
            ),
            const SizedBox(width: TmsSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(syllabus.subject,
                      style: Theme.of(context)
                          .textTheme
                          .titleLarge
                          ?.copyWith(color: Colors.white, fontSize: 22)),
                  const SizedBox(height: 3),
                  Text(
                    '${syllabus.className}${syllabus.teacherName.isEmpty ? '' : ' · ${syllabus.teacherName}'}',
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: Colors.white.withValues(alpha: .78)),
                  ),
                ],
              ),
            ),
            Text('${(progress * 100).round()}%',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: Colors.white, fontWeight: FontWeight.w800)),
          ]),
          const SizedBox(height: TmsSpace.lg),
          ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 8,
              backgroundColor: Colors.white.withValues(alpha: .18),
              valueColor: const AlwaysStoppedAnimation(Colors.white),
            ),
          ),
          const SizedBox(height: TmsSpace.sm),
          Text(
            '$completed of ${syllabus.chapters.length} chapters completed',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Colors.white.withValues(alpha: .82),
                fontWeight: FontWeight.w600),
          ),
        ]),
      ),
      const SizedBox(height: TmsSpace.md),
      _SyllabusMetrics(
        totalChapters: syllabus.chapters.length,
        totalTopics: topics.length,
        completedChapters: completed,
        completedTopics: completedTopics,
        inProgressChapters: inProgress,
        remainingChapters: remaining,
      ),
      const SizedBox(height: TmsSpace.md),
      for (final chapter in syllabus.chapters)
        _ChapterDetails(
          chapter: chapter,
          syllabus: syllabus,
          color: _color,
          label: _label,
        ),
    ]);
  }
}

class _SyllabusMetrics extends StatelessWidget {
  const _SyllabusMetrics({
    required this.totalChapters,
    required this.totalTopics,
    required this.completedChapters,
    required this.completedTopics,
    required this.inProgressChapters,
    required this.remainingChapters,
  });

  final int totalChapters;
  final int totalTopics;
  final int completedChapters;
  final int completedTopics;
  final int inProgressChapters;
  final int remainingChapters;

  @override
  Widget build(BuildContext context) {
    final items = [
      _SyllabusMetricData(
        label: 'Total Chapters',
        value: totalChapters,
        supportingText:
            '$totalTopics ${totalTopics == 1 ? 'topic' : 'topics'} overall',
        icon: Icons.menu_book_outlined,
        color: StudentColors.primary,
      ),
      _SyllabusMetricData(
        label: 'Completed',
        value: completedChapters,
        supportingText:
            '$completedTopics ${completedTopics == 1 ? 'topic' : 'topics'} done',
        icon: Icons.check_circle_outline_rounded,
        color: StudentColors.success,
      ),
      _SyllabusMetricData(
        label: 'In Progress',
        value: inProgressChapters,
        supportingText: 'Actively being taught',
        icon: Icons.pending_outlined,
        color: StudentColors.warning,
      ),
      _SyllabusMetricData(
        label: 'Remaining',
        value: remainingChapters,
        supportingText: 'Untouched chapters',
        icon: Icons.schedule_outlined,
        color: StudentColors.mutedText,
      ),
    ];
    return LayoutBuilder(builder: (context, constraints) {
      final columns = constraints.maxWidth >= 640 ? 2 : 1;
      const gap = TmsSpace.sm;
      final width = columns == 1
          ? constraints.maxWidth
          : (constraints.maxWidth - gap) / columns;
      return Wrap(
        spacing: gap,
        runSpacing: gap,
        children: [
          for (final item in items)
            SizedBox(width: width, child: _SyllabusMetricCard(data: item)),
        ],
      );
    });
  }
}

class _SyllabusMetricData {
  const _SyllabusMetricData({
    required this.label,
    required this.value,
    required this.supportingText,
    required this.icon,
    required this.color,
  });

  final String label;
  final int value;
  final String supportingText;
  final IconData icon;
  final Color color;
}

class _SyllabusMetricCard extends StatelessWidget {
  const _SyllabusMetricCard({required this.data});
  final _SyllabusMetricData data;

  @override
  Widget build(BuildContext context) => Container(
        constraints: const BoxConstraints(minHeight: 96),
        padding: const EdgeInsets.all(TmsSpace.md),
        decoration: BoxDecoration(
          color: StudentColors.background,
          borderRadius: BorderRadius.circular(TmsRadius.card),
          border: Border.all(color: StudentColors.border),
          boxShadow: [
            BoxShadow(
              color: StudentColors.text.withValues(alpha: .055),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: data.color.withValues(alpha: .10),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(data.icon, color: data.color, size: 25),
          ),
          const SizedBox(width: TmsSpace.md),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  data.label,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: StudentColors.mutedText,
                        fontWeight: FontWeight.w700,
                      ),
                ),
                Text(
                  '${data.value}',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        color: StudentColors.text,
                        fontSize: 24,
                      ),
                ),
                Text(data.supportingText,
                    style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
        ]),
      );
}

class _ChapterDetails extends StatelessWidget {
  const _ChapterDetails({
    required this.chapter,
    required this.syllabus,
    required this.color,
    required this.label,
  });
  final SyllabusChapter chapter;
  final SyllabusSummary syllabus;
  final Color Function(String) color;
  final String Function(String) label;

  @override
  Widget build(BuildContext context) {
    final logs =
        syllabus.dailyLogs.where((log) => log.chapterId == chapter.id).toList();
    final latest = logs.isEmpty ? null : logs.first;
    final statusColor = color(chapter.status);
    return Container(
      margin: const EdgeInsets.only(bottom: TmsSpace.sm),
      decoration: BoxDecoration(
        color: StudentColors.background,
        borderRadius: BorderRadius.circular(TmsRadius.card),
        border: Border.all(color: StudentColors.border),
        boxShadow: [
          BoxShadow(
            color: StudentColors.text.withValues(alpha: .035),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(width: 5, color: statusColor),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(TmsSpace.md),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          CircleAvatar(
                            radius: 19,
                            backgroundColor:
                                StudentColors.primary.withValues(alpha: .10),
                            foregroundColor: StudentColors.primary,
                            child: Text('${chapter.position}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800)),
                          ),
                          const SizedBox(width: TmsSpace.sm),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(chapter.title,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium),
                                const SizedBox(height: 3),
                                Text(
                                  latest?.notes.isNotEmpty == true
                                      ? latest!.notes
                                      : chapter.status == 'COMPLETED'
                                          ? 'All topics completed'
                                          : chapter.status == 'IN_PROGRESS'
                                              ? 'Chapter in progress'
                                              : 'Not started',
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodySmall
                                      ?.copyWith(
                                          color: StudentColors.mutedText),
                                ),
                              ],
                            ),
                          ),
                        ]),
                    const SizedBox(height: TmsSpace.sm),
                    StudentStatusPill(
                      label: label(chapter.status),
                      icon: chapter.status == 'COMPLETED'
                          ? Icons.check_circle
                          : chapter.status == 'IN_PROGRESS'
                              ? Icons.pending
                              : Icons.radio_button_unchecked,
                      color: statusColor,
                    ),
                    if (chapter.topics.isNotEmpty) ...[
                      const SizedBox(height: TmsSpace.md),
                      for (final topic in chapter.topics)
                        _TopicProgressTile(
                          topic: topic,
                          color: color(topic.status),
                          label: label(topic.status),
                        ),
                    ],
                    const SizedBox(height: TmsSpace.sm),
                    Text(
                      latest == null
                          ? 'Shared by ${syllabus.teacherName.isEmpty ? 'your teacher' : syllabus.teacherName}'
                          : 'Updated by ${syllabus.teacherName.isEmpty ? 'your teacher' : syllabus.teacherName} · ${latest.logDate}',
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: StudentColors.mutedText),
                    ),
                  ]),
            ),
          ),
        ]),
      ),
    );
  }
}

class _TopicProgressTile extends StatelessWidget {
  const _TopicProgressTile({
    required this.topic,
    required this.color,
    required this.label,
  });

  final SyllabusTopic topic;
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    final log = topic.logs.isEmpty ? null : topic.logs.first;
    return Container(
      margin: const EdgeInsets.only(bottom: TmsSpace.xs),
      padding: const EdgeInsets.symmetric(
          horizontal: TmsSpace.sm, vertical: TmsSpace.sm),
      decoration: BoxDecoration(
        color: StudentColors.surface,
        borderRadius: BorderRadius.circular(TmsRadius.control),
        border: Border.all(color: StudentColors.border),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 10,
          height: 10,
          margin: const EdgeInsets.only(top: 5),
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: TmsSpace.sm),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(topic.title,
                style: const TextStyle(fontWeight: FontWeight.w700)),
            if (log != null && log.notes.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text('${log.notes} · ${log.logDate}',
                  style: Theme.of(context).textTheme.bodySmall),
            ],
          ]),
        ),
        const SizedBox(width: TmsSpace.xs),
        Text(label,
            style: TextStyle(
                color: color, fontSize: 11, fontWeight: FontWeight.w800)),
      ]),
    );
  }
}

enum _HomeworkFilter { pending, soon, overdue, completed }

class _HomeworkView extends StatefulWidget {
  const _HomeworkView({required this.state, required this.viewModel});

  final StudentAcademicsState state;
  final StudentAcademicsViewModel viewModel;

  @override
  State<_HomeworkView> createState() => _HomeworkViewState();
}

class _HomeworkViewState extends State<_HomeworkView> {
  _HomeworkFilter _filter = _HomeworkFilter.pending;

  String _label(_HomeworkFilter filter) => switch (filter) {
        _HomeworkFilter.pending => 'Pending',
        _HomeworkFilter.soon => 'Due soon',
        _HomeworkFilter.overdue => 'Overdue',
        _HomeworkFilter.completed => 'Completed',
      };

  bool _matches(HomeworkTask item, _HomeworkFilter filter) => switch (filter) {
        _HomeworkFilter.pending => !item.completed,
        _HomeworkFilter.soon => !item.completed && item.isDueSoon,
        _HomeworkFilter.overdue => !item.completed && item.isOverdue,
        _HomeworkFilter.completed => item.completed,
      };

  int _count(_HomeworkFilter filter) =>
      widget.state.homework.where((item) => _matches(item, filter)).length;

  List<HomeworkTask> get _visible {
    return widget.state.homework
        .where((item) => _matches(item, _filter))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.state.homework.isEmpty) {
      return const StudentEmptyView(
        icon: Icons.assignment_outlined,
        title: 'No homework assigned',
        message: 'New homework from your teachers will show up here.',
      );
    }
    return RefreshIndicator(
      onRefresh: widget.viewModel.refresh,
      child: ListView(
        padding: const EdgeInsets.all(TmsSpace.md),
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final filter in _HomeworkFilter.values) ...[
                  FilterChip(
                    selected: _filter == filter,
                    label: Text('${_label(filter)} ${_count(filter)}'),
                    onSelected: (_) => setState(() => _filter = filter),
                  ),
                  const SizedBox(width: TmsSpace.xs),
                ],
              ],
            ),
          ),
          const SizedBox(height: TmsSpace.md),
          Text('${_label(_filter)} homework',
              style: Theme.of(context).textTheme.titleLarge),
          Text('Open an assignment to review details or mark it done.',
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: TmsSpace.sm),
          if (_visible.isEmpty)
            StudentEmptyView(
              icon: Icons.task_alt_rounded,
              title: 'No ${_label(_filter).toLowerCase()} homework',
              message: 'There are no assignments in this view right now.',
            )
          else
            for (final item in _visible) ...[
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
                      : item.isOverdue
                          ? const Icon(Icons.error_rounded,
                              color: StudentColors.error)
                          : item.isDueSoon
                              ? const Icon(Icons.schedule_rounded,
                                  color: StudentColors.warning)
                              : null,
                  onTap: () => showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    showDragHandle: true,
                    builder: (_) => _HomeworkDetails(
                      item: item,
                      viewModel: widget.viewModel,
                      busy:
                          widget.state.completingHomeworkIds.contains(item.id),
                    ),
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

class _HomeworkDetails extends StatefulWidget {
  const _HomeworkDetails({
    required this.item,
    required this.viewModel,
    required this.busy,
  });

  final HomeworkTask item;
  final StudentAcademicsViewModel viewModel;
  final bool busy;

  @override
  State<_HomeworkDetails> createState() => _HomeworkDetailsState();
}

class _HomeworkDetailsState extends State<_HomeworkDetails> {
  late bool _saving = widget.busy;

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          TmsSpace.lg,
          0,
          TmsSpace.lg,
          TmsSpace.lg,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(item.subject,
                style: Theme.of(context)
                    .textTheme
                    .labelLarge
                    ?.copyWith(color: StudentColors.primary)),
            Text(item.title, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: TmsSpace.xs),
            Text('Assigned by ${item.teacher}'),
            Text(item.completed ? item.dueLabel : 'Due ${item.dueLabel}'),
            if (item.description?.isNotEmpty == true) ...[
              const Divider(height: TmsSpace.xl),
              Text('Instructions',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: TmsSpace.xs),
              Text(item.description!),
            ],
            if (item.contentUrl?.isNotEmpty == true ||
                item.submissionUrl?.isNotEmpty == true) ...[
              const SizedBox(height: TmsSpace.lg),
              Wrap(
                spacing: TmsSpace.sm,
                runSpacing: TmsSpace.sm,
                children: [
                  if (item.contentUrl?.isNotEmpty == true)
                    FilledButton.tonalIcon(
                      onPressed: () =>
                          _openStudentFile(context, item.contentUrl!),
                      icon: const Icon(Icons.attachment_rounded),
                      label: const Text('Open assignment file'),
                    ),
                  if (item.submissionUrl?.isNotEmpty == true)
                    OutlinedButton.icon(
                      onPressed: () =>
                          _openStudentFile(context, item.submissionUrl!),
                      icon: const Icon(Icons.upload_file_rounded),
                      label: const Text('View your submission'),
                    ),
                ],
              ),
            ],
            if (item.teacherRemarks?.isNotEmpty == true) ...[
              const Divider(height: TmsSpace.xl),
              Text('Teacher feedback',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: TmsSpace.xs),
              Text(item.teacherRemarks!),
            ],
            if (!item.completed) ...[
              const SizedBox(height: TmsSpace.xl),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _saving
                      ? null
                      : () async {
                          setState(() => _saving = true);
                          final messenger = ScaffoldMessenger.of(context);
                          final done =
                              await widget.viewModel.markHomeworkDone(item.id);
                          if (!context.mounted) return;
                          if (done) {
                            Navigator.pop(context);
                            messenger.showSnackBar(
                              const SnackBar(
                                content: Text('Homework marked as done.'),
                              ),
                            );
                          } else {
                            setState(() => _saving = false);
                            messenger.showSnackBar(
                              const SnackBar(
                                content: Text('Could not update homework.'),
                              ),
                            );
                          }
                        },
                  icon: const Icon(Icons.task_alt_rounded),
                  label: Text(_saving ? 'Saving…' : 'Mark as done'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _InsightsView extends StatefulWidget {
  const _InsightsView({required this.state, required this.viewModel});

  final StudentAcademicsState state;
  final StudentAcademicsViewModel viewModel;

  @override
  State<_InsightsView> createState() => _InsightsViewState();
}

class _InsightsViewState extends State<_InsightsView> {
  String _selectedSubject = 'Overall';
  String _selectedPeriod = 'all';
  DateTimeRange? _dateRange;

  String _dateLabel(DateTime date) =>
      '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';

  Future<void> _selectDates() async {
    final dates = widget.state.results.map((item) => item.testDate).nonNulls;
    final earliest = dates.isEmpty
        ? DateTime(DateTime.now().year - 1)
        : dates.reduce((a, b) => a.isBefore(b) ? a : b);
    final latest = dates.isEmpty
        ? DateTime.now()
        : dates.reduce((a, b) => a.isAfter(b) ? a : b);
    final selected = await showDateRangePicker(
      context: context,
      firstDate: DateTime(earliest.year - 1),
      lastDate: DateTime(latest.year + 1, 12, 31),
      initialDateRange: _dateRange,
      helpText: 'Select performance period',
    );
    if (selected != null && mounted) setState(() => _dateRange = selected);
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final viewModel = widget.viewModel;
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
    final years = state.results
        .map((item) => item.academicYear)
        .whereType<int>()
        .toSet()
        .toList()
      ..sort((a, b) => b.compareTo(a));
    final assessments = state.results.map((item) => item.assessment).toSet();
    final periodOptions = <String, String>{
      'all': 'All published',
      for (final assessment in assessments)
        'assessment:$assessment': assessment,
      for (final year in years) 'year:$year': '$year',
    };
    if (!periodOptions.containsKey(_selectedPeriod)) _selectedPeriod = 'all';
    final visibleMarks = state.results.where((item) {
      final testDate = item.testDate;
      if (_dateRange != null &&
          (testDate == null ||
              testDate.isBefore(_dateRange!.start) ||
              testDate.isAfter(_dateRange!.end.add(const Duration(days: 1))))) {
        return false;
      }
      if (_selectedPeriod == 'all') return true;
      if (_selectedPeriod.startsWith('year:')) {
        return item.academicYear.toString() == _selectedPeriod.substring(5);
      }
      return item.assessment == _selectedPeriod.substring('assessment:'.length);
    }).toList();
    final scoresBySubject = <String, List<double>>{};
    for (final result in visibleMarks) {
      scoresBySubject
          .putIfAbsent(result.subject, () => [])
          .add(result.percentage);
    }
    final periodAverages = scoresBySubject.entries
        .map((entry) => (
              subject: entry.key,
              average: entry.value.reduce((a, b) => a + b) / entry.value.length,
            ))
        .toList();
    final strongest = [...periodAverages]
      ..sort((a, b) => b.average.compareTo(a.average));
    final weakest = [...periodAverages]
      ..sort((a, b) => a.average.compareTo(b.average));
    if (_selectedSubject != 'Overall' &&
        !insights.any((item) => item.subject == _selectedSubject)) {
      _selectedSubject = 'Overall';
    }
    final chartResults = visibleMarks
        .where((item) =>
            _selectedSubject == 'Overall' || item.subject == _selectedSubject)
        .toList()
      ..sort((a, b) {
        if (a.testDate == null && b.testDate == null) return 0;
        if (a.testDate == null) return -1;
        if (b.testDate == null) return 1;
        return a.testDate!.compareTo(b.testDate!);
      });
    final chartValues = chartResults.map((item) => item.percentage).toList();
    final chartTrend =
        chartValues.length < 2 ? 0.0 : chartValues.last - chartValues.first;
    final latestResult = chartResults.isEmpty ? null : chartResults.last;
    final passPercentage = latestResult?.passMarks == null ||
            latestResult == null ||
            latestResult.maximum <= 0
        ? 40.0
        : (latestResult.passMarks! / latestResult.maximum) * 100;
    final trendStatus = _trendStatus(
      chartTrend,
      failed: latestResult != null && latestResult.percentage < passPercentage,
      hasHistory: chartValues.length >= 2,
    );
    return RefreshIndicator(
      onRefresh: viewModel.refresh,
      child: ListView(
        padding: const EdgeInsets.all(TmsSpace.md),
        children: [
          Container(
            padding: const EdgeInsets.all(TmsSpace.lg),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [StudentColors.primaryDark, StudentColors.primary],
              ),
              borderRadius: BorderRadius.circular(TmsRadius.card),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.insights_rounded,
                    color: Colors.white, size: 30),
                const SizedBox(height: TmsSpace.sm),
                Text(
                  'Track progress over time',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: Colors.white,
                      ),
                ),
                const SizedBox(height: TmsSpace.xs),
                Text(
                  'Filter by subject and date to see where performance is improving.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Colors.white.withValues(alpha: .84),
                      ),
                ),
              ],
            ),
          ),
          const SizedBox(height: TmsSpace.md),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(TmsSpace.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text('Performance trend',
                            style: Theme.of(context).textTheme.titleLarge),
                      ),
                      DropdownButton<String>(
                        value: _selectedSubject,
                        underline: const SizedBox.shrink(),
                        items: [
                          const DropdownMenuItem(
                            value: 'Overall',
                            child: Text('Overall'),
                          ),
                          for (final insight in insights)
                            DropdownMenuItem(
                              value: insight.subject,
                              child: Text(insight.subject),
                            ),
                        ],
                        onChanged: (value) {
                          if (value != null) {
                            setState(() => _selectedSubject = value);
                          }
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: TmsSpace.sm),
                  DropdownButtonFormField<String>(
                    initialValue: _selectedPeriod,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Assessment or academic year',
                      prefixIcon: Icon(Icons.date_range_outlined),
                      isDense: true,
                    ),
                    items: periodOptions.entries
                        .map((entry) => DropdownMenuItem(
                              value: entry.key,
                              child: Text(entry.value,
                                  overflow: TextOverflow.ellipsis),
                            ))
                        .toList(),
                    onChanged: (value) {
                      if (value != null) {
                        setState(() => _selectedPeriod = value);
                      }
                    },
                  ),
                  const SizedBox(height: TmsSpace.sm),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _selectDates,
                          icon: const Icon(Icons.calendar_month_outlined),
                          label: Text(
                            _dateRange == null
                                ? 'Choose date range'
                                : '${_dateLabel(_dateRange!.start)} – ${_dateLabel(_dateRange!.end)}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                      if (_dateRange != null) ...[
                        const SizedBox(width: TmsSpace.xs),
                        IconButton(
                          tooltip: 'Clear date range',
                          onPressed: () => setState(() => _dateRange = null),
                          icon: const Icon(Icons.close_rounded),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: TmsSpace.sm),
                  Text(
                    trendStatus.label,
                    style: TextStyle(
                      color: trendStatus.color,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: TmsSpace.md),
                  SizedBox(
                    height: 190,
                    width: double.infinity,
                    child: chartValues.length < 2
                        ? Center(
                            child: Text(
                              chartValues.isEmpty
                                  ? 'No published evaluations match these filters.'
                                  : 'At least two published evaluations are needed for a trend.',
                              textAlign: TextAlign.center,
                            ),
                          )
                        : CustomPaint(
                            painter: _PerformanceLineChartPainter(
                              values: chartValues,
                              color: StudentColors.primary,
                            ),
                          ),
                  ),
                  const SizedBox(height: TmsSpace.xs),
                  if (chartResults.isNotEmpty)
                    Wrap(
                      spacing: TmsSpace.xs,
                      runSpacing: TmsSpace.xs,
                      children: [
                        for (final result in chartResults.take(4))
                          Chip(
                            avatar: const Icon(Icons.event_outlined, size: 16),
                            label: Text(
                              '${result.testDate == null ? 'Date unavailable' : _dateLabel(result.testDate!)} · ${result.percentage.toStringAsFixed(0)}%',
                            ),
                          ),
                      ],
                    ),
                  const SizedBox(height: TmsSpace.xs),
                  Text(
                    'Based only on teacher-published evaluations and marksheets.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: TmsSpace.md),
          if (periodAverages.isNotEmpty)
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
                          _trendStatus(
                            insight.change,
                            failed: _subjectFailed(
                              insight.subject,
                              state.results,
                            ),
                            hasHistory: true,
                          ).label,
                          style:
                              Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: _trendStatus(
                                      insight.change,
                                      failed: _subjectFailed(
                                        insight.subject,
                                        state.results,
                                      ),
                                      hasHistory: true,
                                    ).color,
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
          if (state.detail?.remarks.isNotEmpty == true) ...[
            const SizedBox(height: TmsSpace.md),
            Text('Teacher comments',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: TmsSpace.sm),
          ],
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

  ({String label, Color color}) _trendStatus(
    double change, {
    required bool failed,
    required bool hasHistory,
  }) {
    if (failed) {
      return (
        label: 'Below pass level · needs immediate support',
        color: StudentColors.error,
      );
    }
    if (!hasHistory) {
      return (
        label: 'More evaluations are needed',
        color: StudentColors.mutedText,
      );
    }
    if (change <= -10) {
      return (
        label: 'Significant decline · ${change.toStringAsFixed(1)}%',
        color: StudentColors.error,
      );
    }
    if (change < -3) {
      return (
        label: 'Needs improvement · ${change.toStringAsFixed(1)}%',
        color: StudentColors.warning,
      );
    }
    if (change >= 10) {
      return (
        label: 'Strong improvement · +${change.toStringAsFixed(1)}%',
        color: StudentColors.success,
      );
    }
    if (change > 3) {
      return (
        label: 'Improving · +${change.toStringAsFixed(1)}%',
        color: StudentColors.success,
      );
    }
    return (
      label: 'Stable performance',
      color: StudentColors.primary,
    );
  }

  bool _subjectFailed(String subject, List<AcademicResult> results) {
    final matches = results.where((result) => result.subject == subject);
    if (matches.isEmpty) return false;
    final latest = matches.first;
    final passPercentage = latest.passMarks == null || latest.maximum <= 0
        ? 40.0
        : (latest.passMarks! / latest.maximum) * 100;
    return latest.percentage < passPercentage;
  }
}

class _PerformanceLineChartPainter extends CustomPainter {
  const _PerformanceLineChartPainter({
    required this.values,
    required this.color,
  });

  final List<double> values;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const left = 30.0;
    const top = 10.0;
    const bottom = 24.0;
    final chartHeight = size.height - top - bottom;
    final chartWidth = size.width - left - 8;
    final gridPaint = Paint()
      ..color = StudentColors.border
      ..strokeWidth = 1;
    final labelPainter = TextPainter(textDirection: TextDirection.ltr);
    for (final score in [0, 25, 50, 75, 100]) {
      final y = top + chartHeight * (1 - score / 100);
      canvas.drawLine(Offset(left, y), Offset(size.width, y), gridPaint);
      labelPainter
        ..text = TextSpan(
          text: '$score',
          style: const TextStyle(fontSize: 9, color: StudentColors.mutedText),
        )
        ..layout();
      labelPainter.paint(canvas, Offset(0, y - labelPainter.height / 2));
    }

    final path = Path();
    final points = <Offset>[];
    for (var index = 0; index < values.length; index++) {
      final x = left + chartWidth * index / (values.length - 1);
      final value = values[index].clamp(0, 100).toDouble();
      final y = top + chartHeight * (1 - value / 100);
      final point = Offset(x, y);
      points.add(point);
      index == 0 ? path.moveTo(x, y) : path.lineTo(x, y);
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..strokeWidth = 3
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    for (final point in points) {
      canvas.drawCircle(point, 4, Paint()..color = color);
      canvas.drawCircle(point, 2, Paint()..color = Colors.white);
    }
  }

  @override
  bool shouldRepaint(covariant _PerformanceLineChartPainter oldDelegate) =>
      oldDelegate.values != values || oldDelegate.color != color;
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
