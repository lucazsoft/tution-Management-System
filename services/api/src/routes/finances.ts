import { sendPaymentCode, consumePaymentCode, isUploadedQr } from '../services/payment-settings-verification';
import { branchAllowance, pettyCashPeriod } from '../services/petty-cash';
import { Router, Response } from 'express';
import { LateFeeMode, Prisma, RefundPolicy } from '@prisma/client';
import prisma from '../utils/db';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware, hasPermission } from '../middleware/auth';
import { MockSmsSender } from '../utils/notifications';
import { getAdmissionTenure, getBillingPeriod } from '../utils/nepali';
import { managedBranchIds, canApprovePettyCashL1, canReleasePettyCash, canAccessBranch, hasBranchPermission, isTenantAdmin } from '../utils/access-control';
import crypto from 'node:crypto';
import { isInvoiceOverdue, recurringInvoiceType } from '../utils/billing-rules';
import { createConnectIpsForm, validateAndConfirmConnectIps } from '../utils/connectips';
import { parsePlainRecord, parseStrictKeys, parseStrictObject, readBoolean, readFiniteNumber, readTrimmedString } from '../utils/request-validation';
import { activateAdmissionAndSendLogins } from '../utils/admission-logins';
import { reconcileBranchBillingAccess } from '../services/billing-access';
import { buildFinancialIntelligence } from '../utils/financial-intelligence';
import { invoiceTypeLabel } from '../utils/invoice-document';
import { getTenantPaymentSettings, getBranchPaymentSettings, upsertBranchPaymentSettings, deleteBranchPaymentSettings, getTenantBranchPaymentSettings } from '../services/branch-payment-settings';
import { privateImageUrl, storePrivateImage } from '../services/object-storage';
import {
  compensationStructure,
  createPayrollRecords,
  PayrollConfigurationError,
  PayrollPeriodConflictError,
} from '../services/payroll-service';

const router = Router();

async function deliverPaidAdmission(invoice: { invoiceType: string; tenantId: string; studentId: string }) {
  if (invoice.invoiceType !== 'ADMISSION') return null;
  const student = await prisma.student.findFirst({
    where: { id: invoice.studentId, user: { tenantId: invoice.tenantId } },
    select: { admissionStatus: true },
  });
  if (student?.admissionStatus === 'ACTIVE') return null;
  return activateAdmissionAndSendLogins(invoice.tenantId, invoice.studentId);
}

// GET /payment-settings - Fetch payment settings for tenant or specific branch
router.get('/payment-settings', authMiddleware, async (req: TenantRequest, res: Response) => {
  try {
    const branchId = req.query.branchId;
    if (branchId !== undefined && (typeof branchId !== 'string' || !branchId.trim())) {
      return res.status(400).json({ error: 'Branch ID must be a non-empty string' });
    }
    if (!isTenantAdmin(req.user!) && (!branchId || !managedBranchIds(req.user!).includes(branchId))) {
      return res.status(403).json({ error: 'Insufficient permissions to view branch payment settings' });
    }
    
    // If no branch specified, return tenant defaults
    if (!branchId) {
      return res.json(getTenantPaymentSettings());
    }
    
    // Verify branch exists and belongs to tenant
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, tenantId: req.tenantId },
      select: { id: true },
    });
    
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }
    
    // Return merged: branch-specific settings with tenant defaults as fallback
    const settings = await getBranchPaymentSettings(req.tenantId!, branchId);
    return res.json(settings);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch payment settings' });
  }
});

router.post('/branches/:branchId/payment-settings/verification', authMiddleware, async (req: TenantRequest, res: Response) => {
  if (!isTenantAdmin(req.user!)) return res.status(403).json({ error: 'Tenant Admin access required' });
  const branch = await prisma.branch.findFirst({ where: { id: req.params.branchId, tenantId: req.tenantId! } });
  if (!branch) return res.status(404).json({ error: 'Branch not found' });
  if (!['save', 'reset'].includes(req.body?.action)) return res.status(400).json({ error: 'Invalid verification action' });
  if (req.body.action === 'save' && req.body.config?.staticQrEnabled && !isUploadedQr(req.body.config.staticQrImageUrl)) return res.status(400).json({ error: 'Upload a valid QR image before requesting verification.' });
  try { return res.json(await sendPaymentCode(req.tenantId!, req.user!.id, req.params.branchId, req.body.action, req.body.config)); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to send verification SMS.' }); }
});

// PUT /branches/:branchId/payment-settings - Update branch-specific payment settings (tenant admin only)
router.put('/branches/:branchId/payment-settings', authMiddleware, async (req: TenantRequest, res: Response) => {
  try {
    const { branchId } = req.params as { branchId: string };
    
    if (!branchId) {
      return res.status(400).json({ error: 'Branch ID is required' });
    }
    
    // Verify access: tenant admin only (branch admins can view but not edit)
    if (!isTenantAdmin(req.user)) {
      return res.status(403).json({ error: 'Tenant Admin access required to manage payment settings' });
    }
    
    // Verify branch exists
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, tenantId: req.tenantId },
    });
    
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }
    
    // Parse and validate input
    const { staticQrEnabled, staticQrImageUrl, accountName, accountNumber, bankName, instructions } = req.body ?? {};
    
    if (typeof staticQrEnabled !== 'boolean') {
      return res.status(400).json({ error: 'staticQrEnabled must be boolean' });
    }
    
    for (const [field, value, min, max] of [
      ['staticQrImageUrl', staticQrImageUrl, 1, 1_400_000],
      ['accountName', accountName, 1, 100],
      ['accountNumber', accountNumber, 5, 20],
      ['bankName', bankName, 1, 100],
      ['instructions', instructions, 0, 500],
    ] as const) {
      if (value != null && typeof value !== 'string') return res.status(400).json({ error: `${field} must be text` });
      if ((value?.trim().length ?? 0) > max || (staticQrEnabled && (value?.trim().length ?? 0) < min)) {
        return res.status(400).json({ error: `${field} must contain ${min}-${max} characters` });
      }
    }
    if (staticQrEnabled && !isUploadedQr(staticQrImageUrl)) return res.status(400).json({ error: 'Upload a PNG, JPEG, or WebP QR image under 1 MB. External URLs are not accepted.' });

    if (staticQrEnabled) {
      if (!staticQrImageUrl?.toString().trim()) return res.status(400).json({ error: 'QR image URL is required when static QR is enabled' });
      if (!accountName?.toString().trim()) return res.status(400).json({ error: 'Account name is required when static QR is enabled' });
      if (!accountNumber?.toString().trim()) return res.status(400).json({ error: 'Account number is required when static QR is enabled' });
      if (!bankName?.toString().trim()) return res.status(400).json({ error: 'Bank name is required when static QR is enabled' });
    }
    
    if (!await consumePaymentCode(req.tenantId!, req.user!.id, branchId, 'save', req.body, req.body?.verification)) return res.status(403).json({ error: 'SMS verification is invalid, expired, or does not match these changes.' });
    // Upsert branch settings
    const settings = await upsertBranchPaymentSettings(req.tenantId!, branchId, {
      staticQrEnabled,
      staticQrImageUrl: staticQrImageUrl?.toString() || null,
      accountName: accountName?.toString() || null,
      accountNumber: accountNumber?.toString() || null,
      bankName: bankName?.toString() || null,
      instructions: instructions?.toString() || null,
    });
    
    return res.json({ message: 'Branch payment settings updated successfully', data: settings });
  } catch (error: any) {
    if (error.message.includes('All required fields')) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to update payment settings' });
  }
});

// DELETE /branches/:branchId/payment-settings - Reset branch settings to tenant defaults (tenant admin only)
router.delete('/branches/:branchId/payment-settings', authMiddleware, async (req: TenantRequest, res: Response) => {
  try {
    const { branchId } = req.params as { branchId: string };
    
    if (!branchId) {
      return res.status(400).json({ error: 'Branch ID is required' });
    }
    
    // Verify access: tenant admin only
    if (!isTenantAdmin(req.user)) {
      return res.status(403).json({ error: 'Tenant Admin access required to manage payment settings' });
    }
    
    // Verify branch exists
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, tenantId: req.tenantId },
    });
    
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }
    
    if (!await consumePaymentCode(req.tenantId!, req.user!.id, branchId, 'reset', null, req.body?.verification)) return res.status(403).json({ error: 'SMS verification is invalid or expired.' });
    // Delete branch-specific settings
    await deleteBranchPaymentSettings(req.tenantId!, branchId);
    
    return res.json({ message: 'Branch payment settings deleted. Branch now uses tenant defaults.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete payment settings' });
  }
});

// GET /admin/branches/payment-settings - Admin endpoint to list all branch settings for tenant
router.get('/admin/branches/payment-settings', authMiddleware, async (req: TenantRequest, res: Response) => {
  try {
    if (!isTenantAdmin(req.user)) {
      return res.status(403).json({ error: 'Tenant Admin access required' });
    }
    
    const audit = await getTenantBranchPaymentSettings(req.tenantId!);
    return res.json(audit);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch branch payment settings' });
  }
});

type PettyCashRequestItem = { name: string; quantity: number; unitAmount: number; totalAmount: number };

function normalizePettyCashItems(value: unknown, purpose: string, amount: number): PettyCashRequestItem[] {
  if (Array.isArray(value)) {
    const items = value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const item = entry as Record<string, unknown>;
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const quantity = Number(item.quantity);
      const unitAmount = Number(item.unitAmount);
      if (!name || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitAmount) || unitAmount <= 0) return [];
      return [{ name, quantity, unitAmount, totalAmount: Math.round(quantity * unitAmount * 100) / 100 }];
    });
    if (items.length) return items;
  }
  return [{ name: purpose, quantity: 1, unitAmount: amount, totalAmount: amount }];
}

function parsePettyCashItems(value: unknown, legacyPurpose: string, legacyAmount: number) {
  if (value === undefined) {
    const items = normalizePettyCashItems(undefined, legacyPurpose, legacyAmount);
    return { success: true as const, items, total: legacyAmount };
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    return { success: false as const, error: 'Petty cash requests require between 1 and 50 items.' };
  }
  const items: PettyCashRequestItem[] = [];
  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { success: false as const, error: `Item ${index + 1} is invalid.` };
    }
    const item = entry as Record<string, unknown>;
    if (Object.keys(item).some((key) => !['name', 'quantity', 'unitAmount'].includes(key))) {
      return { success: false as const, error: `Item ${index + 1} contains an unsupported field.` };
    }
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const quantity = Number(item.quantity);
    const unitAmount = Number(item.unitAmount);
    if (!name || name.length > 160) return { success: false as const, error: `Item ${index + 1} needs a name no longer than 160 characters.` };
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) return { success: false as const, error: `Item ${index + 1} quantity must be a positive whole number.` };
    if (!Number.isFinite(unitAmount) || unitAmount <= 0 || unitAmount > 10_000_000) return { success: false as const, error: `Item ${index + 1} amount must be a positive number.` };
    items.push({ name, quantity, unitAmount, totalAmount: Math.round(quantity * unitAmount * 100) / 100 });
  }
  const total = Math.round(items.reduce((sum, item) => sum + item.totalAmount, 0) * 100) / 100;
  if (total > 10_000_000) return { success: false as const, error: 'Petty cash request total exceeds the allowed maximum.' };
  return { success: true as const, items, total };
}

async function loadInvoicePaymentAccess(req: TenantRequest, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId: req.tenantId! },
    include: {
      student: {
        include: {
          user: true,
          studentParents: { include: { parent: true } },
        },
      },
    },
  });
  if (!invoice) return null;
  const ownStudent = invoice.student.userId === req.user!.id;
  const ownParent = invoice.student.studentParents.some((link) => link.parent.userId === req.user!.id);
  const billingAccess = billingBranchScopes(req.user!);
  const staffAccess = billingAccess.scopes.includes(invoice.branchId)
    || hasBranchPermission(req.user!, 'manage_students', invoice.branchId);
  return ownStudent || ownParent || billingAccess.isTenantAdmin || staffAccess ? invoice : null;
}

async function loadStudentBillingAccess(req: TenantRequest, studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, user: { tenantId: req.tenantId! } },
    include: {
      grade: true,
      user: { include: { userRoles: { include: { branch: true } } } },
      studentParents: { include: { parent: true } },
    },
  });
  if (!student) return null;
  const branchIds = student.user.userRoles
    .map((assignment) => assignment.branchId)
    .filter((branchId): branchId is string => Boolean(branchId));
  const billingAccess = billingBranchScopes(req.user!);
  const allowed = student.userId === req.user!.id
    || student.studentParents.some((link) => link.parent.userId === req.user!.id)
    || billingAccess.isTenantAdmin
    || branchIds.some((branchId) => billingAccess.scopes.includes(branchId));
  return allowed ? student : null;
}

// Checkout resolves the branch from an authorized invoice, never a client-selected branch.
router.get('/invoices/:invoiceId/payment-settings', authMiddleware, async (req: TenantRequest, res: Response) => {
  try {
    const invoice = await loadInvoicePaymentAccess(req, req.params.invoiceId);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found or unavailable to this account.' });
    return res.json(await getBranchPaymentSettings(req.tenantId!, invoice.branchId));
  } catch {
    return res.status(500).json({ error: 'Failed to fetch payment instructions' });
  }
});

