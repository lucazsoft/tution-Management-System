/// API DTOs for the signed-in student's academic records (MOB-102).
///
/// Shapes mirror `GET /api/users/me/student-portal` and
/// `GET /api/performance/student/:studentId` in `services/api/src`
/// (read-only from mobile). The portal resolves identity server-side from
/// the Better Auth session cookie, so the app never passes another
/// student's id — repository callers only use the `enrollmentId` returned
/// inside the portal snapshot itself.
library;

/// One published score visible to the signed-in student.
class AcademicResult {
  const AcademicResult({
    required this.id,
    required this.subject,
    required this.assessment,
    required this.score,
    required this.maximum,
    this.publishedLabel,
    this.classAverage,
  });

  factory AcademicResult.fromJson(Map<String, dynamic> json) {
    return AcademicResult(
      id: '${json['id'] ?? ''}',
      subject: '${json['subject'] ?? ''}',
      assessment: '${json['assessment'] ?? ''}',
      score: _asDouble(json['score']),
      maximum: _asDouble(json['maximum'], fallback: 100),
      publishedLabel: json['publishedLabel'] as String?,
      classAverage:
          json['classAverage'] == null ? null : _asDouble(json['classAverage']),
    );
  }

  final String id;
  final String subject;
  final String assessment;
  final double score;
  final double maximum;
  final String? publishedLabel;
  final double? classAverage;

  double get percentage => maximum <= 0 ? 0 : (score / maximum) * 100;
}

/// One homework task assigned to the signed-in student's class.
class HomeworkTask {
  const HomeworkTask({
    required this.id,
    required this.subject,
    required this.title,
    required this.teacher,
    required this.dueLabel,
    required this.urgency,
    required this.completed,
    this.description,
  });

  factory HomeworkTask.fromJson(Map<String, dynamic> json) {
    return HomeworkTask(
      id: '${json['id'] ?? ''}',
      subject: '${json['subject'] ?? ''}',
      title: '${json['title'] ?? ''}',
      teacher: '${json['teacher'] ?? 'Teacher'}',
      dueLabel: '${json['dueLabel'] ?? ''}',
      urgency: '${json['urgency'] ?? 'normal'}',
      completed: json['completed'] == true,
      description: json['description'] as String?,
    );
  }

  /// Parses the teacher-scoped `GET /api/homework/:classId` shape, which
  /// returns raw rows (`deadline`, `description`) instead of portal labels.
  factory HomeworkTask.fromClassRow(Map<String, dynamic> json) {
    final teacher =
        json['class'] is Map ? (json['class'] as Map)['assignedTeacher'] : null;
    final teacherName = teacher is Map
        ? '${teacher['firstName'] ?? ''} ${teacher['lastName'] ?? ''}'.trim()
        : 'Teacher';
    return HomeworkTask(
      id: '${json['id'] ?? ''}',
      subject: '${json['subject'] ?? ''}',
      title: '${json['title'] ?? ''}',
      teacher: teacherName.isEmpty ? 'Teacher' : teacherName,
      dueLabel: '${json['deadline'] ?? ''}',
      urgency: 'normal',
      completed: false,
      description: json['description'] as String?,
    );
  }

  final String id;
  final String subject;
  final String title;
  final String teacher;
  final String dueLabel;
  final String urgency;
  final bool completed;
  final String? description;

  bool get isOverdue => urgency == 'overdue';
}

/// One marked attendance session for the signed-in student.
class AttendanceEntry {
  const AttendanceEntry({
    required this.id,
    required this.date,
    required this.subject,
    required this.session,
    required this.state,
  });

  factory AttendanceEntry.fromJson(Map<String, dynamic> json) {
    return AttendanceEntry(
      id: '${json['id'] ?? ''}',
      date: '${json['date'] ?? ''}',
      subject: '${json['subject'] ?? ''}',
      session: '${json['session'] ?? ''}',
      state: '${json['state'] ?? ''}',
    );
  }

  final String id;
  final String date;
  final String subject;
  final String session;
  final String state;

