import { ApiError, request } from './api/client';

export interface PaymentSettings {
  connectIpsEnabled: boolean;
  staticQrEnabled: boolean;
  staticQrImageUrl: string | null;
  accountName: string | null;
  accountNumber: string | null;
  bankName: string | null;
  instructions: string | null;
  source?: 'branch' | 'tenant_default';
  branchId?: string;
}
export type QRConfig = Omit<PaymentSettings, 'connectIpsEnabled' | 'source' | 'branchId'>;
export function validateQRConfig(config: QRConfig): Partial<Record<keyof QRConfig, string>> {
  const errors: Partial<Record<keyof QRConfig, string>> = {};
  if (config.staticQrEnabled) {
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(config.staticQrImageUrl ?? '')) errors.staticQrImageUrl = 'Upload a PNG, JPEG, or WebP QR image.';
    for (const [key, label, min, max] of [
      ['accountName', 'Account name', 1, 100], ['accountNumber', 'Account number', 5, 20], ['bankName', 'Bank name', 1, 100],
    ] as const) {
      const length = config[key]?.trim().length ?? 0;
      if (length < min || length > max) errors[key] = `${label} must contain ${min}–${max} characters.`;
    }
    if ((config.staticQrImageUrl?.length ?? 0) > 1_400_000) errors.staticQrImageUrl = 'QR image must be under 1 MB.';
  }
  if ((config.instructions?.trim().length ?? 0) > 500) errors.instructions = 'Instructions must be at most 500 characters.';
  return errors;
}
export interface PaymentAudit {
  tenantDefaults: PaymentSettings;
  branches: { branch: { id: string; name: string; location?: string }; hasCustomSettings: boolean; settings: QRConfig | null }[];
}

// Retry only reads that failed before an HTTP response; never replay a mutation.
async function read<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await request<T>(path); }
    catch (error) {
      if (!(error instanceof TypeError) || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
}
export function paymentSettingsError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return 'Insufficient permissions to manage this branch.';
  if (error instanceof ApiError && error.status === 404) return 'Branch not found or has been deleted.';
  return error instanceof Error ? error.message : 'Unable to load payment settings.';
}
export const paymentSettingsApi = {
  getPaymentSettings: (branchId?: string) => read<PaymentSettings>(`/finances/payment-settings${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`),
  getInvoicePaymentSettings: (invoiceId: string) => read<PaymentSettings>(`/finances/invoices/${encodeURIComponent(invoiceId)}/payment-settings`),
  updateBranchPaymentSettings: (branchId: string, config: QRConfig, verification: { challengeId: string; code: string }) => request(`/finances/branches/${encodeURIComponent(branchId)}/payment-settings`, { method: 'PUT', body: JSON.stringify({ ...config, verification }) }),
  requestVerification: (branchId: string, action: 'save' | 'reset', config: QRConfig | null) => request<{ challengeId: string; destination: string; expiresIn: number }>(`/finances/branches/${encodeURIComponent(branchId)}/payment-settings/verification`, { method: 'POST', body: JSON.stringify({ action, config }) }),
  deleteBranchPaymentSettings: (branchId: string, verification: { challengeId: string; code: string }) => request(`/finances/branches/${encodeURIComponent(branchId)}/payment-settings`, { method: 'DELETE', body: JSON.stringify({ verification }) }),
  getAllBranchPaymentSettings: () => read<PaymentAudit>('/finances/admin/branches/payment-settings'),
};