router.post('/connectips/initiate/:invoiceId', authMiddleware, async (req: TenantRequest, res: Response) => {
  try {
    const settings = getTenantPaymentSettings();
    if (!settings.connectIpsEnabled) return res.status(503).json({ error: 'connectIPS is not enabled for this institution.' });
    const invoice = await loadInvoicePaymentAccess(req, req.params.invoiceId);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found or unavailable to this account.' });
    if (invoice.status === 'PAID') return res.status(409).json({ error: 'Invoice is already paid.' });
    const amountPaisa = BigInt(Math.round(Number(invoice.netPayable) * 100));
    if (amountPaisa <= 0n) return res.status(422).json({ error: 'Invoice amount must be positive.' });

    let attempt = await prisma.paymentAttempt.findFirst({
      where: { invoiceId: invoice.id, provider: 'CONNECTIPS', status: { in: ['PENDING', 'INCOMPLETE'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!attempt) {
      const txnId = crypto.randomBytes(10).toString('hex');
      attempt = await prisma.paymentAttempt.create({
        data: {
          tenantId: req.tenantId!,
          branchId: invoice.branchId,
          invoiceId: invoice.id,
          provider: 'CONNECTIPS',
          status: 'PENDING',
          txnId,
          referenceId: txnId,
          amountPaisa,
          createdBy: req.user!.id,
        },
      });
    }
    if (attempt.amountPaisa !== amountPaisa) {
      return res.status(409).json({ error: 'Invoice amount changed after payment initiation. Start a new payment attempt.' });
    }
    const form = createConnectIpsForm(
      attempt.txnId,
      attempt.amountPaisa,
      `TMS invoice ${invoice.id.slice(0, 8)}`,
      `${invoice.invoiceType} fee payment`,
    );
    return res.status(201).json({
      payment: {
        txnId: attempt.txnId,
        invoiceId: invoice.id,
        amountPaisa: attempt.amountPaisa.toString(),
        status: attempt.status,
      },
      ...form,
    });
  } catch (error: any) {
    const configurationError = /CONNECTIPS_|connectIPS is not enabled|private key/i.test(error.message || '');
    return res.status(configurationError ? 503 : 500).json({
      error: configurationError ? 'connectIPS is not configured.' : 'Failed to initiate connectIPS payment.',
    });
  }
});

// Static NCHL success URL may point here directly, or the frontend may call it
// after receiving ?TXNID=. The gateway redirect itself is never trusted.
router.get('/connectips/return/success', async (req: TenantRequest, res: Response) => {
  const txnId = typeof req.query.TXNID === 'string' ? req.query.TXNID : '';
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(txnId)) return res.status(400).json({ error: 'Valid TXNID is required.' });
  try {
    const attempt = await validateAndConfirmConnectIps(txnId);
    if (!attempt) return res.status(404).json({ error: 'Payment attempt not found.' });
    const appUrl = process.env.PAYMENT_FRONTEND_BASE_URL?.replace(/\/$/, '');
    if (appUrl) return res.redirect(303, `${appUrl}/payment/result?txnId=${encodeURIComponent(attempt.txnId)}&status=${attempt.status.toLowerCase()}`);
    return res.json({ txnId: attempt.txnId, status: attempt.status });
  } catch {
    const appUrl = process.env.PAYMENT_FRONTEND_BASE_URL?.replace(/\/$/, '');
    if (appUrl) return res.redirect(303, `${appUrl}/payment/result?txnId=${encodeURIComponent(txnId)}&status=pending`);
    return res.status(502).json({ error: 'connectIPS validation is temporarily unavailable.' });
  }
});

router.get('/connectips/return/failure', async (req: TenantRequest, res: Response) => {
  const txnId = typeof req.query.TXNID === 'string' ? req.query.TXNID : '';
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(txnId)) return res.status(400).json({ error: 'Valid TXNID is required.' });
  const attempt = await prisma.paymentAttempt.findUnique({ where: { txnId } });
  if (!attempt || attempt.provider !== 'CONNECTIPS') return res.status(404).json({ error: 'Payment attempt not found.' });
  if (attempt.status !== 'SUCCESS') {
    await prisma.paymentAttempt.updateMany({
      where: { id: attempt.id, status: { not: 'SUCCESS' } },
      data: { gatewayStatus: 'USER_RETURNED_FAILURE', gatewayMessage: 'User returned through the failure URL.' },
    });
  }
  const current = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  const appUrl = process.env.PAYMENT_FRONTEND_BASE_URL?.replace(/\/$/, '');
  if (appUrl) return res.redirect(303, `${appUrl}/payment/result?txnId=${encodeURIComponent(txnId)}&status=${current.status.toLowerCase()}`);
  return res.json({ txnId, status: current.status });
});

router.post('/manual-payment/:invoiceId', authMiddleware, async (req: TenantRequest, res: Response) => {
  const invoice = await loadInvoicePaymentAccess(req, req.params.invoiceId);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found or unavailable to this account.' });
  if (invoice.status === 'PAID') return res.status(409).json({ error: 'Invoice is already paid.' });
  
  // Check if static QR is enabled for this branch
  const paymentSettings = await getBranchPaymentSettings(req.tenantId!, invoice.branchId);
  if (!paymentSettings.staticQrEnabled) return res.status(503).json({ error: 'Manual QR payment is not enabled for this branch.' });
  const shape = parseStrictKeys(req.body, ['referenceId', 'receiptProof']);
  if (!shape.success) return res.status(400).json({ error: shape.error });
  const referenceId = readTrimmedString(shape.data, 'referenceId', { required: true, maxLength: 80, pattern: /^[A-Za-z0-9._\/-]+$/, message: 'Enter a valid payment reference.' });
  const receiptProof = readTrimmedString(shape.data, 'receiptProof', { required: true, maxLength: 1_500_000, pattern: /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, message: 'Upload a PNG, JPEG, or WebP receipt under 1 MB.' });
  if (!referenceId.success) return res.status(400).json({ error: referenceId.error });
  if (!receiptProof.success) return res.status(400).json({ error: receiptProof.error });
  const duplicate = await prisma.paymentAttempt.findFirst({ where: { tenantId: req.tenantId!, provider: 'BANK', referenceId: referenceId.data } });
  if (duplicate) return res.status(409).json({ error: 'This payment reference was already submitted.' });
  const txnId = `qr_${crypto.randomBytes(8).toString('hex')}`;
  const attemptId = crypto.randomUUID();
  const storedProof = await storePrivateImage(receiptProof.data, { tenantId: req.tenantId!, branchId: invoice.branchId, category: 'payment-proofs', id: attemptId });
  const attempt = await prisma.paymentAttempt.create({ data: { id: attemptId, tenantId: req.tenantId!, branchId: invoice.branchId, invoiceId: invoice.id, provider: 'BANK', status: 'PENDING', txnId, referenceId: referenceId.data, amountPaisa: BigInt(Math.round(Number(invoice.netPayable) * 100)), receiptProof: storedProof, receiptMimeType: receiptProof.data.slice(5, receiptProof.data.indexOf(';')), gatewayStatus: 'AWAITING_REVIEW', createdBy: req.user!.id } });
  return res.status(201).json({ id: attempt.id, txnId, status: attempt.status, message: 'Receipt submitted for verification.' });
});

router.get('/manual-payments', authMiddleware, async (req: TenantRequest, res: Response) => {
  const access = billingBranchScopes(req.user);
  if (!access.isTenantAdmin && access.scopes.length === 0) return res.status(403).json({ error: 'You do not have access to payment receipts.' });
  const attempts = await prisma.paymentAttempt.findMany({ where: { tenantId: req.tenantId!, provider: 'BANK', status: { in: ['PENDING', 'SUCCESS', 'FAILED'] }, ...(access.isTenantAdmin ? {} : { branchId: { in: access.scopes } }) }, include: { invoice: { include: { student: { include: { user: true } } } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  return res.json({ attempts: await Promise.all(attempts.map(async (attempt) => ({ id: attempt.id, txnId: attempt.txnId, referenceId: attempt.referenceId, amount: Number(attempt.amountPaisa) / 100, status: attempt.status, receiptProof: await privateImageUrl(attempt.receiptProof), createdAt: attempt.createdAt, reviewedAt: attempt.reviewedAt, reviewRemarks: attempt.reviewRemarks, invoiceId: attempt.invoiceId, studentName: `${attempt.invoice.student.user.firstName} ${attempt.invoice.student.user.lastName}`.trim() }))) });
});

router.get('/payment-attempts', authMiddleware, async (req: TenantRequest, res: Response) => {
  const access = billingBranchScopes(req.user);
  if (!access.isTenantAdmin && access.scopes.length === 0) return res.status(403).json({ error: 'You do not have access to payment activity.' });
  const attempts = await prisma.paymentAttempt.findMany({
    where: { tenantId: req.tenantId!, provider: { in: ['CONNECTIPS', 'BANK'] }, ...(access.isTenantAdmin ? {} : { branchId: { in: access.scopes } }) },
    include: { branch: { select: { id: true, name: true } }, invoice: { include: { student: { include: { user: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return res.json({ attempts: await Promise.all(attempts.map(async (attempt) => ({
    id: attempt.id,
    txnId: attempt.txnId,
    provider: attempt.provider,
    referenceId: attempt.referenceId,
    amount: Number(attempt.amountPaisa) / 100,
    status: attempt.status,
    gatewayStatus: attempt.gatewayStatus,
    gatewayMessage: attempt.gatewayMessage,
    receiptProof: await privateImageUrl(attempt.receiptProof),
    createdAt: attempt.createdAt,
    confirmedAt: attempt.confirmedAt,
    failedAt: attempt.failedAt,
    reviewedAt: attempt.reviewedAt,
    reviewRemarks: attempt.reviewRemarks,
    invoiceId: attempt.invoiceId,
    invoiceStatus: attempt.invoice.status,
    branchId: attempt.branch.id,
    branchName: attempt.branch.name,
    studentName: `${attempt.invoice.student.user.firstName} ${attempt.invoice.student.user.lastName}`.trim(),
  }))) });
});

router.post('/manual-payments/:id/decision', authMiddleware, async (req: TenantRequest, res: Response) => {
  const access = billingBranchScopes(req.user);
  if (!access.isTenantAdmin && access.scopes.length === 0) return res.status(403).json({ error: 'You do not have access to review payment receipts.' });
  const shape = parseStrictKeys(req.body, ['decision', 'remarks']);
  if (!shape.success) return res.status(400).json({ error: shape.error });
  const decision = readTrimmedString(shape.data, 'decision', { required: true, maxLength: 10, pattern: /^(APPROVE|REJECT)$/, message: 'Decision must be APPROVE or REJECT.' });
  const remarks = readTrimmedString(shape.data, 'remarks', { required: false, maxLength: 500, message: 'Remarks are too long.' });
  if (!decision.success) return res.status(400).json({ error: decision.error });
  if (!remarks.success) return res.status(400).json({ error: remarks.error });
  const attempt = await prisma.paymentAttempt.findFirst({ where: { id: req.params.id, tenantId: req.tenantId!, provider: 'BANK', ...(access.isTenantAdmin ? {} : { branchId: { in: access.scopes } }) }, include: { invoice: true } });
  if (!attempt) return res.status(404).json({ error: 'Payment submission not found.' });
  if (attempt.status !== 'PENDING') return res.status(409).json({ error: 'This payment submission was already reviewed.' });
  if (decision.data === 'REJECT') { await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'FAILED', gatewayStatus: 'REJECTED', reviewRemarks: remarks.data, reviewedBy: req.user!.id, reviewedAt: new Date(), failedAt: new Date() } }); return res.json({ message: 'Payment receipt rejected.' }); }
  const paidAt = new Date();
  const admissionTenure = attempt.invoice.invoiceType === 'ADMISSION' ? await getAdmissionTenure(paidAt) : null;
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.paymentAttempt.updateMany({ where: { id: attempt.id, status: 'PENDING' }, data: { status: 'SUCCESS', gatewayStatus: 'APPROVED', reviewRemarks: remarks.data, reviewedBy: req.user!.id, reviewedAt: paidAt, confirmedAt: paidAt } });
    if (claimed.count !== 1) throw new Error('Payment was already reviewed.');
    const paid = await tx.invoice.updateMany({ where: { id: attempt.invoiceId, tenantId: req.tenantId!, status: { in: ['UNPAID', 'OVERDUE', 'BLOCKED_OVERRIDE'] } }, data: { status: 'PAID', transactionId: attempt.referenceId, paymentDate: paidAt, ...(admissionTenure ? { billingCycleStart: admissionTenure.start, billingCycleEnd: admissionTenure.end } : {}) } });
    if (paid.count !== 1) throw new Error('Invoice is already paid or unavailable.');
    if (attempt.invoice.invoiceType === 'ADMISSION') {
      await tx.student.updateMany({ where: { id: attempt.invoice.studentId, admissionStatus: 'PENDING_PAYMENT' }, data: { admissionStatus: 'READY_FOR_LOGIN' } });
    }
    await reconcileBranchBillingAccess(tx, attempt.tenantId, attempt.invoice.studentId, attempt.invoice.branchId, paidAt);
  });
  if (attempt.invoice.invoiceType === 'ADMISSION') await activateAdmissionAndSendLogins(req.tenantId!, attempt.invoice.studentId);
  return res.json({ message: 'Payment approved and invoice marked paid.' });
});

router.get('/connectips/status/:txnId', authMiddleware, async (req: TenantRequest, res: Response) => {
  const attempt = await prisma.paymentAttempt.findFirst({
    where: { txnId: req.params.txnId, tenantId: req.tenantId! },
  });
  if (!attempt) return res.status(404).json({ error: 'Payment attempt not found.' });
  const invoice = await loadInvoicePaymentAccess(req, attempt.invoiceId);
  if (!invoice) return res.status(404).json({ error: 'Payment attempt not found.' });
  return res.json({
    txnId: attempt.txnId,
    invoiceId: attempt.invoiceId,
    status: attempt.status,
    gatewayStatus: attempt.gatewayStatus,
    confirmedAt: attempt.confirmedAt,
  });
});

// ── Fee aggregation helpers ────────────────────────────────────────────────
const num = (v: any) => Number(v ?? 0);

// An invoice counts as overdue if explicitly OVERDUE, or unpaid past its due date.
function invoiceOverdue(inv: { status: string; dueDate: Date }): boolean {
  return isInvoiceOverdue(inv.status, inv.dueDate);
}

interface FeeSummary {
  totalBilled: number;
  totalPaid: number;
  totalDue: number;
  overdueCount: number;
  overdueAmount: number;
  invoiceCount: number;
}

function summarizeInvoices(invoices: Array<{ status: string; netPayable: any; dueDate: Date }>): FeeSummary {
  let totalBilled = 0, totalPaid = 0, totalDue = 0, overdueCount = 0, overdueAmount = 0;
  for (const inv of invoices) {
    const amt = num(inv.netPayable);
    totalBilled += amt;
    if (inv.status === 'PAID') {
      totalPaid += amt;
    } else if (inv.status === 'UNPAID' || inv.status === 'OVERDUE') {
      totalDue += amt;
      if (invoiceOverdue(inv)) {
        overdueCount += 1;
        overdueAmount += amt;
      }
    }
  }
  return { totalBilled, totalPaid, totalDue, overdueCount, overdueAmount, invoiceCount: invoices.length };
}

// Branches are derived from signed permission assignments, not a role-name
// shortcut. This keeps Accountant and any future finance role branch-scoped.
function permissionBranchScopes(user: any, permission: string): { isTenantAdmin: boolean; scopes: string[] } {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isTenantAdmin = roles.some((r: any) => r.roleName === 'Tenant Admin' && r.branchId === null);
  const scopes = [...new Set<string>(roles
    .filter((r: any) => r.branchId && Array.isArray(r.permissions) && r.permissions.includes(permission))
    .map((r: any) => String(r.branchId)))];
  return { isTenantAdmin, scopes };
}

function billingBranchScopes(user: any) {
  const permissionAccess = permissionBranchScopes(user, 'manage_billing');
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const branchAdminScopes = roles
    .filter((role: any) => role?.roleName === 'Branch Admin' && role?.branchId)
    .map((role: any) => String(role.branchId));

  return {
    isTenantAdmin: permissionAccess.isTenantAdmin,
    scopes: [...new Set([...permissionAccess.scopes, ...branchAdminScopes])],
  };
}

function addMonths(value: Date, count: number): Date {
  const next = new Date(value);
  next.setMonth(next.getMonth() + count);
  return next;
}

function staffBaseSalary(staff: { contractType: string; salaryStructure: Prisma.JsonValue }): number {
  const configured = compensationStructure(staff.contractType, staff.salaryStructure);
  return configured.success ? configured.value.baseMonthlySalary ?? 0 : 0;
}

// Shared, persisted billing contract for Accountants, Branch Admins and Tenant Admins.
// Future entries are projections only; invoices and payroll records are created when posted.
router.get('/billing-ledger', authMiddleware, async (req: TenantRequest, res: Response) => {
  const access = billingBranchScopes(req.user);
  if (!access.isTenantAdmin && access.scopes.length === 0) {
    return res.status(403).json({ error: 'You do not have access to billing records.' });
  }
  const branchFilter = access.isTenantAdmin ? {} : { userRoles: { some: { branchId: { in: access.scopes } } } };
  try {
    const [students, staff, tenant] = await Promise.all([
      prisma.student.findMany({
        where: { user: { tenantId: req.tenantId!, ...branchFilter } },
        include: {
          grade: true,
          user: { include: { userRoles: { include: { branch: true } } } },
          enrollments: { where: { status: 'ACTIVE' }, include: { course: true } },
          invoices: {
            where: access.isTenantAdmin ? {} : { branchId: { in: access.scopes } },
            orderBy: { dueDate: 'desc' },
          },
        },
      }),
      prisma.staffRecord.findMany({
        where: { user: { tenantId: req.tenantId!, ...branchFilter } },
        include: {
          user: { include: { userRoles: { include: { branch: true } } } },
          payrolls: {
            where: access.isTenantAdmin ? {} : { branchId: { in: access.scopes } },
            include: { branch: true },
            orderBy: [{ year: 'desc' }, { month: 'desc' }],
          },
        },
      }),
      prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { vatRate: true } }),
    ]);

    const now = new Date();
    const studentRows = await Promise.all(students.map(async (student) => {
      const assignment = student.user.userRoles.find((role) => role.branchId && (access.isTenantAdmin || access.scopes.includes(role.branchId)));
      const gradeFee = student.grade?.billingMode === 'GRADE' ? num(student.grade.monthlyFee) : 0;
      const courseFee = student.enrollments.reduce((sum, enrollment) => {
        if (!recurringInvoiceType(student.grade?.billingMode ?? 'GRADE', enrollment.course.isExtraActivity)) return sum;
        const fee = (enrollment.course.feeStructure ?? {}) as { monthlyBase?: number };
        const base = num(fee.monthlyBase);
        return sum + (enrollment.course.isTaxExempt ? base : base * (1 + num(enrollment.course.taxPercentage) / 100));
      }, 0);
      const monthlyAmount = Math.round((gradeFee + courseFee) * 100) / 100;
      const courseStart = student.admissionDate;
      const courseEnd = addMonths(courseStart, 12);
      const forecastStart = now > courseStart ? now : courseStart;
      const containingPeriod = await getBillingPeriod(forecastStart, 10);
      let cycleCursor = forecastStart > now
        ? containingPeriod.cycleStart
        : new Date(containingPeriod.cycleEnd.getTime() + 86_400_000);
      const projections: Array<{ cycleStart: Date; cycleEnd: Date; dueDate: Date; amount: number; billingPeriod: string }> = [];
      while (projections.length < 12) {
        const period = await getBillingPeriod(cycleCursor, 10);
        if (period.cycleStart > courseEnd) break;
        projections.push({
          cycleStart: period.cycleStart,
          cycleEnd: period.cycleEnd,
          dueDate: period.dueDate,
          amount: monthlyAmount,
          billingPeriod: period.label,
        });
        cycleCursor = new Date(period.cycleEnd.getTime() + 86_400_000);
      }
      return {
        studentId: student.id,
        studentName: `${student.user.firstName} ${student.user.lastName}`.trim(),
        email: student.user.email,
        grade: student.grade?.name ?? 'Unassigned',
        branchId: assignment?.branchId ?? null,
        branchName: assignment?.branch?.name ?? 'Unassigned',
        admissionDate: student.admissionDate,
        courseEnd,
        monthlyAmount,
        invoices: student.invoices.map((invoice) => ({
          id: invoice.id, invoiceType: invoice.invoiceType, amount: num(invoice.amount), discount: num(invoice.discount),
          fine: num(invoice.fine), netPayable: num(invoice.netPayable), status: invoice.status,
          overdue: invoiceOverdue(invoice), billingCycleStart: invoice.billingCycleStart,
          billingCycleEnd: invoice.billingCycleEnd, dueDate: invoice.dueDate, paymentDate: invoice.paymentDate,
          transactionId: invoice.transactionId, vatRate: num(invoice.vatRateSnapshot), createdAt: invoice.createdAt,
        })),
        projections,
      };
    }));

    const teacherRows = staff.map((record) => {
      const assignment = record.user.userRoles.find((role) => role.branchId && (access.isTenantAdmin || access.scopes.includes(role.branchId)));
      const baseSalary = staffBaseSalary(record);
      const nextMonth = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), 1);
      return {
        teacherId: record.id,
        userId: record.userId,
        teacherName: `${record.user.firstName} ${record.user.lastName}`.trim(),
        email: record.user.email,
        designation: record.designation,
        contractType: record.contractType,
        branchId: assignment?.branchId ?? null,
        branchName: assignment?.branch?.name ?? 'Unassigned',
        baseSalary,
        payrolls: record.payrolls.map((payroll) => ({
          id: payroll.id, branchId: payroll.branchId, branchName: payroll.branch.name,
          month: payroll.month, year: payroll.year, baseSalary: payroll.baseSalary,
          deductions: payroll.attendanceDeductions, bonuses: payroll.bonuses, netPayable: payroll.netPayable,
          status: payroll.status, settlementReference: payroll.settlementReference, paymentDate: payroll.paymentDate,
          createdAt: payroll.createdAt,
        })),
        projection: { month: nextMonth.getMonth() + 1, year: nextMonth.getFullYear(), baseSalary, deductions: 0, bonuses: 0, netPayable: baseSalary },
      };
    });
    return res.json({ generatedAt: now, vatRate: num(tenant?.vatRate), students: studentRows, teachers: teacherRows });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to load the shared billing ledger.', details: error.message });
  }
});

router.post('/billing-ledger/invoices', authMiddleware, async (req: TenantRequest, res: Response) => {
  const access = billingBranchScopes(req.user);
  if (!access.isTenantAdmin && access.scopes.length === 0) {
    return res.status(403).json({ error: 'You do not have access to create billing records.' });
  }
  const shape = parseStrictKeys(req.body, ['studentId', 'amount', 'discount', 'fine', 'invoiceType', 'periodAnchor']);
  if (!shape.success) return res.status(400).json({ error: shape.error });
  const studentId = readTrimmedString(shape.data, 'studentId', { required: true, maxLength: 128, message: 'A valid student is required.' });
  const amount = readFiniteNumber(shape.data, 'amount', { min: 0.01, max: 100_000_000, message: 'Amount must be greater than zero.' });
  const discount = readFiniteNumber(shape.data, 'discount', { min: 0, max: 100_000_000, message: 'Discount must be zero or greater.' });
  const fine = readFiniteNumber(shape.data, 'fine', { min: 0, max: 100_000_000, message: 'Fine must be zero or greater.' });
  const invoiceType = readTrimmedString(shape.data, 'invoiceType', { required: true, maxLength: 20, message: 'Invoice type is required.' });
  if (!studentId.success || !amount.success || !discount.success || !fine.success || !invoiceType.success || !['TUITION', 'SUBJECT', 'ACTIVITY'].includes(invoiceType.data)) {
    return res.status(400).json({ error: 'Valid student, amounts and invoice type are required.' });
  }
  const periodAnchor = new Date(String(shape.data.periodAnchor));
  if (Number.isNaN(periodAnchor.getTime())) return res.status(400).json({ error: 'A valid billing period anchor is required.' });
  const student = await loadStudentBillingAccess(req, studentId.data);
  if (!student) return res.status(404).json({ error: 'Student not found or outside your billing scope.' });
  const accessBranchId = student.user.userRoles
    .map((assignment) => assignment.branchId)
    .find((candidate): candidate is string => Boolean(candidate) && (access.isTenantAdmin || access.scopes.includes(candidate)));
  if (!accessBranchId) return res.status(404).json({ error: 'Student has no branch in your billing scope.' });
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { panNumber: true, vatRate: true } });
  const billingPeriod = await getBillingPeriod(periodAnchor, 10);
  const netPayable = Math.round((amount.data - discount.data + fine.data) * 100) / 100;
  if (netPayable < 0) return res.status(400).json({ error: 'Discount cannot exceed the invoice total.' });
  try {
    const invoice = await prisma.invoice.create({ data: {
      tenantId: req.tenantId!, branchId: accessBranchId, studentId: student.id, invoiceType: invoiceType.data as 'TUITION' | 'SUBJECT' | 'ACTIVITY',
      amount: amount.data, discount: discount.data, fine: fine.data, netPayable, billingCycleStart: billingPeriod.cycleStart,
      billingCycleEnd: billingPeriod.cycleEnd, dueDate: billingPeriod.dueDate, status: 'UNPAID', panNumberSnapshot: tenant?.panNumber ?? '', vatRateSnapshot: tenant?.vatRate ?? 0,
      lineItemsSnapshot: [{ label: invoiceTypeLabel(invoiceType.data), amount: amount.data }],
    } });
    return res.status(201).json({ message: 'Invoice created in the shared ledger.', invoice });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'This student already has an invoice of this type for the selected BS billing cycle.' });
    }
    return res.status(500).json({ error: 'Failed to create the invoice.' });
  }
});