  /// Approved leave is reflected server-side as `Absent (Excused)`.
  bool get isExcused => state == 'Absent (Excused)';
  bool get isPresent => state == 'Present';
}

/// Per-subject performance insight computed from published scores.
class PerformanceInsight {
  const PerformanceInsight({
    required this.subject,
    required this.average,
    required this.previousAverage,
    this.history = const [],
  });

  factory PerformanceInsight.fromJson(Map<String, dynamic> json) {
    return PerformanceInsight(
      subject: '${json['subject'] ?? ''}',
      average: _asDouble(json['average']),
      previousAverage: _asDouble(
        json['previousAverage'],
        fallback: _asDouble(json['average']),
      ),
      history: json['history'] is List
          ? (json['history'] as List).map((v) => _asDouble(v).round()).toList()
          : const [],
    );
  }

  final String subject;
  final double average;
  final double previousAverage;
  final List<int> history;

  double get change => average - previousAverage;
  String get trend => change > 2
      ? 'Improving'
      : change < -2
          ? 'Declining'
          : 'Stable';
}

/// Approved/rejected leave surfaced to the student as an explanation.
///
/// TODO(mob-102): no `GET /api/leaves/mine` exists server-side; leave rows
/// are only embedded in the portal `notifications` feed (leave decisions
/// addressed to the student). Wire a dedicated endpoint when the backend
/// adds one instead of filtering notifications here.
class LeaveExplanation {
  const LeaveExplanation({
    required this.id,
    required this.title,
    required this.message,
    required this.time,
  });

  factory LeaveExplanation.fromNotification(Map<String, dynamic> json) {
    return LeaveExplanation(
      id: '${json['id'] ?? ''}',
      title: '${json['title'] ?? ''}',
      message: '${json['message'] ?? ''}',
      time: '${json['time'] ?? ''}',
    );
  }

  final String id;
  final String title;
  final String message;
  final String time;

  bool get isApproved => title == 'Leave approved';
}

/// One syllabus chapter with topic progress.
class SyllabusChapter {
  const SyllabusChapter({
    required this.id,
    required this.title,
    this.topics = const [],
  });

  factory SyllabusChapter.fromJson(Map<String, dynamic> json) {
    return SyllabusChapter(
      id: '${json['id'] ?? ''}',
      title: '${json['title'] ?? ''}',
      topics: json['topics'] is List
          ? (json['topics'] as List)
              .whereType<Map<String, dynamic>>()
              .map((t) => '${t['title'] ?? ''}')
              .where((t) => t.isNotEmpty)
              .toList()
          : const [],
    );
  }

  final String id;
  final String title;
  final List<String> topics;
}

/// Syllabus shared with one of the student's classes.
class SyllabusSummary {
  const SyllabusSummary({
    required this.id,
    required this.subject,
    required this.className,
    this.chapters = const [],
  });

  factory SyllabusSummary.fromJson(Map<String, dynamic> json) {
    return SyllabusSummary(
      id: '${json['id'] ?? ''}',
      subject: '${json['subject'] ?? ''}',
      className: '${json['className'] ?? ''}',
      chapters: json['chapters'] is List
          ? (json['chapters'] as List)
              .whereType<Map<String, dynamic>>()
              .map(SyllabusChapter.fromJson)
              .toList()
          : const [],
    );
  }

  final String id;
  final String subject;
  final String className;
  final List<SyllabusChapter> chapters;

  int get topicCount => chapters.fold(0, (n, c) => n + c.topics.length);
}

/// Full academics snapshot for the signed-in student.
class StudentPortalSnapshot {
  const StudentPortalSnapshot({
    required this.enrollmentId,
    this.results = const [],
    this.homework = const [],
    this.insights = const [],
    this.syllabi = const [],
    this.attendance = const [],
    this.leaveExplanations = const [],
    this.presentCount = 0,
    this.absentCount = 0,
    this.excusedCount = 0,
  });

