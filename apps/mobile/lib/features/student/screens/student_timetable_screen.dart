import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/sync/sync.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/features/student/models/student_portal_dto.dart';
import 'package:tms_mobile/features/student/student_design.dart';
import 'package:tms_mobile/features/student/viewmodels/student_timetable_viewmodel.dart';

/// Weekly timetable backed by the authenticated student portal.
///
/// Primary source is `weeklySessions` from
/// `GET /api/users/me/student-portal`, grouped by day (Monday → Sunday) with
/// the tab defaulting to today. `todaySessions` feeds the summary header.
/// Covers loading, empty days, error with retry, access-denied (403) and
/// offline (no connection) states; pull-to-refresh reloads.
class StudentTimetableScreen extends ConsumerWidget {
  const StudentTimetableScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(studentTimetableViewModelProvider);
    final viewModel = ref.read(studentTimetableViewModelProvider.notifier);
    final connectivity = ref.watch(connectivityMonitorProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'My Weekly Timetable',
          style:
              GoogleFonts.fraunces(fontWeight: FontWeight.w700, fontSize: 22),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.go('/student/home'),
        ),
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (state.isLoading && !state.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            if (!state.hasData) {
              return _TimetableStateMessage(
                state: state,
                isOffline: state.isOffline ||
                    connectivity == ConnectivityState.offline,
                onRetry: viewModel.load,
              );
            }
            return RefreshIndicator(
              onRefresh: viewModel.refresh,
              child: _TimetableBody(
                state: state,
                showOfflineBar: connectivity == ConnectivityState.offline,
                onSelectDay: viewModel.selectDay,
              ),
            );
          },
        ),
      ),
    );
  }
}

class _TimetableBody extends StatelessWidget {
  const _TimetableBody({
    required this.state,
    required this.showOfflineBar,
    required this.onSelectDay,
  });

  final StudentTimetableState state;
  final bool showOfflineBar;
  final ValueChanged<int> onSelectDay;

  @override
  Widget build(BuildContext context) {
    final days = state.days;
    return DefaultTabController(
      length: days.length,
      initialIndex: state.selectedIndex.clamp(0, days.length - 1),
      child: Builder(
        builder: (context) {
          final controller = DefaultTabController.of(context);
          controller.addListener(() {
            if (!controller.indexIsChanging) onSelectDay(controller.index);
          });
          return Column(
            children: [
              if (showOfflineBar)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 8,
                  ),
                  color: kColorAccent.withValues(alpha: 0.15),
                  child: const Row(
                    children: [
                      Icon(Icons.wifi_off_rounded, size: 18),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'You are offline. Showing the last loaded timetable.',
                        ),
                      ),
                    ],
                  ),
                ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                color: kColorPrimary.withValues(alpha: 0.04),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline_rounded,
                        size: 18, color: kColorPrimary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        state.todaySessions.isEmpty
                            ? 'No sessions scheduled for today.'
                            : '${state.todaySessions.length} session${state.todaySessions.length == 1 ? '' : 's'} scheduled for today.',
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: kColorPrimary),
                      ),
                    ),
                  ],
                ),
              ),
              TabBar(
                isScrollable: true,
                indicatorColor: kColorAccent,
                labelColor: kColorPrimary,
                unselectedLabelColor: kColorText.withValues(alpha: 0.6),
                tabs: days.map((day) => Tab(text: day.label)).toList(),
              ),
              Expanded(
                child: TabBarView(
                  children:
                      days.map((day) => _DayScheduleList(day: day)).toList(),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _DayScheduleList extends StatelessWidget {
  const _DayScheduleList({required this.day});

  final PortalDaySchedule day;

  @override
  Widget build(BuildContext context) {
    if (day.sessions.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.event_busy_rounded,
                size: 48, color: kColorText.withValues(alpha: 0.3)),
            const SizedBox(height: 12),
            Text(
              'No classes scheduled for ${day.label}.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: kColorText.withValues(alpha: 0.55),
                  ),
            ),
          ],
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: day.sessions.length,
      itemBuilder: (context, index) =>
          _TimetableSessionTile(session: day.sessions[index]),
    );
  }
}

/// Session tile with course-type distinction (Regular, Music, Short-term,
/// Long-term, Personalized) shown as a pill.
class _TimetableSessionTile extends StatelessWidget {
  const _TimetableSessionTile({required this.session});

  final PortalSession session;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(TmsRadius.r14),
        border: Border.all(color: StudentColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: kColorPrimary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(TmsRadius.r12),
                ),
                child: Text(
                  session.time,
                  style: const TextStyle(
                    color: kColorPrimary,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      session.subject,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${session.teacher} · ${session.room}',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: kColorText.withValues(alpha: 0.7),
                          ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Ends ${session.endTime}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: kColorText.withValues(alpha: 0.55),
                          ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: StudentColors.info.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(TmsRadius.pill),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.school_outlined,
                    size: 14,
                    color: StudentColors.info,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    session.typeLabel,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: StudentColors.info,
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Full-screen loading/error/denied/offline message for the timetable.
class _TimetableStateMessage extends StatelessWidget {
  const _TimetableStateMessage({
    required this.state,
    required this.isOffline,
    required this.onRetry,
  });

  final StudentTimetableState state;
  final bool isOffline;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (state.error == null) {
      return _StateBody(
        icon: Icons.event_busy_rounded,
        title: 'No timetable yet',
        message:
            'No classes are scheduled for you right now. Pull to refresh or check back later.',
        actionLabel: 'Refresh',
        onAction: onRetry,
      );
    }
    if (state.isDenied) {
      return _StateBody(
        icon: Icons.block_rounded,
        title: 'Access denied',
        message: state.error ??
            'Your account is not allowed to view this timetable.',
        actionLabel: 'Try again',
        onAction: onRetry,
      );
    }
    if (isOffline) {
      return _StateBody(
        icon: Icons.wifi_off_rounded,
        title: 'You are offline',
        message:
            'Check your connection and try again. The timetable needs the network to load.',
        actionLabel: 'Retry',
        onAction: onRetry,
      );
    }
    return _StateBody(
      icon: Icons.error_outline_rounded,
      title: 'Could not load the timetable',
      message: state.error ?? 'Something went wrong. Please try again.',
      actionLabel: 'Retry',
      onAction: onRetry,
    );
  }
}

class _StateBody extends StatelessWidget {
  const _StateBody({
    required this.icon,
    required this.title,
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 64),
        Icon(icon, size: 56, color: kColorText.withValues(alpha: 0.4)),
        const SizedBox(height: 16),
        Text(
          title,
          style: Theme.of(context).textTheme.titleLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          message,
          style: Theme.of(context).textTheme.bodyMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        Center(
          child: FilledButton(onPressed: onAction, child: Text(actionLabel)),
        ),
      ],
    );
  }
}