router.post('/billing-ledger/payrolls', authMiddleware, async (req: TenantRequest, res: Response) => {
  const access = billingBranchScopes(req.user);
  if (!access.isTenantAdmin && access.scopes.length === 0) {
    return res.status(403).json({ error: 'You do not have access to create payroll records.' });
  }
  const shape = parseStrictKeys(req.body, ['staffRecordId', 'month', 'year', 'bonuses', 'deductions']);
  if (!shape.success) return res.status(400).json({ error: shape.error });
  const staffRecordId = readTrimmedString(shape.data, 'staffRecordId', { required: true, maxLength: 128, message: 'A valid teacher is required.' });
  const month = readFiniteNumber(shape.data, 'month', { min: 1, max: 12, message: 'Month must be between 1 and 12.' });
  const year = readFiniteNumber(shape.data, 'year', { min: 2000, max: 2100, message: 'Year must be valid.' });
  const bonuses = readFiniteNumber(shape.data, 'bonuses', { min: 0, max: 100_000_000, message: 'Bonuses must be zero or greater.' });
  const deductions = readFiniteNumber(shape.data, 'deductions', { min: 0, max: 100_000_000, message: 'Deductions must be zero or greater.' });
  if (!staffRecordId.success || !month.success || !year.success || !bonuses.success || !deductions.success || !Number.isInteger(month.data) || !Number.isInteger(year.data)) {
    return res.status(400).json({ error: 'Valid teacher and payroll amounts are required.' });
  }
  const record = await prisma.staffRecord.findFirst({
    where: {
      id: staffRecordId.data,
      user: {
        tenantId: req.tenantId!,
        ...(access.isTenantAdmin ? {} : { userRoles: { some: { branchId: { in: access.scopes } } } }),
      },
    },
    include: { user: { include: { userRoles: true } } },
  });
  if (!record) return res.status(404).json({ error: 'Teacher not found or outside your billing scope.' });
  const eligibleBranchIds = [...new Set(record.user.userRoles
    .map((role) => role.branchId)
    .filter((branchId): branchId is string => Boolean(branchId) && (access.isTenantAdmin || access.scopes.includes(branchId))))];
  if (eligibleBranchIds.length !== 1) {
    return res.status(422).json({ error: 'Payroll requires exactly one branch assignment in your billing scope.' });
  }
  try {
    const [payroll] = await createPayrollRecords({
      tenantId: req.tenantId!,
      branchId: eligibleBranchIds[0],
      staffRecordIds: [record.id],
      month: month.data,
      year: year.data,
      bonuses: bonuses.data,
      deductions: deductions.data,
    });
    return res.status(201).json({ message: 'Payroll created in the shared ledger.', payroll });
  } catch (error) {
    if (error instanceof PayrollConfigurationError) {
      return res.status(422).json({ error: error.message, incompleteStaff: error.staff });
    }
    if (error instanceof PayrollPeriodConflictError) {
      return res.status(409).json({ error: error.message, existingStaff: error.staff });
    }
    if (error instanceof Error && error.message === 'Deductions cannot exceed salary plus bonuses.') {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to create payroll.' });
  }
});

// One scoped contract powers the Accountant workspace. It deliberately omits
// tenant-wide records and returns empty arrays instead of presentation samples.
router.get('/accountant-workspace', authMiddleware, async (req: TenantRequest, res: Response) => {
  const billing = permissionBranchScopes(req.user, 'manage_billing');
  const pettyCash = permissionBranchScopes(req.user, 'manage_petty_cash');
  const report = permissionBranchScopes(req.user, 'view_reports');
  const tenantWide = billing.isTenantAdmin || pettyCash.isTenantAdmin || report.isTenantAdmin;
  const branchIds = [...new Set([...billing.scopes, ...pettyCash.scopes, ...report.scopes])];
  if (!tenantWide && branchIds.length === 0) {
    return res.status(403).json({ error: 'You do not have access to branch finance records.' });
  }

  const invoiceWhere: Prisma.InvoiceWhereInput = {
    tenantId: req.tenantId!,
    ...(tenantWide ? {} : { branchId: { in: billing.scopes } }),
  };
  const expenseWhere: Prisma.ExpenseWhereInput = {
    tenantId: req.tenantId!,
    ...(tenantWide ? {} : { branchId: { in: report.scopes } }),
  };
  const payrollWhere: Prisma.PayrollWhereInput = {
    tenantId: req.tenantId!,
    status: 'MANUALLY_PAID',
    ...(tenantWide ? {} : { staffRecord: { user: { userRoles: { some: { branchId: { in: report.scopes } } } } } }),
  };

  try {
    const [branches, invoices, requests, expenses, payrolls, tenant, pendingPaymentReviews] = await Promise.all([
      prisma.branch.findMany({
        where: { tenantId: req.tenantId!, ...(tenantWide ? {} : { id: { in: branchIds } }) },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.invoice.findMany({
        where: invoiceWhere,
        include: { student: { include: { user: { include: { userRoles: { include: { branch: true } } } } } } },
        orderBy: { dueDate: 'desc' },
        take: 500,
      }),
      prisma.pettyCash.findMany({
        where: {
          tenantId: req.tenantId!,
          ...(tenantWide ? {} : { accountantId: req.user!.id, branchId: { in: pettyCash.scopes } }),
        },
        include: { branch: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.expense.findMany({ where: expenseWhere, orderBy: { date: 'desc' }, take: 500 }),
      prisma.payroll.findMany({ where: payrollWhere, take: 500 }),
      prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { pettyCashCapNpr: true } }),
      prisma.paymentAttempt.count({ where: { tenantId: req.tenantId!, provider: 'BANK', status: 'PENDING', ...(tenantWide ? {} : { branchId: { in: billing.scopes } }) } }),
    ]);

    const allowances = await Promise.all(branches.map(branch => branchAllowance(prisma, req.tenantId!, branch.id)));
    const invoiceSummary = summarizeInvoices(invoices);
    const releasedPettyCash = requests
      .filter((item) => ['RELEASED', 'RECEIPT_SUBMITTED', 'CLOSED'].includes(item.status))
      .reduce((sum, item) => sum + num(item.amount), 0);
    const operatingCosts = expenses.reduce((sum, item) => sum + num(item.amount), 0)
      + payrolls.reduce((sum, item) => sum + num(item.netPayable), 0)
      + releasedPettyCash;
    const allowedBranchIds = new Set(branches.map((branch) => branch.id));

    return res.json({
      branches,
      pettyCashCap: num(tenant?.pettyCashCapNpr),
      pettyCashUsage: branches.map((branch, index) => ({
        branchId: branch.id,
        committed: allowances[index].used,
        limit: allowances[index].limit,
        available: allowances[index].available,
      })),
      summary: {
        collected: invoiceSummary.totalPaid,
        outstanding: invoiceSummary.totalDue,
        overdueAmount: invoiceSummary.overdueAmount,
        invoiceCount: invoiceSummary.invoiceCount,
        openPettyCash: requests.filter((item) => item.status !== 'CLOSED' && item.status !== 'REJECTED').length,
        awaitingReceipt: requests.filter((item) => item.status === 'RELEASED').length,
        pendingPaymentReviews,
      },
      pettyCash: requests.map((item) => ({
        id: item.id,
        branchId: item.branchId,
        branchName: item.branch.name,
        purpose: item.purpose,
        amount: num(item.amount),
        items: normalizePettyCashItems(item.requestItems, item.purpose, num(item.amount)),
        status: item.status,
        receiptProofUrl: item.receiptProofUrl,
        approvalChain: item.approvalChain,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      invoices: invoices.map((invoice) => {
        const branchRole = invoice.student.user.userRoles.find((role) => role.branchId && allowedBranchIds.has(role.branchId));
        return {
          id: invoice.id,
          studentId: invoice.studentId,
          studentName: `${invoice.student.user.firstName} ${invoice.student.user.lastName}`.trim(),
          branchId: branchRole?.branchId ?? null,
          branchName: branchRole?.branch?.name ?? null,
          amount: num(invoice.amount),
          discount: num(invoice.discount),
          netPayable: num(invoice.netPayable),
          status: invoice.status,
          overdue: invoiceOverdue(invoice),
          billingCycleStart: invoice.billingCycleStart,
          billingCycleEnd: invoice.billingCycleEnd,
          dueDate: invoice.dueDate,
          paymentDate: invoice.paymentDate,
          transactionId: invoice.transactionId,
        };
      }),
      reports: {
        revenue: invoiceSummary.totalPaid,
        operatingCosts,
        netMargin: invoiceSummary.totalPaid - operatingCosts,
        expenseCount: expenses.length,
        ledgerEntryCount: invoices.filter((item) => item.status === 'PAID').length + expenses.length + payrolls.length,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to load the Accountant workspace.' });
  }
});

// Fee overview scoped to the caller's authorized billing branches. Tenant Admins
// receive the institution-wide aggregate; branch roles only receive their branch.
router.get(
  '/overview',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const { isTenantAdmin, scopes } = billingBranchScopes(req.user);
    if (!isTenantAdmin && scopes.length === 0) {
      return res.status(403).json({ error: 'You do not have access to fee totals.' });
    }
    try {
      const invoices = await prisma.invoice.findMany({
        where: {
          tenantId: req.tenantId!,
          ...(!isTenantAdmin ? { branchId: { in: scopes } } : {}),
        },
      });
      const summary = summarizeInvoices(invoices);
      const overdueStudentIds = new Set(invoices.filter(invoiceOverdue).map((i) => i.studentId));
      const period = await getBillingPeriod(new Date(), 10);
      return res.json({
        collected: summary.totalPaid,
        outstanding: summary.totalDue,
        overdueAmount: summary.overdueAmount,
        overdueStudents: overdueStudentIds.size,
        invoiceCount: summary.invoiceCount,
        billingPeriod: period.label,
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to compute fee overview.', details: error.message });
    }
  }
);

// Per-student fee status, ordered by dues owed (highest first).
router.get(
  '/students',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const { isTenantAdmin, scopes } = billingBranchScopes(req.user);
    if (!isTenantAdmin && scopes.length === 0) {
      return res.status(403).json({ error: 'You do not have access to fee records.' });
    }

    try {
      const students = await prisma.student.findMany({
        where: { user: { tenantId: req.tenantId! } },
        include: { user: { include: { userRoles: { include: { branch: true } } } } },
      });
      const invoices = await prisma.invoice.findMany({
        where: { tenantId: req.tenantId!, ...(isTenantAdmin ? {} : { branchId: { in: scopes } }) },
      });

      const byStudent = new Map<string, typeof invoices>();
      for (const inv of invoices) {
        const list = byStudent.get(inv.studentId) ?? [];
        list.push(inv);
        byStudent.set(inv.studentId, list);
      }

      const rows = students
        .map((s) => {
          const scopedRole = s.user.userRoles.find((ur) => ur.branchId && (isTenantAdmin || scopes.includes(ur.branchId)));
          const branchId = scopedRole?.branchId ?? null;
          const branchName = scopedRole?.branch?.name ?? null;
          const summary = summarizeInvoices(byStudent.get(s.id) ?? []);
          return {
            studentId: s.id,
            userId: s.userId,
            name: `${s.user.firstName} ${s.user.lastName}`,
            email: s.user.email,
            branchId,
            branchName,
            ...summary,
          };
        })
        .filter((r) => isTenantAdmin || (r.branchId && scopes.includes(r.branchId)))
        .sort((a, b) => b.totalDue - a.totalDue);

      return res.json({ students: rows });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to load student fees.', details: error.message });
    }
  }
);

// Invoices for one student.
router.get(
  '/students/:studentId/invoices',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    try {
      const student = await loadStudentBillingAccess(req, req.params.studentId);
      if (!student) return res.status(404).json({ error: 'Student fee record not found or unavailable.' });
      const ownStudent = student.userId === req.user!.id;
      const ownParent = student.studentParents.some((link) => link.parent.userId === req.user!.id);
      const billingAccess = billingBranchScopes(req.user!);
      const invoiceScope = ownStudent || ownParent || billingAccess.isTenantAdmin
        ? {}
        : { branchId: { in: billingAccess.scopes } };
      const [invoices, loginDeliveries, tenant] = await Promise.all([
        prisma.invoice.findMany({
          where: { studentId: student.id, tenantId: req.tenantId!, ...invoiceScope },
          include: { branch: { select: { name: true } } },
          orderBy: { dueDate: 'desc' },
        }),
        prisma.$queryRaw<Array<{
          recipient: 'STUDENT' | 'PARENT';
          status: 'PENDING' | 'SENT' | 'FAILED';
          failureReason: string | null;
          attemptCount: number;
          lastAttemptAt: Date | null;
          sentAt: Date | null;
        }>>`
          SELECT "recipient", "status", "failureReason", "attemptCount", "lastAttemptAt", "sentAt"
          FROM "AdmissionLoginDelivery"
          WHERE "tenantId" = ${req.tenantId!} AND "studentId" = ${student.id}
          ORDER BY "recipient" ASC
        `,
        prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { name: true, panNumber: true } }),
      ]);
      const normalizedInvoices = await Promise.all(invoices.map(async (invoice) => {
        if (invoice.invoiceType !== 'ADMISSION' || invoice.status !== 'PAID' || !invoice.paymentDate) return invoice;
        const tenure = await getAdmissionTenure(invoice.paymentDate);
        return { ...invoice, billingCycleStart: tenure.start, billingCycleEnd: tenure.end };
      }));
      return res.json({
        admissionStatus: student.admissionStatus,
        loginDeliveries,
        invoices: normalizedInvoices.map((i) => ({
          id: i.id,
          invoiceType: i.invoiceType,
          institutionName: tenant?.name ?? 'Institution',
          panNumber: i.panNumberSnapshot || tenant?.panNumber || '',
          vatRate: num(i.vatRateSnapshot),
          studentName: `${student.user.firstName} ${student.user.lastName}`.trim(),
          admissionNumber: student.admissionNumber,
          gradeName: student.grade?.name ?? null,
          issuedAt: i.createdAt,
          transactionId: i.transactionId,
          lines: Array.isArray(i.lineItemsSnapshot)
            ? (i.lineItemsSnapshot as Array<{ label?: unknown; amount?: unknown }>).map((line) => ({ label: String(line.label || 'Charge'), amount: num(line.amount) }))
            : [{ label: invoiceTypeLabel(i.invoiceType), amount: num(i.amount) }],
          discount: num(i.discount),
          fine: num(i.fine),
          netPayable: num(i.netPayable),
          status: i.status,
          overdue: invoiceOverdue(i),
          dueDate: i.dueDate,
          billingCycleStart: i.billingCycleStart,
          billingCycleEnd: i.billingCycleEnd,
          paymentDate: i.paymentDate,
          branchName: i.branch.name,
        })),
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to load invoices.', details: error.message });
    }
  }
);

// Record a payment against an invoice (cash/bank or a gateway reference).
router.post(
  '/invoices/:id/pay',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const { id } = req.params;
    const input = parseStrictObject(req.body, {
      fields: {
        transactionId: {
          required: false,
          maxLength: 128,
          pattern: /^(?:[A-Za-z0-9._/-]+)?$/,
          normalize: (value) => value.trim(),
          message: 'transactionId must be a valid payment reference.',
        },
      },
    });
    if (!input.success) return res.status(400).json({ error: input.error });
    // The UI sends the generic label "CASH" for manual collection. Invoice
    // references are unique in the ledger, so turn that label into a unique
    // receipt reference instead of reusing the same value for every payment.
    const requestedReference = input.data.transactionId;
    const transactionId = !requestedReference || requestedReference.toUpperCase() === 'CASH'
      ? `CASH-${crypto.randomUUID()}`
      : requestedReference;
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: { student: { include: { user: { include: { userRoles: true } } } } },
      });
      if (!invoice || invoice.tenantId !== req.tenantId) {
        return res.status(404).json({ error: 'Invoice not found in your institution.' });
      }
      const billingAccess = billingBranchScopes(req.user!);
      if (
        !billingAccess.isTenantAdmin &&
        !billingAccess.scopes.includes(invoice.branchId)
      ) {
        return res.status(403).json({ error: 'You cannot record payments for this student branch.' });
      }
      if (invoice.status === 'PAID') {
        return res.status(400).json({ error: 'This invoice is already paid.' });
      }
      const paidAt = new Date();
      const admissionTenure = invoice.invoiceType === 'ADMISSION' ? await getAdmissionTenure(paidAt) : null;
      const updated = await prisma.$transaction(async (tx) => {
        const transition = await tx.invoice.updateMany({
          where: { id, tenantId: req.tenantId!, status: { not: 'PAID' } },
          data: { status: 'PAID', paymentDate: paidAt, transactionId, ...(admissionTenure ? { billingCycleStart: admissionTenure.start, billingCycleEnd: admissionTenure.end } : {}) },
        });
        if (transition.count !== 1) return null;
        const paid = await tx.invoice.findUniqueOrThrow({ where: { id } });
        await reconcileBranchBillingAccess(tx, paid.tenantId, paid.studentId, paid.branchId, paidAt);
        if (paid.invoiceType === 'ADMISSION') {
          await tx.student.update({
            where: { id: paid.studentId },
            data: { admissionStatus: 'READY_FOR_LOGIN' },
          });
        }
        return paid;
      });
      if (!updated) {
        return res.status(409).json({ error: 'Invoice payment was already processed by another request.' });
      }
      let loginDelivery: Awaited<ReturnType<typeof activateAdmissionAndSendLogins>> | null = null;
      if (updated.invoiceType === 'ADMISSION') {
        loginDelivery = await activateAdmissionAndSendLogins(req.tenantId!, updated.studentId);
      }
      return res.json({
        message: updated.invoiceType === 'ADMISSION'
          ? loginDelivery?.delivered
            ? 'Payment recorded. Student and parent login IDs were sent by SMS.'
            : `Payment recorded, but login SMS delivery failed. ${loginDelivery?.failures.join(' ') || 'Retry from Admissions.'}`
          : 'Payment recorded.',
        invoice: { id: updated.id, status: updated.status, paymentDate: updated.paymentDate, transactionId: updated.transactionId },
        loginDelivery,
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res.status(409).json({ error: 'That payment reference has already been used. Try marking the invoice as paid again.' });
      }
      return res.status(500).json({ error: 'Failed to record payment.', details: error.message });
    }
  }
);

// Monthly billing run: generate this BS month's invoice for each active student
// who doesn't already have one for the cycle (one invoice per student per month,
// summing their active enrolments' fees).
router.post(
  '/generate-invoices',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const { isTenantAdmin, scopes } = billingBranchScopes(req.user);
    if (!isTenantAdmin && scopes.length === 0) {
      return res.status(403).json({ error: 'You do not have access to generate invoices.' });
    }
    const scopedUserRoles = isTenantAdmin ? {} : { userRoles: { some: { branchId: { in: scopes } } } };
    try {
      const period = await getBillingPeriod(new Date(), 10);
      const tenantConfig = await prisma.tenant.findUnique({ where: { id: req.tenantId! } });
      if (!tenantConfig) return res.status(404).json({ error: 'Tenant not found.' });

      // Monthly bill per student = their grade's base tuition (all subjects) +
      // net fees of their active extra-activity enrolments.
      const fees = new Map<string, { studentId: string; branchId: string; invoiceType: 'TUITION' | 'SUBJECT' | 'ACTIVITY'; amount: number; lines: Array<{ label: string; amount: number }> }>();
      const addFee = (studentId: string, branchId: string, invoiceType: 'TUITION' | 'SUBJECT' | 'ACTIVITY', amount: number, label: string) => {
        const key = `${studentId}:${invoiceType}`;
        const current = fees.get(key);
        fees.set(key, {
          studentId,
          branchId,
          invoiceType,
          amount: (current?.amount ?? 0) + amount,
          lines: [...(current?.lines ?? []), { label, amount: Math.round(amount * 100) / 100 }],
        });
      };

      // 1. Grade base tuition for every student who has a graded level.
      const students = await prisma.student.findMany({
        where: {
          user: { tenantId: req.tenantId!, status: 'ACTIVE', ...scopedUserRoles },
          admissionStatus: 'ACTIVE',
          gradeId: { not: null },
          enrollments: { some: { status: 'ACTIVE', OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] } },
        },
        include: {
          grade: { select: { name: true, monthlyFee: true, billingMode: true } },
          enrollments: {
            where: {
              status: 'ACTIVE',
              OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
              course: { tenantId: req.tenantId!, ...(!isTenantAdmin ? { branchId: { in: scopes } } : {}) },
            },
            include: { course: { select: { branchId: true } } },
            take: 1,
          },
        },
      });
      for (const s of students) {
        const branchId = s.enrollments[0]?.course.branchId;
        if (branchId && s.grade?.billingMode === 'GRADE' && s.grade.monthlyFee > 0) {
          addFee(s.id, branchId, 'TUITION', s.grade.monthlyFee, `${s.grade.name} tuition package`);
        }
      }

      // 2. Add active extra-activity enrolment fees.
      const enrollments = await prisma.enrollment.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
          student: {
            admissionStatus: 'ACTIVE',
            user: { status: 'ACTIVE', ...scopedUserRoles },
          },
          course: { tenantId: req.tenantId!, ...(!isTenantAdmin ? { branchId: { in: scopes } } : {}) },
        },
        include: { course: true, student: { include: { grade: true } } },
      });
      for (const e of enrollments) {
        const invoiceType = recurringInvoiceType(
          e.student.grade?.billingMode ?? 'GRADE',
          e.course.isExtraActivity,
        );
        if (!invoiceType) continue;
        const fee = (e.course.feeStructure ?? {}) as { monthlyBase?: number };
        const base = Number(fee.monthlyBase || 0);
        const net = e.course.isTaxExempt ? base : base * (1 + Number(e.course.taxPercentage || 13) / 100);
        addFee(e.studentId, e.course.branchId, invoiceType, net, e.course.name);
      }

      // Students already invoiced for this cycle.
      const existing = await prisma.invoice.findMany({
        where: {
          tenantId: req.tenantId!,
          billingCycleStart: period.cycleStart,
          invoiceType: { in: ['TUITION', 'SUBJECT', 'ACTIVITY'] },
        },
        select: { studentId: true, invoiceType: true },
      });
      const alreadyBilled = new Set(existing.map((i) => `${i.studentId}:${i.invoiceType}`));

      let created = 0;
      for (const [key, charge] of fees) {
        if (alreadyBilled.has(key) || charge.amount <= 0) continue;
        const net = charge.amount;
        try {
          await prisma.invoice.create({ data: {
            tenantId: req.tenantId!,
            branchId: charge.branchId,
            studentId: charge.studentId,
            invoiceType: charge.invoiceType,
            panNumberSnapshot: tenantConfig.panNumber,
            vatRateSnapshot: tenantConfig.vatRate,
            lineItemsSnapshot: charge.lines,
            amount: Math.round(net * 100) / 100,
            discount: 0,
            fine: 0,
            netPayable: Math.round(net * 100) / 100,
            billingCycleStart: period.cycleStart,
            billingCycleEnd: period.cycleEnd,
            dueDate: period.dueDate,
            status: 'UNPAID',
          } });
          created += 1;
        } catch (error: any) {
          // The database constraint is the final guard when two billing runs
          // overlap after both have read the same pre-existing invoice set.
          if (error?.code !== 'P2002') throw error;
        }
      }

      return res.json({ message: `Generated ${created} invoice(s) for ${period.label}.`, created, billingPeriod: period.label, skipped: fees.size - created });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to generate invoices.', details: error.message });
    }
  }
);

// Generate NepalPay EMVCo QR Payload for an invoice.
router.get(
  '/nepalpay-qr/:invoiceId',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    try {
      const authorizedInvoice = await loadInvoicePaymentAccess(req, req.params.invoiceId);
      if (!authorizedInvoice) return res.status(404).json({ error: 'Invoice not found or unavailable to this account.' });
      const invoice = await prisma.invoice.findUnique({
        where: { id: authorizedInvoice.id },
        include: { student: { include: { user: true } } },
      });
      if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

      // Format NepalPay EMVCo static/dynamic payload string format
      const payload = {
        invoiceId: invoice.id,
        merchantName: 'TMS Tuition Management System',
        merchantCity: 'Kathmandu',
        amount: Number(invoice.netPayable),
        currency: 'NPR',
        currencyCode: '524',
        studentName: `${invoice.student.user.firstName} ${invoice.student.user.lastName}`,
        qrString: `00020101021226580012np.nepalpay0118TMS${invoice.tenantId.slice(0, 8)}520459995303524540${Number(invoice.netPayable).toFixed(2)}5802NP5922TMS Tuition Management6009Kathmandu6304ABCD`,
      };

      return res.json(payload);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to generate NepalPay QR payload.', details: error.message });
    }
  }
);

