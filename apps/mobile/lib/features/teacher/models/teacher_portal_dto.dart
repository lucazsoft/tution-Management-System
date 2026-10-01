/// Teacher workspace DTOs parsed from `GET /api/teacher/workspace`.
///
/// Verified read-only against `services/api/src/routes/teacher.ts`
/// (`router.get('/workspace')`; `/dashboard` is a 307 redirect to it).
/// Identity comes from the Better Auth session cookie; the client never
/// sends user, tenant or branch ids on reads.
///
/// Timetable note: there is no dedicated timetable endpoint. Daily classes
/// come from `todayClasses` (teacher sessions for today) and the weekly
/// view is derived client-side from `classes[].schedule`. Leave status
/// likewise comes from the embedded `leaves` array - no standalone
/// `GET /api/leaves/mine` exists (TODO if the backend adds one).
library;

class TeacherBranchRef {
  const TeacherBranchRef({
    required this.id,
    required this.name,
    this.address,
    this.radiusMeters,
    this.latitude,
    this.longitude,
  });

  final String id;
  final String name;
  final String? address;
  final double? radiusMeters;
  final double? latitude;
  final double? longitude;

  factory TeacherBranchRef.fromJson(Map<String, dynamic> json) {
    return TeacherBranchRef(
      id: _str(json['id']),
      name: _str(json['name']),
      address: json['address'] as String?,
      radiusMeters: _dbl(json['radiusMeters']),
      latitude: _dbl(json['latitude']),
      longitude: _dbl(json['longitude']),
    );
  }
}

class TeacherScheduleSlot {
  const TeacherScheduleSlot({
    required this.day,
    required this.start,
    required this.end,
    this.subject,
    this.room,
  });

  final String day;
  final String start;
  final String end;
  final String? subject;
  final String? room;

  String get label {
    final time = start.isEmpty || end.isEmpty ? '' : ' $start-$end';
    return '$day$time'.trim();
  }

  String get timeLabel => start.isEmpty || end.isEmpty ? '' : '$start-$end';

  bool matchesDay(String candidate) =>
      _dayKey(day) == _dayKey(candidate) && _dayKey(day).isNotEmpty;

  factory TeacherScheduleSlot.fromJson(Map<String, dynamic> json) {
    return TeacherScheduleSlot(
      day: _str(json['day']),
      start: _str(json['startTime'] ?? json['start']),
      end: _str(json['endTime'] ?? json['end']),
      subject: json['subject'] as String?,
      room: json['room'] as String?,
    );
  }
}

class TeacherTodayClass {
  const TeacherTodayClass({
    required this.sessionId,
    required this.classId,
    required this.className,
    required this.courseName,
    this.status,
    this.dailyUpdateSubmitted = false,
    this.slots = const [],
    this.scheduleLabel,
    this.branchName,
    this.checkInTime,
    this.checkOutTime,
  });

  final String sessionId;
  final String classId;
  final String className;
  final String courseName;
  final String? status;
  final bool dailyUpdateSubmitted;
  final List<TeacherScheduleSlot> slots;
  final String? scheduleLabel;
  final String? branchName;
  final DateTime? checkInTime;
  final DateTime? checkOutTime;

  factory TeacherTodayClass.fromJson(Map<String, dynamic> json) {
    final branch = json['branch'];
    final rawSchedule = json['schedule'] ?? json['class']?['schedule'];
    return TeacherTodayClass(
      sessionId: _str(json['sessionId']),
      classId: _str(json['classId']),
      className: _str(json['className']),
      courseName: _str(json['courseName']),
      status: json['status'] as String?,
      dailyUpdateSubmitted: json['dailyUpdateSubmitted'] == true,
      slots: _scheduleSlots(rawSchedule),
      scheduleLabel: _scheduleLabel(rawSchedule),
      branchName:
          branch is Map<String, dynamic> ? branch['name'] as String? : null,
      checkInTime: _date(json['checkInTime']),
      checkOutTime: _date(json['checkOutTime']),
    );
  }
}

class TeacherHomework {
  const TeacherHomework(
      {required this.id,
      required this.title,
      required this.subject,
      required this.deadline,
      this.description,
      this.contentUrl,
      this.createdAt});
  final String id;
  final String title;
  final String subject;
  final DateTime deadline;
  final String? description;
  final String? contentUrl;
  final DateTime? createdAt;
  factory TeacherHomework.fromJson(Map<String, dynamic> json) =>
      TeacherHomework(
          id: _str(json['id']),
          title: _str(json['title']),
          subject: _str(json['subject']),
          deadline:
              _date(json['deadline']) ?? DateTime.fromMillisecondsSinceEpoch(0),
          description: json['description'] as String?,
          contentUrl: json['contentUrl'] as String?,
          createdAt: _date(json['createdAt']));
}

