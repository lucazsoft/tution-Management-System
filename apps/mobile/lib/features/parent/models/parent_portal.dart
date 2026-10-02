/// Parent portal DTOs mirroring `GET /api/parent/portal`
/// (see `services/api/src/routes/parent.ts`, read-only here).
///
/// Identity comes from the Better Auth session cookie; the optional
/// `studentId` query parameter is a *selector only* — the server returns 404
/// unless the student is linked to the signed-in parent.
library;

double _num(dynamic value) =>
    value is num ? value.toDouble() : double.tryParse('$value') ?? 0;

String _str(dynamic value, [String fallback = '']) =>
    value == null ? fallback : '$value';

DateTime? _date(dynamic iso, dynamic label) {
  final parsed = DateTime.tryParse(_str(iso));
  if (parsed != null) return parsed;
  final parts = _str(label).replaceAll(',', '').split(RegExp(r'\s+'));
  if (parts.length < 3 || parts[1].length < 3) return null;
  const months = {
    'jan': 1,
    'feb': 2,
    'mar': 3,
    'apr': 4,
    'may': 5,
    'jun': 6,
    'jul': 7,
    'aug': 8,
    'sep': 9,
    'oct': 10,
    'nov': 11,
    'dec': 12,
  };
  final day = int.tryParse(parts[0]);
  final month = months[parts[1].toLowerCase().substring(0, 3)];
  final year = int.tryParse(parts[2]);
  return day == null || month == null || year == null
      ? null
      : DateTime(year, month, day);
}

/// One linked child summary (`children[]` in the portal payload).
class ParentChild {
  const ParentChild({
    required this.id,
    required this.name,
    required this.initials,
    required this.grade,
    required this.branch,
    required this.branchId,
    required this.rollNumber,
    required this.blocked,
    required this.attendanceRate,
    required this.outstanding,
  });

  final String id;
  final String name;
  final String initials;
  final String grade;
  final String branch;
  final String branchId;
  final String rollNumber;
  final bool blocked;
  final int attendanceRate;
  final double outstanding;

  factory ParentChild.fromJson(Map<String, dynamic> json) => ParentChild(
        id: _str(json['id']),
        name: _str(json['name'], 'Child'),
        initials: _str(json['initials']),
        grade: _str(json['grade'], 'Grade not assigned'),
        branch: _str(json['branch'], 'Branch not assigned'),
        branchId: _str(json['branchId']),
        rollNumber: _str(json['rollNumber']),
        blocked: json['blocked'] == true,
        attendanceRate: (json['attendanceRate'] as num?)?.toInt() ?? 0,
        outstanding: _num(json['outstanding']),
      );
}

class ParentContact {
  const ParentContact(
      {required this.id,
      required this.childId,
      required this.name,
      required this.subject,
      required this.initials,
      required this.role});
  factory ParentContact.fromJson(Map<String, dynamic> json) => ParentContact(
      id: _str(json['id']),
      childId: _str(json['childId']),
      name: _str(json['name']),
      subject: _str(json['subject']),
      initials: _str(json['initials']),
      role: _str(json['role'], 'TEACHER'));
  final String id;
  final String childId;
  final String name;
  final String subject;
  final String initials;
  final String role;
}

class ParentMessageItem {
  const ParentMessageItem(
      {required this.id,
      required this.childId,
      required this.teacherId,
      required this.sender,
      required this.text,
      required this.time,
      this.occurredAt});
  factory ParentMessageItem.fromJson(Map<String, dynamic> json) =>
      ParentMessageItem(
          id: _str(json['id']),
          childId: _str(json['childId']),
          teacherId: _str(json['teacherId']),
          sender: _str(json['sender']),
          text: _str(json['text']),
          time: _str(json['time']),
          occurredAt: DateTime.tryParse(_str(json['occurredAt'])));
  final String id;
  final String childId;
  final String teacherId;
  final String sender;
  final String text;
  final String time;
  final DateTime? occurredAt;
}

