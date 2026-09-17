import { API_BASE_URL, request } from '../../services/api/client';
import { type NepalPayPayload, type StudentPortalDataset } from './studentPortalData';

export async function loadStudentPortal(): Promise<StudentPortalDataset> {
  return request<StudentPortalDataset>('/users/me/student-portal');
}

export function loadNepalPayPayload(invoiceId: string): Promise<NepalPayPayload> {
  return request<NepalPayPayload>(`/finances/nepalpay-qr/${encodeURIComponent(invoiceId)}`);
}

export function studentFileUrl(path: string): string {
  return path.startsWith('/') ? `${API_BASE_URL}${path}` : path;
}

export function markStudentNotificationsRead(ids: string[]): Promise<{ message: string }> {
  return request('/portal-notifications/read', { method: 'POST', body: JSON.stringify({ ids }) });
}
