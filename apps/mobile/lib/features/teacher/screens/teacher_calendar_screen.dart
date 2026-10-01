import 'package:flutter/material.dart';
import 'package:tms_mobile/features/teacher/data/teacher_portal_repository.dart';
import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_navigation.dart';
import 'package:tms_mobile/shared/widgets/academic_calendar.dart';

class TeacherCalendarScreen extends StatefulWidget {
  const TeacherCalendarScreen({super.key});
  @override
  State<TeacherCalendarScreen> createState() => _TeacherCalendarScreenState();
}

class _TeacherCalendarScreenState extends State<TeacherCalendarScreen> {
  late Future<List<TeacherAcademicEvent>> _events;
  @override
  void initState() {
    super.initState();
    _events = TeacherPortalRepository().fetchCalendar();
  }

  Future<void> _refresh() async {
    final next = TeacherPortalRepository().fetchCalendar();
    setState(() => _events = next);
    await next;
  }

  @override
  Widget build(BuildContext context) => TeacherPortalScaffold(
        title: 'Academic calendar',
        body: FutureBuilder<List<TeacherAcademicEvent>>(
          future: _events,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done &&
                !snapshot.hasData)
              return const Center(child: CircularProgressIndicator());
            if (snapshot.hasError)
              return Center(
                  child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.event_busy_outlined, size: 48),
                        const SizedBox(height: 12),
                        Text(snapshot.error.toString(),
                            textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        FilledButton(
                            onPressed: _refresh, child: const Text('Retry'))
                      ])));
            final events = snapshot.data ?? const <TeacherAcademicEvent>[];
            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(padding: const EdgeInsets.all(16), children: [
                Text(
                    'Holidays, examinations, staff events, and academic deadlines.',
                    style: Theme.of(context).textTheme.bodyMedium),
                const SizedBox(height: 16),
                AcademicCalendar(events: [
                  for (final event in events)
                    AcademicCalendarEvent(
                        id: event.id,
                        title: event.title,
                        date: event.startDate,
                        kind: event.type,
                        details: event.description)
                ]),
              ]),
            );
          },
        ),
      );
}
