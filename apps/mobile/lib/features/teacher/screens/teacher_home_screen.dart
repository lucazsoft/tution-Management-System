/// API-backed teacher home screen (MVVM).
///
/// Reads [TeacherPortalViewModel] (one `GET /api/teacher/workspace` per
/// load). Covers loading / empty / error / denied / offline states; the
/// offline banner shows when connectivity drops but cached data exists.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/sync/sync.dart';

import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/features/teacher/models/teacher_models.dart';
import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';
import 'package:tms_mobile/features/teacher/screens/geo_attendance_screen.dart';
import 'package:tms_mobile/features/teacher/screens/teacher_class_detail_screen.dart';
import 'package:tms_mobile/features/teacher/viewmodels/teacher_portal_viewmodel.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_record_states.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_navigation.dart';
import 'package:tms_mobile/features/student/widgets/nepal_date_time.dart';

class TeacherHomeScreen extends ConsumerStatefulWidget {
  const TeacherHomeScreen({super.key, this.initialTab = 0});

  final int initialTab;

  @override
  ConsumerState<TeacherHomeScreen> createState() => _TeacherHomeScreenState();
}

class _TeacherHomeScreenState extends ConsumerState<TeacherHomeScreen> {
  late int _tab;

  @override
  void initState() {
    super.initState();
    _tab = widget.initialTab;
  }

  @override
  void didUpdateWidget(covariant TeacherHomeScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialTab != widget.initialTab) _tab = widget.initialTab;
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(teacherPortalViewModelProvider);
    final vm = ref.read(teacherPortalViewModelProvider.notifier);
    final connectivity = ref.watch(connectivityMonitorProvider);
    final offline = connectivity == ConnectivityState.offline;
    final showAppBarActions = MediaQuery.sizeOf(context).width >= 360;