class ParentAppointmentItem {
  const ParentAppointmentItem(
      {required this.id,
      required this.childId,
      required this.teacher,
      required this.subject,
      required this.requestedTime,
      required this.state,
      this.scheduledAt,
      this.alternativeTime,
      this.alternativeAt,
      this.proposalFrom,
      this.responseMessage,
      this.participants = const [],
      this.isGroup = false});
  factory ParentAppointmentItem.fromJson(Map<String, dynamic> json) =>
      ParentAppointmentItem(
          id: _str(json['id']),
          childId: _str(json['childId']),
          teacher: _str(json['teacher']),
          subject: _str(json['subject']),
          requestedTime: _str(json['requestedTime']),
          state: _str(json['state']),
          scheduledAt: DateTime.tryParse(_str(json['scheduledAt'])),
          alternativeTime: json['alternativeTime']?.toString(),
          alternativeAt: DateTime.tryParse(_str(json['alternativeAt'])),
          proposalFrom: json['proposalFrom']?.toString(),
          responseMessage: json['responseMessage']?.toString(),
          isGroup: json['group'] == true,
          participants: [
            for (final item in (json['participants'] as List? ?? const []))
              if (item is Map<String, dynamic>)
                ParentAppointmentParticipant.fromJson(item),
          ]);
  final String id;
  final String childId;
  final String teacher;
  final String subject;
  final String requestedTime;
  final String state;
  final DateTime? scheduledAt;
  final String? alternativeTime;
  final DateTime? alternativeAt;
  final String? proposalFrom;
  final String? responseMessage;
  final List<ParentAppointmentParticipant> participants;
  final bool isGroup;
}

class ParentAppointmentParticipant {
  const ParentAppointmentParticipant({
    required this.name,
    required this.approval,
  });
  factory ParentAppointmentParticipant.fromJson(Map<String, dynamic> json) =>
      ParentAppointmentParticipant(
        name: _str(json['name'], 'Staff member'),
        approval: _str(json['approval'], 'PENDING'),
      );
  final String name;
  final String approval;
}

/// One of today's class sessions for the selected child.
class ParentSession {
  const ParentSession({
    required this.id,
    required this.time,
    required this.endTime,
    required this.subject,
    required this.teacher,
    required this.room,
    required this.type,
    this.day = '',
  });

  final String id;
  final String time;
  final String endTime;
  final String subject;
  final String teacher;
  final String room;
  final String type;
  final String day;

  factory ParentSession.fromJson(Map<String, dynamic> json) => ParentSession(
        id: _str(json['id']),
        time: _str(json['time'], '—'),
        endTime: _str(json['endTime'], '—'),
        subject: _str(json['subject'], 'Class'),
        teacher: _str(json['teacher'], 'Teacher not assigned'),
        room: _str(json['room']),
        type: _str(json['type'], 'Regular'),
        day: _str(json['day']),
      );
}

/// One attendance record for the selected child (latest 60, newest first).
class ParentAttendanceRecord {
  const ParentAttendanceRecord({
    required this.id,
    required this.date,
    required this.subject,
    required this.session,
    required this.state,
    this.occurredAt,
  });

  final String id;
  final String date;
  final String subject;
  final String session;
  final String state;
  final DateTime? occurredAt;

  bool get isPresent => state.toLowerCase() == 'present';
  bool get isAbsent => state.toLowerCase().startsWith('absent');

  factory ParentAttendanceRecord.fromJson(Map<String, dynamic> json) =>
      ParentAttendanceRecord(
        id: _str(json['id']),
        date: _str(json['date']),
        subject: _str(json['subject']),
        session: _str(json['session']),
        state: _str(json['state'], 'Present'),
        occurredAt: _date(json['occurredAt'], json['date']),
      );
}

/// One line inside an invoice breakdown.
class ParentInvoiceLine {
  const ParentInvoiceLine({required this.label, required this.amount});