// Current Nepali (Bikram Sambat) billing period — drives billing-cycle labels.
router.get(
  '/billing-period',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    try {
      const anchorValue = typeof req.query.anchor === 'string' ? req.query.anchor : '';
      const anchor = anchorValue ? new Date(anchorValue) : new Date();
      if (Number.isNaN(anchor.getTime())) return res.status(400).json({ error: 'A valid billing period anchor is required.' });
      const period = await getBillingPeriod(anchor, 10);
      return res.json({
        label: period.label,
        bsYear: period.bsYear,
        bsMonthName: period.bsMonthName,
        bsMonthNameNp: period.bsMonthNameNp,
        daysInMonth: period.daysInMonth,
        cycleStart: period.cycleStart,
        cycleEnd: period.cycleEnd,
        dueDate: period.dueDate,
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to resolve billing period.', details: error.message });
    }
  }
);

// 1. Get Monthly Financial Forecast (Admin only)
router.get(
  '/forecast',
  authMiddleware,
  hasPermission('view_reports'),
  async (req: TenantRequest, res: Response) => {
    if (!isTenantAdmin(req.user!)) {
      return res.status(403).json({ error: 'Institution-wide P&L is available only to the Tenant Admin.' });
    }
    try {
      const now = new Date();
      const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const [enrollments, paid, historical] = await Promise.all([
        prisma.enrollment.findMany({
          where: { status: 'ACTIVE', course: { tenantId: req.tenantId! } },
          include: { course: { select: { feeStructure: true } } },
        }),
        prisma.invoice.aggregate({
          where: { tenantId: req.tenantId!, status: 'PAID', paymentDate: { gte: cycleStart, lt: cycleEnd } },
          _sum: { netPayable: true },
        }),
        prisma.enrollment.count({
          where: { course: { tenantId: req.tenantId! }, status: { in: ['ACTIVE', 'DROPPED'] } },
        }),
      ]);
      const baseForecastNpr = enrollments.reduce((sum, enrollment) => {
        const fee = enrollment.course.feeStructure as { monthlyBase?: number };
        return sum + Number(fee?.monthlyBase || 0);
      }, 0);
      const dropped = Math.max(0, historical - enrollments.length);
      const dropoutRate = historical > 0 ? dropped / historical : 0;
      const attritionNpr = baseForecastNpr * dropoutRate;
      const netForecastNpr = Math.max(0, baseForecastNpr - attritionNpr);
      const actualCollectedNpr = Number(paid._sum.netPayable ?? 0);

      return res.status(200).json({
        billingCycle: cycleStart.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        metrics: {
          baseForecastNpr,
          estimatedAttritionNpr: attritionNpr,
          attritionPercentage: `${(dropoutRate * 100).toFixed(1)}%`,
          netForecastNpr,
          actualCollectedNpr,
          varianceNpr: actualCollectedNpr - netForecastNpr,
          activeEnrollments: enrollments.length,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to compute monthly financial forecast.' });
    }
  }
);

// 2. Get AI-Driven Expense Suggestions and Anomalies (Admin only)
router.get(
  '/suggestions',
  authMiddleware,
  hasPermission('view_reports'),
  async (req: TenantRequest, res: Response) => {
    if (!isTenantAdmin(req.user!)) {
      return res.status(403).json({ error: 'Institution-wide ledger export is available only to the Tenant Admin.' });
    }
    try {
      const now = new Date();
      const historyStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const historyEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const payrollPeriods = Array.from({ length: 4 }, (_, index) => {
        const period = new Date(now.getFullYear(), now.getMonth() - index, 1);
        return { year: period.getFullYear(), month: period.getMonth() + 1 };
      });
      const [expenses, payrolls, enrollments] = await Promise.all([
        prisma.expense.findMany({
          where: { tenantId: req.tenantId!, date: { gte: historyStart, lt: historyEnd } },
          select: { category: true, amount: true, date: true },
        }),
        prisma.payroll.findMany({
          where: {
            tenantId: req.tenantId!,
            OR: payrollPeriods,
          },
          select: { netPayable: true, month: true, year: true },
        }),
        prisma.enrollment.findMany({
          where: { status: 'ACTIVE', course: { tenantId: req.tenantId! } },
          include: { course: { select: { feeStructure: true } } },
        }),
      ]);
      const projectedIncomeNpr = enrollments.reduce((sum, enrollment) => {
        const fee = enrollment.course.feeStructure as { monthlyBase?: number };
        return sum + Number(fee?.monthlyBase || 0);
      }, 0);

      return res.status(200).json(buildFinancialIntelligence({
        now,
        expenses,
        payrolls: payrolls.map((item) => ({ ...item, netPayable: Number(item.netPayable) })),
        projectedIncomeNpr,
        activeEnrollments: enrollments.length,
      }));
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to generate financial intelligence suggestions.' });
    }
  }
);

// 3. Nepal Pay Webhook confirmation endpoint
router.post(
  '/nepalpay/webhook',
  async (req: TenantRequest, res: Response) => {
    const shape = parseStrictKeys(req.body, ['invoiceId', 'transactionId', 'status', 'paymentAmount']);
    if (!shape.success) return res.status(400).json({ error: shape.error });
    const invoiceId = readTrimmedString(shape.data, 'invoiceId', { required: true, maxLength: 128, message: 'A valid invoiceId is required.' });
    const transactionId = readTrimmedString(shape.data, 'transactionId', { required: true, maxLength: 128, pattern: /^[A-Za-z0-9._/-]+$/, message: 'A valid transactionId is required.' });
    const status = readTrimmedString(shape.data, 'status', { required: true, maxLength: 20, pattern: /^SUCCESS$/, message: 'Payment status must be SUCCESS.' });
    const paymentAmount = readFiniteNumber(shape.data, 'paymentAmount', { min: 0.01, max: 100_000_000, message: 'paymentAmount must be a positive finite number.' });
    if (!invoiceId.success) return res.status(400).json({ error: invoiceId.error });
    if (!transactionId.success) return res.status(400).json({ error: transactionId.error });
    if (!status.success) return res.status(400).json({ error: status.error });
    if (!paymentAmount.success) return res.status(400).json({ error: paymentAmount.error });
    const webhookSecret = process.env.NEPALPAY_WEBHOOK_SECRET;
    const suppliedSignature = req.header('x-nepalpay-signature') || '';
    if (!webhookSecret) {
      return res.status(503).json({ error: 'Payment webhook is not configured.' });
    }
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    const validSignature =
      suppliedSignature.length === expectedSignature.length &&
      crypto.timingSafeEqual(Buffer.from(suppliedSignature), Buffer.from(expectedSignature));
    if (!validSignature) {
      return res.status(401).json({ error: 'Invalid payment webhook signature.' });
    }

    try {
      if (status.data === 'SUCCESS') {
        const duplicate = await prisma.invoice.findFirst({ where: { transactionId: transactionId.data } });
        if (duplicate && duplicate.id !== invoiceId.data) {
          return res.status(409).json({ error: 'Transaction has already been used.' });
        }
        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId.data } });

        if (!invoice) {
          return res.status(404).json({ error: 'Invoice not found.' });
        }
        if (Number(invoice.netPayable) !== paymentAmount.data) {
          return res.status(422).json({ error: 'Payment amount does not match the invoice.' });
        }
        if (invoice.status === 'PAID') {
          if (invoice.transactionId !== transactionId.data) {
            return res.status(409).json({ error: 'Invoice was paid using a different transaction.' });
          }
          const admissionDelivery = await deliverPaidAdmission(invoice);
          return res.status(admissionDelivery && !admissionDelivery.delivered ? 503 : 200).json({
            message: admissionDelivery && !admissionDelivery.delivered
              ? 'Payment recorded; admission login delivery is pending. Retry this callback.'
              : 'Payment was already recorded.',
            invoiceId: invoice.id,
          });
        }

        const confirmed = await prisma.$transaction(async (tx) => {
          const transition = await tx.invoice.updateMany({
            where: {
              id: invoiceId.data,
              tenantId: invoice.tenantId,
              status: { in: ['UNPAID', 'OVERDUE', 'BLOCKED_OVERRIDE'] },
            },
            data: {
              status: 'PAID',
              transactionId: transactionId.data,
              paymentDate: new Date(),
            },
          });
          if (transition.count !== 1) return false;

          await reconcileBranchBillingAccess(tx, invoice.tenantId, invoice.studentId, invoice.branchId);
          if (invoice.invoiceType === 'ADMISSION') {
            await tx.student.updateMany({
              where: { id: invoice.studentId, admissionStatus: 'PENDING_PAYMENT' },
              data: { admissionStatus: 'READY_FOR_LOGIN' },
            });
          }
          return true;
        });
        if (!confirmed) {
          return res.status(409).json({ error: 'Invoice changed during payment confirmation. Retry this callback.' });
        }

        const admissionDelivery = await deliverPaidAdmission(invoice);
        if (admissionDelivery && !admissionDelivery.delivered) {
          return res.status(503).json({ error: 'Payment recorded; admission login delivery is pending. Retry this callback.', invoiceId: invoice.id });
        }

        const smsSender = new MockSmsSender();
        await smsSender.sendSms(
          '98510XXXXX',
          `Dear Parent, fee payment of NPR ${paymentAmount.data} received successfully. Ref ID: ${transactionId.data}.`
        );

        return res.status(200).json({
          message: admissionDelivery
            ? admissionDelivery.delivered
              ? 'Payment confirmed and admission login IDs were sent by SMS.'
              : 'Payment confirmed, but admission login SMS delivery failed.'
            : 'Payment confirmed and branch enrollment access reconciled.',
          payment: {
            invoiceId: invoiceId.data,
            transactionId: transactionId.data,
            status: 'PAID',
            paymentDate: new Date(),
          },
        });
      } else {
        return res.status(400).json({ error: 'Payment status failed or not recognized.' });
      }
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Transaction has already been used.' });
      }
      return res.status(500).json({ error: 'Failed to process Nepal Pay webhook.', details: error.message });
    }
  }
);