    return Scaffold(
      drawer: TeacherNavigation.drawer(context),
      appBar: AppBar(
        title: Text(
          'Teacher Home',
          style:
              GoogleFonts.fraunces(fontWeight: FontWeight.w700, fontSize: 22),
        ),
        actions: showAppBarActions
            ? [
                IconButton(
                  icon: const Icon(Icons.calendar_month_outlined),
                  tooltip: 'Timetable',
                  onPressed: () => context.push('/teacher/timetable'),
                ),
                IconButton(
                  icon: const Icon(Icons.notifications_outlined),
                  tooltip: 'Notifications',
                  onPressed: () => context.push('/teacher/notifications'),
                ),
              ]
            : null,
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (offline && state.hasData) const TeacherOfflineBar(),
            Expanded(child: _body(context, state, vm, offline)),
          ],
        ),
      ),
      bottomNavigationBar: TeacherDashboardNavigationBar(
        selectedIndex: _tab < 2 ? _tab : _tab + 1,
        onDestinationSelected: (i) {
          if (i == 2) {
            context.go('/teacher/messages');
          } else if (i == 3) {
            context.go('/teacher/timetable');
          } else {
            setState(() => _tab = i < 2 ? i : i - 1);
          }
        },
      ),
    );
  }

  Widget _body(
    BuildContext context,
    TeacherPortalState state,
    TeacherPortalViewModel vm,
    bool offline,
  ) {
    if (state.isLoading && !state.hasData) {
      return const TeacherLoadingView(message: 'Loading your classes...');
    }
    if (state.isDenied && !state.hasData) {
      return TeacherDeniedView(message: state.error);
    }
    if (state.isOffline && !state.hasData) {
      return TeacherOfflineView(onRetry: vm.load);
    }
    if (state.hasError && !state.hasData) {
      return TeacherErrorView(
        message: state.error ?? 'Could not load the teacher workspace.',
        onRetry: vm.load,
      );
    }
    final workspace = state.workspace;
    if (workspace == null ||
        workspace.todayClasses.isEmpty && workspace.classes.isEmpty) {
      if (workspace != null &&
          workspace.todayClasses.isEmpty &&
          workspace.classes.isEmpty) {
        return const TeacherEmptyView(
          icon: Icons.event_available_rounded,
          title: 'No classes assigned',
          message: 'You have no classes today or this week.',
        );
      }
      return TeacherEmptyView(
        icon: Icons.event_available_rounded,
        title: 'No data',
        message: state.error ?? 'Nothing to show right now.',
      );
    }
    switch (_tab) {
      case 1:
        return _AttendanceTab(
          workspace: workspace,
          onMarkAttendance: (today) => _openGeo(context, workspace, today),
        );
      case 2:
        return _ClassesTab(workspace: workspace);
      case 3:
        return _MoreTab(workspace: workspace);
      case 0:
      default:
        return RefreshIndicator(
          onRefresh: vm.refresh,
          child: _TodayTab(
            workspace: workspace,
            onClockAttendance: () => _openGeoForWorkspace(context, workspace),
            onAttendClass: (today) => _openGeo(context, workspace, today),
            onOpenAttendance: () => setState(() => _tab = 1),
            onUpdateSyllabus: () => context.push('/teacher/syllabus'),
            onAssignHomework: () => context.push('/teacher/homework'),
            onEnterResults: () => context.push('/teacher/results'),
          ),
        );
    }
  }

  Future<void> _openGeo(
    BuildContext context,
    TeacherWorkspace workspace,
    TeacherTodayClass today,
  ) async {
    final match = workspace.classes.where((c) => c.id == today.classId);
    final branch = match.isEmpty ? null : match.first.branch;
    final now = DateTime.now();
    final session = TeacherClassSession(
      id: today.sessionId,
      subject: '${today.courseName} - ${today.className}',
      room: today.scheduleLabel ?? '',
      branch: today.branchName ?? branch?.name ?? '',
      enrolledCount: match.isEmpty ? 0 : match.first.studentCount,
      status: ClassSessionStatus.scheduled,
      scheduledStart: now,
      scheduledEnd: now,
    );
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => GeoAttendanceScreen(
          session: session,
          branchId: branch?.id,
          branchRadiusMeters: branch?.radiusMeters,
          branchLatitude: branch?.latitude,
          branchLongitude: branch?.longitude,
        ),
      ),
    );
    if (mounted) {
      await ref.read(teacherPortalViewModelProvider.notifier).refresh();
    }
  }

  Future<void> _openGeoForWorkspace(
    BuildContext context,
    TeacherWorkspace workspace,
  ) async {
    final today =
        workspace.todayClasses.isEmpty ? null : workspace.todayClasses.first;
    TeacherClassInfo? klass;
    if (today != null) {
      for (final item in workspace.classes) {
        if (item.id == today.classId) {
          klass = item;
          break;
        }
      }
    }
    klass ??= workspace.classes.isEmpty ? null : workspace.classes.first;
    final branch = klass?.branch ??
        (workspace.branches.isEmpty ? null : workspace.branches.first);
    if (branch == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No branch is assigned for attendance.')),
      );
      return;
    }
    final now = DateTime.now();
    final session = TeacherClassSession(
      id: today?.sessionId ?? 'teacher-clock-${branch.id}',
      subject: today == null
          ? 'Teacher attendance'
          : '${today.courseName} - ${today.className}',
      room: today?.scheduleLabel ?? klass?.scheduleLabel ?? '',
      branch: branch.name,
      enrolledCount: klass?.studentCount ?? 0,
      status: ClassSessionStatus.scheduled,
      scheduledStart: now,
      scheduledEnd: now,
    );
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => GeoAttendanceScreen(
          session: session,
          branchId: branch.id,
          branchRadiusMeters: branch.radiusMeters,
          branchLatitude: branch.latitude,
          branchLongitude: branch.longitude,
        ),
      ),
    );
    if (mounted) {
      await ref.read(teacherPortalViewModelProvider.notifier).refresh();
    }
  }
}

class _TodayTab extends StatelessWidget {
  const _TodayTab({
    required this.workspace,
    required this.onClockAttendance,
    required this.onAttendClass,
    required this.onOpenAttendance,
    required this.onUpdateSyllabus,
    required this.onAssignHomework,
    required this.onEnterResults,
  });

