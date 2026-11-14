import prisma from './db';
import { getSmsSender } from './sms';
import { resolveSecurityMobile } from './linked-security-mobile';

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
  const mobile = user ? await resolveSecurityMobile(user) : null;
  const phone = mobile?.phone ?? null;
  if (!user || !phone || (expectedPhone && expectedPhone !== phone)) {
    throw new Error('Verify your security mobile or use platform-supported recovery.');
  }
  if (!authenticationSmsConfigured()) throw new Error('SMS authentication is temporarily unavailable.');
  if (process.env.NODE_ENV === 'test' && process.env.SMS_PROVIDER === 'MOCK') {
    testCodes.set(`${purpose}:${normalizedEmail}`, code);
    return;
  }
  const label = purpose === 'PASSWORD_RESET' ? 'password reset' : 'login';
  // A guardian's phone can receive codes for several children, so name the login.
  const message = mobile?.via === 'GUARDIAN'
    ? `TMS: ${code} is the ${label} code for ${`${user.firstName} ${user.lastName}`.trim()} (student login). Expires in 5 minutes. Do not share.`
    : `TMS: ${code} is your ${label} code. Expires in 5 minutes. Do not share.`;
  const result = await getSmsSender().sendSms(phone, message);
  if (!result.success) throw new Error('SMS could not be sent. Please try again later.');
}
