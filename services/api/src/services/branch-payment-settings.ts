import prisma from '../utils/db';
import { BranchPaymentSettings } from '@prisma/client';

export type PaymentSettings = {
  connectIpsEnabled: boolean;
  staticQrEnabled: boolean;
  staticQrImageUrl: string | null;
  accountName: string | null;
  accountNumber: string | null;
  bankName: string | null;
  instructions: string | null;
  branchId?: string;
  source?: 'branch' | 'tenant_default';
};

/**
 * Get tenant-wide payment settings (fallback defaults)
 */
export function getTenantPaymentSettings(): PaymentSettings {
  return {
    connectIpsEnabled: process.env.CONNECTIPS_ENABLED === 'true',
    staticQrEnabled: process.env.STATIC_PAYMENT_QR_ENABLED === 'true',
    staticQrImageUrl: process.env.STATIC_PAYMENT_QR_IMAGE_URL || null,
    accountName: process.env.STATIC_PAYMENT_ACCOUNT_NAME || null,
    accountNumber: process.env.STATIC_PAYMENT_ACCOUNT_NUMBER || null,
    bankName: process.env.STATIC_PAYMENT_BANK_NAME || null,
    instructions: process.env.STATIC_PAYMENT_INSTRUCTIONS || null,
    source: 'tenant_default',
  };
}

/**
 * Get branch-specific payment settings with tenant fallback
 * Returns branch settings if configured, otherwise tenant defaults
 * 
 * ACCESS CONTROL (enforced in API routes):
 * - READ: Tenant admin or branch admin (for their branch)
 * - WRITE (upsert/delete): Tenant admin only
 */
export async function getBranchPaymentSettings(
  tenantId: string,
  branchId?: string
): Promise<PaymentSettings> {
  // If no branch ID, return tenant defaults
  if (!branchId) {
    return getTenantPaymentSettings();
  }

  // Fetch branch-specific settings if they exist
  const branchSettings = await prisma.branchPaymentSettings.findUnique({
    where: { branchId },
  });

  if (!branchSettings || branchSettings.tenantId !== tenantId || !branchSettings.staticQrEnabled) {
    // No custom settings; return tenant defaults
    return {
      ...getTenantPaymentSettings(),
      branchId,
      source: 'tenant_default',
    };
  }

  // Return branch-specific settings
  const tenantDefaults = getTenantPaymentSettings();
  return {
    connectIpsEnabled: tenantDefaults.connectIpsEnabled, // Always from tenant
    staticQrEnabled: branchSettings.staticQrEnabled,
    staticQrImageUrl: branchSettings.staticQrImageUrl,
    accountName: branchSettings.accountName,
    accountNumber: branchSettings.accountNumber,
    bankName: branchSettings.bankName,
    instructions: branchSettings.instructions,
    branchId,
    source: 'branch',
  };
}

/**
 * Upsert branch payment settings
 * Validates that at least one field is set if staticQrEnabled is true
 */
export async function upsertBranchPaymentSettings(
  tenantId: string,
  branchId: string,
  input: {
    staticQrEnabled: boolean;
    staticQrImageUrl?: string | null;
    accountName?: string | null;
    accountNumber?: string | null;
    bankName?: string | null;
    instructions?: string | null;
  }
): Promise<BranchPaymentSettings> {
  // Validation: if enabled, all required fields must be provided
  if (input.staticQrEnabled) {
    const required = [
      input.staticQrImageUrl?.trim(),
      input.accountName?.trim(),
      input.accountNumber?.trim(),
      input.bankName?.trim(),
    ];
    if (required.some(field => !field)) {
      throw new Error('All required fields must be provided when enabling static QR: imageUrl, accountName, accountNumber, bankName');
    }
  }

  const settings = await prisma.branchPaymentSettings.upsert({
    where: { branchId },
    create: {
      id: `branch-payment-${branchId}`,
      branchId,
      tenantId,
      staticQrEnabled: input.staticQrEnabled,
      staticQrImageUrl: input.staticQrEnabled ? input.staticQrImageUrl?.trim() || null : null,
      accountName: input.staticQrEnabled ? input.accountName?.trim() || null : null,
      accountNumber: input.staticQrEnabled ? input.accountNumber?.trim() || null : null,
      bankName: input.staticQrEnabled ? input.bankName?.trim() || null : null,
      instructions: input.instructions?.trim() || null,
    },
    update: {
      staticQrEnabled: input.staticQrEnabled,
      staticQrImageUrl: input.staticQrEnabled ? input.staticQrImageUrl?.trim() || null : null,
      accountName: input.staticQrEnabled ? input.accountName?.trim() || null : null,
      accountNumber: input.staticQrEnabled ? input.accountNumber?.trim() || null : null,
      bankName: input.staticQrEnabled ? input.bankName?.trim() || null : null,
      instructions: input.instructions?.trim() || null,
      updatedAt: new Date(),
    },
  });

  return settings;
}

/**
 * Delete branch payment settings (revert to tenant defaults)
 */
export async function deleteBranchPaymentSettings(
  tenantId: string,
  branchId: string
): Promise<void> {
  await prisma.branchPaymentSettings.deleteMany({
    where: { branchId, tenantId },
  });
}

/**
 * Get all branch payment settings for a tenant with overview
 */
export async function getTenantBranchPaymentSettings(tenantId: string) {
  const branches = await prisma.branch.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      address: true,
      paymentSettings: true,
    },
    orderBy: { name: 'asc' },
  });

  return {
    tenantDefaults: getTenantPaymentSettings(),
    branches: branches.map(b => ({
      branch: { id: b.id, name: b.name, location: b.address },
      hasCustomSettings: !!b.paymentSettings,
      settings: b.paymentSettings || null,
    })),
  };
}