  final TeacherWorkspace workspace;
  final VoidCallback onClockAttendance;
  final ValueChanged<TeacherTodayClass> onAttendClass;
  final VoidCallback onOpenAttendance;
  final VoidCallback onUpdateSyllabus;
  final VoidCallback onAssignHomework;
  final VoidCallback onEnterResults;

  @override
  Widget build(BuildContext context) {
    final items = workspace.todayClasses;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const NepalDateTimeHeader(),
        const SizedBox(height: 16),
        _ClockCard(workspace: workspace, onPressed: onClockAttendance),
        const SizedBox(height: 16),
        _QuickActions(
          onAttendance: onOpenAttendance,
          onSyllabus: onUpdateSyllabus,
          onHomework: onAssignHomework,
          onResults: onEnterResults,
        ),
        const SizedBox(height: 24),
        Row(children: [
          Expanded(
              child: Text('Today\'s timetable',
                  style: Theme.of(context).textTheme.titleLarge)),
          TextButton(
              onPressed: () => context.push('/teacher/timetable'),
              child: const Text('Full timetable'))
        ]),
        const SizedBox(height: 4),
        if (items.isEmpty)
          const TeacherEmptyView(
            icon: Icons.event_available_rounded,
            title: 'No classes today',
            message: 'Enjoy the day - nothing scheduled.',
          )
        else
          _TodayTimetableTable(
            items: items,
            onAttendClass: onAttendClass,
          ),
      ],
    );
  }
}

class _TodayTimetableTable extends StatelessWidget {
  const _TodayTimetableTable({
    required this.items,
    required this.onAttendClass,
  });

  final List<TeacherTodayClass> items;
  final ValueChanged<TeacherTodayClass> onAttendClass;

  String get _todayKey => const [
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat',
        'Sun'
      ][DateTime.now().weekday - 1];

  List<({TeacherTodayClass item, TeacherScheduleSlot? slot})> get _rows {
    final rows = <({TeacherTodayClass item, TeacherScheduleSlot? slot})>[];
    for (final item in items) {
      final todaySlots = item.slots
          .where((slot) => slot.matchesDay(_todayKey))
          .toList()
        ..sort((a, b) => a.start.compareTo(b.start));
      if (todaySlots.isEmpty) {
        rows.add((item: item, slot: null));
      } else {
        rows.addAll(todaySlots.map((slot) => (item: item, slot: slot)));
      }
    }
    rows.sort((a, b) =>
        (a.slot?.start ?? '99:99').compareTo(b.slot?.start ?? '99:99'));
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          color: Theme.of(context).colorScheme.primary.withValues(alpha: .07),
          child: Row(children: [
            Icon(Icons.table_chart_outlined,
                color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 10),
            Text(
                '${rows.length} scheduled ${rows.length == 1 ? 'period' : 'periods'}',
                style: Theme.of(context).textTheme.titleSmall),
            const Spacer(),
            const Text('Managed by Branch Admin',
                style: TextStyle(fontSize: 11)),
          ]),
        ),
        LayoutBuilder(builder: (context, constraints) {
          return SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: ConstrainedBox(
              constraints: BoxConstraints(minWidth: constraints.maxWidth),
              child: DataTable(
                headingRowColor: WidgetStatePropertyAll(
                  Theme.of(context).colorScheme.surfaceContainerLow,
                ),
                horizontalMargin: 16,
                columnSpacing: 24,
                columns: const [
                  DataColumn(label: Text('Time')),
                  DataColumn(label: Text('Subject')),
                  DataColumn(label: Text('Class')),
                  DataColumn(label: Text('Room')),
                  DataColumn(label: Text('Update')),
                  DataColumn(label: Text('Action')),
                ],
                rows: [
                  for (final row in rows)
                    DataRow(cells: [
                      DataCell(Text(
                        row.slot?.timeLabel.isNotEmpty == true
                            ? row.slot!.timeLabel
                            : 'Time not set',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      )),
                      DataCell(SizedBox(
                        width: 120,
                        child: Text(row.item.courseName,
                            maxLines: 2, overflow: TextOverflow.ellipsis),
                      )),
                      DataCell(SizedBox(
                        width: 120,
                        child: Text(row.item.className,
                            maxLines: 2, overflow: TextOverflow.ellipsis),
                      )),
                      DataCell(Text(
                        row.slot?.room?.trim().isNotEmpty == true
                            ? row.slot!.room!
                            : 'Not assigned',
                      )),
                      DataCell(Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(
                          row.item.dailyUpdateSubmitted
                              ? Icons.check_circle
                              : Icons.pending_outlined,
                          color: row.item.dailyUpdateSubmitted
                              ? Colors.green
                              : Colors.orange,
                          size: 18,
                        ),
                        const SizedBox(width: 6),
                        Text(row.item.dailyUpdateSubmitted
                            ? 'Submitted'
                            : 'Pending'),
                      ])),
                      DataCell(FilledButton.tonal(
                        onPressed: () => onAttendClass(row.item),
                        child: const Text('Attend'),
                      )),
                    ]),
                ],
              ),
            ),
          );
        }),
      ]),
    );
  }
}

