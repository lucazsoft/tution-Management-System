import crypto from 'node:crypto';
import prisma from '../utils/db';
import { generateOtpCode, hashCode } from '../utils/otp';
import { consumePersistentRateLimit } from '../utils/persistent-rate-limit';
import { getSmsSender, normaliseAakashPhoneNumber } from '../utils/sms';

export function paymentChangeKey(tenantId: string, userId: string, branchId: string, action: string, config: any, phone?: string) {
  const payload = action === 'reset' ? null : ['staticQrEnabled', 'staticQrImageUrl', 'accountName', 'accountNumber', 'bankName', 'instructions'].map(key => config?.[key] ?? null);
  return `payment:${tenantId}:${userId}:${branchId}:${crypto.createHash('sha256').update(JSON.stringify([action, payload, phone])).digest('hex')}`;
}
export async function sendPaymentCode(tenantId: string, userId: string, branchId: string, action: string, config: any) {
  const limit = await consumePersistentRateLimit(`payment-sms:${tenantId}:${userId}`, 15 * 60_000, 5);
  if (!limit.allowed) throw new Error('Too many verification requests. Try again in 15 minutes.');
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { phone: true } });
  const phone = normaliseAakashPhoneNumber(user?.phone ?? '');
  if (!/^\d{10}$/.test(phone)) throw new Error('A valid saved mobile number is required for SMS verification.');
  // Never treat a console/mock SMS as a security verification delivery.
  if (process.env.SMS_PROVIDER?.toUpperCase() !== 'AAKASH' || !process.env.AAKASH_SMS_AUTH_TOKEN) throw new Error('SMS verification is not configured. Contact support.');
  const identifier = paymentChangeKey(tenantId, userId, branchId, action, config, phone);
  const code = generateOtpCode();
  const record = await prisma.verificationCode.create({ data: { identifier, purpose: 'PAYMENT_SETTINGS', codeHash: hashCode(code), expiresAt: new Date(Date.now() + 5 * 60_000) } });
  const delivery = await getSmsSender().sendSms(phone, `TMS: ${code} confirms your branch payment settings ${action}. Expires in 5 minutes. Do not share this code.`);
  if (!delivery.success) {
    await prisma.verificationCode.updateMany({ where: { id: record.id }, data: { consumedAt: new Date() } });
    throw new Error('Could not deliver verification SMS. Please try again.');
  }
  return { challengeId: record.id, destination: `******${phone.slice(-4)}`, expiresIn: 300 };
}
export async function consumePaymentCode(tenantId: string, userId: string, branchId: string, action: string, config: any, verification: any) {
  if (typeof verification?.challengeId !== 'string' || typeof verification?.code !== 'string' || !/^\d{6}$/.test(verification.code)) return false;
  return prisma.$transaction(async tx => {
    const user = await tx.user.findFirst({ where: { id: userId, tenantId }, select: { phone: true } });
    const phone = normaliseAakashPhoneNumber(user?.phone ?? '');
    if (!/^\d{10}$/.test(phone)) return false;
    const identifier = paymentChangeKey(tenantId, userId, branchId, action, config, phone);
    const record = await tx.verificationCode.findFirst({ where: { id: verification.challengeId, identifier, purpose: 'PAYMENT_SETTINGS', consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } } });
    if (!record) return false;
    const valid = crypto.timingSafeEqual(Buffer.from(record.codeHash), Buffer.from(hashCode(verification.code)));
    const result = await tx.verificationCode.updateMany({ where: { id: record.id, consumedAt: null, attempts: record.attempts, expiresAt: { gt: new Date() } }, data: valid ? { consumedAt: new Date() } : { attempts: { increment: 1 } } });
    if (!valid || result.count !== 1) return false;
    // Persist trust only for the destination bound to this successfully consumed code.
    const updated = await tx.user.updateMany({ where: { id: userId, tenantId, phone: user!.phone },
      data: { securityMobile: phone, securityMobileVerifiedAt: new Date() } });
    return updated.count === 1;
  });
}
export function isUploadedQr(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 1_400_000) return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 12 || bytes.length > 1_000_000 || bytes.toString('base64') !== match[2]) return false;
  return match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}