// 4. Create Category Expense
router.post(
  '/expenses',
  authMiddleware,
  hasPermission('view_reports'),
  async (req: TenantRequest, res: Response) => {
    const { category, amount, purpose, branchId } = req.body;
    const tenantId = req.tenantId!;

    if (!category || amount === undefined || !purpose) {
      return res.status(400).json({ error: 'Missing required parameters: category, amount, purpose.' });
    }

    try {
      const expense = await prisma.expense.create({
          data: {
            tenantId,
            branchId,
            category,
            amount: Number(amount),
            purpose,
          },
        });
      return res.status(201).json({ message: 'Expense logged successfully.', expense });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to record expense.', details: error.message });
    }
  }
);

// 5. Get Expenses
router.get(
  '/expenses',
  authMiddleware,
  hasPermission('view_reports'),
  async (req: TenantRequest, res: Response) => {
    const { category, branchId } = req.query;
    try {
      const list = await prisma.expense.findMany({
          where: {
            tenantId: req.tenantId!,
            category: category ? String(category) : undefined,
            branchId: branchId ? String(branchId) : undefined,
          },
        });
      return res.status(200).json({ expenses: list });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to fetch expenses.' });
    }
  }
);

// Branch funding is an allowance, never an expense or a cash release.
router.get('/petty-cash/funding', authMiddleware, async (req: TenantRequest, res: Response) => {
  try {
    const tenantWide = isTenantAdmin(req.user!);
    const branches = await prisma.branch.findMany({ where: { tenantId: req.tenantId!, ...(tenantWide ? {} : { id: { in: managedBranchIds(req.user!) } }) }, select: { id: true, name: true } });
    if (!tenantWide && !branches.length) return res.status(403).json({ error: 'Branch administration access required.' });
    const allowances = await Promise.all(branches.map(async branch => ({ branchId: branch.id, branchName: branch.name, ...await branchAllowance(prisma, req.tenantId!, branch.id) })));
    const requests = await prisma.pettyCashFunding.findMany({ where: { tenantId: req.tenantId!, branchId: { in: branches.map(b => b.id) } }, orderBy: { createdAt: 'desc' } });
    return res.json({ allowances, requests });
  } catch { return res.status(500).json({ error: 'Could not load branch funding.' }); }
});