String _nepalTime(DateTime value) {
  final nepal = value.toUtc().add(const Duration(minutes: 345));
  return '${_two(nepal.hour)}:${_two(nepal.minute)} Nepal time';
}

String _two(int value) => value.toString().padLeft(2, '0');

class _AttendanceTab extends ConsumerStatefulWidget {
  const _AttendanceTab(
      {required this.workspace, required this.onMarkAttendance});

  final TeacherWorkspace workspace;
  final void Function(TeacherTodayClass) onMarkAttendance;

  @override
  ConsumerState<_AttendanceTab> createState() => _AttendanceTabState();
}

class _AttendanceTabState extends ConsumerState<_AttendanceTab> {
  String? _classId;
  Map<String, String> _statuses = {};

  @override
  void initState() {
    super.initState();
    _selectClass(widget.workspace.classes.firstOrNull);
  }

  @override
  void didUpdateWidget(covariant _AttendanceTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    final selected = _selectedClass;
    if (selected == null) {
      _selectClass(widget.workspace.classes.firstOrNull);
    } else if (!identical(oldWidget.workspace, widget.workspace)) {
      _selectClass(selected);
    }
  }

  TeacherClassInfo? get _selectedClass {
    for (final item in widget.workspace.classes) {
      if (item.id == _classId) return item;
    }
    return null;
  }

  void _selectClass(TeacherClassInfo? selected) {
    _classId = selected?.id;
    _statuses = selected == null
        ? {}
        : {
            for (final student in selected.students)
              student.id: _editableStatusForStudent(selected, student),
          };
  }

  String _editableStatusForStudent(
    TeacherClassInfo selected,
    TeacherStudent student,
  ) {
    final saved = _savedStatusForStudent(selected, student.id);
    if (saved == 'PRESENT' && !student.isFeeBlocked) return 'PRESENT';
    return 'ABSENT';
  }

  String? _savedStatusForStudent(TeacherClassInfo selected, String studentId) {
    final today = _dateOnly(DateTime.now());
    for (final record in selected.attendance.reversed) {
      if (record.studentId != studentId) continue;
      final recordDate = record.date;
      if (recordDate == null || _dateOnly(recordDate) == today) {
        return record.status;
      }
    }
    return null;
  }

