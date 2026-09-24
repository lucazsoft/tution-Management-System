/// DTOs for the authenticated student portal payload.
///
/// Backend contract (read-only, verified in `services/api/src/routes/users.ts`):
/// `GET /api/users/me/student-portal` returns a single JSON object with
/// `studentProfile`, `todaySessions`, `weeklySessions`, `homework`, `results`,
/// `insights`, `attendance`, `invoices`, `events`, `certificates` and
/// `notifications`. All identity comes from the Better Auth session cookie;
/// the client never sends user/tenant/branch ids.
///
/// A dedicated daily/weekly timetable endpoint pair does not exist. The raw
/// per-student schedule (`GET /api/courses/timetable/student/:studentId`,
/// verified in `services/api/src/routes/courses.ts`) returns class schedules
/// without teacher or course-type detail, so the portal's `todaySessions` /
/// `weeklySessions` are the primary timetable source and the raw endpoint is
/// a fallback only.
library;

import '../models/student_portal_models.dart';

/// Maps a backend course-type label to [StudentCourseType].
///
/// The API formats enum values as `Short-Term`, `Long-Term`, etc. Matching is
/// case-insensitive and tolerant of `-`, `_` and spaces. Unknown values fall
/// back to [StudentCourseType.regular] rather than throwing.
StudentCourseType parseCourseType(String? raw) {
  final normalized =
      (raw ?? '').trim().toLowerCase().replaceAll(RegExp(r'[-_\s]+'), '_');
  return switch (normalized) {
    'music' => StudentCourseType.music,
    'short_term' => StudentCourseType.shortTerm,
    'long_term' => StudentCourseType.longTerm,
    'personalized' => StudentCourseType.personalized,
    _ => StudentCourseType.regular,
  };
}