  final String label;
  final double amount;

  factory ParentInvoiceLine.fromJson(Map<String, dynamic> json) =>
      ParentInvoiceLine(
        label: _str(json['label']),
        amount: _num(json['amount']),
      );
}

/// One invoice for the selected child (latest 24, newest first).
class ParentInvoice {
  const ParentInvoice({
    required this.id,
    required this.cycle,
    required this.dueDate,
    required this.state,
    required this.reference,
    required this.netPayable,
    required this.qrAvailable,
    required this.lines,
  });

  final String id;
  final String cycle;
  final String dueDate;
  final String state;
  final String reference;
  final double netPayable;
  final bool qrAvailable;
  final List<ParentInvoiceLine> lines;

  bool get isPaid => state.toLowerCase() == 'paid';
  bool get isDue => !isPaid;

  factory ParentInvoice.fromJson(Map<String, dynamic> json) => ParentInvoice(
        id: _str(json['id']),
        cycle: _str(json['cycle']),
        dueDate: _str(json['dueDate']),
        state: _str(json['state'], 'Upcoming'),
        reference: _str(json['reference']),
        netPayable: _num(json['netPayable']),
        qrAvailable: json['qrAvailable'] == true,
        lines: [
          for (final line in (json['lines'] as List? ?? const []))
            if (line is Map<String, dynamic>) ParentInvoiceLine.fromJson(line),
        ],
      );
}

/// One parent-visible remark or derived performance signal.
class ParentRemark {
  const ParentRemark({
    required this.id,
    required this.subject,
    required this.author,
    required this.message,
    required this.date,
    required this.signal,
  });

  final String id;
  final String subject;
  final String author;
  final String message;
  final String date;
  final String signal;

  factory ParentRemark.fromJson(Map<String, dynamic> json) => ParentRemark(
        id: _str(json['id']),
        subject: _str(json['subject']),
        author: _str(json['author']),
        message: _str(json['message']),
        date: _str(json['date']),
        signal: _str(json['signal'], 'Stable'),
      );
}

/// One leave record for the selected child.
class ParentLeaveRecord {
  const ParentLeaveRecord({
    required this.id,
    required this.dates,
    required this.reason,
    required this.state,
    required this.detail,
  });

  final String id;
  final String dates;
  final String reason;
  final String state;
  final String detail;

  factory ParentLeaveRecord.fromJson(Map<String, dynamic> json) =>
      ParentLeaveRecord(
        id: _str(json['id']),
        dates: _str(json['dates']),
        reason: _str(json['reason']),
        state: _str(json['state'], 'Pending'),
        detail: _str(json['detail']),
      );
}

/// One academic/fee event visible to the parent.
class ParentEventItem {
  const ParentEventItem({
    required this.id,
    required this.day,
    required this.month,
    required this.date,
    required this.title,
    required this.kind,
    required this.details,
  });

  final String id;
  final String day;
  final String month;
  final String date;
  final String title;
  final String kind;
  final String details;

  factory ParentEventItem.fromJson(Map<String, dynamic> json) =>
      ParentEventItem(
        id: _str(json['id']),
        day: _str(json['day']),
        month: _str(json['month']),
        date: _str(json['date']),
        title: _str(json['title']),
        kind: _str(json['kind']),
        details: _str(json['details']),
      );
}

class ParentHomeworkItem {
  const ParentHomeworkItem({
    required this.id,
    required this.subject,
    required this.title,
    required this.teacher,
    required this.dueDate,
    required this.completed,
  });

  factory ParentHomeworkItem.fromJson(Map<String, dynamic> json) =>
      ParentHomeworkItem(
        id: _str(json['id']),
        subject: _str(json['subject'], 'Subject'),
        title: _str(json['title'], 'Homework'),
        teacher: _str(json['teacher'], 'Teacher'),
        dueDate: _str(json['dueDate']),
        completed: json['completed'] == true,
      );

