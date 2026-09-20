import { request } from './client';

export interface MaintenanceTask {
  id: string; branchId: string; classroomId: string; description: string; assignedStaffId: string; status: string;
  escalationDaysSnapshot: number; createdAt: string; escalatedAt?: string | null; completionTimestamp?: string | null;
}
export interface InventoryItem {
  id: string; branchId: string; branchName: string; itemName: string; category: string; quantity: number; itemStatus: string; location: string; notes: string;
  assignedTaskId: string | null; taskStatus: string | null; assignedStaffId: string | null; updatedAt: string; createdAt: string;
}
export const resourcesApi = {
  tasks: (branchId: string) => request<{ tasks: MaintenanceTask[] }>(`/resources/tasks?branchId=${encodeURIComponent(branchId)}`),
  inventory: (branchId?: string) => request<{ items: InventoryItem[] }>(`/resources/inventory${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`),
  janitors: (branchId: string) => request<{ janitors: Array<{ id: string; name: string }> }>(`/resources/janitors?branchId=${encodeURIComponent(branchId)}`),
  addInventoryItem: (payload: { branchId: string; itemName: string; category: string; quantity: number; location: string; status: string; notes: string }) => request<{ message: string }>('/resources/inventory', { method: 'POST', body: JSON.stringify(payload) }),
  updateInventoryItem: (itemId: string, payload: { status: string; notes: string; assignedStaffId?: string }) => request<{ message: string; notificationDelivered: boolean }>(`/resources/inventory/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  complete: (taskId: string) => request<{ message: string }>(`/resources/tasks/complete/${encodeURIComponent(taskId)}`, { method: 'POST' }),
};
