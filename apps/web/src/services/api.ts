// API Client Service for Tuition Management System (TMS)
// Tenant scope is authoritative from the signed session on the API.
import { request } from './api/client';
import { paymentSettingsApi } from './payment-settings';

export interface BillingInvoice {
  id: string; invoiceType: 'ADMISSION' | 'TUITION' | 'SUBJECT' | 'ACTIVITY'; amount: number; discount: number; fine: number;
  netPayable: number; status: string; overdue: boolean; billingCycleStart: string; billingCycleEnd: string; dueDate: string;
  paymentDate: string | null; transactionId: string | null; vatRate: number; createdAt: string;
}

export interface BillingPayroll {
  id: string; month: number; year: number; baseSalary: number; deductions: number; bonuses: number; netPayable: number;
  status: string; settlementReference: string | null; paymentDate: string | null; createdAt: string;
}

export interface BillingLedger {
  generatedAt: string;
  vatRate: number;
  students: Array<{
    studentId: string; studentName: string; email: string; grade: string; branchId: string | null; branchName: string;
    admissionDate: string; courseEnd: string; monthlyAmount: number; invoices: BillingInvoice[];
    projections: Array<{ cycleStart: string; cycleEnd: string; dueDate: string; amount: number; billingPeriod: string }>;
  }>;
  teachers: Array<{
    teacherId: string; userId: string; teacherName: string; email: string; designation: string; contractType: string;
    branchId: string | null; branchName: string; baseSalary: number; payrolls: BillingPayroll[];
    projection: { month: number; year: number; baseSalary: number; deductions: number; bonuses: number; netPayable: number };
  }>;
}

export interface AccountantWorkspace {
  branches: Array<{ id: string; name: string }>;
  pettyCashCap: number;
  pettyCashUsage: Array<{ branchId: string; committed: number; limit: number; available: number }>;
  summary: {
    collected: number;
    outstanding: number;
    overdueAmount: number;
    invoiceCount: number;
    openPettyCash: number;
    awaitingReceipt: number;
    pendingPaymentReviews: number;
  };
  pettyCash: Array<{
    id: string;
    branchId: string;
    branchName: string;
    purpose: string;
    amount: number;
    items: Array<{ name: string; quantity: number; unitAmount: number; totalAmount: number }>;
    status: 'PENDING' | 'APPROVED_LEVEL1' | 'REJECTED' | 'RELEASED' | 'RECEIPT_SUBMITTED' | 'CLOSED';
    receiptProofUrl: string | null;
    approvalChain: Array<{ role?: string; action?: string; timestamp?: string; comment?: string }>;
    createdAt: string;
    updatedAt: string;
  }>;
  invoices: Array<{
    id: string;
    studentId: string;
    studentName: string;
    branchId: string | null;
    branchName: string | null;
    amount: number;
    discount: number;
    netPayable: number;
    status: string;
    overdue: boolean;
    billingCycleStart: string;
    billingCycleEnd: string;
    dueDate: string;
    paymentDate: string | null;
    transactionId: string | null;
  }>;
  reports: { revenue: number; operatingCosts: number; netMargin: number; expenseCount: number; ledgerEntryCount: number };
}