  Future<void> _save() async {
    final selected = _selectedClass;
    if (selected == null || _statuses.isEmpty) return;
    if (!widget.workspace.checkedIn) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Clock in before taking class attendance.'),
        ),
      );
      return;
    }
    final saved = await ref
        .read(teacherPortalViewModelProvider.notifier)
        .saveClassAttendance(classId: selected.id, records: _statuses);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(saved
            ? 'Class attendance saved.'
            : 'Could not save class attendance. Please try again.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final workspace = widget.workspace;
    final stamps = workspace.stamps;
    final selected = _selectedClass;
    final saving =
        ref.watch(teacherPortalViewModelProvider).savingClassAttendance;
    final present =
        _statuses.values.where((value) => value == 'PRESENT').length;
    final absent = _statuses.values.where((value) => value == 'ABSENT').length;
    final excused = selected == null
        ? 0
        : selected.students
            .where((student) =>
                _savedStatusForStudent(selected, student.id) == 'EXCUSED')
            .length;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text('Today\'s stamps', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (stamps.isEmpty)
          const TeacherEmptyView(
            icon: Icons.fingerprint_outlined,
            title: 'No stamps yet',
            message: 'Mark your attendance from a class below.',
          )
        else
          for (final stamp in stamps.take(10))
            ListTile(
              leading: const Icon(Icons.fingerprint),
              title: Text(stamp.stampType),
              subtitle: Text(
                '${stamp.branchName ?? ''}${stamp.timestamp == null ? '' : ' - ${stamp.timestamp!.toLocal()}'}',
              ),
            ),
        const SizedBox(height: 16),
        Text('Teacher attendance',
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (workspace.todayClasses.isEmpty)
          const TeacherEmptyView(
            icon: Icons.event_available_rounded,
            title: 'No classes today',
            message: 'Nothing to mark attendance for.',
          )
        else
          _TodayTimetableTable(
            items: workspace.todayClasses,
            onAttendClass: widget.onMarkAttendance,
          ),
        const SizedBox(height: 24),
        Text('Class attendance',
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        Text(
          workspace.checkedIn
              ? 'Mark today\'s roster and save when it is ready.'
              : 'Clock in first to unlock class attendance.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 12),
        if (workspace.classes.isEmpty)
          const TeacherEmptyView(
            icon: Icons.groups_outlined,
            title: 'No assigned class',
            message: 'Class attendance appears after a class is assigned.',
          )
        else ...[
          DropdownButtonFormField<String>(
            key: ValueKey(_classId),
            initialValue: _classId,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Class',
              border: OutlineInputBorder(),
            ),
            items: [
              for (final item in workspace.classes)
                DropdownMenuItem(value: item.id, child: Text(item.name)),
            ],
            onChanged: (value) {
              final next = workspace.classes
                  .where((item) => item.id == value)
                  .firstOrNull;
              setState(() => _selectClass(next));
            },
          ),
          if (selected != null) ...[
            const SizedBox(height: 12),
            if (selected.students.isEmpty)
              const TeacherEmptyView(
                icon: Icons.group_off_outlined,
                title: 'No students enrolled',
                message: 'Enroll students before recording attendance.',
              )
            else
              for (final student in selected.students)
                _StudentAttendanceRow(
                  student: student,
                  value: _statuses[student.id] ?? 'ABSENT',
                  savedStatus: _savedStatusForStudent(selected, student.id),
                  onChanged: (value) => setState(
                    () => _statuses = {..._statuses, student.id: value},
                  ),
                ),
            const SizedBox(height: 12),
            _ClassAttendanceSummary(
              total: selected.students.length,
              present: present,
              absent: absent,
              excused: excused,
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed:
                    saving || selected.students.isEmpty || !workspace.checkedIn
                        ? null
                        : _save,
                icon: saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.save_outlined),
                label: Text(saving ? 'Saving attendance' : 'Save attendance'),
              ),
            ),
          ],
        ],
      ],
    );
  }
}

String _dateOnly(DateTime value) {
  final local = value.toLocal();
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  return '${local.year}-$month-$day';
}

class _ClassAttendanceSummary extends StatelessWidget {
  const _ClassAttendanceSummary({
    required this.total,
    required this.present,
    required this.absent,
    required this.excused,
  });

  final int total;
  final int present;
  final int absent;
  final int excused;

