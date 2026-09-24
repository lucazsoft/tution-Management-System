import 'package:flutter/material.dart';
import 'package:tms_mobile/features/student/data/student_portal_repository.dart';
import 'package:tms_mobile/features/student/models/student_portal_dto.dart';
import 'package:tms_mobile/features/student/widgets/student_scaffold.dart';
import 'package:tms_mobile/shared/widgets/leave_request_content.dart';

class StudentLeaveScreen extends StatefulWidget {
  const StudentLeaveScreen({super.key});
  @override
  State<StudentLeaveScreen> createState() => _StudentLeaveScreenState();
}

class _StudentLeaveScreenState extends State<StudentLeaveScreen> {
  final _repository = StudentPortalRepository();
  late Future<StudentPortal> _portal = _repository.fetchPortal();

  Future<void> _reload() async {
    final next = _repository.fetchPortal();
    setState(() => _portal = next);
    await next;
  }

  @override
  Widget build(BuildContext context) => StudentScaffold(
        title: 'Leave requests',
        body: FutureBuilder<StudentPortal>(
          future: _portal,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting &&
                !snapshot.hasData)
              return const Center(child: CircularProgressIndicator());
            if (snapshot.hasError || !snapshot.hasData)
              return Center(
                  child: FilledButton.icon(
                      onPressed: _reload,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Retry loading leave requests')));
            final portal = snapshot.data!;
            return RefreshIndicator(
              onRefresh: _reload,
              child: ListView(padding: const EdgeInsets.all(20), children: [
                LeaveRequestContent(
                  subjectName: portal.profile.name,
                  history: portal.leaves
                      .map((item) => LeaveHistoryItem(
                          item.dates, item.reason, item.state, item.detail))
                      .toList(),
                  onSubmit: (type, start, end, reason) async {
                    if (portal.profile.branchId.isEmpty)
                      throw StateError(
                          'No active branch is linked to this student account.');
                    await _repository.requestLeave(
                        branchId: portal.profile.branchId,
                        leaveType: type,
                        startDate: start,
                        endDate: end,
                        reason: reason);
                    await _reload();
                  },
                ),
              ]),
            );
          },
        ),
      );
}
