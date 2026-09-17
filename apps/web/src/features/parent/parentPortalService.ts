import { API_BASE_URL, request } from '../../services/api/client';
import type { NepalPayPayload, ParentPortalDataset } from './parentPortalTypes';

export function loadParentPortal(studentId?: string): Promise<ParentPortalDataset> {
  const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
  return request<ParentPortalDataset>(`/parent/portal${query}`);
}

export function sendParentMessage(input: { studentId: string; receiverId: string; messageText: string }) {
  return request('/communication/messages', { method: 'POST', body: JSON.stringify(input) });
}

export function requestAppointment(input: {
  studentId: string;
  branchId?: string;
  teacherId?: string;
  target: 'TEACHER' | 'BRANCH_ADMIN';
  scheduledTime: string;
  remarks: string;
  isGroup?: boolean;
  participantIds?: string[];
}) {
  return request('/appointments/request', { method: 'POST', body: JSON.stringify(input) });
}

export function respondToAppointment(input: {
  appointmentId: string;
  action: 'ACCEPT_ALTERNATIVE' | 'REJECT_ALTERNATIVE' | 'PROPOSE_ALTERNATIVE';
  alternativeSlot?: string;
  remarks?: string;
}) {
  const { appointmentId, ...body } = input;
  return request(`/appointments/parent-respond/${encodeURIComponent(appointmentId)}`, { method: 'POST', body: JSON.stringify(body) });
}

export function requestStudentLeave(input: {
  studentId: string;
  branchId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
}) {
  return request('/leaves/request', { method: 'POST', body: JSON.stringify(input) });
}

export function loadParentNepalPayQr(invoiceId: string): Promise<NepalPayPayload> {
  return request<NepalPayPayload>(`/finances/nepalpay-qr/${encodeURIComponent(invoiceId)}`);
}

export function parentFileUrl(path: string) {
  return path.startsWith('/') ? `${API_BASE_URL}${path}` : path;
}

export function markParentNotificationsRead(ids: string[]): Promise<{ message: string }> {
  return request('/portal-notifications/read', { method: 'POST', body: JSON.stringify({ ids }) });
}