class TeacherSyllabusTopic {
  const TeacherSyllabusTopic(
      {required this.id, required this.title, required this.status});
  final String id;
  final String title;
  final String status;
  factory TeacherSyllabusTopic.fromJson(Map<String, dynamic> json) =>
      TeacherSyllabusTopic(
          id: _str(json['id']),
          title: _str(json['title']),
          status: _str(json['status']));
}

class TeacherSyllabusChapter {
  const TeacherSyllabusChapter(
      {required this.id,
      required this.title,
      required this.status,
      required this.topics});
  final String id;
  final String title;
  final String status;
  final List<TeacherSyllabusTopic> topics;
  factory TeacherSyllabusChapter.fromJson(Map<String, dynamic> json) =>
      TeacherSyllabusChapter(
          id: _str(json['id']),
          title: _str(json['title']),
          status: _str(json['status']),
          topics: _mappedList(json['topics'], TeacherSyllabusTopic.fromJson));
}

class TeacherSyllabus {
  const TeacherSyllabus(
      {required this.id, required this.subject, required this.chapters});
  final String id;
  final String subject;
  final List<TeacherSyllabusChapter> chapters;
  factory TeacherSyllabus.fromJson(Map<String, dynamic> json) =>
      TeacherSyllabus(
          id: _str(json['id']),
          subject: _str(json['subject']),
          chapters:
              _mappedList(json['chapters'], TeacherSyllabusChapter.fromJson));
}

class TeacherResultDefinition {
  const TeacherResultDefinition(
      {required this.id,
      required this.classId,
      required this.title,
      required this.subject,
      required this.testDate});
  final String id;
  final String classId;
  final String title;
  final String subject;
  final DateTime testDate;
  factory TeacherResultDefinition.fromJson(Map<String, dynamic> json) =>
      TeacherResultDefinition(
          id: _str(json['id']),
          classId: _str(json['classId']),
          title: _str(json['title']),
          subject: _str(json['subject']),
          testDate: _date(json['testDate']) ?? DateTime.now());
}

class TeacherAcademicEvent {
  const TeacherAcademicEvent(
      {required this.id,
      required this.title,
      required this.type,
      required this.startDate,
      this.endDate,
      this.description = ''});
  final String id;
  final String title;
  final String type;
  final DateTime startDate;
  final DateTime? endDate;
  final String description;
  factory TeacherAcademicEvent.fromJson(Map<String, dynamic> json) =>
      TeacherAcademicEvent(
          id: _str(json['id']),
          title: _str(json['title']),
          type: _str(json['eventType']),
          startDate: _date(json['startDate']) ?? DateTime.now(),
          endDate: _date(json['endDate']),
          description: _str(json['description']));
}

class TeacherPendingUpdate {
  const TeacherPendingUpdate({
    required this.sessionId,
    required this.classId,
    required this.className,
    required this.courseName,
    this.date,
  });

  final String sessionId;
  final String classId;
  final String className;
  final String courseName;
  final DateTime? date;

  factory TeacherPendingUpdate.fromJson(Map<String, dynamic> json) {
    return TeacherPendingUpdate(
      sessionId: _str(json['sessionId']),
      classId: _str(json['classId']),
      className: _str(json['className']),
      courseName: _str(json['courseName']),
      date: _date(json['date']),
    );
  }
}

class TeacherClassInfo {
  const TeacherClassInfo({
    required this.id,
    required this.name,
    required this.subject,
    this.slots = const [],
    this.scheduleLabel,
    this.branch,
    this.studentCount = 0,
    this.students = const [],
    this.attendance = const [],
    this.homework = const [],
    this.syllabi = const [],
  });

  final String id;
  final String name;
  final String subject;
  final List<TeacherScheduleSlot> slots;
  final String? scheduleLabel;
  final TeacherBranchRef? branch;
  final int studentCount;
  final List<TeacherStudent> students;
  final List<TeacherClassAttendance> attendance;
  final List<TeacherHomework> homework;
  final List<TeacherSyllabus> syllabi;

  bool isScheduledOn(String day) => slots.any((slot) => slot.matchesDay(day));