export interface BranchAdminDashboardData {
  branches: Array<{ id: string; name: string }>;
  selectedBranch: { id: string; name: string };
  generatedAt: string;
  metrics: {
    teacherAttendance: { present: number; total: number; rate: number | null };
    studentAttendance: { present: number; total: number; rate: number | null };
    blockedStudents: number;
    pendingInvoices: number;
    outstandingAmount: number;
    pendingAppointments: number;
  };
  timetable: Array<{ id: string; time: string | null; title: string; detail: string; room: string; status: string }>;
  resources: Array<{ id: string; label: string; detail: string; status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'; actionRequired: boolean; createdAt: string }>;
  pettyCash: Array<{ id: string; amount: number; purpose: string; status: 'PENDING' }>;
  appointments: Array<{ id: string; parent: string; student: string; preferredTime: string; description: string }>;
}

export interface AcademicClassEnrollment {
  id: string;
  studentId: string;
  status: 'ACTIVE' | 'BLOCKED';
  studentName: string;
  studentEmail: string;
}

export interface AcademicClass {
  id: string;
  name: string;
  courseId: string;
  courseName: string;
  courseType: string;
  gradeId: string | null;
  gradeName: string | null;
  branchId: string;
  branchName: string;
  teacherId: string | null;
  teacherName: string | null;
  enrollmentCount: number;
  enrollments: AcademicClassEnrollment[];
  schedule: unknown;
  academicYear: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  archivedAt: string | null;
  hasEnrollmentHistory: boolean;
}

export interface ClassDependencies {
  archived: boolean;
  canArchive: boolean;
  canDelete: boolean;
  dependencies: {
    activeEnrollments: number;
    enrollmentHistory: number;
    sessions: number;
    attendanceRecords: number;
    homework: number;
    syllabi: number;
    resultDefinitions: number;
  };
}

export interface BranchAppointment {
  id: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'ALTERNATIVE_PROPOSED' | 'CONFIRMED' | 'CANCELLED';
  scheduledTime: string;
  remarks: string | null;
  responseRemarks: string | null;
  createdAt: string;
  requestedBy: { firstName: string; lastName: string; phone: string | null };
  teacher?: { firstName: string; lastName: string };
  student: { user: { firstName: string; lastName: string } };
}

// Helper to remove token
export function removeAuthToken() {
  localStorage.removeItem('tms_tenant_id');
  localStorage.removeItem('tms_user');
  localStorage.removeItem('tms_session_scope');
  sessionStorage.removeItem('tms_tenant_id');
  sessionStorage.removeItem('tms_user');
}

// Helper to get current tenantId
export function getTenantId(): string | null {
  return sessionStorage.getItem('tms_tenant_id') ?? localStorage.getItem('tms_tenant_id');
}

export function setTenantId(tenantId: string) {
  localStorage.setItem('tms_tenant_id', tenantId);
}

// API Service exports
export const api = {
  // Authentication
  auth: {
    requestPasswordReset: async (email: string) => {
      return request<{ success: boolean }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    },
    verifyPasswordResetOtp: async (email: string, otp: string) => {
      return request<{ resetToken: string }>('/auth/verify-reset-otp', {
        method: 'POST',
        body: JSON.stringify({ email, otp }),
      });
    },
    resetPassword: async (resetToken: string, newPassword: string) => {
      return request<{ success: boolean }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ resetToken, newPassword }),
      });
    },
    changePassword: async (currentPassword: string, newPassword: string) => {
      return request<{ success: boolean }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions: true }),
      });
    },
  },

  // Finances
  finances: {
    ...paymentSettingsApi,
    submitManualPayment: async (invoiceId: string, payload: { referenceId: string; receiptProof: string }) => request<{ txnId: string; status: string; message: string }>(`/finances/manual-payment/${encodeURIComponent(invoiceId)}`, { method: 'POST', body: JSON.stringify(payload) }),
    getManualPayments: async () => request<{ attempts: Array<{ id: string; txnId: string; referenceId: string; amount: number; status: string; receiptProof: string; createdAt: string; reviewedAt: string | null; reviewRemarks: string | null; invoiceId: string; studentName: string }> }>('/finances/manual-payments'),
    getPaymentAttempts: async () => request<{ attempts: Array<{ id: string; txnId: string; provider: 'CONNECTIPS' | 'BANK'; referenceId: string; amount: number; status: string; gatewayStatus: string | null; gatewayMessage: string | null; receiptProof: string | null; createdAt: string; confirmedAt: string | null; failedAt: string | null; reviewedAt: string | null; reviewRemarks: string | null; invoiceId: string; invoiceStatus: string; branchId: string; branchName: string; studentName: string }> }>('/finances/payment-attempts'),
    decideManualPayment: async (id: string, decision: 'APPROVE' | 'REJECT', remarks: string) => request<{ message: string }>(`/finances/manual-payments/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify({ decision, remarks }) }),
    getAccountantWorkspace: async () => request<AccountantWorkspace>('/finances/accountant-workspace'),
    getBillingLedger: async () => request<BillingLedger>('/finances/billing-ledger'),
    createInvoice: async (payload: { studentId: string; amount: number; discount: number; fine: number; invoiceType: 'TUITION' | 'SUBJECT' | 'ACTIVITY'; periodAnchor: string }) =>
      request<{ message: string; invoice: BillingInvoice }>('/finances/billing-ledger/invoices', { method: 'POST', body: JSON.stringify(payload) }),
    createPayroll: async (payload: { staffRecordId: string; month: number; year: number; bonuses: number; deductions: number }) =>
      request<{ message: string; payroll: BillingPayroll }>('/finances/billing-ledger/payrolls', { method: 'POST', body: JSON.stringify(payload) }),
    requestPettyCash: async (payload: { branchId: string; purpose: string; amount: number; items: Array<{ name: string; quantity: number; unitAmount: number }> }) =>
      request<{ message: string; pettyCash: AccountantWorkspace['pettyCash'][number] }>('/finances/petty-cash/request', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    resubmitPettyCash: async (id: string, payload: { purpose: string; amount: number; items: Array<{ name: string; quantity: number; unitAmount: number }> }) =>
      request<{ message: string; pettyCash: AccountantWorkspace['pettyCash'][number] }>(`/finances/petty-cash/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    submitPettyCashReceipt: async (id: string, receiptProofUrl: string) =>
      request<{ message: string; pettyCash: AccountantWorkspace['pettyCash'][number] }>(`/finances/petty-cash/upload-receipt/${id}`, {
        method: 'POST',
        body: JSON.stringify({ receiptProofUrl }),
      }),
    getPL: async () => {
      return request<{
        revenue: number;
        operatingCosts: number;
        netMargin: number;
        month: string;
      }>('/finances/pl');
    },
    getPettyCash: async () => {
      return request<any[]>('/finances/petty-cash');
    },
    approvePettyCash: async (id: string, action: 'APPROVE_L1' | 'APPROVE_L2', remarks?: string) => {
      const level = action === 'APPROVE_L1' ? 'approve-l1' : 'approve-l2';
      return request<{ message: string; pettyCash: any }>(`/finances/petty-cash/${level}/${id}`, {
        method: 'POST',
        body: JSON.stringify({ remarks }),
      });
    },
    updateConfig: async (
      vatRate: number,
      gracePeriod: number,
      pettyCashCap: number,
      policies: {
        refundPolicy: string;
        lateFeeEnabled: boolean;
        lateFeeMode: string;
        lateFeeValue: number;
        lateFeeGraceDays: number;
        appointmentWindowHours: number;
        maintenanceEscalationDays: number;
        leavePolicy: Record<string, unknown>;
        performanceWeights: Record<string, number>;
      },
    ) => {
      return request<{ success: boolean; tenant: any }>('/finances/config', {
        method: 'PUT',
        body: JSON.stringify({
          vatRate,
          gracePeriod,
          pettyCashCap,
          ...policies,
        }),
      });
    },
    decidePettyCash: async (id: string, action: 'REJECT' | 'REVISION', remarks?: string) => {
      return request<{ message: string; pettyCash: any }>(`/finances/petty-cash/decide/${id}`, {
        method: 'POST',
        body: JSON.stringify({ action, remarks }),
      });
    },
    getConfig: async () => {
      return request<{
        vatRate: number; gracePeriod: number; pettyCashCap: number; refundPolicy: string;
        lateFeeEnabled: boolean; lateFeeMode: string | null; lateFeeValue: number | null;
        lateFeeGraceDays: number; appointmentWindowHours: number; maintenanceEscalationDays: number;
        leavePolicy: Record<string, unknown> | null; performanceWeights: Record<string, number> | null;
      }>('/finances/config');
    },
    getForecast: async () => request<any>('/finances/forecast'),
    getSuggestions: async () => request<any>('/finances/suggestions'),
    exportLedger: async () => request<{ format: string; entries: any[] }>('/finances/ledger/export'),
    getBillingPeriod: async (anchor?: string) => {
      const query = anchor ? `?anchor=${encodeURIComponent(anchor)}` : '';
      return request<{ label: string; bsYear: number; bsMonthName: string; bsMonthNameNp: string; daysInMonth: number; cycleStart: string; cycleEnd: string; dueDate: string }>(`/finances/billing-period${query}`);
    },
    getOverview: async () => {
      return request<{ collected: number; outstanding: number; overdueAmount: number; overdueStudents: number; invoiceCount: number; billingPeriod: string }>('/finances/overview');
    },
    getStudentFees: async () => {
      const data = await request<{ students: Array<{ studentId: string; userId: string; name: string; email: string; branchId: string | null; branchName: string | null; totalBilled: number; totalPaid: number; totalDue: number; overdueCount: number; overdueAmount: number; invoiceCount: number }> }>('/finances/students');
      return data.students ?? [];
    },
    getStudentInvoices: async (studentId: string) => {
      return request<{
        admissionStatus: 'PENDING_PAYMENT' | 'READY_FOR_LOGIN' | 'ACTIVE';
        loginDeliveries: Array<{ recipient: 'STUDENT' | 'PARENT'; status: 'PENDING' | 'SENT' | 'FAILED'; failureReason: string | null; attemptCount: number; lastAttemptAt: string | null; sentAt: string | null }>;
        invoices: Array<{ id: string; invoiceType: 'ADMISSION' | 'TUITION' | 'SUBJECT' | 'ACTIVITY'; institutionName: string; panNumber: string; vatRate: number; studentName: string; admissionNumber: string | null; gradeName: string | null; branchName: string | null; issuedAt: string; transactionId: string | null; lines: Array<{ label: string; amount: number }>; discount: number; fine: number; netPayable: number; status: string; overdue: boolean; dueDate: string; billingCycleStart: string; billingCycleEnd: string; paymentDate: string | null }>;
      }>(`/finances/students/${studentId}/invoices`);
    },
    getNepalPayQr: async (invoiceId: string) => request<{ invoiceId: string; merchantName: string; merchantCity: string; amount: number; currency: string; studentName: string; qrString: string }>(`/finances/nepalpay-qr/${encodeURIComponent(invoiceId)}`),
    payInvoice: async (invoiceId: string, transactionId?: string) => {
      return request<{
        message: string;
        invoice: { id: string; status: string; paymentDate: string | null; transactionId: string | null };
        loginDelivery: { delivered: boolean; studentPhone: string; parentPhone: string; failures: string[]; recipients: Array<{ recipient: 'STUDENT' | 'PARENT'; status: 'SENT' | 'FAILED'; sentAt: string | null; error: string | null }> } | null;
      }>(`/finances/invoices/${invoiceId}/pay`, {
        method: 'POST',
        body: JSON.stringify({ transactionId }),
      });
    },
    initiateConnectIps: async (invoiceId: string) => {
      return request<{
        payment: { txnId: string; invoiceId: string; amountPaisa: string; status: string };
        gatewayUrl: string;
        fields: Record<string, string>;
      }>(`/finances/connectips/initiate/${invoiceId}`, { method: 'POST' });
    },
    getConnectIpsStatus: async (txnId: string) => {
      return request<{
        txnId: string;
        invoiceId: string;
        status: string;
        gatewayStatus: string | null;
        confirmedAt: string | null;
      }>(`/finances/connectips/status/${encodeURIComponent(txnId)}`);
    },
    generateInvoices: async () => {
      return request<{ message: string; created: number; billingPeriod: string; skipped: number }>('/finances/generate-invoices', {
        method: 'POST',
      });
    },
  },

  // Teacher workspace
  teacher: {
    getDashboard: async () => request<any>('/teacher/workspace'),
    submitSessionUpdate: async (sessionId: string, updateContent: string) => {
      return request<{ message: string; session: any }>(`/teacher/session/${sessionId}/update`, {
        method: 'POST',
        body: JSON.stringify({ updateContent }),
      });
    },
    saveClassAttendance: async (classId: string, date: string, records: Array<{ studentId: string; status: 'PRESENT' | 'ABSENT' }>) =>
      request<any>(`/teacher/class/${classId}/attendance`, { method: 'POST', body: JSON.stringify({ date, records }) }),
    createSyllabus: async (payload: { classId: string; subject: string; chapters: Array<string | { title: string; topics: string[] }> }) =>
      request<any>('/teacher/syllabus', { method: 'POST', body: JSON.stringify(payload) }),
    updateSyllabus: async (syllabusId: string, payload: { subject: string; chapters: Array<{ id?: string; title: string }> }) =>
      request<any>(`/teacher/syllabus/${syllabusId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    updateSyllabusLog: async (syllabusId: string, payload: { chapterId: string; status: 'IN_PROGRESS' | 'COMPLETED' | 'LEFT'; notes?: string; logDate?: string }) =>
      request<any>(`/teacher/syllabus/${syllabusId}/log`, { method: 'POST', body: JSON.stringify(payload) }),
    updateTopicLog: async (syllabusId: string, payload: { topicId: string; status: 'IN_PROGRESS' | 'COMPLETED' | 'LEFT'; notes?: string; logDate?: string }) =>
      request<any>(`/teacher/syllabus/${syllabusId}/topic-log`, { method: 'POST', body: JSON.stringify(payload) }),
    createSyllabusTopic: async (syllabusId: string, payload: { chapterId: string; title: string }) => request<any>(`/teacher/syllabus/${syllabusId}/topics`, { method: 'POST', body: JSON.stringify(payload) }),
    updateSyllabusTopic: async (syllabusId: string, topicId: string, title: string) => request<any>(`/teacher/syllabus/${syllabusId}/topics/${topicId}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
    deleteSyllabusTopic: async (syllabusId: string, topicId: string) => request<void>(`/teacher/syllabus/${syllabusId}/topics/${topicId}`, { method: 'DELETE' }),
    createHomework: async (payload: { classId: string; subject: string; title: string; description?: string; contentUrl?: string; deadline: string }) =>
      request<any>('/homework', { method: 'POST', body: JSON.stringify(payload) }),
    saveResultDraft: async (payload: any) => request<{ message: string; resultIds: string[] }>('/teacher/results', { method: 'POST', body: JSON.stringify(payload) }),
    shareResults: async (resultIds: string[]) => request<any>('/teacher/results/share', { method: 'POST', body: JSON.stringify({ resultIds }) }),
    deleteResultDraft: async (resultId: string) => request<void>(`/teacher/results/${encodeURIComponent(resultId)}`, { method: 'DELETE' }),
    requestLeave: async (payload: { branchId: string; leaveType: string; startDate: string; endDate: string; reason: string }) =>
      request<any>('/leaves/request', { method: 'POST', body: JSON.stringify(payload) }),
  },

  // Geo attendance (Teacher)
  attendance: {
    markIn: async (branchId: string, latitude: number, longitude: number, gpsAccuracy: number) => {
      return request<{ message: string; stamp: any; geofenceMeta: any }>('/attendance/in', {
        method: 'POST',
        body: JSON.stringify({ branchId, latitude, longitude, gpsAccuracy }),
      });
    },
    markOut: async (branchId: string, latitude: number, longitude: number, gpsAccuracy: number) => {
      return request<{ message: string; stamp: any }>('/attendance/out', {
        method: 'POST',
        body: JSON.stringify({ branchId, latitude, longitude, gpsAccuracy }),
      });
    },
  },


  // Parent-Teacher Communication Chat
  chat: {
    getMessages: async () => {
      return request<any[]>('/communication/chat');
    },
    sendMessage: async (text: string) => {
      return request<{ success: boolean; message: any }>('/communication/chat', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
    }
  },

  // Tenant dashboard summary (students, teachers, dues, leaves, per-branch)
  tenant: {
    getDashboard: async () => {
      return request<{
        activeStudentsCount: number;
        activeTeachersCount: number;
        totalOverdueAmountNpr: number;
        pendingLeaveRequestsCount: number;
        branchSummary: Array<{ branchId: string; branchName: string; activeStudents: number; staffCount: number }>;
      }>('/tenant-admin/dashboard');
    },
    getDocumentAlerts: async () => request<{ expiringDocs: any[] }>('/hr/documents/alerts'),
    listCalendarEvents: async () => request<{ events: any[] }>('/academic-events'),
    publishCalendarEvent: async (payload: {
      title: string; description?: string; eventType: string; startDate: string; endDate: string;
    }) => request<{ message: string; event: any }>('/academic-events', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  },

  // People / user provisioning (Tenant Admin + Branch Admin)
  people: {
    capabilities: async () => {
      return request<{
        isTenantAdmin: boolean;
        isBranchAdmin: boolean;
        canManagePeople: boolean;
        creatableRoles: string[];
        manageableBranches: Array<{ id: string; name: string }>;
      }>('/users/me');
    },
    list: async () => {
      const data = await request<{ users: any[] }>('/users');
      return data.users ?? [];
    },
    getProfile: async (userId: string) => {
      return request<any>(`/users/${userId}/profile`);
    },
    updateStudentPhoto: async (studentId: string, image: string) => {
      return request<{ message: string; photoUrl: string }>(`/users/students/${studentId}/photo`, {
        method: 'PUT',
        body: JSON.stringify({ image }),
      });
    },
    removeStudentPhoto: async (studentId: string) => {
      return request<{ message: string }>(`/users/students/${studentId}/photo`, { method: 'DELETE' });
    },
    resetPassword: async (userId: string) => {
      return request<{ temporaryPassword: string }>(`/users/${userId}/reset-password`, { method: 'POST' });
    },
    issueAdmissionLogins: async (studentId: string) => {
      return request<{ message: string; delivery: { delivered: boolean; studentPhone: string; parentPhone: string; failures: string[]; recipients: Array<{ recipient: 'STUDENT' | 'PARENT'; status: 'SENT' | 'FAILED'; sentAt: string | null; error: string | null }> } }>(`/users/admissions/${studentId}/issue-logins`, { method: 'POST' });
    },
    getAnalytics: async (userId: string) => {
      return request<{
        name: string;
        grade: string | null;
        attendance: {
          present: number; absent: number; excused: number; blocked: number; totalMarked: number; rate: number | null;
          trend: Array<{ month: string; present: number; total: number; rate: number | null }>;
        };
        homework: {
          assigned: number; submitted: number; graded: number; pending: number; overdue: number;
          completionRate: number | null; onTimeRate: number | null;
          timeline: Array<{ id: string; title: string; subject: string; course: string | null; deadline: string; status: 'GRADED' | 'SUBMITTED' | 'OVERDUE' | 'PENDING'; late: boolean; grade: string | null; submittedAt: string | null }>;
        };
        fees: { paid: number; due: number; overdue: number; collectionRate: number | null };
        activeCourses: string[];
        perCourse: Array<{ course: string; className: string; teacher: string | null; status: string; attendanceRate: number | null; homeworkAssigned: number; homeworkSubmitted: number }>;
        activity: Array<{ type: string; date: string; label: string; detail?: string }>;
        connections: { courses: string[]; teachers: string[]; parents: string[] };
      }>(`/users/${userId}/analytics`);
    },
    update: async (userId: string, changes: { firstName?: string; lastName?: string; phone?: string; status?: string; gradeId?: string | null; contractType?: 'FIXED' | 'HOUR_RATE'; baseMonthlySalary?: number; hourlyRate?: number }) => {
      return request<{ message: string; droppedEnrollments?: number }>(`/users/${userId}`, { method: 'PUT', body: JSON.stringify(changes) });
    },
    deactivate: async (userId: string) => {
      return request<{ message: string }>(`/users/${userId}`, { method: 'DELETE' });
    },
    createBranchAdmin: async (payload: { firstName: string; lastName: string; email: string; phone?: string; branchId: string }) => {
      return request<{ message: string; user: any; temporaryPassword: string }>('/users/branch-admin', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    create: async (payload: { firstName: string; lastName: string; email: string; phone?: string; role: string; branchId: string; gradeId?: string; studentId?: string; contractType?: 'FIXED' | 'HOUR_RATE'; baseMonthlySalary?: number; hourlyRate?: number }) => {
      return request<{ message: string; user: any; temporaryPassword: string }>('/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    bulkCreateStudents: async (students: Array<Record<string, string>>) => {
      return request<{
        createdCount: number;
        errorCount: number;
        results: Array<{ row: number; name: string; email: string; status: 'created' | 'error'; temporaryPassword?: string; parentEmail?: string; parentTemporaryPassword?: string; error?: string }>;
      }>('/users/bulk-students', {
        method: 'POST',
        body: JSON.stringify({ students }),
      });
    },
  },

  // Grade levels (UKG … Class 12)
  grades: {
    list: async () => {
      const data = await request<{ grades: Array<{ id: string; name: string; sortOrder: number; monthlyFee: number; billingMode: 'GRADE' | 'SUBJECT'; studentCount: number; courseCount: number }> }>('/grades');
      return data.grades ?? [];
    },
    seedDefaults: async () => {
      return request<{ message: string; created: number }>('/grades/seed-defaults', { method: 'POST' });
    },
    create: async (name: string, sortOrder?: number, monthlyFee?: number, billingMode?: 'GRADE' | 'SUBJECT') => {
      return request<{ message: string; grade: any }>('/grades', { method: 'POST', body: JSON.stringify({ name, sortOrder, monthlyFee, billingMode }) });
    },
    update: async (id: string, changes: { name?: string; sortOrder?: number; monthlyFee?: number; billingMode?: 'GRADE' | 'SUBJECT' }) => {
      return request<{ message: string; grade: any }>(`/grades/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
    },
    remove: async (id: string) => {
      return request<{ message: string }>(`/grades/${id}`, { method: 'DELETE' });
    },
    getDetail: async (id: string) => {
      return request<{
        id: string;
        name: string;
        studentCount: number;
        courseCount: number;
        teacherCount: number;
        students: Array<{ studentId: string; userId: string; name: string; email: string }>;
        courses: Array<{ id: string; name: string; branchName: string; classCount: number; enrollmentCount: number }>;
        teachers: Array<{ id: string; name: string }>;
      }>(`/grades/${id}`);
    },
  },

  // Academics — courses & classes (Tenant Admin / Branch Admin)
  academics: {
    listCourses: async () => {
      const data = await request<{ courses: any[] }>('/courses');
      return data.courses ?? [];
    },
    createCourse: async (payload: {
      branchId: string;
      gradeId?: string;
      name: string;
      description?: string;
      type: string;
      feeStructure: Record<string, unknown>;
      isTaxExempt?: boolean;
      taxPercentage?: number;
      isExtraActivity?: boolean;
    }) => {
      return request<{ message: string; course: any }>('/courses', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    bulkCreateCourses: async (payload: {
      branchId: string;
      items: Array<{ name: string; gradeId?: string | null; type?: string; monthlyBase: number; isTaxExempt?: boolean; description?: string }>;
    }) => {
      return request<{
        message: string;
        created: number;
        skipped: number;
        results: Array<{ index: number; name: string; status: 'created' | 'skipped' | 'error'; error?: string }>;
      }>('/courses/bulk', { method: 'POST', body: JSON.stringify(payload) });
    },
    listClasses: async (options: { includeArchived?: boolean; signal?: AbortSignal } = {}) => {
      const data = await request<{ classes: AcademicClass[] }>(`/courses/classes${options.includeArchived ? '?includeArchived=true' : ''}`, { signal: options.signal });
      return data.classes ?? [];
    },
    listEligibleClassStudents: async (classId: string, signal?: AbortSignal) => {
      const data = await request<{ students: Array<{ studentId: string; studentName: string; studentEmail: string }> }>(`/courses/classes/${encodeURIComponent(classId)}/eligible-students`, { signal });
      return data.students ?? [];
    },
    getClassDependencies: async (classId: string, signal?: AbortSignal) => request<ClassDependencies>(`/courses/classes/${encodeURIComponent(classId)}/dependencies`, { signal }),
    setClassArchived: async (classId: string, archived: boolean) => request<{ message: string; class: AcademicClass }>(`/courses/classes/${encodeURIComponent(classId)}/archive`, { method: 'PATCH', body: JSON.stringify({ archived }) }),
    moveClassStudents: async (sourceClassId: string, targetClassId: string, studentIds: string[]) => request<{ message: string; moved: number }>(`/courses/classes/${encodeURIComponent(sourceClassId)}/move-students`, { method: 'POST', body: JSON.stringify({ targetClassId, studentIds }) }),
    setupClass: async (payload: { branchId: string; gradeId: string; courseName: string; courseType: 'REGULAR' | 'SHORT_TERM'; className: string; monthlyBase: number; teacherId?: string | null; studentIds: string[] }) => {
      return request<{ message: string; course: any; class: any }>('/courses/classes/setup', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    createClass: async (payload: { courseId: string; name: string; schedule: unknown; teacherId?: string | null; academicYear?: string; effectiveFrom?: string | null; effectiveUntil?: string | null }) => {
      return request<{ message: string; class: any }>('/courses/classes', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    checkClassConflicts: async (payload: { courseId: string; classId?: string; teacherId?: string | null; schedule: unknown }) => {
      return request<{ conflicts: string[] }>('/courses/classes/conflicts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    updateCourse: async (id: string, changes: { name?: string; description?: string | null; type?: string; feeStructure?: Record<string, unknown>; isTaxExempt?: boolean; taxPercentage?: number; gradeId?: string | null }) => {
      return request<{ message: string; course: any }>(`/courses/${id}`, {
        method: 'PUT',
        body: JSON.stringify(changes),
      });
    },
    deleteCourse: async (id: string) => {
      return request<{ message: string }>(`/courses/${id}`, { method: 'DELETE' });
    },
    enroll: async (studentId: string, courseId: string, classId: string) => {
      return request<{ message: string; enrollment: any; monthlyDelta: number }>('/courses/enroll', {
        method: 'POST',
        body: JSON.stringify({ studentId, courseId, classId }),
      });
    },
    unenroll: async (enrollmentId: string) => {
      return request<{ message: string }>(`/courses/enrollments/${enrollmentId}`, { method: 'DELETE' });
    },
    updateClass: async (id: string, changes: { name?: string; schedule?: unknown; teacherId?: string | null; academicYear?: string; effectiveFrom?: string | null; effectiveUntil?: string | null }) => {
      return request<{ message: string; class: any }>(`/courses/classes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(changes),
      });
    },
    deleteClass: async (id: string) => {
      return request<{ message: string }>(`/courses/classes/${id}`, { method: 'DELETE' });
    },
  },

  // Branch management (Tenant Admin)
  branches: {
    list: async () => {
      const data = await request<{ branches: any[] }>('/branches');
      return data.branches ?? [];
    },
    create: async (branch: {
      name: string;
      address: string;
      latitude: number;
      longitude: number;
      radiusMeters?: number;
      gracePeriodMinutes?: number;
      admissionFee?: number;
    }) => {
      return request<{ message: string; branch: any }>('/branches', {
        method: 'POST',
        body: JSON.stringify(branch),
      });
    },
    update: async (id: string, changes: Record<string, unknown>) => {
      return request<{ message: string; branch: any }>(`/branches/${id}`, {
        method: 'PUT',
        body: JSON.stringify(changes),
      });
    },
  },

  // Branch Admin operations. Authorization and branch scoping are enforced by the API.
  branchAdmin: {
    getDashboard: async (branchId?: string) => request<BranchAdminDashboardData>(`/branch-admin/dashboard${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`),
    getTeacherWorkflows: async (branchId?: string, date?: string) => request<any>(`/branch-admin/teacher-workflows?${new URLSearchParams({ ...(branchId ? { branchId } : {}), ...(date ? { date } : {}) }).toString()}`),
    createResultDefinition: async (payload: { branchId: string; classId: string; title: string; subject: string; testDate: string }) => request<any>('/branch-admin/result-definitions', { method: 'POST', body: JSON.stringify(payload) }),
    getResultTemplate: async (resultId: string) => request<any>(`/branch-admin/result-definitions/${encodeURIComponent(resultId)}/template`),
    importResults: async (resultId: string, payload: { maximum: number; passMarks: number; rows: Array<{ studentId: string; score: number }> }) => request<{ message: string; imported: number }>(`/branch-admin/result-definitions/${encodeURIComponent(resultId)}/import`, { method: 'POST', body: JSON.stringify(payload) }),
    getResultReport: async (resultId: string) => request<any>(`/branch-admin/result-definitions/${encodeURIComponent(resultId)}/report`),
    updateResultDefinition: async (resultId: string, payload: { title?: string; testDate?: string; isOpen?: boolean }) => request<any>(`/branch-admin/result-definitions/${encodeURIComponent(resultId)}`, { method: 'PUT', body: JSON.stringify(payload) }),
    publishResultDefinition: async (resultId: string) => request<any>(`/branch-admin/result-definitions/${encodeURIComponent(resultId)}/publish`, { method: 'POST' }),
    deleteResultDefinition: async (resultId: string) => request<void>(`/branch-admin/result-definitions/${encodeURIComponent(resultId)}`, { method: 'DELETE' }),
    getAppointments: async (branchId: string) => request<{ appointments: BranchAppointment[] }>(`/appointments/branch?branchId=${encodeURIComponent(branchId)}`),
    respondToAppointment: async (appointmentId: string, payload: { action: 'APPROVE' | 'REJECT'; scheduledTime?: string; remarks: string }) =>
      request<{ message: string }>(`/appointments/respond/${encodeURIComponent(appointmentId)}`, { method: 'POST', body: JSON.stringify(payload) }),
    decideLeave: async (leaveId: string, action: 'APPROVE' | 'REJECT', remarks?: string) =>
      request<{ message: string; leave: any }>(`/leaves/approve/${leaveId}`, { method: 'POST', body: JSON.stringify({ action, remarks }) }),
    getLeaves: async (level: 'L1' | 'L2') => request<{ leaves: Array<{ id: string; staffName: string; branchId: string; branchName: string; leaveType: string; startDate: string; endDate: string; reason: string; status: string; remarks: string | null; approvedBy: string | null; createdAt: string }> }>(`/leaves?level=${level}`),
    emergencyDeparture: async (payload: { studentId: string; branchId: string; reason: string; collectedBy?: string; departureTime?: string }) =>
      request<{ message: string; leave: any }>('/leaves/emergency-out', { method: 'POST', body: JSON.stringify(payload) }),
    addRemark: async (payload: { studentId: string; subject: string; message: string; parentVisible: boolean }) =>
      request<{ message: string; remark: any }>('/performance/student/remarks', { method: 'POST', body: JSON.stringify(payload) }),
    createPersonalizedClass: async (payload: { branchId: string; name: string; courseId: string; schedule: unknown; feeStructure: unknown }) =>
      request<{ message: string; class: any }>('/classes/personalized', { method: 'POST', body: JSON.stringify(payload) }),
    createCalendarEvent: async (payload: { audience?: string; classId?: string; branchId: string; title: string; description?: string; eventType: string; startDate: string; endDate: string }) =>
      request<{ message: string; event: any }>('/academic-events', { method: 'POST', body: JSON.stringify(payload) }),
    issueCertificate: async (payload: { studentId: string; templateId: string; branchId: string }) =>
      request<{ message: string; certificate: any }>('/certificates/issue', { method: 'POST', body: JSON.stringify(payload) }),
    getCertificateOptions: async () => request<{ templates: Array<{ id: string; name: string; type: string; status: string; version: number; updatedAt: string; layoutConfig: { renderMode?: string; theme?: 'CLASSIC' | 'MODERN' | 'ACADEMIC'; title?: string; presentationLine?: string; achievementLine?: string; signatoryName?: string; signatoryTitle?: string; sourceFile?: { name: string; mimeType: string } } }>; students: Array<{ studentId: string; studentName: string; gradeName: string; branchId: string; branchName: string }> }>('/certificates/options'),
    getIssuedCertificates: async () => request<{ certificates: Array<{ certificateId: string; status: string; issuedDate: string; studentName: string; gradeName: string; branchName: string; templateName: string; templateType: string; revokedAt: string | null; revocationReason: string | null }> }>('/certificates/issued'),
    revokeCertificate: async (certificateId: string, reason: string) => request<{ message: string }>(`/certificates/${encodeURIComponent(certificateId)}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) }),
    archiveCertificateTemplate: async (templateId: string) => request<{ message: string }>(`/certificates/templates/${encodeURIComponent(templateId)}/archive`, { method: 'POST' }),
    completeMaintenanceTask: async (taskId: string) =>
      request<{ message: string; task: any }>(`/resources/tasks/complete/${taskId}`, { method: 'POST' }),
    grantFeeOverride: async (payload: { studentId: string; branchId: string; scope: 'ONE_SESSION' | 'ONE_DAY'; reason: string }) =>
      request<{ message: string; override: any }>('/branch-admin/fee-overrides', { method: 'POST', body: JSON.stringify(payload) }),
    getParentContacts: async () => request<{ contacts: Array<{ studentId: string; studentName: string; gradeName: string; branchName: string; parentId: string; parentName: string; parentEmail: string; parentPhone: string }> }>('/communication/admin/parent-contacts'),
    getParentThread: async (studentId: string, parentId: string) => request<{ messages: Array<{ id: string; senderId: string; receiverId: string; messageText: string; createdAt: string; sender: { firstName: string; lastName: string } }> }>(`/communication/messages/thread/${encodeURIComponent(studentId)}?teacherId=${encodeURIComponent(parentId)}`),
    sendParentMessage: async (payload: { studentId: string; receiverId: string; messageText: string }) => request<{ message: string }>('/communication/messages', { method: 'POST', body: JSON.stringify(payload) }),
  },

  // Onboarding & tenant provisioning (Super Admin)
  onboarding: {
    provisionTenant: async (payload: {
      institutionName: string;
      panNumber: string;
      adminFirstName: string;
      adminLastName: string;
      adminEmail: string;
      adminPhone: string;
      branchName: string;
      branchAddress: string;
      latitude?: number;
      longitude?: number;
    }) => {
      return request<{
        message: string;
        provisioned: {
          tenantId: string;
          tenantName: string;
          primaryAdminUser: string;
          primaryAdminName: string;
          defaultBranch: string;
          temporaryPassword: string;
        };
      }>('/onboarding/provision', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    getRequests: async () => {
      const data = await request<{ requests: any[] }>('/onboarding/requests');
      return data.requests ?? [];
    },
    approveRequest: async (id: string, defaultBranchName?: string) => {
      return request<{
        message: string;
        provisioned: {
          tenantId: string;
          tenantName: string;
          primaryAdminUser: string;
          defaultBranch: string;
          temporaryPassword: string;
        };
      }>(`/onboarding/approve/${id}`, {
        method: 'POST',
        body: JSON.stringify({ defaultBranchName }),
      });
    },
    rejectRequest: async (id: string) => {
      return request<{ message: string; request: any }>(`/onboarding/reject/${id}`, {
        method: 'POST',
      });
    },
    getTenants: async () => {
      const data = await request<{ tenants: any[] }>('/onboarding/tenants');
      return data.tenants ?? [];
    },
  }
};
