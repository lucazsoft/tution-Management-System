import assert from 'node:assert/strict';
import prisma from './db';
import { authenticationSmsConfigured, getMockVerificationCodeForTest, sendVerificationCode } from './delivery';

const db = prisma as any;
let user: any;
let delivered: any[] = [];
let providerSuccess = true;
db.user.findUnique = async ({ where }: any) => user?.email === where.email ? user : null;
require('./sms').getSmsSender = () => ({ sendSms: async (phone: string, message: string) => {
  delivered.push({ phone, message }); return { success: providerSuccess };
} });

async function main() {
  process.env.NODE_ENV = 'production'; process.env.SMS_PROVIDER = 'AAKASH'; process.env.AAKASH_SMS_AUTH_TOKEN = 'test-only';
  user = { email: 'admin@example.test', status: 'ACTIVE', phone: '9812345678', securityMobile: '9812345678', securityMobileVerifiedAt: new Date() };
  assert.equal(authenticationSmsConfigured(), true);
  await sendVerificationCode(user.email, '456789', 'PASSWORD_RESET');
  assert.equal(delivered[0].phone, '9812345678'); assert.match(delivered[0].message, /password reset/);
  user.securityMobile = null; await assert.rejects(sendVerificationCode(user.email, '456789', 'PASSWORD_RESET'), /Verify your security mobile/);
  user.securityMobile = user.phone; user.phone = '9800000000'; await assert.rejects(sendVerificationCode(user.email, '456789', 'TWO_FACTOR'));
  user.phone = user.securityMobile; user.status = 'SUSPENDED'; await assert.rejects(sendVerificationCode(user.email, '456789', 'TWO_FACTOR'));
  user.status = 'ACTIVE'; providerSuccess = false; await assert.rejects(sendVerificationCode(user.email, '456789', 'TWO_FACTOR'), /could not be sent/);
  providerSuccess = true; delete process.env.AAKASH_SMS_AUTH_TOKEN; assert.equal(authenticationSmsConfigured(), false);
  await assert.rejects(sendVerificationCode(user.email, '456789', 'TWO_FACTOR'), /temporarily unavailable/);
  process.env.NODE_ENV = 'test'; process.env.SMS_PROVIDER = 'MOCK';
  await sendVerificationCode(user.email, '654321', 'TWO_FACTOR');
  assert.equal(getMockVerificationCodeForTest(user.email, 'TWO_FACTOR'), '654321');
  process.env.NODE_ENV = 'production'; assert.equal(getMockVerificationCodeForTest(user.email, 'TWO_FACTOR'), undefined);
  console.log('PASS verified-mobile delivery, account state, destination mismatch, provider failure, configuration and test-only code capture');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