router.post('/petty-cash/funding', authMiddleware, async (req: TenantRequest, res: Response) => {
  const shape = parseStrictKeys(req.body, ['branchId', 'amount', 'purpose']);
  if (!shape.success) return res.status(400).json({ error: shape.error });
  const branchId = readTrimmedString(shape.data, 'branchId', { required: true, maxLength: 128, message: 'Branch is required.' });
  const amount = readFiniteNumber(shape.data, 'amount', { min: 0.01, max: 10_000_000, message: 'A positive amount is required.' });
  const purpose = readTrimmedString(shape.data, 'purpose', { required: true, maxLength: 1000, message: 'Reason is required.' });
  if (!branchId.success || !amount.success || !purpose.success) return res.status(400).json({ error: 'Branch, positive amount and reason are required.' });
  if (!managedBranchIds(req.user!).includes(branchId.data)) return res.status(403).json({ error: 'Only the assigned Branch Admin may request additional funds.' });
  try {
    const branch = await prisma.branch.findFirst({ where: { id: branchId.data, tenantId: req.tenantId! } });
    if (!branch) return res.status(404).json({ error: 'Branch not found.' });
    const funding = await prisma.pettyCashFunding.create({ data: { tenantId: req.tenantId!, branchId: branch.id, amount: amount.data, purpose: purpose.data, period: pettyCashPeriod().period, requestedBy: req.user!.id } });
    return res.status(201).json(funding);
  } catch { return res.status(500).json({ error: 'Could not request additional funds.' }); }
});

router.post('/petty-cash/funding/:id/decide', authMiddleware, async (req: TenantRequest, res: Response) => {
  if (!isTenantAdmin(req.user!)) return res.status(403).json({ error: 'Only the Tenant Admin may approve additional branch funds.' });
  const input = parseStrictObject(req.body, { fields: {
    action: { required: true, pattern: /^(APPROVE|REJECT)$/, maxLength: 20, message: 'Choose APPROVE or REJECT.' },
    remarks: { required: false, maxLength: 2000, normalize: value => value.trim(), message: 'Remarks must be text up to 2000 characters.' },
  } });
  if (!input.success) return res.status(400).json({ error: input.error });
  if (input.data.action === 'REJECT' && !input.data.remarks) return res.status(400).json({ error: 'A rejection reason is required.' });
  try {
    const funding = await prisma.pettyCashFunding.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!funding) return res.status(404).json({ error: 'Funding request not found.' });
    if (funding.period !== pettyCashPeriod().period && input.data.action === 'APPROVE') return res.status(409).json({ error: 'This request is for a previous month. Ask the branch to submit a current request.' });
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Branch" WHERE "id" = ${funding.branchId} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
      return tx.pettyCashFunding.updateMany({ where: { id: funding.id, tenantId: req.tenantId!, status: 'PENDING' }, data: { status: input.data.action === 'APPROVE' ? 'APPROVED' : 'REJECTED', decidedBy: req.user!.id, remarks: input.data.remarks || '' } });
    });
    if (result.count !== 1) return res.status(409).json({ error: 'Funding request already decided.' });
    return res.json({ message: 'Branch funding updated.' });
  } catch { return res.status(500).json({ error: 'Could not decide branch funding.' }); }
});