  factory StudentPortalSnapshot.fromJson(Map<String, dynamic> json) {
    List<T> listOf<T>(
      String key,
      T Function(Map<String, dynamic>) fromJson,
    ) {
      final raw = json[key];
      if (raw is! List) return <T>[];
      return raw.whereType<Map<String, dynamic>>().map(fromJson).toList();
    }

    final profile = json['studentProfile'];
    final enrollmentId =
        profile is Map ? '${profile['enrollmentId'] ?? ''}' : '';

    final notifications = json['notifications'] is List
        ? (json['notifications'] as List).whereType<Map<String, dynamic>>()
        : const <Map<String, dynamic>>[];
    final leaveNotes = notifications
        .where((n) => '${n['id'] ?? ''}'.startsWith('leave-'))
        .map(LeaveExplanation.fromNotification)
        .toList();

    final counts = profile is Map && profile['attendanceCounts'] is Map
        ? (profile['attendanceCounts'] as Map)
        : const {};

    return StudentPortalSnapshot(
      enrollmentId: enrollmentId,
      results: listOf('results', AcademicResult.fromJson),
      homework: listOf('homework', HomeworkTask.fromJson),
      insights: listOf('insights', PerformanceInsight.fromJson),
      syllabi: listOf('syllabi', SyllabusSummary.fromJson),
      attendance: listOf('attendance', AttendanceEntry.fromJson),
      leaveExplanations: leaveNotes,
      presentCount: _asInt(counts['present']),
      absentCount: _asInt(counts['absent']),
      excusedCount: _asInt(counts['excused']),
    );
  }

  /// Server-resolved student record id — the only id the app may use for
  /// `GET /api/performance/student/:studentId`. Never accept ids from
  /// navigation arguments or other users' data.
  final String enrollmentId;
  final List<AcademicResult> results;
  final List<HomeworkTask> homework;
  final List<PerformanceInsight> insights;
  final List<SyllabusSummary> syllabi;
  final List<AttendanceEntry> attendance;
  final List<LeaveExplanation> leaveExplanations;
  final int presentCount;
  final int absentCount;
  final int excusedCount;

  int get totalMarked => presentCount + absentCount + excusedCount;
  double? get attendanceRate =>
      totalMarked == 0 ? null : presentCount / totalMarked;
}

/// Detail from `GET /api/performance/student/:studentId`: published scores,
//  per-subject insights, and teacher remarks visible to the student.
class StudentPerformanceDetail {
  const StudentPerformanceDetail({
    this.scores = const [],
    this.insights = const [],
    this.remarks = const [],
  });

  factory StudentPerformanceDetail.fromJson(Map<String, dynamic> json) {
    List<Map<String, dynamic>> listOf(String key) {
      final raw = json[key];
      if (raw is! List) return const [];
      return raw.whereType<Map<String, dynamic>>().toList();
    }

    return StudentPerformanceDetail(
      scores: listOf('scores').map(AcademicResult.fromJson).toList(),
      insights: listOf('insights').map((m) {
        final history = m['history'] is List
            ? (m['history'] as List).map((v) => _asDouble(v).round()).toList()
            : <int>[];
        final average = history.isEmpty
            ? 0.0
            : history.reduce((a, b) => a + b) / history.length;
        return PerformanceInsight(
          subject: '${m['subject'] ?? ''}',
          average: _asDouble(m['average'], fallback: average),
          previousAverage: _asDouble(m['average'], fallback: average),
          history: history,
        );
      }).toList(),
      remarks: listOf('remarks')
          .map((m) => TeacherRemark(
                subject: '${m['subject'] ?? ''}',
                message: '${m['message'] ?? ''}',
              ))
          .where((r) => r.message.isNotEmpty)
          .toList(),
    );
  }

  final List<AcademicResult> scores;
  final List<PerformanceInsight> insights;
  final List<TeacherRemark> remarks;
}

/// Teacher remark visible to the student/parent.
class TeacherRemark {
  const TeacherRemark({required this.subject, required this.message});
  final String subject;
  final String message;
}

double _asDouble(dynamic value, {double fallback = 0}) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? fallback;
  return fallback;
}

int _asInt(dynamic value) {
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? 0;
  return 0;
}
