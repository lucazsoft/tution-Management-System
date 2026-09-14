/// Mobile class workspace for an assigned teacher class.
library;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_record_states.dart';

class TeacherClassDetailScreen extends StatelessWidget {
  const TeacherClassDetailScreen({super.key, required this.klass});

  final TeacherClassInfo klass;

  @override
  Widget build(BuildContext context) {
    final branchName = klass.branch?.name;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          klass.name,
          style:
              GoogleFonts.fraunces(fontWeight: FontWeight.w700, fontSize: 22),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      klass.subject,
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      [
                        if (branchName != null) branchName,
                        '${klass.studentCount} students',
                        if (klass.scheduleLabel != null) klass.scheduleLabel!,
                      ].join(' - '),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            _SectionHeader(
              title: 'Class tools',
              subtitle: 'Daily workflows for this class',
            ),
            const SizedBox(height: 8),
            _ToolTile(
              icon: Icons.fact_check_outlined,
              title: 'Class attendance',
              subtitle: 'Use the Attendance tab to mark today\'s roster',
            ),
            const _ToolTile(
              icon: Icons.menu_book_outlined,
              title: 'Syllabus progress',
              subtitle: 'Coming next from the web teacher workflow',
              enabled: false,
            ),
            const _ToolTile(
              icon: Icons.assignment_outlined,
              title: 'Homework',
              subtitle: 'Coming next from the web teacher workflow',
              enabled: false,
            ),
            const _ToolTile(
              icon: Icons.analytics_outlined,
              title: 'Results',
              subtitle: 'Coming next from the web teacher workflow',
              enabled: false,
            ),
            const SizedBox(height: 16),
            _SectionHeader(
              title: 'Roster',
              subtitle: '${klass.students.length} enrolled students',
            ),
            const SizedBox(height: 8),
            if (klass.students.isEmpty)
              const TeacherEmptyView(
                icon: Icons.group_off_outlined,
                title: 'No students enrolled',
                message: 'Students will appear here once assigned.',
              )
            else
              for (final student in klass.students)
                Card(
                  child: ListTile(
                    leading: CircleAvatar(child: Text(_initials(student.name))),
                    title:
                        Text(student.name.isEmpty ? student.id : student.name),
                    subtitle: Text(
                      student.isFeeBlocked
                          ? 'Fee-blocked: Present unavailable'
                          : 'Active enrollment',
                    ),
                    trailing: student.isFeeBlocked
                        ? const Icon(Icons.lock_outline)
                        : const Icon(Icons.check_circle_outline),
                  ),
                ),
            const SizedBox(height: 16),
            _SectionHeader(
              title: 'Schedule',
              subtitle: klass.scheduleLabel ?? 'No schedule published',
            ),
            const SizedBox(height: 8),
            if (klass.slots.isEmpty)
              const TeacherEmptyView(
                icon: Icons.calendar_month_outlined,
                title: 'No timetable slots',
                message: 'Schedule details will appear after publication.',
              )
            else
              for (final slot in klass.slots)
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.schedule_outlined),
                    title: Text(slot.label),
                    subtitle: slot.subject == null ? null : Text(slot.subject!),
                  ),
                ),
            const SizedBox(height: 16),
            _SectionHeader(
              title: 'Attendance history',
              subtitle: '${klass.attendance.length} records from workspace',
            ),
            const SizedBox(height: 8),
            if (klass.attendance.isEmpty)
              const TeacherEmptyView(
                icon: Icons.history_outlined,
                title: 'No attendance history',
                message: 'Saved class attendance will appear after refresh.',
              )
            else
              for (final record in klass.attendance.take(10))
                Card(
                  child: ListTile(
                    leading: Icon(_attendanceIcon(record.status)),
                    title: Text(record.status),
                    subtitle: Text(
                      [
                        _studentName(record.studentId),
                        if (record.date != null)
                          record.date!.toLocal().toString().split(' ').first,
                      ].join(' - '),
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }

  String _studentName(String studentId) {
    for (final student in klass.students) {
      if (student.id == studentId) {
        return student.name.isEmpty ? student.id : student.name;
      }
    }
    return studentId;
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 2),
        Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

class _ToolTile extends StatelessWidget {
  const _ToolTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.enabled = true,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        enabled: enabled,
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(subtitle),
      ),
    );
  }
}

String _initials(String name) {
  final value = name
      .split(' ')
      .where((part) => part.isNotEmpty)
      .map((part) => part[0])
      .take(2)
      .join();
  return value.isEmpty ? '?' : value;
}

IconData _attendanceIcon(String status) {
  return switch (status) {
    'PRESENT' => Icons.check_circle_outline,
    'EXCUSED' => Icons.event_available_outlined,
    _ => Icons.cancel_outlined,
  };
}
