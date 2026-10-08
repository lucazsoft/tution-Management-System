import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';
import 'package:tms_mobile/shared/widgets/academic_calendar.dart';

import '../viewmodels/parent_portal_viewmodel.dart';
import '../widgets/parent_navigation.dart';
import '../widgets/parent_portal_state_view.dart';

class ParentCalendarScreen extends ConsumerWidget {
  const ParentCalendarScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
        drawer: ParentNavigation.drawer(context),
        appBar: AppBar(title: const Text('Academic calendar')),
        bottomNavigationBar: const ParentNavigationBar(selectedIndex: 0),
        body: SafeArea(
            child: ParentPortalStateView(
          padding: const EdgeInsets.all(TmsSpace.md),
          wrapInScrollView: false,
          builder: (context, portal, child) {
            final today = DateTime.now();
            final startOfToday = DateTime(today.year, today.month, today.day);
            final upcomingEvents = portal.events
                .map((event) {
                  final date = parsePortalEventDate(event.date);
                  return date == null || date.isBefore(startOfToday)
                      ? null
                      : AcademicCalendarEvent(
                          id: event.id,
                          title: event.title,
                          date: date,
                          kind: event.kind.isEmpty ? 'Event' : event.kind,
                          details: event.details,
                        );
                })
                .whereType<AcademicCalendarEvent>()
                .toList();
            return Column(children: [
              Expanded(
                  child: RefreshIndicator(
                onRefresh: ref.read(parentPortalProvider.notifier).refresh,
                child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [
                      Text(
                          '${child.name}\'s holidays, exams, ceremonies, and fee deadlines.',
                          style: Theme.of(context).textTheme.bodyMedium),
                      const SizedBox(height: TmsSpace.md),
                      AcademicCalendar(
                        events: upcomingEvents,
                        showGregorianDates: false,
                      ),
                    ]),
              )),
            ]);
          },
        )),
      );
}
