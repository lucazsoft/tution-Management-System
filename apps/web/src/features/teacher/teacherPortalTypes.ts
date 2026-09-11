export type TeacherView = 'calendar' | 'dashboard' | 'timetable' | 'geo-attendance' | 'attendance' | 'syllabus' | 'daily-update-log' | 'homework' | 'results' | 'profile' | 'leave-requests' | 'salary-slips' | 'security';
export type ChapterStatus = 'IN_PROGRESS' | 'COMPLETED' | 'LEFT';

export interface TeacherClass {
  id: string;
  name: string;
  subject: string;
  type: string;
  schedule: unknown;
  branch: { id: string; name: string; address: string; radiusMeters: number };
  students: Array<{ id: string; name: string; status: string }>;
  attendance: Array<{ id: string; studentId: string; date: string; status: string }>;
  syllabi: Array<{
    id: string; subject: string;
    chapters: Array<{ id: string; title: string; position: number; status: ChapterStatus; topics: Array<{ id: string; title: string; position: number; status: ChapterStatus; logs: Array<{ id: string; status: ChapterStatus; notes?: string | null; logDate: string; updatedAt?: string }> }> }>;
    dailyLogs: Array<{ id: string; chapterId: string; logDate: string; status: ChapterStatus; notes?: string | null }>;
  }>;
  homework: Array<{ id: string; subject: string; title: string; description?: string | null; contentUrl?: string | null; deadline: string; createdAt: string }>;
}

export interface TeacherDashboard {
  generatedAt: string;
  teacher: { id: string; name: string; email: string; designation: string; joiningDate: string | null; contractType: string | null; branches: Array<{ id: string; name: string }> };
  statistics: { attendanceRate: number; presentDays: number; requiredDays: number; approvedLeaveDays: number; totalSessions: number; updateCompliance: number; assignedClasses: number };
  attendance: { checkedIn: boolean; lastStampType: string | null; lastStampAt: string | null };
  stamps: Array<{ id: string; stampType: string; timestamp: string; branchName: string; gpsAccuracy: number }>;
  todayClasses: Array<{ sessionId: string; classId: string; className: string; courseName: string; branch: { id: string; name: string; radiusMeters: number }; schedule: unknown; status: string; dailyUpdateSubmitted: boolean; checkInTime: string | null; checkOutTime: string | null }>;
  pendingUpdates: Array<{ sessionId: string; classId: string; className: string; courseName: string; date: string }>;
  classes: TeacherClass[];
  results: Array<{ id: string; studentId: string; resultDefinitionId: string | null; studentName: string; subject: string; assessment: string; score: number; maximum: number; passMarks: number | null; percentile: number | null; resultSheetUrl?: string | null; publishedAt: string | null; testDate: string }>;
  resultDefinitions: Array<{ id: string; branchId: string; classId: string; title: string; subject: string; testDate: string; isOpen: boolean }>;
  profile: { performance: any; salaryStructure: any };
  leaves: Array<{ id: string; leaveType: string; startDate: string; endDate: string; reason: string; status: string; branch: { name: string } }>;
  payrolls: Array<{ id: string; month: number; year: number; baseSalary: number; attendanceDeductions: number; bonuses: number; netPayable: number; status: string; paymentDate: string | null }>;
}
