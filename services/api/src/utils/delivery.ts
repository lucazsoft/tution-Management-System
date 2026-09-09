import prisma from './db';
import { getSmsSender } from './sms';
import { trustedSecurityMobile } from './security-mobile';

const testCodes = new Map<string, string>();

export function getMockVerificationCodeForTest(email: string, purpose: 'PASSWORD_RESET' | 'TWO_FACTOR') {
  return process.env.NODE_ENV === 'test'
    ? testCodes.get(`${purpose}:${email.trim().toLowerCase()}`)
    : undefined;
}

export function authenticationSmsConfigured() {
  return (process.env.NODE_ENV === 'test' && process.env.SMS_PROVIDER === 'MOCK') ||
    (process.env.SMS_PROVIDER?.toUpperCase() === 'AAKASH' && Boolean(process.env.AAKASH_SMS_AUTH_TOKEN?.trim()));
}

export async function sendVerificationCode(
  email: string,
  code: string,
  purpose: 'PASSWORD_RESET' | 'TWO_FACTOR',
  expectedPhone?: string,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  const phone = user?.status === 'ACTIVE' ? trustedSecurityMobile(user) : null;
  if (!phone || (expectedPhone && expectedPhone !== phone)) {
    throw new Error('Verify your security mobile or use platform-supported recovery.');
  }
  if (!authenticationSmsConfigured()) throw new Error('SMS authentication is temporarily unavailable.');
  if (process.env.NODE_ENV === 'test' && process.env.SMS_PROVIDER === 'MOCK') {
    testCodes.set(`${purpose}:${normalizedEmail}`, code);
    return;
  }
  const label = purpose === 'PASSWORD_RESET' ? 'password reset' : 'login';
  const result = await getSmsSender().sendSms(phone, `TMS: ${code} is your ${label} code. Expires in 5 minutes. Do not share.`);
  if (!result.success) throw new Error('SMS could not be sent. Please try again later.');
}
