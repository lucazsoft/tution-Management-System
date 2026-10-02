import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/shared/widgets/leave_request_content.dart';

void main() {
  const activeLeave = LeaveHistoryItem(
    '9 Oct 2026 - 23 Oct 2026',
    'Family event',
    'Pending',
    'Awaiting approval',
    startDate: null,
    endDate: null,
  );

  test('pending and approved ranges block overlapping leave requests', () {
    final history = [
      LeaveHistoryItem(
        activeLeave.dates,
        activeLeave.reason,
        activeLeave.state,
        activeLeave.detail,
        startDate: DateTime(2026, 10, 9),
        endDate: DateTime(2026, 10, 23),
      ),
    ];

    expect(
      leaveDateRangeOverlaps(
        history,
        DateTime(2026, 10, 8),
        DateTime(2026, 10, 9),
      ),
      isTrue,
    );
    expect(
      leaveDateRangeOverlaps(
        history,
        DateTime(2026, 10, 24),
        DateTime(2026, 10, 25),
      ),
      isFalse,
    );
  });

  test('rejected ranges do not block a new request', () {
    final history = [
      LeaveHistoryItem(
        activeLeave.dates,
        activeLeave.reason,
        'Rejected',
        activeLeave.detail,
        startDate: DateTime(2026, 10, 9),
        endDate: DateTime(2026, 10, 23),
      ),
    ];

    expect(
      leaveDateRangeOverlaps(
        history,
        DateTime(2026, 10, 10),
        DateTime(2026, 10, 11),
      ),
      isFalse,
    );
  });

  test('API errors expose only their human-readable message', () {
    const error = ApiException(
      kind: ApiErrorKind.unknown,
      statusCode: 409,
      message:
          'A pending or approved leave request already covers these dates.',
    );

    expect(
      leaveSubmissionErrorMessage(error),
      'A pending or approved leave request already covers these dates.',
    );
  });
}
