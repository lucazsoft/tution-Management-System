export type CourseType = 'Regular' | 'Music' | 'Short-term' | 'Long-term' | 'Personalized';
export type AttendanceState = 'Present' | 'Absent' | 'Absent (Excused)';
export type FeeState = 'Upcoming' | 'Due soon' | 'Overdue' | 'Paid';
export type EventKind = 'Holiday' | 'Exam' | 'Ceremony' | 'Fee due';

export interface StudentSession {
  id: string;
  day?: string;
  time: string;
  endTime: string;
  subject: string;
  teacher: string;
  room: string;
  type: CourseType;
  className?: string;
}

export interface HomeworkItem {
  id: string;
  subject: string;
  title: string;
  teacher: string;
  dueLabel: string;
  urgency: 'soon' | 'normal' | 'overdue';
  completed: boolean;
  description?: string;
  contentUrl?: string;
  submissionUrl?: string;
  teacherRemarks?: string;
}

export interface TestResult {
  id: string;
  subject: string;
  assessment: string;
  score: number;
  maximum: number;
  classAverage: number;
  publishedLabel: string;
  teacherRemarks?: string;
  passMarks?: number;
  percentile?: number;
  resultSheetUrl?: string;
}

export interface StudentSyllabus {
  id: string;
  className: string;
  subject: string;
  teacherName?: string;
  chapters: Array<{ id: string; title: string; position: number; status: 'IN_PROGRESS' | 'COMPLETED' | 'LEFT'; topics: Array<{ id: string; title: string; position: number; status: 'IN_PROGRESS' | 'COMPLETED' | 'LEFT'; logs: Array<{ id: string; status: string; notes?: string; logDate: string }> }> }>;
  dailyLogs: Array<{ id: string; chapterId: string; status: string; notes?: string; logDate: string }>;
}

export interface SubjectInsight {
  subject: string;
  average: number;
  previousAverage: number;
  history: number[];
}

export interface AttendanceRecord {
  id: string;
  date: string;
  subject: string;
  session: string;
  state: AttendanceState;
}

export interface InvoiceLine {
  label: string;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceType: 'ADMISSION' | 'TUITION' | 'SUBJECT' | 'ACTIVITY';
  paymentDate: string | null;
  cycle: string;
  dueDate: string;
  state: FeeState;
  lines: InvoiceLine[];
  netPayable: number;
  qrAvailable: boolean;
  paymentReference?: string;
  document: InvoiceDocumentData;
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

export interface AcademicEvent {
  id: string;
  date: string;
  day: string;
  month: string;
  title: string;
  kind: EventKind;
  details: string;
}

export interface Certificate {
  id: string;
  title: string;
  course: string;
  issuedDate: string;
  fileName: string;
  pdfUrl?: string;
  htmlUrl?: string;
}

export interface StudentNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  icon: string;
  destination: string;
  unread: boolean;
  occurredAt: string;
}

export interface StudentProfile {
  name: string;
  initials: string;
  photoUrl?: string | null;
  institution: string;
  grade: string;
  branch: string;
  branchAddress?: string;
  rollNumber: string;
  enrollmentId: string;
  academicYear: string;
  validUntil: string;
  blocked: boolean;
  outstanding: number;
  attendanceRate?: number | null;
  attendanceCounts?: {
    present: number;
    absent: number;
    excused: number;
  };
}

export interface StudentPortalDataset {
  generatedAt: string;
  studentProfile: StudentProfile;
  todaySessions: StudentSession[];
  weeklySessions: StudentSession[];
  homework: HomeworkItem[];
  results: TestResult[];
  insights: SubjectInsight[];
  syllabi: StudentSyllabus[];
  attendance: AttendanceRecord[];
  invoices: Invoice[];
  events: AcademicEvent[];
  certificates: Certificate[];
  notifications: StudentNotification[];
}

export function invoiceTotal(invoice: Invoice): number {
  return invoice.netPayable;
}

export function resultPercentage(result: TestResult): number {
  return result.maximum === 0 ? 0 : Math.round((result.score / result.maximum) * 100);
}
import type { InvoiceDocumentData } from '../../components/InvoiceDocument';
