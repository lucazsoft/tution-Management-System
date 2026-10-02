export type ParentView =
  | 'home'
  | 'timetable'
  | 'attendance'
  | 'performance'
  | 'syllabus'
  | 'messages'
  | 'appointments'
  | 'leave'
  | 'fees'
  | 'certificates'
  | 'calendar'
  | 'notifications'
  | 'profile';

export type ParentTone = 'success' | 'warning' | 'error' | 'info' | 'gold';
export type AttendanceState = 'Present' | 'Absent' | 'Absent (Excused)';
export type InvoiceState = 'Paid' | 'Upcoming' | 'Due soon' | 'Overdue';
export type AppointmentState = 'Requested' | 'Approved' | 'Rejected' | 'Alternative proposed' | 'Confirmed';
export type LeaveState = 'Pending' | 'Approved' | 'Rejected' | 'Emergency departure';

export interface ParentChild {
  id: string;
  name: string;
  initials: string;
  grade: string;
  branch: string;
  rollNumber: string;
  blocked: boolean;
  attendanceRate: number;
  outstanding: number;
  branchId?: string;
  photoUrl?: string | null;
}

export interface ParentProfile {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  emailVerified: boolean;
  memberSince: string;
}

export interface ParentSession {
  id: string;
  childId: string;
  time: string;
  endTime: string;
  subject: string;
  teacher: string;
  room: string;
  type: string;
}

export interface ParentAttendance {
  id: string;
  childId: string;
  date: string;
  subject: string;
  session: string;
  state: AttendanceState;
}

export interface ParentRemark {
  id: string;
  childId: string;
  subject: string;
  author: string;
  message: string;
  date: string;
  signal: 'Improving' | 'Stable' | 'Needs support';
  parentVisible: boolean;
}

export interface ParentTeacher {
  id: string;
  childId: string;
  name: string;
  subject: string;
  initials: string;
  role: 'TEACHER' | 'BRANCH_ADMIN';
}

export interface ParentMessage {
  id: string;
  childId: string;
  teacherId: string;
  sender: 'Parent' | 'Teacher';
  text: string;
  time: string;
}

export interface ParentAppointment {
  id: string;
  childId: string;
  teacher: string;
  subject: string;
  requestedTime: string;
  alternativeTime?: string;
  responseMessage?: string;
  responseDescription?: string;
  state: AppointmentState;
  group: boolean;
  originalAppointmentId?: string;
  participants: Array<{ id: string; name: string; approval: 'PENDING' | 'APPROVED' | 'REJECTED' }>;
}

export interface ParentLeave {
  id: string;
  childId: string;
  dates: string;
  reason: string;
  state: LeaveState;
  detail: string;
}

export interface ParentInvoice {
  id: string;
  childId: string;
  cycle: string;
  dueDate: string;
  invoiceType: 'ADMISSION' | 'TUITION' | 'SUBJECT' | 'ACTIVITY';
  paymentDate: string | null;
  state: InvoiceState;
  reference: string;
  netPayable: number;
  qrAvailable: boolean;
  document: InvoiceDocumentData;
  lines: Array<{ label: string; amount: number }>;
}

export interface ParentCertificate {
  id: string;
  childId: string;
  title: string;
  course: string;
  issuedDate: string;
  fileName: string;
  pdfUrl?: string;
  htmlUrl?: string;
}

export interface ParentEvent {
  id: string;
  childId: string;
  day: string;
  month: string;
  date: string;
  title: string;
  kind: 'Holiday' | 'Exam' | 'Ceremony' | 'Fee due';
  details: string;
}

export interface ParentNotification {
  id: string;
  childId: string;
  title: string;
  message: string;
  time: string;
  icon: string;
  destination: ParentView;
  channels: Array<'Push' | 'SMS'>;
  urgent: boolean;
  unread: boolean;
  occurredAt: string;
}

export interface ParentPortalDataset {
  generatedAt: string;
  bookingWindowHours: number;
  profile: ParentProfile;
  children: ParentChild[];
  selected: ParentChild | null;
  billing: { billingMode: 'GRADE' | 'SUBJECT' | null; setupStatus: 'READY' | 'INCOMPLETE'; blockers: string[]; recurringTotal: number; lines: Array<{ type: 'GRADE' | 'SUBJECT' | 'ACTIVITY'; sourceId: string; label: string; className?: string; amount: number; status: string }> };
  enrollmentAccess: { status: 'PENDING' | 'ACTIVE' | 'EXPIRED'; validFrom: string | null; validUntil: string | null };
  sessions: ParentSession[];
  attendance: ParentAttendance[];
  remarks: ParentRemark[];
  teachers: ParentTeacher[];
  messages: ParentMessage[];
  appointments: ParentAppointment[];
  leaves: ParentLeave[];
  invoices: ParentInvoice[];
  certificates: ParentCertificate[];
  events: ParentEvent[];
  notifications: ParentNotification[];
  syllabi?: ParentSyllabus[];
}

export interface NepalPayPayload {
  invoiceId: string;
  merchantName: string;
  merchantCity: string;
  amount: number;
  currency: string;
  currencyCode: string;
  studentName: string;
  qrString: string;
}

export interface ParentSyllabusTopicLog {
  id: string;
  status: string;
  notes?: string | null;
  logDate: string;
}

export interface ParentSyllabusTopic {
  id: string;
  title: string;
  position: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | string;
  logs: ParentSyllabusTopicLog[];
}

export interface ParentSyllabusChapter {
  id: string;
  title: string;
  position: number;
  status: 'LEFT' | 'IN_PROGRESS' | 'COMPLETED' | string;
  topics: ParentSyllabusTopic[];
}

export interface ParentSyllabus {
  id: string;
  className: string;
  subject: string;
  teacherName?: string;
  chapters: ParentSyllabusChapter[];
  dailyLogs?: Array<{
    id: string;
    chapterId?: string | null;
    status: string;
    notes?: string | null;
    logDate: string;
  }>;
}

import type { InvoiceDocumentData } from '../../components/InvoiceDocument';