const _dayOrder = <String>['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/// Normalises a backend day label (`Monday`, `Mon`, …) to a 3-letter key.
String dayKey(String raw) {
  final lower = raw.trim().toLowerCase();
  if (lower.length < 3) return lower;
  return lower.substring(0, 3);
}

/// Display label for a 3-letter day key.
String dayLabel(String key) => switch (key) {
      'mon' => 'Monday',
      'tue' => 'Tuesday',
      'wed' => 'Wednesday',
      'thu' => 'Thursday',
      'fri' => 'Friday',
      'sat' => 'Saturday',
      'sun' => 'Sunday',
      _ => key,
    };

/// Sort rank for a day key; unknown days sort last.
int dayRank(String key) {
  final index = _dayOrder.indexOf(key);
  return index == -1 ? _dayOrder.length : index;
}

double _num(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse('$value') ?? 0;
}

String _str(dynamic value, [String fallback = '—']) {
  if (value == null) return fallback;
  final text = '$value'.trim();
  return text.isEmpty ? fallback : text;
}

/// Authenticated student's profile summary.
class PortalProfile {
  const PortalProfile({
    required this.name,
    required this.initials,
    required this.institution,
    required this.grade,
    required this.branch,
    required this.rollNumber,
    required this.enrollmentId,
    required this.academicYear,
    required this.blocked,
    required this.outstanding,
    required this.attendanceRate,
  });

  factory PortalProfile.fromJson(Map<String, dynamic> json) => PortalProfile(
        name: _str(json['name'], 'Student'),
        initials: _str(json['initials'], 'S'),
        institution: _str(json['institution'], ''),
        grade: _str(json['grade'], 'Grade not assigned'),
        branch: _str(json['branch'], 'Branch not assigned'),
        rollNumber: _str(json['rollNumber'], ''),
        enrollmentId: _str(json['enrollmentId'], ''),
        academicYear: _str(json['academicYear'], ''),
        blocked: json['blocked'] == true,
        outstanding: _num(json['outstanding']),
        attendanceRate: json['attendanceRate'] is num
            ? (json['attendanceRate'] as num).toDouble()
            : null,
      );

  final String name;
  final String initials;
  final String institution;
  final String grade;
  final String branch;
  final String rollNumber;
  final String enrollmentId;
  final String academicYear;
  final bool blocked;
  final double outstanding;
  final double? attendanceRate;
}

/// One class session. `day` is empty for today-only sessions.
class PortalSession {
  const PortalSession({
    required this.id,
    required this.day,
    required this.time,
    required this.endTime,
    required this.subject,
    required this.teacher,
    required this.room,
    required this.type,
    required this.typeLabel,
  });

  factory PortalSession.fromJson(Map<String, dynamic> json) {
    final typeLabel = _str(json['type'], 'Regular');
    return PortalSession(
      id: _str(json['id'], ''),
      day: json['day'] == null ? '' : '${json['day']}',
      time: _str(json['time']),
      endTime: _str(json['endTime']),
      subject: _str(json['subject'], 'Class'),
      teacher: _str(json['teacher'], 'Teacher not assigned'),
      room: _str(json['room']),
      type: parseCourseType(typeLabel),
      typeLabel: typeLabel,
    );
  }

  final String id;
  final String day;
  final String time;
  final String endTime;
  final String subject;
  final String teacher;
  final String room;
  final StudentCourseType type;
  final String typeLabel;

  String get dayGroupKey => dayKey(day);
}

class PortalHomework {
  const PortalHomework({
    required this.id,
    required this.subject,
    required this.title,
    required this.teacher,
    required this.dueLabel,
    required this.urgency,
    required this.completed,
  });

  factory PortalHomework.fromJson(Map<String, dynamic> json) => PortalHomework(
        id: _str(json['id'], ''),
        subject: _str(json['subject'], ''),
        title: _str(json['title'], ''),
        teacher: _str(json['teacher'], 'Teacher'),
        dueLabel: _str(json['dueLabel'], ''),
        urgency: _str(json['urgency'], 'normal'),
        completed: json['completed'] == true,
      );

  final String id;
  final String subject;
  final String title;
  final String teacher;
  final String dueLabel;
  final String urgency;
  final bool completed;
}

class PortalResult {
  const PortalResult({
    required this.id,
    required this.subject,
    required this.assessment,
    required this.score,
    required this.maximum,
    required this.publishedLabel,
  });

  factory PortalResult.fromJson(Map<String, dynamic> json) => PortalResult(
        id: _str(json['id'], ''),
        subject: _str(json['subject'], ''),
        assessment: _str(json['assessment'], ''),
        score: _num(json['score']),
        maximum: _num(json['maximum']),
        publishedLabel: _str(json['publishedLabel'], ''),
      );

  final String id;
  final String subject;
  final String assessment;
  final double score;
  final double maximum;
  final String publishedLabel;

  double get percentage => maximum <= 0 ? 0 : (score / maximum) * 100;
}

class PortalInsight {
  const PortalInsight({
    required this.subject,
    required this.average,
    required this.previousAverage,
  });

  factory PortalInsight.fromJson(Map<String, dynamic> json) => PortalInsight(
        subject: _str(json['subject'], ''),
        average: _num(json['average']),
        previousAverage: _num(json['previousAverage']),
      );

  final String subject;
  final double average;
  final double previousAverage;

  String get trend {
    final change = average - previousAverage;
    if (change > 2) return 'Improving';
    if (change < -2) return 'Declining';
    return 'Stable';
  }
}

class PortalInvoice {
  const PortalInvoice({
    required this.id,
    required this.cycle,
    required this.dueDateLabel,
    required this.state,
    required this.netPayable,
    required this.qrAvailable,
    required this.paymentReference,
    required this.lines,
  });

  factory PortalInvoice.fromJson(Map<String, dynamic> json) => PortalInvoice(
        id: _str(json['id'], ''),
        cycle: _str(json['cycle'], ''),
        dueDateLabel: _str(json['dueDate'], ''),
        state: _str(json['state'], 'Upcoming'),
        netPayable: _num(json['netPayable']),
        qrAvailable: json['qrAvailable'] != false,
        paymentReference: _str(json['paymentReference'], ''),
        lines: [
          for (final line in (json['lines'] as List? ?? const []))
            if (line is Map<String, dynamic>)
              PortalInvoiceLine(
                label: _str(line['label'], ''),
                amount: _num(line['amount']),
              ),
        ],
      );

  final String id;
  final String cycle;
  final String dueDateLabel;
  final String state;
  final double netPayable;
  final bool qrAvailable;
  final String paymentReference;
  final List<PortalInvoiceLine> lines;

  bool get isOverdue => state.toLowerCase() == 'overdue';
}

class PortalInvoiceLine {
  const PortalInvoiceLine({required this.label, required this.amount});
  final String label;
  final double amount;
}

class PortalEvent {
  const PortalEvent({
    required this.id,
    required this.dateLabel,
    required this.day,
    required this.month,
    required this.title,
    required this.kind,
    required this.details,
  });

  factory PortalEvent.fromJson(Map<String, dynamic> json) => PortalEvent(
        id: _str(json['id'], ''),
        dateLabel: _str(json['date'], ''),
        day: _str(json['day'], ''),
        month: _str(json['month'], ''),
        title: _str(json['title'], ''),
        kind: _str(json['kind'], ''),
        details: json['details'] == null ? '' : '${json['details']}',
      );

  final String id;
  final String dateLabel;
  final String day;
  final String month;
  final String title;
  final String kind;
  final String details;
}

class PortalCertificate {
  const PortalCertificate({
    required this.id,
    required this.title,
    required this.course,
    required this.issuedDateLabel,
    required this.fileName,
  });

  factory PortalCertificate.fromJson(Map<String, dynamic> json) =>
      PortalCertificate(
        id: _str(json['id'], ''),
        title: _str(json['title'], ''),
        course: _str(json['course'], ''),
        issuedDateLabel: _str(json['issuedDate'], ''),
        fileName: _str(json['fileName'], ''),
      );

  final String id;
  final String title;
  final String course;
  final String issuedDateLabel;
  final String fileName;
}

class PortalNotification {
  const PortalNotification({
    required this.id,
    required this.title,
    required this.message,
    required this.time,
    required this.destination,
    required this.unread,
  });

  factory PortalNotification.fromJson(Map<String, dynamic> json) =>
      PortalNotification(
        id: _str(json['id'], ''),
        title: _str(json['title'], ''),
        message: _str(json['message'], ''),
        time: _str(json['time'], ''),
        destination: '${json['destination'] ?? ''}',
        unread: json['unread'] == true,
      );

  final String id;
  final String title;
  final String message;
  final String time;
  final String destination;
  final bool unread;
}

/// Full portal payload backing the student home and timetable screens.
class StudentPortal {
  const StudentPortal({
    required this.profile,
    required this.todaySessions,
    required this.weeklySessions,
    required this.homework,
    required this.results,
    required this.insights,
    required this.invoices,
    required this.events,
    required this.certificates,
    required this.notifications,
  });

  factory StudentPortal.fromJson(Map<String, dynamic> json) {
    List<T> list<T>(
      String key,
      T Function(Map<String, dynamic>) parse,
    ) {
      final raw = json[key];
      if (raw is! List) return const [];
      return [
        for (final item in raw)
          if (item is Map<String, dynamic>) parse(item),
      ];
    }

    final profileRaw = json['studentProfile'];
    return StudentPortal(
      profile: profileRaw is Map<String, dynamic>
          ? PortalProfile.fromJson(profileRaw)
          : const PortalProfile(
              name: 'Student',
              initials: 'S',
              institution: '',
              grade: 'Grade not assigned',
              branch: 'Branch not assigned',
              rollNumber: '',
              enrollmentId: '',
              academicYear: '',
              blocked: false,
              outstanding: 0,
              attendanceRate: null,
            ),
      todaySessions: list('todaySessions', PortalSession.fromJson),
      weeklySessions: list('weeklySessions', PortalSession.fromJson),
      homework: list('homework', PortalHomework.fromJson),
      results: list('results', PortalResult.fromJson),
      insights: list('insights', PortalInsight.fromJson),
      invoices: list('invoices', PortalInvoice.fromJson),
      events: list('events', PortalEvent.fromJson),
      certificates: list('certificates', PortalCertificate.fromJson),
      notifications: list('notifications', PortalNotification.fromJson),
    );
  }

  final PortalProfile profile;
  final List<PortalSession> todaySessions;
  final List<PortalSession> weeklySessions;
  final List<PortalHomework> homework;
  final List<PortalResult> results;
  final List<PortalInsight> insights;
  final List<PortalInvoice> invoices;
  final List<PortalEvent> events;
  final List<PortalCertificate> certificates;
  final List<PortalNotification> notifications;

  /// Weekly sessions grouped by day, ordered Monday → Sunday.
  List<PortalDaySchedule> get weeklyByDay {
    final groups = <String, List<PortalSession>>{};
    for (final session in weeklySessions) {
      groups.putIfAbsent(session.dayGroupKey, () => []).add(session);
    }
    final days = groups.entries
        .map((entry) => PortalDaySchedule(
              key: entry.key,
              label: dayLabel(entry.key),
              sessions: List.unmodifiable(entry.value),
            ))
        .toList()
      ..sort((a, b) => dayRank(a.key).compareTo(dayRank(b.key)));
    return days;
  }

  double get overdueAmount => invoices
      .where((invoice) => invoice.isOverdue)
      .fold<double>(0, (sum, invoice) => sum + invoice.netPayable);

  int get unreadCount => notifications.where((notice) => notice.unread).length;

  List<PortalHomework> get pendingHomework =>
      homework.where((item) => !item.completed).toList();
}

/// One day of the weekly timetable.
class PortalDaySchedule {
  const PortalDaySchedule({
    required this.key,
    required this.label,
    required this.sessions,
  });

  final String key;
  final String label;
  final List<PortalSession> sessions;
}

/// Raw class schedule from `GET /api/courses/timetable/student/:studentId`.
///
/// Fallback source only: slots carry day/start/end without teacher or
/// course-type detail. Prefer [StudentPortal.weeklySessions].
class StudentClassSchedule {
  const StudentClassSchedule({
    required this.classId,
    required this.className,
    required this.courseId,
    required this.slots,
  });

  factory StudentClassSchedule.fromJson(Map<String, dynamic> json) {
    final rawSlots = json['schedule'];
    return StudentClassSchedule(
      classId: _str(json['classId'], ''),
      className: _str(json['className'], 'Class'),
      courseId: json['courseId'] == null ? '' : '${json['courseId']}',
      slots: [
        if (rawSlots is List)
          for (final slot in rawSlots)
            if (slot is Map<String, dynamic>) RawScheduleSlot.fromJson(slot),
      ],
    );
  }

  final String classId;
  final String className;
  final String courseId;
  final List<RawScheduleSlot> slots;

  /// Normalises raw slots into displayable sessions.
  List<PortalSession> toPortalSessions() => [
        for (var i = 0; i < slots.length; i++)
          PortalSession(
            id: '$classId-$i',
            day: slots[i].day,
            time: slots[i].start,
            endTime: slots[i].end,
            subject: className,
            teacher: 'Teacher not assigned',
            room: className,
            type: StudentCourseType.regular,
            typeLabel: 'Regular',
          ),
      ];
}

class RawScheduleSlot {
  const RawScheduleSlot({
    required this.day,
    required this.start,
    required this.end,
  });

  factory RawScheduleSlot.fromJson(Map<String, dynamic> json) {
    String pick(List<String> keys) {
      for (final key in keys) {
        final value = json[key];
        if (value != null && '$value'.trim().isNotEmpty) return '$value';
      }
      return '—';
    }

    return RawScheduleSlot(
      day: pick(['day', 'dayLabel']),
      start: pick(['start', 'startTime', 'time']),
      end: pick(['end', 'endTime']),
    );
  }

  final String day;
  final String start;
  final String end;
}