// 6. Petty Cash Approval Flow
// L1 Request
router.post(
  '/petty-cash/request',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const shape = parseStrictKeys(req.body, ['amount', 'purpose', 'branchId', 'items']);
    if (!shape.success) return res.status(400).json({ error: shape.error });
    const amount = readFiniteNumber(shape.data, 'amount', { min: 0.01, max: 10_000_000, message: 'Petty cash amount must be a positive finite number.' });
    const purpose = readTrimmedString(shape.data, 'purpose', { required: true, maxLength: 1_000, message: 'A petty cash purpose is required.' });
    const branchId = readTrimmedString(shape.data, 'branchId', { required: true, maxLength: 128, message: 'A valid branchId is required.' });
    if (!amount.success) return res.status(400).json({ error: amount.error });
    if (!purpose.success) return res.status(400).json({ error: purpose.error });
    if (!branchId.success) return res.status(400).json({ error: branchId.error });
    const requestItems = parsePettyCashItems(shape.data.items, purpose.data, amount.data);
    if (!requestItems.success) return res.status(400).json({ error: requestItems.error });
    if (Math.abs(requestItems.total - amount.data) > 0.009) return res.status(400).json({ error: 'Petty cash amount must equal the item total.' });
    const accountantId = req.user!.id;

    try {
      if (!hasBranchPermission(req.user!, 'manage_petty_cash', branchId.data)) {
        return res.status(403).json({ error: 'Only the assigned branch Accountant may request petty cash.' });
      }
      const requestedAmount = requestItems.total;
      const branch = await prisma.branch.findFirst({ where: { id: branchId.data, tenantId: req.tenantId! } });
      if (!branch) return res.status(404).json({ error: 'Branch not found.' });
      const tenantPolicy = await prisma.tenant.findUniqueOrThrow({ where: { id: req.tenantId! } });
      const pc = await prisma.pettyCash.create({
          data: {
            tenantId: req.tenantId!,
            branchId: branchId.data,
            accountantId,
            purpose: purpose.data,
            amount: requestedAmount,
            remainingBalance: requestedAmount,
            approvalChain: [
              {
                role: 'Accountant',
                action: 'REQUESTED',
                timestamp: new Date().toISOString(),
                comment: 'Initial request.',
              },
            ],
            requestItems: requestItems.items,
            status: 'PENDING',
            policySnapshot: {
              pettyCashCapNpr: tenantPolicy.pettyCashCapNpr,
              requestedAt: new Date().toISOString(),
            },
          },
        });
      return res.status(201).json({ message: 'Petty cash request logged.', pettyCash: { ...pc, items: requestItems.items } });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to request petty cash.', details: error.message });
    }
  }
);

// List petty cash requests for the tenant
router.get(
  '/petty-cash',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const branchAdminIds = Array.isArray(req.user?.roles)
      ? req.user.roles.filter((role: any) => role.roleName === 'Branch Admin' && role.branchId).map((role: any) => role.branchId as string)
      : [];
    const accountantIds = permissionBranchScopes(req.user, 'manage_petty_cash').scopes;
    if (!isTenantAdmin(req.user!) && branchAdminIds.length === 0 && accountantIds.length === 0) {
      return res.status(403).json({ error: 'You do not have access to petty-cash records.' });
    }
    try {
      const requests = await prisma.pettyCash.findMany({
        where: {
          tenantId: req.tenantId!,
          ...(isTenantAdmin(req.user!) ? {} : {
            OR: [
              ...(branchAdminIds.length ? [{ branchId: { in: branchAdminIds } }] : []),
              ...(accountantIds.length ? [{ branchId: { in: accountantIds }, accountantId: req.user!.id }] : []),
            ],
          }),
        },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(requests.map((item) => ({ ...item, items: normalizePettyCashItems(item.requestItems, item.purpose, num(item.amount)) })));
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to list petty cash requests.', details: error.message });
    }
  }
);

// The requesting Accountant may amend only a request explicitly returned for
// revision. Approval history is retained and the same record is resubmitted.
router.put('/petty-cash/:id', authMiddleware, async (req: TenantRequest, res: Response) => {
  const shape = parseStrictKeys(req.body, ['amount', 'purpose', 'items']);
  if (!shape.success) return res.status(400).json({ error: shape.error });
  const amount = readFiniteNumber(shape.data, 'amount', { min: 0.01, max: 10_000_000, message: 'Petty cash amount must be a positive finite number.' });
  const purpose = readTrimmedString(shape.data, 'purpose', { required: true, maxLength: 1_000, message: 'A petty cash purpose is required.' });
  if (!amount.success) return res.status(400).json({ error: amount.error });
  if (!purpose.success) return res.status(400).json({ error: purpose.error });
  const requestItems = parsePettyCashItems(shape.data.items, purpose.data, amount.data);
  if (!requestItems.success) return res.status(400).json({ error: requestItems.error });
  if (Math.abs(requestItems.total - amount.data) > 0.009) return res.status(400).json({ error: 'Petty cash amount must equal the item total.' });

  try {
    const request = await prisma.pettyCash.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!request) return res.status(404).json({ error: 'Petty cash request not found.' });
    const approvalChain = Array.isArray(request.approvalChain) ? request.approvalChain as any[] : [];
    const lastAction = approvalChain.at(-1)?.action;
    if (request.accountantId !== req.user!.id || request.status !== 'PENDING' || lastAction !== 'REVISION') {
      return res.status(409).json({ error: 'Only your own request returned for revision can be resubmitted.' });
    }
    if (!hasBranchPermission(req.user!, 'manage_petty_cash', request.branchId)) {
      return res.status(403).json({ error: 'You no longer have petty-cash access for this branch.' });
    }
    const nextChain = [...approvalChain, {
      role: 'Accountant', action: 'RESUBMITTED', timestamp: new Date().toISOString(), comment: 'Request revised and resubmitted.',
    }];
    const transition = await prisma.pettyCash.updateMany({
      where: { id: request.id, tenantId: req.tenantId!, accountantId: req.user!.id, status: 'PENDING' },
      data: { purpose: purpose.data, amount: requestItems.total, remainingBalance: requestItems.total, requestItems: requestItems.items, approvalChain: nextChain },
    });
    if (transition.count !== 1) return res.status(409).json({ error: 'The request changed before it could be resubmitted.' });
    const updated = await prisma.pettyCash.findUniqueOrThrow({ where: { id: request.id } });
    return res.json({ message: 'Petty cash request resubmitted for Level 1 approval.', pettyCash: { ...updated, items: requestItems.items } });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to resubmit petty cash.' });
  }
});

