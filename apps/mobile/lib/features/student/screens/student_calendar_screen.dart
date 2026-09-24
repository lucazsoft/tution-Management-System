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
    final events = state.events
        .map((event) {
          final date = parsePortalEventDate(event.dateLabel);
          return date == null
              ? null
              : AcademicCalendarEvent(
                  id: event.id,
                  title: event.title,
                  date: date,
                  kind: event.kind.isEmpty ? 'Event' : event.kind,
                  details: event.details);
        })
        .whereType<AcademicCalendarEvent>()
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
              AcademicCalendar(events: events),
            ]),
      ),
    );
  }
}
