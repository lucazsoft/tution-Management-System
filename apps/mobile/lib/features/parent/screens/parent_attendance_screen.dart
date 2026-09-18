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

class ParentAttendanceScreen extends ConsumerStatefulWidget {
  const ParentAttendanceScreen({super.key});

  @override
  ConsumerState<ParentAttendanceScreen> createState() =>
      _ParentAttendanceScreenState();
}

class _ParentAttendanceScreenState
    extends ConsumerState<ParentAttendanceScreen> {
  _AttendanceView _view = _AttendanceView.list;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => ParentNavigation.back(context),
          tooltip: 'Back',
        ),
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
      bottomNavigationBar: const ParentNavigationBar(selectedIndex: 2),
      body: SafeArea(
        child: ParentPortalStateView(
          builder: (context, portal, child) {
            final rate = (child.attendanceRate / 100).clamp(0.0, 1.0);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const ChildSwitcherBar(),
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
                              '${portal.attendance.length} recent records',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 20,
                              runSpacing: 8,
                              children: [
                                _StatBadge(
                                  label: 'Present',
                                  count: '${portal.presentCount}',
                                  color: kColorSuccess,
                                ),
                                _StatBadge(
                                  label: 'Absent',
                                  count: '${portal.absentCount}',
                                  color: kColorError,
                                ),
                              ],
                            ),
                          ],
                        );
                        if (constraints.maxWidth < 420) {
                          return Column(
                            children: [
                              ProgressRing(percent: rate, size: 84),
                              const SizedBox(height: 16),
                              summary,
                            ],
                          );
                        }
                        return Row(
                          children: [
                            ProgressRing(
                              percent: rate,
                              size: 84,
                              color:
                                  rate >= 0.9 ? kColorSuccess : kColorWarning,
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
                  'Recent Activity Log',
                  style: GoogleFonts.fraunces(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                if (portal.attendance.isEmpty)
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(20),
                      child: Text('No attendance records are available.'),
                    ),
                  )
                else if (_view == _AttendanceView.list)
                  for (final record in portal.attendance) ...[
                    _AttendanceTile(record: record),
                    const SizedBox(height: 10),
                  ]
                else
                  LayoutBuilder(
                    builder: (context, constraints) => Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        for (final record in portal.attendance)
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
            style: GoogleFonts.outfit(
              fontWeight: FontWeight.w700,
              fontSize: 15,
              color: color,
            ),
          ),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
        ],
      );
}