  factory TeacherClassInfo.fromJson(Map<String, dynamic> json) {
    final branch = json['branch'];
    final students = json['students'];
    return TeacherClassInfo(
      id: _str(json['id']),
      name: _str(json['name']),
      subject: _str(json['subject']),
      slots: _scheduleSlots(json['schedule']),
      scheduleLabel: _scheduleLabel(json['schedule']),
      branch: branch is Map<String, dynamic>
          ? TeacherBranchRef.fromJson(branch)
          : null,
      studentCount: students is List ? students.length : 0,
      students: students is List
          ? [
              for (final student in students)
                if (student is Map<String, dynamic>)
                  TeacherStudent.fromJson(student),
            ]
          : const [],
      attendance: json['attendance'] is List
          ? [
              for (final record in json['attendance'] as List)
                if (record is Map<String, dynamic>)
                  TeacherClassAttendance.fromJson(record),
            ]
          : const [],
      homework: _mappedList(json['homework'], TeacherHomework.fromJson),
      syllabi: _mappedList(json['syllabi'], TeacherSyllabus.fromJson),
    );
  }
}

class TeacherStudent {
  const TeacherStudent({
    required this.id,
    required this.name,
    required this.status,
  });

  final String id;
  final String name;
  final String status;

  bool get isFeeBlocked => status == 'BLOCKED';

  factory TeacherStudent.fromJson(Map<String, dynamic> json) {
    return TeacherStudent(
      id: _str(json['id']),
      name: _str(json['name']),
      status: _str(json['status']).toUpperCase(),
    );
  }
}

class TeacherMessageContact {
  const TeacherMessageContact(
      {required this.studentId,
      required this.studentName,
      required this.gradeName,
      required this.parentId,
      required this.parentName,
      this.lastMessage = '',
      this.lastMessageAt,
      this.unreadCount = 0});
  final String studentId, studentName, gradeName, parentId, parentName;
  final String lastMessage;
  final DateTime? lastMessageAt;
  final int unreadCount;
  factory TeacherMessageContact.fromJson(Map<String, dynamic> json) =>
      TeacherMessageContact(
          studentId: _str(json['studentId']),
          studentName: _str(json['studentName']),
          gradeName: _str(json['gradeName']),
          parentId: _str(json['parentId']),
          parentName: _str(json['parentName']),
          lastMessage: _str(json['lastMessage']),
          lastMessageAt: _date(json['lastMessageAt']),
          unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0);
}

class TeacherMessageItem {
  const TeacherMessageItem(
      {required this.id,
      required this.senderId,
      required this.text,
      required this.createdAt});
  final String id, senderId, text;
  final DateTime? createdAt;
  factory TeacherMessageItem.fromJson(Map<String, dynamic> json) =>
      TeacherMessageItem(
          id: _str(json['id']),
          senderId: _str(json['senderId']),
          text: _str(json['messageText']),
          createdAt: _date(json['createdAt']));
}

class TeacherClassAttendance {
  const TeacherClassAttendance({
    required this.studentId,
    required this.status,
    this.date,
  });

  final String studentId;
  final String status;
  final DateTime? date;

  factory TeacherClassAttendance.fromJson(Map<String, dynamic> json) {
    return TeacherClassAttendance(
      studentId: _str(json['studentId']),
      status: _str(json['status']).toUpperCase(),
      date: _date(json['date']),
    );
  }
}

class TeacherLeaveEntry {
  const TeacherLeaveEntry({
    required this.id,
    required this.leaveType,
    required this.status,
    this.reason,
    this.startDate,
    this.endDate,
  });

  final String id;
  final String leaveType;
  final String status;
  final String? reason;
  final DateTime? startDate;
  final DateTime? endDate;

  bool get isPending => status == 'PENDING' || status == 'APPROVED_LEVEL1';

  factory TeacherLeaveEntry.fromJson(Map<String, dynamic> json) {
    return TeacherLeaveEntry(
      id: _str(json['id']),
      leaveType: _str(json['leaveType']),
      status: _str(json['status']),
      reason: json['reason'] as String?,
      startDate: _date(json['startDate']),
      endDate: _date(json['endDate']),
    );
  }
}

class TeacherStamp {
  const TeacherStamp(
      {required this.stampType, this.timestamp, this.branchName});

  final String stampType;
  final DateTime? timestamp;
  final String? branchName;

  factory TeacherStamp.fromJson(Map<String, dynamic> json) {
    return TeacherStamp(
      stampType: _str(json['stampType']),
      timestamp: _date(json['timestamp']),
      branchName: json['branchName'] as String?,
    );
  }
}

/// Consolidated teacher workspace payload.
class TeacherWorkspace {
  const TeacherWorkspace({
    required this.teacherName,
    required this.designation,
    required this.branches,
    required this.todayClasses,
    required this.pendingUpdates,
    required this.classes,
    required this.leaves,
    required this.stamps,
    this.resultDefinitions = const [],
    this.checkedIn = false,
    this.lastStampType,
    this.lastStampAt,
    this.attendanceRate,
    this.presentDays,
    this.requiredDays,
    this.totalSessions,
    this.updateCompliance,
    this.assignedClasses,
  });