  @override
  Widget build(BuildContext context) {
    final counts = [
      _AttendanceCount(label: 'Students', value: '$total'),
      _AttendanceCount(label: 'Present', value: '$present'),
      _AttendanceCount(label: 'Absent', value: '$absent'),
      _AttendanceCount(label: 'Excused', value: '$excused'),
    ];
    return Card(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final columns = constraints.maxWidth < 340 ? 2 : 4;
          final width = constraints.maxWidth / columns;
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Wrap(
              runSpacing: 12,
              children: [
                for (final count in counts)
                  SizedBox(
                    width: width,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: count,
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _AttendanceCount extends StatelessWidget {
  const _AttendanceCount({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodySmall),
        Text(
          value,
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}

class _StudentAttendanceRow extends StatelessWidget {
  const _StudentAttendanceRow({
    required this.student,
    required this.value,
    required this.savedStatus,
    required this.onChanged,
  });

  final TeacherStudent student;
  final String value;
  final String? savedStatus;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final initials = student.name
        .split(' ')
        .where((part) => part.isNotEmpty)
        .map((part) => part[0])
        .take(2)
        .join();
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
        child: Row(
          children: [
            CircleAvatar(child: Text(initials.isEmpty ? '?' : initials)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(student.name,
                      style: Theme.of(context).textTheme.titleSmall),
                  Text(
                    savedStatus == 'EXCUSED'
                        ? 'Excused leave recorded'
                        : student.isFeeBlocked
                            ? 'Fee-blocked: Present unavailable'
                            : savedStatus == null
                                ? 'Active enrollment'
                                : 'Saved as ${savedStatus!.toLowerCase()}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            SegmentedButton<String>(
              segments: [
                ButtonSegment(
                  value: 'PRESENT',
                  label: const Text('P'),
                  enabled: !student.isFeeBlocked && savedStatus != 'EXCUSED',
                ),
                ButtonSegment(
                  value: 'ABSENT',
                  label: const Text('A'),
                  enabled: savedStatus != 'EXCUSED',
                ),
              ],
              selected: {value},
              showSelectedIcon: false,
              onSelectionChanged: (next) {
                final status = next.first;
                if (savedStatus == 'EXCUSED') return;
                if (student.isFeeBlocked && status == 'PRESENT') return;
                onChanged(status);
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _ClassesTab extends StatelessWidget {
  const _ClassesTab({required this.workspace});

  final TeacherWorkspace workspace;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text('Assigned classes',
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (workspace.classes.isEmpty)
          const TeacherEmptyView(
            icon: Icons.school_outlined,
            title: 'No classes assigned',
            message: 'Your assigned classes will appear here.',
          )
        else
          for (final item in workspace.classes)
            Card(
              child: ListTile(
                leading: const Icon(Icons.school_outlined),
                title: Text(item.name),
                subtitle: Text(
                  [
                    item.subject,
                    if (item.branch != null) item.branch!.name,
                    '${item.studentCount} students',
                    if (item.scheduleLabel != null) item.scheduleLabel!,
                  ].join(' - '),
                ),
                onTap: () => Navigator.of(context).push<void>(
                  MaterialPageRoute<void>(
                    builder: (_) => TeacherClassDetailScreen(klass: item),
                  ),
                ),
              ),
            ),
        const SizedBox(height: 16),
        FilledButton.tonalIcon(
          onPressed: () => context.push('/teacher/timetable'),
          icon: const Icon(Icons.calendar_month_outlined),
          label: const Text('Open full timetable'),
        ),
      ],
    );
  }
}

class _ClockCard extends StatelessWidget {
  const _ClockCard({required this.workspace, required this.onPressed});

  final TeacherWorkspace workspace;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final nepalNow = DateTime.now().toUtc().add(const Duration(minutes: 345));
    final time = '${_two(nepalNow.hour)}:${_two(nepalNow.minute)} Nepal time';
    final lastStamp = workspace.lastStampAt == null
        ? 'No attendance stamp yet'
        : 'Last ${workspace.lastStampType ?? 'stamp'} at ${_nepalTime(workspace.lastStampAt!)}';
    return Card(
      color: workspace.checkedIn
          ? Colors.green.withValues(alpha: 0.10)
          : kColorPrimary.withValues(alpha: 0.08),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  workspace.checkedIn
                      ? Icons.how_to_reg_rounded
                      : Icons.schedule_rounded,
                  color: workspace.checkedIn ? Colors.green : kColorPrimary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    workspace.checkedIn ? 'Clocked in' : 'Clock in for today',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(time, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 4),
            Text(lastStamp, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: onPressed,
                icon: Icon(workspace.checkedIn
                    ? Icons.logout_rounded
                    : Icons.login_rounded),
                label: Text(workspace.checkedIn
                    ? 'Open clock out'
                    : 'Clock in with location'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({
    required this.onAttendance,
    required this.onSyllabus,
    required this.onHomework,
    required this.onResults,
  });

  final VoidCallback onAttendance;
  final VoidCallback onSyllabus;
  final VoidCallback onHomework;
  final VoidCallback onResults;

  @override
  Widget build(BuildContext context) {
    final actions = [
      _QuickActionTile(
        icon: Icons.how_to_reg_outlined,
        label: 'Attendance',
        onTap: onAttendance,
      ),
      _QuickActionTile(
        icon: Icons.menu_book_outlined,
        label: 'Update syllabus',
        onTap: onSyllabus,
      ),
      _QuickActionTile(
        icon: Icons.assignment_outlined,
        label: 'Assign homework',
        onTap: onHomework,
      ),
      _QuickActionTile(
        icon: Icons.analytics_outlined,
        label: 'Enter results',
        onTap: onResults,
      ),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth < 320 ? 1 : 2;
        final width = (constraints.maxWidth - (columns - 1) * 8) / columns;
        return Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final action in actions) SizedBox(width: width, child: action),
          ],
        );
      },
    );
  }
}

class _QuickActionTile extends StatelessWidget {
  const _QuickActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon),
      label: Text(label),
    );
  }
}

class _MoreTab extends StatelessWidget {
  const _MoreTab({required this.workspace});

  final TeacherWorkspace workspace;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        ListTile(
          leading: const Icon(Icons.person),
          title: Text(workspace.teacherName),
          subtitle: Text(workspace.designation),
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.business_outlined),
          title: const Text('Branches'),
          subtitle: Text(
            workspace.branches.isEmpty
                ? 'None assigned'
                : workspace.branches.map((b) => b.name).join(', '),
          ),
        ),
        ListTile(
          leading: const Icon(Icons.class_outlined),
          title: const Text('Assigned classes'),
          subtitle: Text('${workspace.classes.length}'),
        ),
        ListTile(
          leading: const Icon(Icons.event_note_outlined),
          title: const Text('Leave requests'),
          subtitle: Text('${workspace.leaves.length}'),
          onTap: () => context.push('/teacher/leave'),
        ),
        ListTile(
          leading: const Icon(Icons.calendar_month_outlined),
          title: const Text('Academic calendar'),
          subtitle: const Text('Events, examinations, and deadlines'),
          onTap: () => context.push('/teacher/calendar'),
        ),
        ListTile(
          leading: const Icon(Icons.menu_book_outlined),
          title: const Text('Syllabus tracker'),
          subtitle: const Text('Plan chapters, topics, and progress'),
          onTap: () => context.push('/teacher/syllabus'),
        ),
        ListTile(
          leading: const Icon(Icons.assignment_outlined),
          title: const Text('Homework'),
          subtitle: const Text('Assign and review recent homework'),
          onTap: () => context.push('/teacher/homework'),
        ),
        ListTile(
          leading: const Icon(Icons.analytics_outlined),
          title: const Text('Results'),
          subtitle: const Text('Enter marks and publish paper evidence'),
          onTap: () => context.push('/teacher/results'),
        ),
        const ListTile(
          leading: Icon(Icons.receipt_long_outlined),
          title: Text('Salary slips'),
          subtitle: Text('Coming from the web teacher panel'),
          enabled: false,
        ),
      ],
    );
  }
}
