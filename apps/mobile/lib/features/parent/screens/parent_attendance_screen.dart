import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/features/parent/models/parent_portal.dart';
import 'package:tms_mobile/features/parent/widgets/child_switcher_bar.dart';
import 'package:tms_mobile/features/parent/widgets/parent_navigation.dart';
import 'package:tms_mobile/features/parent/widgets/parent_portal_state_view.dart';
import 'package:tms_mobile/shared/models/app_models.dart';
import 'package:tms_mobile/shared/widgets/progress_ring.dart';
import 'package:tms_mobile/shared/widgets/status_chip.dart';

enum _AttendanceView { list, compact }

enum _AttendancePeriod { month, year, all }

class ParentAttendanceScreen extends ConsumerStatefulWidget {
  const ParentAttendanceScreen({super.key});

  @override
  ConsumerState<ParentAttendanceScreen> createState() =>
      _ParentAttendanceScreenState();
}

class _ParentAttendanceScreenState
    extends ConsumerState<ParentAttendanceScreen> {
  _AttendanceView _view = _AttendanceView.list;
  _AttendancePeriod _period = _AttendancePeriod.month;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      drawer: ParentNavigation.drawer(context),
      appBar: AppBar(
        title: Text(
          'Child Attendance',
          style:
              GoogleFonts.fraunces(fontWeight: FontWeight.w700, fontSize: 22),
        ),
        actions: [
          IconButton(
            icon: Icon(
              _view == _AttendanceView.list
                  ? Icons.grid_view_rounded
                  : Icons.format_list_bulleted_rounded,
            ),
            tooltip:
                _view == _AttendanceView.list ? 'Compact view' : 'List view',
            onPressed: () => setState(() {
              _view = _view == _AttendanceView.list
                  ? _AttendanceView.compact
                  : _AttendanceView.list;
            }),
          ),
        ],
      ),
      bottomNavigationBar: const ParentNavigationBar(selectedIndex: 0),
      body: SafeArea(
        child: ParentPortalStateView(
          builder: (context, portal, child) {
            final now = DateTime.now();
            final records = portal.attendance.where((record) {
              final date = record.occurredAt?.toLocal();
              return switch (_period) {
                _AttendancePeriod.month => date != null &&
                    date.year == now.year &&
                    date.month == now.month,
                _AttendancePeriod.year => date != null && date.year == now.year,
                _AttendancePeriod.all => true,
              };
            }).toList();
            final present = records.where((record) => record.isPresent).length;
            final absent = records
                .where((record) =>
                    record.isAbsent &&
                    !record.state.toLowerCase().contains('excused'))
                .length;
            final excused = records
                .where(
                    (record) => record.state.toLowerCase().contains('excused'))
                .length;
            final rateValue = records.isEmpty ? 0.0 : present / records.length;
            final periodLabel = switch (_period) {
              _AttendancePeriod.month =>
                'This month · ${_monthName(now.month)} ${now.year}',
              _AttendancePeriod.year => 'Academic record · ${now.year}',
              _AttendancePeriod.all => 'All available records',
            };
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const ChildSwitcherBar(),
                const SizedBox(height: 12),
                SegmentedButton<_AttendancePeriod>(
                  segments: const [
                    ButtonSegment(
                        value: _AttendancePeriod.month, label: Text('Month')),
                    ButtonSegment(
                        value: _AttendancePeriod.year, label: Text('Year')),
                    ButtonSegment(
                        value: _AttendancePeriod.all, label: Text('All')),
                  ],
                  selected: {_period},
                  onSelectionChanged: (selection) =>
                      setState(() => _period = selection.first),
                ),
                const SizedBox(height: 20),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final summary = Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${child.name}\'s rate',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              periodLabel,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 20,
                              runSpacing: 8,
                              children: [
                                _StatBadge(
                                  label: 'Present',
                                  count: '$present',
                                  color: kColorSuccess,
                                ),
                                _StatBadge(
                                  label: 'Absent',
                                  count: '$absent',
                                  color: kColorError,
                                ),
                                _StatBadge(
                                  label: 'Excused',
                                  count: '$excused',
                                  color: kColorWarning,
                                ),
                              ],
                            ),
                          ],
                        );
                        if (constraints.maxWidth < 420) {
                          return Column(
                            children: [
                              ProgressRing(percent: rateValue, size: 84),
                              const SizedBox(height: 16),
                              summary,
                            ],
                          );
                        }
                        return Row(
                          children: [
                            ProgressRing(
                              percent: rateValue,
                              size: 84,
                              color: rateValue >= 0.9
                                  ? kColorSuccess
                                  : kColorWarning,
                            ),
                            const SizedBox(width: 20),
                            Expanded(child: summary),
                          ],
                        );
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  'Session record · $periodLabel',
                  style: GoogleFonts.fraunces(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                if (records.isEmpty)
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(20),
                      child: Text(
                          'No teacher-marked attendance is available for this period.'),
                    ),
                  )
                else if (_view == _AttendanceView.list)
                  for (final record in records) ...[
                    _AttendanceTile(record: record),
                    const SizedBox(height: 10),
                  ]
                else
                  LayoutBuilder(
                    builder: (context, constraints) => Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        for (final record in records)
                          SizedBox(
                            width: constraints.maxWidth >= 600
                                ? (constraints.maxWidth - 10) / 2
                                : constraints.maxWidth,
                            child: _AttendanceTile(record: record),
                          ),
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  String _monthName(int month) => const [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December'
      ][month - 1];
}

class _AttendanceTile extends StatelessWidget {
  const _AttendanceTile({required this.record});

  final ParentAttendanceRecord record;

  @override
  Widget build(BuildContext context) {
    final variant = record.isPresent
        ? StatusChipVariant.success
        : record.state.toLowerCase().contains('excused')
            ? StatusChipVariant.warning
            : StatusChipVariant.error;
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
        leading: Icon(
          record.isPresent ? Icons.check_rounded : Icons.close_rounded,
          color: record.isPresent ? kColorSuccess : kColorError,
        ),
        title: Text(record.date),
        subtitle: Text('${record.subject} · ${record.session}'),
        trailing: StatusChip(label: record.state, variant: variant),
      ),
    );
  }
}

class _StatBadge extends StatelessWidget {
  const _StatBadge({
    required this.label,
    required this.count,
    required this.color,
  });

  final String label;
  final String count;
  final Color color;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Text(
            count,
            style: GoogleFonts.roboto(
              fontWeight: FontWeight.w700,
              fontSize: 15,
              color: color,
            ),
          ),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
        ],
      );
}