  final String teacherName;
  final String designation;
  final List<TeacherBranchRef> branches;
  final List<TeacherTodayClass> todayClasses;
  final List<TeacherPendingUpdate> pendingUpdates;
  final List<TeacherClassInfo> classes;
  final List<TeacherLeaveEntry> leaves;
  final List<TeacherStamp> stamps;
  final List<TeacherResultDefinition> resultDefinitions;
  int get pendingUpdateCount => pendingUpdates.length;
  final bool checkedIn;
  final String? lastStampType;
  final DateTime? lastStampAt;
  final int? attendanceRate;
  final int? presentDays;
  final int? requiredDays;
  final int? totalSessions;
  final int? updateCompliance;
  final int? assignedClasses;

  factory TeacherWorkspace.fromJson(Map<String, dynamic> json) {
    final teacher = json['teacher'] is Map<String, dynamic>
        ? json['teacher'] as Map<String, dynamic>
        : <String, dynamic>{};
    final attendance = json['attendance'] is Map<String, dynamic>
        ? json['attendance'] as Map<String, dynamic>
        : <String, dynamic>{};
    final stats = json['statistics'] is Map<String, dynamic>
        ? json['statistics'] as Map<String, dynamic>
        : <String, dynamic>{};
    List<T> listOf<T>(Object? raw, T Function(Map<String, dynamic>) f) {
      if (raw is! List) return <T>[];
      return [
        for (final e in raw)
          if (e is Map<String, dynamic>) f(e)
      ];
    }

    final branchMaps = teacher['branches'];
    return TeacherWorkspace(
      teacherName: (teacher['name'] as String?) ?? 'Teacher',
      designation: (teacher['designation'] as String?) ?? 'Teacher',
      branches: listOf<TeacherBranchRef>(branchMaps, TeacherBranchRef.fromJson),
      todayClasses: listOf<TeacherTodayClass>(
          json['todayClasses'], TeacherTodayClass.fromJson),
      pendingUpdates: listOf<TeacherPendingUpdate>(
          json['pendingUpdates'], TeacherPendingUpdate.fromJson),
      classes:
          listOf<TeacherClassInfo>(json['classes'], TeacherClassInfo.fromJson),
      leaves:
          listOf<TeacherLeaveEntry>(json['leaves'], TeacherLeaveEntry.fromJson),
      stamps: listOf<TeacherStamp>(json['stamps'], TeacherStamp.fromJson),
      resultDefinitions: listOf<TeacherResultDefinition>(
          json['resultDefinitions'], TeacherResultDefinition.fromJson),
      checkedIn: attendance['checkedIn'] == true,
      lastStampType: attendance['lastStampType'] as String?,
      lastStampAt: _date(attendance['lastStampAt']),
      attendanceRate: (stats['attendanceRate'] as num?)?.toInt(),
      presentDays: (stats['presentDays'] as num?)?.toInt(),
      requiredDays: (stats['requiredDays'] as num?)?.toInt(),
      totalSessions: (stats['totalSessions'] as num?)?.toInt(),
      updateCompliance: (stats['updateCompliance'] as num?)?.toInt(),
      assignedClasses: (stats['assignedClasses'] as num?)?.toInt(),
    );
  }
}

List<T> _mappedList<T>(Object? raw, T Function(Map<String, dynamic>) parser) {
  if (raw is! List) return <T>[];
  return [
    for (final item in raw)
      if (item is Map<String, dynamic>) parser(item)
  ];
}

String _str(Object? v) => v?.toString() ?? '';

double? _dbl(Object? v) => v is num ? v.toDouble() : null;

DateTime? _date(Object? v) {
  if (v is String && v.isNotEmpty) return DateTime.tryParse(v);
  return null;
}

List<TeacherScheduleSlot> _scheduleSlots(Object? raw) {
  if (raw is! List) return const [];
  return [
    for (final item in raw)
      if (item is Map<String, dynamic>) TeacherScheduleSlot.fromJson(item),
  ];
}

String? _scheduleLabel(Object? raw) {
  if (raw is String) return raw.trim().isEmpty ? null : raw.trim();
  final slots = _scheduleSlots(raw);
  if (slots.isEmpty) return null;
  return slots.map((slot) => slot.label).join(', ');
}

String _dayKey(String value) {
  final normalized = value.trim().toLowerCase();
  if (normalized.length < 3) return normalized;
  return normalized.substring(0, 3);
}
