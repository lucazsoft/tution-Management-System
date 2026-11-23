export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type CourseType = 'REGULAR' | 'MUSIC' | 'SHORT_TERM' | 'LONG_TERM' | 'PERSONALIZED';

export type SessionStatus =
  | 'PRESENT_CONFIRMED'
  | 'PRESENT_UPDATE_PENDING'
  | 'PARTIAL_PRESENCE'
  | 'UNSCHEDULED_PRESENCE'
  | 'ABSENT';

export type StudentAttendanceStatus = 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'BLOCKED';

export type InvoiceStatus = 'UNPAID' | 'PAID' | 'OVERDUE' | 'BLOCKED_OVERRIDE';
export type InvoiceType = 'ADMISSION' | 'TUITION' | 'SUBJECT' | 'ACTIVITY';
export type GradeBillingMode = 'GRADE' | 'SUBJECT';
export type AdmissionStatus = 'PENDING_PAYMENT' | 'READY_FOR_LOGIN' | 'ACTIVE';

export type LeaveType = 'CASUAL' | 'SICK' | 'LONG_SICK' | 'EARLY_OUT';

export type LeaveStatus = 'PENDING' | 'APPROVED_LEVEL1' | 'APPROVED_LEVEL2' | 'REJECTED' | 'CANCELLED';

export type PettyCashStatus =
  | 'PENDING'
  | 'APPROVED_LEVEL1'
  | 'APPROVED_LEVEL2'
  | 'RELEASED'
  | 'RECEIPT_SUBMITTED'
  | 'CLOSED';

export type ResourceLogStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export type OnboardingRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

// Shared User interface for frontend/backend contracts
export interface UserPayload {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  roles: {
    roleName: string;
    branchId: string | null; // null means tenant-wide scope
    permissions: string[];
  }[];
}

// SMS Gateway Adapter Interface
export interface ISmsSender {
  sendSms(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

// Onboarding request submission structure
export interface TenantOnboardingRequest {
  name: string;
  email: string;
  phone: string;
  panNumber: string;
  remarks?: string;
}

// ==========================================
// PHASE 2: ACADEMIC, OPERATIONS & INTELLIGENCE TYPES
// ==========================================

export type EventType = 'HOLIDAY' | 'EXAM' | 'EVENT' | 'FEE_DUE';

export type CertificateType = 'COMPLETION' | 'ACHIEVEMENT' | 'ATTENDANCE' | 'CUSTOM';

