import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/features/parent/viewmodels/parent_portal_viewmodel.dart';
import 'package:tms_mobile/features/parent/widgets/child_switcher_bar.dart';
import 'package:tms_mobile/features/parent/widgets/parent_navigation.dart';
import 'package:tms_mobile/features/parent/widgets/parent_portal_state_view.dart';
import 'package:tms_mobile/shared/widgets/leave_request_content.dart';

class ParentLeaveScreen extends ConsumerWidget {
  const ParentLeaveScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
        drawer: ParentNavigation.drawer(context),
        appBar: AppBar(title: const Text('Leave requests')),
        bottomNavigationBar: const ParentNavigationBar(selectedIndex: 0),
        body: ParentPortalStateView(
            builder: (context, portal, child) => Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const ChildSwitcherBar(),
                      const SizedBox(height: 16),
                      LeaveRequestContent(
                        subjectName: child.name,
                        history: portal.leaves
                            .map((item) => LeaveHistoryItem(item.dates,
                                item.reason, item.state, item.detail))
                            .toList(),
                        onSubmit: (type, start, end, reason) async {
                          await ref
                              .read(parentPortalRepositoryProvider)
                              .requestLeave(
                                  child: child,
                                  leaveType: type,
                                  startDate: start,
                                  endDate: end,
                                  reason: reason);
                          await ref
                              .read(parentPortalProvider.notifier)
                              .refresh();
                        },
                      ),
                    ])),
      );
}
