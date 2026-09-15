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
import 'package:tms_mobile/features/teacher/screens/daily_update_screen.dart';
import 'package:tms_mobile/features/teacher/screens/geo_attendance_screen.dart';
import 'package:tms_mobile/features/teacher/screens/teacher_class_detail_screen.dart';
import 'package:tms_mobile/features/teacher/viewmodels/teacher_portal_viewmodel.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_record_states.dart';

class TeacherHomeScreen extends ConsumerStatefulWidget {
  const TeacherHomeScreen({super.key});

  @override
  ConsumerState<TeacherHomeScreen> createState() => _TeacherHomeScreenState();
}

class _TeacherHomeScreenState extends ConsumerState<TeacherHomeScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(teacherPortalViewModelProvider);
    final vm = ref.read(teacherPortalViewModelProvider.notifier);
    final connectivity = ref.watch(connectivityMonitorProvider);
    final offline = connectivity == ConnectivityState.offline;
    final showAppBarActions = MediaQuery.sizeOf(context).width >= 360;

    return Scaffold(
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
                  icon: const Icon(Icons.event_note_outlined),
                  tooltip: 'Leave requests',
                  onPressed: () => context.push('/teacher/leave'),
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
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home),
              label: 'Today'),
          NavigationDestination(
              icon: Icon(Icons.check_circle_outline),
              selectedIcon: Icon(Icons.check_circle),
              label: 'Attendance'),
          NavigationDestination(
              icon: Icon(Icons.school_outlined),
              selectedIcon: Icon(Icons.school),
              label: 'Classes'),
          NavigationDestination(
              icon: Icon(Icons.more_horiz),
              selectedIcon: Icon(Icons.more),
              label: 'More'),
        ],
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
            onOpenAttendance: () => setState(() => _tab = 1),
            onOpenClasses: () => setState(() => _tab = 2),
            onOpenMore: () => setState(() => _tab = 3),
            onSubmitUpdate: (pending) =>
                _openDailyUpdateScreen(context, vm, pending),
          ),
        );
    }
  }

  Future<void> _openDailyUpdateScreen(
    BuildContext context,
    TeacherPortalViewModel vm,
    TeacherPendingUpdate pending,
  ) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => DailyUpdateScreen(
          pending: pending,
          onSubmit: (content) => vm.submitSessionUpdate(
            sessionId: pending.sessionId,
            updateContent: content,
          ),
        ),
      ),
    );
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
    required this.onOpenAttendance,
    required this.onOpenClasses,
    required this.onOpenMore,
    required this.onSubmitUpdate,
  });

  final TeacherWorkspace workspace;
  final VoidCallback onClockAttendance;
  final VoidCallback onOpenAttendance;
  final VoidCallback onOpenClasses;
  final VoidCallback onOpenMore;
  final void Function(TeacherPendingUpdate) onSubmitUpdate;

  @override
  Widget build(BuildContext context) {
    final items = workspace.todayClasses;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _HeaderCard(workspace: workspace),
        const SizedBox(height: 16),
        Text('Pending daily updates: ${workspace.pendingUpdateCount}',
            style: Theme.of(context).textTheme.bodyMedium),
        if (workspace.pendingUpdates.isNotEmpty) ...[
          const SizedBox(height: 8),
          for (final pending in workspace.pendingUpdates)
            Card(
              child: ListTile(
                title: Text('${pending.courseName} - ${pending.className}'),
                subtitle: pending.date == null
                    ? null
                    : Text(pending.date!.toLocal().toString().split(' ').first),
                trailing: SizedBox(
                  width: 128,
                  child: FilledButton.tonal(
                    onPressed: () => onSubmitUpdate(pending),
                    child: const FittedBox(child: Text('Submit daily update')),
                  ),
                ),
              ),
            ),
          const SizedBox(height: 16),
        ],
        _ClockCard(workspace: workspace, onPressed: onClockAttendance),
        const SizedBox(height: 16),
        _StatsGrid(workspace: workspace),
        const SizedBox(height: 16),
        _QuickActions(
          onAttendance: onOpenAttendance,
          onClasses: onOpenClasses,
          onUpdates: () {
            if (workspace.pendingUpdates.isNotEmpty) {
              onSubmitUpdate(workspace.pendingUpdates.first);
            } else {
              onOpenMore();
            }
          },
          onMore: onOpenMore,
        ),
        const SizedBox(height: 16),
        Text('Today\'s classes (${items.length})',
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (items.isEmpty)
          const TeacherEmptyView(
            icon: Icons.event_available_rounded,
            title: 'No classes today',
            message: 'Enjoy the day - nothing scheduled.',
          )
        else
          for (final item in items)
            _ClassCard(item: item, onTap: onClockAttendance),
      ],
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.workspace});

  final TeacherWorkspace workspace;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(workspace.teacherName,
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w700)),
            Text(workspace.designation,
                style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                Chip(
                  label: Text(
                      workspace.checkedIn ? 'Checked in' : 'Not checked in'),
                  avatar: Icon(
                    workspace.checkedIn ? Icons.check_circle : Icons.schedule,
                    size: 16,
                    color: kColorPrimary,
                  ),
                ),
                if (workspace.attendanceRate != null)
                  Chip(label: Text('Attendance ${workspace.attendanceRate}%')),
                if (workspace.presentDays != null)
                  Chip(label: Text('Present ${workspace.presentDays}d')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ClassCard extends StatelessWidget {
  const _ClassCard({required this.item, required this.onTap});

  final TeacherTodayClass item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        title: Text(item.courseName,
            style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(
          '${item.className}${item.branchName == null ? '' : ' - ${item.branchName}'}${item.scheduleLabel == null ? '' : '\n${item.scheduleLabel}'}',
        ),
        isThreeLine: item.scheduleLabel != null,
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (item.dailyUpdateSubmitted)
              const Icon(Icons.check_circle, color: Colors.green, size: 20)
            else
              const Icon(Icons.pending_outlined, size: 20),
            const SizedBox(width: 8),
            FilledButton.tonal(
              onPressed: onTap,
              child: const Text('Attend'),
            ),
          ],
        ),
      ),
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
          for (final item in workspace.todayClasses)
            _ClassCard(
              item: item,
              onTap: () => widget.onMarkAttendance(item),
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
            _ClassAttendanceSummary(
              total: selected.students.length,
              present: present,
              absent: absent,
              excused: excused,
            ),
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
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Expanded(
                child: _AttendanceCount(label: 'Students', value: '$total')),
            Expanded(
                child: _AttendanceCount(label: 'Present', value: '$present')),
            Expanded(
                child: _AttendanceCount(label: 'Absent', value: '$absent')),
            Expanded(
                child: _AttendanceCount(label: 'Excused', value: '$excused')),
          ],
        ),
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

