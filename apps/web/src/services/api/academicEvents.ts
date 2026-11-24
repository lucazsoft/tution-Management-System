import { request } from './client';

export type EventType = 'HOLIDAY' | 'EXAM' | 'EVENT' | 'FEE_DUE';
export type EventAudience = 'ALL' | 'STAFF' | 'STUDENTS' | 'PARENTS';
export interface AcademicEvent {
  id: string; branchId: string | null; title: string; description?: string | null; eventType: EventType;
  startDate: string; endDate: string;
  audience?: EventAudience; classId?: string | null;
  branch?: { name: string } | null; class?: { name: string } | null;
}
export const academicEventsApi = {
  list: (studentId?: string, viewerRole?: string) => {
    const query = new URLSearchParams();
    if (studentId) query.set('studentId', studentId);
    if (viewerRole) query.set('viewerRole', viewerRole);
    return request<{ events: AcademicEvent[] }>(`/academic-events${query.size ? `?${query}` : ''}`);
  },
  options: (branchId?: string) => request<{ branches?: Array<{ id: string; name: string }>; classes: Array<{ id: string; name: string; branchId: string; branch: { name: string } }> }>(`/academic-events/options${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`),
  updateAudience: (id: string, audience: EventAudience, branchId?: string) => request(`/academic-events/${encodeURIComponent(id)}/audience`, { method: 'PATCH', body: JSON.stringify({ audience, branchId }) }),
  createTenantWide: (payload: Omit<AcademicEvent, 'id' | 'branchId'> & { branchId?: string | null }) => request<{ event: AcademicEvent }>('/academic-events', { method: 'POST', body: JSON.stringify(payload) }),
};
