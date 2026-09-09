import crypto from 'node:crypto';
import prisma from '../utils/db';
import { generateOtpCode, generateResetToken, hashCode } from '../utils/otp';
import { getSmsSender, normaliseAakashPhoneNumber } from '../utils/sms';

const live = () => ({ consumedAt: null, revokedAt: null, expiresAt: { gt: new Date() } });
const eligible = { status: 'ACTIVE' as const, userRoles: { some: { branchId: null, role: { name: 'Tenant Admin' } } } };
const configured = () => process.env.SMS_PROVIDER?.toUpperCase() === 'AAKASH' && !!process.env.AAKASH_SMS_AUTH_TOKEN?.trim();
export class RecoveryError extends Error {}

// Only the host operator script imports this approval operation. No HTTP approval route.
export async function approveMobileRecovery(input: { tenantId: string; userId: string; phone: string; reviewer: string; reference: string }) {
  const phone = normaliseAakashPhoneNumber(input.phone);
  if (!/^\d{10}$/.test(phone) || !input.reviewer.trim() || input.reference.trim().length < 5) throw new RecoveryError('A valid number, reviewer and identity-review reference are required.');
  const token = generateResetToken();
  const record = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
    const user = await tx.user.findFirst({ where: { id: input.userId, tenantId: input.tenantId, ...eligible } });
    if (!user) throw new RecoveryError('An active tenant administrator in this institution is required.');
    const credential = await tx.account.findFirst({ where: { userId: user.id, providerId: 'credential' } });
    if (!credential?.password) throw new RecoveryError('A password account is required for mobile recovery.');
    if (normaliseAakashPhoneNumber(user.phone) === phone) throw new RecoveryError('Recovery must nominate a different number.');
    await tx.mobileRecovery.updateMany({ where: { userId: user.id, consumedAt: null, revokedAt: null }, data: { revokedAt: new Date(), codeHash: null } });
    return tx.mobileRecovery.create({ data: { userId: user.id, tenantId: user.tenantId, oldPhone: user.phone,
      accountUpdatedAt: user.updatedAt, credentialHash: hashCode(credential.password), newPhone: phone, tokenHash: hashCode(token), reviewer: input.reviewer.trim(),
      reviewReference: input.reference.trim(), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
  });
  return { id: record.id, token, expiresAt: record.expiresAt };
}

export async function sendRecoveryCode(token: string) {
  if (!configured()) throw new RecoveryError('SMS recovery is unavailable. Contact platform support.');
  const record = await prisma.mobileRecovery.findFirst({ where: { tokenHash: hashCode(token), ...live() } });
  if (!record || record.attempts >= 5 || record.sends >= 5) throw new RecoveryError('Recovery is invalid, expired or locked. Contact platform support.');
  const user = await prisma.user.findFirst({ where: { id: record.userId, tenantId: record.tenantId, updatedAt: record.accountUpdatedAt, ...eligible } });
  if (!user) throw new RecoveryError('The account changed after review. Contact platform support.');
  const now = new Date();
  if (record.lastSentAt && now.getTime() - record.lastSentAt.getTime() < 60_000) throw new RecoveryError('Wait one minute before requesting another code.');
  // Reserve a send and invalidate any previous code before contacting the provider.
  const claim = await prisma.mobileRecovery.updateMany({ where: { id: record.id, ...live(), sends: record.sends, attempts: { lt: 5 } },
    data: { sends: { increment: 1 }, lastSentAt: now, codeHash: null, codeExpiresAt: null } });
  if (claim.count !== 1) throw new RecoveryError('Recovery changed. Please try again.');
  const code = generateOtpCode();
  const delivery = await getSmsSender().sendSms(record.newPhone, `TMS: ${code} verifies your replacement security mobile after support review. Expires in 5 minutes. Do not share.`);
  if (!delivery.success) throw new RecoveryError('SMS could not be sent. Your account is unchanged. Try again in one minute.');
  const saved = await prisma.mobileRecovery.updateMany({ where: { id: record.id, ...live(), sends: record.sends + 1 },
    data: { codeHash: hashCode(`${token}:${code}`), codeExpiresAt: new Date(Date.now() + 300_000) } });
  if (saved.count !== 1) throw new RecoveryError('Recovery changed. Contact platform support.');
  return { destination: `******${record.newPhone.slice(-4)}`, expiresIn: 300 };
}

export async function confirmMobileRecovery(token: string, code: string) {
  const result = await prisma.$transaction(async tx => {
    // Lock user before recovery to serialize competing grants for the same account.
    const initial = await tx.mobileRecovery.findFirst({ where: { tokenHash: hashCode(token), ...live() } });
    if (!initial) return false;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${initial.userId} FOR UPDATE`;
    const record = await tx.mobileRecovery.findFirst({ where: { id: initial.id, ...live(), attempts: { lt: 5 }, codeExpiresAt: { gt: new Date() } } });
    if (!record?.codeHash) return false;
    const user = await tx.user.findFirst({ where: { id: record.userId, tenantId: record.tenantId, updatedAt: record.accountUpdatedAt, phone: record.oldPhone, ...eligible } });
    if (!user) return false;
    const credential = await tx.account.findFirst({ where: { userId: user.id, providerId: 'credential' } });
    if (!credential?.password || hashCode(credential.password) !== record.credentialHash) return false;
    const correct = crypto.timingSafeEqual(Buffer.from(record.codeHash), Buffer.from(hashCode(`${token}:${code}`)));
    const claim = await tx.mobileRecovery.updateMany({ where: { id: record.id, ...live(), attempts: record.attempts, codeHash: record.codeHash, codeExpiresAt: { gt: new Date() } },
      data: correct ? { consumedAt: new Date(), codeHash: null } : { attempts: { increment: 1 } } });
    if (!correct || claim.count !== 1) return false;
    const changed = await tx.user.updateMany({ where: { id: user.id, tenantId: user.tenantId, updatedAt: record.accountUpdatedAt },
      data: { phone: record.newPhone, securityMobile: record.newPhone, securityMobileVerifiedAt: new Date() } });
    if (changed.count !== 1) throw new RecoveryError('Account changed. Request a new support review.');
    await tx.session.deleteMany({ where: { userId: user.id } });
    // Better Auth stores pending 2FA sessions and trusted devices with value=userId.
    // Deleting those bindings prevents an outstanding OTP from establishing a session.
    await tx.verification.deleteMany({ where: { OR: [{ value: user.id }, { identifier: user.email }, { identifier: `2fa-otp-${user.id}` }] } });
    await tx.verificationCode.updateMany({ where: { consumedAt: null, OR: [
      { identifier: user.email }, { identifier: { startsWith: `payment:${user.tenantId}:${user.id}:` } },
      { purpose: 'ACCOUNT_MOBILE_CHANGE', identifier: { contains: `"user":"${user.id}"` } },
    ] }, data: { consumedAt: new Date() } });
    await tx.mobileRecovery.updateMany({ where: { userId: user.id, id: { not: record.id }, consumedAt: null, revokedAt: null }, data: { revokedAt: new Date(), codeHash: null } });
    const recipients = [...new Set([normaliseAakashPhoneNumber(record.oldPhone), record.newPhone])].filter(phone => /^\d{10}$/.test(phone));
    await tx.recoverySmsNotice.createMany({ data: recipients.map(recipient => ({ recoveryId: record.id, recipient,
      message: `TMS: Your security mobile was changed after platform support review. All sessions were signed out. If this was not you, contact platform support immediately.` })) });
    return record.id;
  });
  if (!result) throw new RecoveryError('Code or recovery is invalid, expired or locked.');
  // Notification failure never reverses a completed recovery; the durable queue remains retryable.
  await deliverRecoveryNotices(result).catch(() => undefined);
  return { success: true, signInRequired: true };
}

export async function deliverRecoveryNotices(recoveryId?: string) {
  if (!configured()) return;
  const jobs = await prisma.recoverySmsNotice.findMany({ where: { ...(recoveryId ? { recoveryId } : {}), acceptedAt: null, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, take: 50, orderBy: { createdAt: 'asc' } });
  for (const job of jobs) {
    const leaseUntil = new Date(Date.now() + 120_000);
    const claim = await prisma.recoverySmsNotice.updateMany({ where: { id: job.id, acceptedAt: null, leaseUntil: job.leaseUntil }, data: { leaseUntil, attempts: { increment: 1 } } });
    if (claim.count !== 1) continue;
    try {
      const sent = await getSmsSender().sendSms(job.recipient, job.message);
      await prisma.recoverySmsNotice.updateMany({ where: { id: job.id, leaseUntil }, data: { acceptedAt: sent.success ? new Date() : null, leaseUntil: null } });
    } catch { /* Lease expiry permits retry after transport/process failure. */ }
  }
}
