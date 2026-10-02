import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/shared/widgets/academic_calendar.dart';

import '../student_design.dart';
import '../viewmodels/student_calendar_viewmodel.dart';
import '../widgets/student_record_states.dart';
import '../widgets/student_scaffold.dart';

class StudentCalendarScreen extends ConsumerWidget {
  const StudentCalendarScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(studentCalendarViewModelProvider);
    final viewModel = ref.read(studentCalendarViewModelProvider.notifier);
    if (state.isLoading && state.events.isEmpty) {
      return const StudentScaffold(
          title: 'Academic calendar',
          selectedIndex: 3,
          body: StudentLoadingView(message: 'Loading the academic calendar…'));
    }
    if (state.hasError && state.events.isEmpty) {
      return StudentScaffold(
        title: 'Academic calendar',
        selectedIndex: 3,
        body: StudentErrorView(
            icon: state.isOffline
                ? Icons.wifi_off_rounded
                : Icons.event_busy_outlined,
            title: state.isDenied
                ? 'Access denied'
                : state.isOffline
                    ? 'You are offline'
                    : 'Could not load calendar',
            message: state.error ?? 'Something went wrong.',
            retryLabel: 'Retry',
            onRetry: viewModel.load),
      );
    }
    final events = state.events.expand((event) {
      final start = parsePortalEventDate(event.dateLabel);
      final end = parsePortalEventDate(event.endDateLabel) ?? start;
      if (start == null || end == null || end.isBefore(start)) {
        return const <AcademicCalendarEvent>[];
      }
      return <AcademicCalendarEvent>[
        for (var date = start;
            !date.isAfter(end);
            date = date.add(const Duration(days: 1)))
          AcademicCalendarEvent(
            id: '${event.id}-${date.toIso8601String()}',
            title: event.title,
            date: date,
            kind: event.kind.isEmpty ? 'Event' : event.kind,
            details: event.details,
          ),
      ];
    }).toList();
    final attendance = state.attendance
        .map((record) {
          final date = parsePortalEventDate(record.dateLabel);
          return date == null
              ? null
              : AcademicCalendarAttendance(
                  id: record.id,
                  date: date,
                  subject: record.subject,
                  session: record.session,
                  status: record.state,
                  details: record.leaveReason ?? '',
                );
        })
        .whereType<AcademicCalendarAttendance>()
        .toList();
    final scheduledClasses = state.weeklySessions
        .map((session) => AcademicCalendarClass(
              id: session.id,
              weekday: _weekdayNumber(session.dayGroupKey),
              subject: session.subject,
              time: [session.time, session.endTime]
                  .where((value) => value.isNotEmpty)
                  .join(' - '),
              teacher: session.teacher,
            ))
        .where((session) => session.weekday != null)
        .toList();
    return StudentScaffold(
      title: 'Academic calendar',
      selectedIndex: 3,
      body: RefreshIndicator(
        onRefresh: viewModel.refresh,
        child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(TmsSpace.md),
            children: [
              Text('Holidays, exams, ceremonies, and fee deadlines.',
                  style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: TmsSpace.md),
              AcademicCalendar(
                events: events,
                attendance: attendance,
                scheduledClasses: scheduledClasses,
              ),
            ]),
      ),
    );
  }
}

int? _weekdayNumber(String day) => switch (day) {
      'mon' => DateTime.monday,
      'tue' => DateTime.tuesday,
      'wed' => DateTime.wednesday,
      'thu' => DateTime.thursday,
      'fri' => DateTime.friday,
      'sat' => DateTime.saturday,
      'sun' => DateTime.sunday,
      _ => null,
    };