  final String id;
  final String subject;
  final String title;
  final String teacher;
  final String dueDate;
  final bool completed;
}

/// One parent notification (fee, attendance, appointment, certificate).
class ParentNotification {
  const ParentNotification({
    required this.id,
    required this.title,
    required this.message,
    required this.time,
    required this.destination,
    required this.urgent,
    required this.unread,
  });

  final String id;
  final String title;
  final String message;
  final String time;
  final String destination;
  final bool urgent;
  final bool unread;

  factory ParentNotification.fromJson(Map<String, dynamic> json) =>
      ParentNotification(
        id: _str(json['id']),
        title: _str(json['title']),
        message: _str(json['message']),
        time: _str(json['time']),
        destination: _str(json['destination']),
        urgent: json['urgent'] == true,
        unread: json['unread'] == true,
      );
}

/// Aggregated parent portal snapshot for the selected child.
class ParentPortal {
  const ParentPortal({
    required this.children,
    required this.selected,
    required this.sessions,
    required this.timetableSessions,
    required this.attendance,
    required this.remarks,
    required this.leaves,
    required this.invoices,
    required this.events,
    required this.homework,
    required this.notifications,
    required this.contacts,
    required this.messages,
    required this.appointments,
    required this.bookingWindowHours,
  });

  final List<ParentChild> children;
  final ParentChild? selected;
  final List<ParentSession> sessions;
  final List<ParentSession> timetableSessions;
  final List<ParentAttendanceRecord> attendance;
  final List<ParentRemark> remarks;
  final List<ParentLeaveRecord> leaves;
  final List<ParentInvoice> invoices;
  final List<ParentEventItem> events;
  final List<ParentHomeworkItem> homework;
  final List<ParentNotification> notifications;
  final List<ParentContact> contacts;
  final List<ParentMessageItem> messages;
  final List<ParentAppointmentItem> appointments;
  final int bookingWindowHours;

  static List<T> _list<T>(
    dynamic json,
    T Function(Map<String, dynamic>) fromJson,
  ) =>
      [
        for (final item in (json as List? ?? const []))
          if (item is Map<String, dynamic>) fromJson(item),
      ];

  factory ParentPortal.fromJson(Map<String, dynamic> json) => ParentPortal(
        children: _list(json['children'], ParentChild.fromJson),
        selected: json['selected'] is Map<String, dynamic>
            ? ParentChild.fromJson(
                (json['selected'] as Map<String, dynamic>),
              )
            : null,
        sessions: _list(json['sessions'], ParentSession.fromJson),
        timetableSessions:
            _list(json['timetableSessions'], ParentSession.fromJson),
        attendance: _list(json['attendance'], ParentAttendanceRecord.fromJson),
        remarks: _list(json['remarks'], ParentRemark.fromJson),
        leaves: _list(json['leaves'], ParentLeaveRecord.fromJson),
        invoices: _list(json['invoices'], ParentInvoice.fromJson),
        events: _list(json['events'], ParentEventItem.fromJson),
        homework: _list(json['homework'], ParentHomeworkItem.fromJson),
        notifications:
            _list(json['notifications'], ParentNotification.fromJson),
        contacts: _list(json['teachers'], ParentContact.fromJson),
        messages: _list(json['messages'], ParentMessageItem.fromJson),
        appointments:
            _list(json['appointments'], ParentAppointmentItem.fromJson),
        bookingWindowHours: (json['bookingWindowHours'] as num?)?.toInt() ?? 24,
      );

  int get presentCount => attendance.where((record) => record.isPresent).length;
  int get absentCount => attendance.where((record) => record.isAbsent).length;

  double get outstandingTotal => invoices
      .where((invoice) => invoice.isDue)
      .fold(0, (sum, invoice) => sum + invoice.netPayable);

  int get unreadCount => notifications.where((item) => item.unread).length;
}