// L1 Approval (Branch Admin)
router.post(
  '/petty-cash/approve-l1/:id',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const { id } = req.params;
    const input = parseStrictObject(req.body, { fields: { remarks: { required: false, maxLength: 2_000, normalize: (value) => value.trim(), message: 'Remarks must be text no longer than 2000 characters.' } } });
    if (!input.success) return res.status(400).json({ error: input.error });
    const remarks = input.data.remarks ?? '';
    try {
      const pc = await prisma.pettyCash.findUnique({ where: { id } });

      if (!pc) return res.status(404).json({ error: 'Petty cash request not found.' });
      if (!canApprovePettyCashL1(req.user!, pc)) {
        return res.status(403).json({ error: 'Only the assigned Branch Admin can approve a pending petty-cash request at Level 1.' });
      }

      const result = await prisma.$transaction(async (tx) => {
        // Serialize spending and allowance decisions for this branch.
        await tx.$queryRaw`SELECT "id" FROM "Branch" WHERE "id" = ${pc.branchId} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
        const allowance = await branchAllowance(tx, req.tenantId!, pc.branchId);
        const status = Number(pc.amount) <= allowance.available ? 'RELEASED' : 'APPROVED_LEVEL1';
        const approvalChain = [...(pc.approvalChain as any[] || []), {
          role: 'Branch Admin', actorId: req.user!.id,
          action: status === 'RELEASED' ? 'RELEASED_WITHIN_ALLOWANCE' : 'APPROVED_L1',
          timestamp: new Date().toISOString(), comment: remarks,
        }];
        const transition = await tx.pettyCash.updateMany({
          where: { id, tenantId: req.tenantId!, status: 'PENDING' },
          data: { status, approvalChain, releasedAt: status === 'RELEASED' ? new Date() : null },
        });
        return { count: transition.count, status, approvalChain };
      });
      if (result.count !== 1) return res.status(409).json({ error: 'Petty-cash request was already processed.' });
      return res.json({ message: result.status === 'RELEASED' ? 'Approved within branch allowance. Cash release recorded.' : 'Request forwarded to Tenant Admin because the branch allowance is insufficient.', pettyCash: { ...pc, status: result.status, approvalChain: result.approvalChain } });
    } catch (error: any) {
      return res.status(500).json({ error: 'L1 approval failed.', details: error.message });
    }
  }
);

// L2 Approval (Tenant Admin)
router.post(
  '/petty-cash/approve-l2/:id',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const { id } = req.params;
    const input = parseStrictObject(req.body, { fields: { remarks: { required: false, maxLength: 2_000, normalize: (value) => value.trim(), message: 'Remarks must be text no longer than 2000 characters.' } } });
    if (!input.success) return res.status(400).json({ error: input.error });
    const remarks = input.data.remarks ?? '';
    try {
      const pc = await prisma.pettyCash.findUnique({ where: { id } });

      if (!pc) return res.status(404).json({ error: 'Petty cash request not found.' });
      if (!canReleasePettyCash(req.user!, pc)) {
        return res.status(403).json({ error: 'Only the Tenant Admin can release a pending or escalated petty-cash request.' });
      }

      const updatedChain = [...(pc.approvalChain as any[] || []), {
        role: 'Tenant Admin',
        action: 'APPROVED_L2',
        timestamp: new Date().toISOString(),
        comment: remarks || '',
      }];

      const transition = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "Branch" WHERE "id" = ${pc.branchId} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
      return tx.pettyCash.updateMany({
        where: { id, tenantId: req.tenantId!, status: pc.status },
        data: {
          status: 'RELEASED',
          releasedAt: new Date(),
          approvalChain: updatedChain,
        },
      });
      });
      if (transition.count !== 1) {
        return res.status(409).json({ error: 'Petty-cash request was already released.' });
      }

      return res.status(200).json({
        message: 'L2 approval completed. Funds released.',
        pettyCash: { ...pc, status: 'RELEASED', approvalChain: updatedChain },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'L2 approval failed.', details: error.message });
    }
  }
);

// Branch Admin handles pending requests; Tenant Admin can also decide escalations.
router.post(
  '/petty-cash/decide/:id',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const input = parseStrictObject(req.body, { fields: {
      action: { required: true, maxLength: 20, pattern: /^(REJECT|REVISION)$/, message: 'Action must be REJECT or REVISION.' },
      remarks: { required: true, maxLength: 2_000, normalize: (value) => value.trim(), message: 'Decision remarks are required.' },
    } });
    if (!input.success) return res.status(400).json({ error: input.error });
    const { action, remarks } = input.data;
    const pc = await prisma.pettyCash.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!pc) return res.status(404).json({ error: 'Petty cash request not found.' });
    if (!isTenantAdmin(req.user!) && !canApprovePettyCashL1(req.user!, pc)) return res.status(403).json({ error: 'Only the assigned Branch Admin or Tenant Admin may decide this request.' });
    if (!['PENDING', 'APPROVED_LEVEL1'].includes(pc.status)) return res.status(409).json({ error: 'Only requests awaiting approval can receive a decision.' });
    const approvalChain = [...((pc.approvalChain as any[]) || []), {
      role: isTenantAdmin(req.user!) ? 'Tenant Admin' : 'Branch Admin', actorId: req.user!.id, action, timestamp: new Date().toISOString(), comment: remarks,
    }];
    const transition = await prisma.pettyCash.updateMany({
      where: { id: pc.id, tenantId: req.tenantId!, status: pc.status },
      data: { status: action === 'REJECT' ? 'REJECTED' : 'PENDING', approvalChain },
    });
    if (transition.count !== 1) return res.status(409).json({ error: 'The request was already processed.' });
    return res.json({
      message: action === 'REJECT' ? 'Petty cash request rejected.' : 'Petty cash request returned for revision.',
      pettyCash: { ...pc, status: action === 'REJECT' ? 'REJECTED' : 'PENDING', approvalChain },
    });
  },
);

// Upload Receipt
router.post(
  '/petty-cash/upload-receipt/:id',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const { id } = req.params;
    const input = parseStrictObject(req.body, { fields: { receiptProofUrl: { required: true, maxLength: 2_000, pattern: /^https?:\/\/\S+$/i, normalize: (value) => value.trim(), message: 'A valid receiptProofUrl is required.' } } });
    if (!input.success) return res.status(400).json({ error: input.error });
    const { receiptProofUrl } = input.data;

    try {
      const pc = await prisma.pettyCash.findFirst({ where: { id, tenantId: req.tenantId! } });

      if (!pc) return res.status(404).json({ error: 'Petty cash record not found.' });
      if (pc.status !== 'RELEASED' || pc.accountantId !== req.user!.id) {
        return res.status(403).json({ error: 'Only the requesting Accountant may submit a receipt for released petty cash.' });
      }

      const transition = await prisma.pettyCash.updateMany({
          where: {
            id,
            tenantId: req.tenantId!,
            status: 'RELEASED',
            accountantId: req.user!.id,
          },
          data: {
            status: 'RECEIPT_SUBMITTED',
            receiptProofUrl,
          },
        });
      if (transition.count !== 1) {
        return res.status(409).json({ error: 'Receipt was already submitted.' });
      }

      return res.status(200).json({
        message: 'Receipt submitted successfully.',
        pettyCash: { ...pc, status: 'RECEIPT_SUBMITTED', receiptProofUrl },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Receipt submission failed.', details: error.message });
    }
  }
);

// Close Petty Cash
router.post(
  '/petty-cash/close/:id',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const { id } = req.params;

    try {
      const pc = await prisma.pettyCash.findFirst({ where: { id, tenantId: req.tenantId! } });

      if (!pc) return res.status(404).json({ error: 'Petty cash record not found.' });
      if (!isTenantAdmin(req.user!) && !managedBranchIds(req.user!).includes(pc.branchId)) return res.status(403).json({ error: 'Only the assigned Branch Admin or Tenant Admin may verify receipts.' });
      if (pc.status !== 'RECEIPT_SUBMITTED') {
        return res.status(409).json({ error: 'A submitted receipt is required before closing petty cash.' });
      }

      const transition = await prisma.pettyCash.updateMany({
          where: { id, tenantId: req.tenantId!, status: 'RECEIPT_SUBMITTED' },
          data: {
            status: 'CLOSED',
          },
        });
      if (transition.count !== 1) {
        return res.status(409).json({ error: 'Petty cash was already closed.' });
      }

      return res.status(200).json({
        message: 'Petty cash verified and closed.',
        pettyCash: { ...pc, status: 'CLOSED' },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Petty cash closure failed.', details: error.message });
    }
  }
);

// 7. P&L Dashboard Aggregator
router.get(
  '/pl',
  authMiddleware,
  hasPermission('view_reports'),
  async (req: TenantRequest, res: Response) => {
    try {
      const invoices = await prisma.invoice.findMany({
        where: { tenantId: req.tenantId!, status: 'PAID' },
      });
      const totalPaidInvoices = invoices.reduce((sum: number, inv: any) => sum + Number(inv.netPayable), 0);

      const expenses = await prisma.expense.findMany({
        where: { tenantId: req.tenantId! },
      });
      const totalExpenses = expenses.reduce((sum: number, exp: any) => sum + Number(exp.amount), 0);

      const payrolls = await prisma.payroll.findMany({
        where: { tenantId: req.tenantId!, status: 'MANUALLY_PAID' },
      });
      const totalPaidPayrolls = payrolls.reduce((sum: number, pay: any) => sum + Number(pay.netPayable), 0);

      const pettyCash = await prisma.pettyCash.findMany({
        where: { tenantId: req.tenantId!, status: { in: ['RELEASED', 'RECEIPT_SUBMITTED', 'CLOSED'] } },
      });
      const totalPettyCashExpenses = pettyCash.reduce((sum: number, pc: any) => sum + Number(pc.amount), 0);

      const totalRevenue = totalPaidInvoices;
      const totalOutflow = totalExpenses + totalPaidPayrolls + totalPettyCashExpenses;
      const netProfit = totalRevenue - totalOutflow;
      const period = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

      return res.status(200).json({
        // Flat fields consumed by the Tenant Admin dashboard
        revenue: totalRevenue,
        operatingCosts: totalOutflow,
        netMargin: netProfit,
        month: period,
        financialSummary: {
          period,
          currency: 'NPR',
          revenues: {
            studentTuitionPaid: totalPaidInvoices,
            totalRevenues: totalRevenue,
          },
          expenses: {
            operatingExpenses: totalExpenses,
            payrollSalariesPaid: totalPaidPayrolls,
            pettyCashOutflow: totalPettyCashExpenses,
            totalOutflows: totalOutflow,
          },
          netProfitMargin: netProfit,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to compile P&L summary.', details: error.message });
    }
  }
);

// 8. Tenant policy configuration (VAT, attendance grace, petty cash cap)
router.get(
  '/config',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    try {
      const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! } });
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found.' });
      }

      return res.json({
        vatRate: tenant.vatRate,
        gracePeriod: tenant.gracePeriodMinutes,
        pettyCashCap: tenant.pettyCashCapNpr,
        refundPolicy: tenant.refundPolicy,
        lateFeeEnabled: tenant.lateFeeEnabled,
        lateFeeMode: tenant.lateFeeMode,
        lateFeeValue: tenant.lateFeeValue,
        lateFeeGraceDays: tenant.lateFeeGraceDays,
        appointmentWindowHours: tenant.appointmentWindowHours,
        maintenanceEscalationDays: tenant.maintenanceEscalationDays,
        leavePolicy: tenant.leavePolicy,
        performanceWeights: tenant.performanceWeights,
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to load tenant configuration.', details: error.message });
    }
  }
);

router.put(
  '/config',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    if (!isTenantAdmin(req.user!)) {
      return res.status(403).json({ error: 'Only the Tenant Admin may change institution policies.' });
    }
    const shape = parseStrictKeys(req.body, [
      'vatRate', 'gracePeriod', 'pettyCashCap', 'refundPolicy', 'lateFeeEnabled',
      'lateFeeMode', 'lateFeeValue', 'lateFeeGraceDays', 'appointmentWindowHours',
      'maintenanceEscalationDays', 'leavePolicy', 'performanceWeights',
    ]);
    if (!shape.success) return res.status(400).json({ error: shape.error });
    const vatRate = readFiniteNumber(shape.data, 'vatRate', { min: 0, max: 100, message: 'VAT rate must be between 0 and 100.' });
    const gracePeriod = readFiniteNumber(shape.data, 'gracePeriod', { min: 0, max: 240, message: 'Grace period must be between 0 and 240 minutes.' });
    const pettyCashCap = readFiniteNumber(shape.data, 'pettyCashCap', { min: 0, max: 100_000_000, message: 'Petty cash cap must be a non-negative amount.' });
    const refundPolicy = readTrimmedString(shape.data, 'refundPolicy', { required: true, maxLength: 32, pattern: /^(PRO_RATA|FIXED_DEDUCTION|NO_REFUND)$/, message: 'Invalid refund policy.' });
    const lateFeeEnabled = readBoolean(shape.data, 'lateFeeEnabled', 'lateFeeEnabled must be a boolean.');
    const lateFeeMode = lateFeeEnabled.success && lateFeeEnabled.data
      ? readTrimmedString(shape.data, 'lateFeeMode', { required: true, maxLength: 20, pattern: /^(FLAT|PERCENTAGE)$/, message: 'Invalid late fee mode.' })
      : { success: true as const, data: '' };
    const lateFeeValue = lateFeeEnabled.success && lateFeeEnabled.data
      ? readFiniteNumber(shape.data, 'lateFeeValue', { min: 0, max: 100_000_000, message: 'lateFeeValue must be a non-negative finite number.' })
      : { success: true as const, data: 0 };
    const lateFeeGraceDays = readFiniteNumber(shape.data, 'lateFeeGraceDays', { min: 0, max: 365, message: 'lateFeeGraceDays must be a non-negative number.' });
    const appointmentWindowHours = readFiniteNumber(shape.data, 'appointmentWindowHours', { min: 1, max: 720, message: 'appointmentWindowHours must be at least 1.' });
    const maintenanceEscalationDays = readFiniteNumber(shape.data, 'maintenanceEscalationDays', { min: 1, max: 365, message: 'maintenanceEscalationDays must be at least 1.' });
    const leavePolicy = shape.data.leavePolicy === undefined ? { success: true as const, data: {} } : parsePlainRecord(shape.data.leavePolicy);
    const weights = parseStrictKeys(shape.data.performanceWeights, ['attendance', 'updateCompliance', 'feedback', 'leaveCompliance', 'taskCompletion']);
    if (!vatRate.success) return res.status(400).json({ error: vatRate.error });
    if (!gracePeriod.success || !Number.isInteger(gracePeriod.data)) return res.status(400).json({ error: 'Grace period must be between 0 and 240 minutes.' });
    if (!pettyCashCap.success || !Number.isInteger(pettyCashCap.data)) return res.status(400).json({ error: 'Petty cash cap must be a non-negative amount.' });
    if (!refundPolicy.success) return res.status(400).json({ error: refundPolicy.error });
    if (!lateFeeEnabled.success) return res.status(400).json({ error: lateFeeEnabled.error });
    if (!lateFeeMode.success) return res.status(400).json({ error: lateFeeMode.error });
    if (!lateFeeValue.success) return res.status(400).json({ error: lateFeeValue.error });
    if (!lateFeeGraceDays.success || !Number.isInteger(lateFeeGraceDays.data)) return res.status(400).json({ error: 'lateFeeGraceDays must be a non-negative integer.' });
    if (!appointmentWindowHours.success || !Number.isInteger(appointmentWindowHours.data)) return res.status(400).json({ error: 'appointmentWindowHours must be a positive integer.' });
    if (!maintenanceEscalationDays.success || !Number.isInteger(maintenanceEscalationDays.data)) return res.status(400).json({ error: 'maintenanceEscalationDays must be a positive integer.' });
    if (!leavePolicy.success) return res.status(400).json({ error: 'leavePolicy must be a JSON object.' });
    if (!weights.success) return res.status(400).json({ error: weights.error });
    const nextVatRate = vatRate.data;
    const nextGracePeriod = gracePeriod.data;
    const nextPettyCashCap = pettyCashCap.data;
    const nextLateFeeValue = lateFeeEnabled.data ? lateFeeValue.data : null;
    if (lateFeeEnabled.data && (!lateFeeMode.data || nextLateFeeValue === null || nextLateFeeValue <= 0)) {
      return res.status(400).json({ error: 'Enabled late fees require a valid mode and positive value.' });
    }
    const nextLateGrace = lateFeeGraceDays.data;
    const nextAppointmentWindow = appointmentWindowHours.data;
    const nextEscalationDays = maintenanceEscalationDays.data;
    const weightKeys = ['attendance', 'updateCompliance', 'feedback', 'leaveCompliance', 'taskCompletion'];
    const weightValues = weightKeys.map((key) => Number(weights.data[key]));
    if (weightValues.some((value) => !Number.isFinite(value) || value < 0) ||
        Math.abs(weightValues.reduce((sum, value) => sum + value, 0) - 100) > 0.0001) {
      return res.status(400).json({ error: 'Performance weights must be non-negative and sum to exactly 100.' });
    }

    try {
      const config = {
          vatRate: nextVatRate,
          gracePeriodMinutes: nextGracePeriod,
          pettyCashCapNpr: nextPettyCashCap,
          refundPolicy: refundPolicy.data as RefundPolicy,
          lateFeeEnabled: lateFeeEnabled.data,
          lateFeeMode: lateFeeEnabled.data ? lateFeeMode.data as LateFeeMode : null,
          lateFeeValue: nextLateFeeValue,
          lateFeeGraceDays: nextLateGrace,
          appointmentWindowHours: nextAppointmentWindow,
          maintenanceEscalationDays: nextEscalationDays,
          leavePolicy: leavePolicy.data as Prisma.InputJsonObject,
          performanceWeights: Object.fromEntries(weightKeys.map((key, index) => [key, weightValues[index]])),
      };
      const latest = await prisma.tenantPolicyVersion.aggregate({
        where: { tenantId: req.tenantId! },
        _max: { version: true },
      });
      const tenant = await prisma.$transaction(async (tx) => {
        const updated = await tx.tenant.update({ where: { id: req.tenantId! }, data: config });
        await tx.tenantPolicyVersion.create({
          data: {
            tenantId: req.tenantId!,
            version: (latest._max.version ?? 0) + 1,
            config,
            changedBy: req.user!.id,
          },
        });
        return updated;
      });

      return res.json({
        success: true,
        tenant: {
          vatRate: tenant.vatRate,
          gracePeriod: tenant.gracePeriodMinutes,
          pettyCashCap: tenant.pettyCashCapNpr,
          refundPolicy: tenant.refundPolicy,
          policyVersion: (latest._max.version ?? 0) + 1,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to update tenant configuration.', details: error.message });
    }
  }
);

// 9. Double-Entry Ledger Export
router.get(
  '/ledger/export',
  authMiddleware,
  hasPermission('view_reports'),
  async (req: TenantRequest, res: Response) => {
    try {
      const [invoices, expenses, payrolls] = await Promise.all([
        prisma.invoice.findMany({ where: { tenantId: req.tenantId!, status: 'PAID' } }),
        prisma.expense.findMany({ where: { tenantId: req.tenantId! } }),
        prisma.payroll.findMany({ where: { tenantId: req.tenantId!, status: 'MANUALLY_PAID' } }),
      ]);
      const ledgerEntries = [
        ...invoices.map((invoice) => ({
          date: invoice.paymentDate ?? invoice.updatedAt,
          accountDebit: 'Cash/Bank Account',
          accountCredit: `${invoice.invoiceType} Income`,
          amount: Number(invoice.netPayable),
          description: `Payment for invoice ${invoice.id}`,
        })),
        ...expenses.map((expense) => ({
          date: expense.date,
          accountDebit: `${expense.category} Expense`,
          accountCredit: 'Cash/Bank Account',
          amount: Number(expense.amount),
          description: expense.purpose,
        })),
        ...payrolls.map((payroll) => ({
          date: payroll.paymentDate ?? payroll.updatedAt,
          accountDebit: 'Payroll Expense',
          accountCredit: 'Cash/Bank Account',
          amount: payroll.netPayable,
          description: `Payroll ${payroll.month}/${payroll.year}`,
        })),
      ].sort((a, b) => a.date.getTime() - b.date.getTime());
      return res.status(200).json({
        exportFormat: 'Excel Double-Entry Ledger',
        columns: ['Date', 'Debit Account', 'Credit Account', 'Amount (NPR)', 'Description'],
        entries: ledgerEntries,
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to export ledger.' });
    }
  }
);

export default router;