class _StatsGrid extends StatelessWidget {
  const _StatsGrid({required this.workspace});

  final TeacherWorkspace workspace;

  @override
  Widget build(BuildContext context) {
    final stats = [
      _StatItem(
        icon: Icons.calendar_month_outlined,
        label: 'Attendance',
        value: workspace.presentDays != null && workspace.requiredDays != null
            ? '${workspace.presentDays}/${workspace.requiredDays}'
            : '${workspace.attendanceRate ?? 0}%',
      ),
      _StatItem(
        icon: Icons.co_present_outlined,
        label: 'Sessions',
        value: '${workspace.totalSessions ?? 0}',
      ),
      _StatItem(
        icon: Icons.task_alt_outlined,
        label: 'Updates',
        value: '${workspace.updateCompliance ?? 0}%',
      ),
      _StatItem(
        icon: Icons.school_outlined,
        label: 'Classes',
        value: '${workspace.assignedClasses ?? workspace.classes.length}',
      ),
    ];
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      childAspectRatio: 1.8,
      children: [for (final stat in stats) _StatTile(stat: stat)],
    );
  }
}

class _StatItem {
  const _StatItem({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.stat});

  final _StatItem stat;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(stat.icon, color: kColorPrimary),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(stat.label,
                      style: Theme.of(context).textTheme.bodySmall),
                  Text(
                    stat.value,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ],
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
    required this.onClasses,
    required this.onUpdates,
    required this.onMore,
  });

  final VoidCallback onAttendance;
  final VoidCallback onClasses;
  final VoidCallback onUpdates;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      childAspectRatio: 2.65,
      children: [
        _QuickActionTile(
          icon: Icons.how_to_reg_outlined,
          label: 'Attendance',
          onTap: onAttendance,
        ),
        _QuickActionTile(
          icon: Icons.school_outlined,
          label: 'Classes',
          onTap: onClasses,
        ),
        _QuickActionTile(
          icon: Icons.note_alt_outlined,
          label: 'Daily update',
          onTap: onUpdates,
        ),
        _QuickActionTile(
          icon: Icons.more_horiz,
          label: 'More tools',
          onTap: onMore,
        ),
      ],
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
        const ListTile(
          leading: Icon(Icons.menu_book_outlined),
          title: Text('Syllabus tracker'),
          subtitle: Text('Coming from the web teacher panel'),
          enabled: false,
        ),
        const ListTile(
          leading: Icon(Icons.assignment_outlined),
          title: Text('Homework'),
          subtitle: Text('Coming from the web teacher panel'),
          enabled: false,
        ),
        const ListTile(
          leading: Icon(Icons.analytics_outlined),
          title: Text('Results'),
          subtitle: Text('Coming from the web teacher panel'),
          enabled: false,
        ),
        const ListTile(
          leading: Icon(Icons.receipt_long_outlined),
          title: Text('Salary slips'),
          subtitle: Text('Coming from the web teacher panel'),
          enabled: false,
        ),
        ListTile(
          leading: const Icon(Icons.lock_outline),
          title: const Text('Change password'),
          onTap: () => context.push('/teacher/change-password'),
        ),
      ],
    );
  }
}
