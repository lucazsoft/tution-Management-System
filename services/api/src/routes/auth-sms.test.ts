import assert from 'node:assert/strict';
import prisma from '../utils/db';
import { hashCode } from '../utils/otp';

const db = prisma as any;
let user: any;
let password = 'credential-hash';
let records: any[] = [];
let sentCode = '';
let deliveryFails = false;
let sessionsRevoked = false;
require('../utils/persistent-rate-limit').consumePersistentRateLimit = async () => ({ allowed: true, retryAfterSeconds: 0 });
const delivery = require('../utils/delivery');
delivery.authenticationSmsConfigured = () => true;
delivery.sendVerificationCode = async (_email: string, code: string, _purpose: string, phone: string) => {
  if (deliveryFails) throw new Error('provider failed');
  assert.equal(phone, '9812345678'); sentCode = code;
};
const router = require('./auth').default;
db.user.findUnique = async ({ where }: any) => where.email ? (user?.email === where.email ? { ...user } : null) : null;
db.account.findFirst = async () => user ? { password } : null;
db.verificationCode.updateMany = async ({ where, data }: any) => {
  let count = 0;
  for (const record of records) {
    const matches = (!where.id || record.id === where.id) && (!where.identifier || record.identifier === where.identifier) &&
      (!where.purpose || record.purpose === where.purpose) && (where.consumedAt !== null || record.consumedAt === null) &&
      (where.attempts === undefined || record.attempts === where.attempts) && (!where.expiresAt?.gt || record.expiresAt > where.expiresAt.gt);
    if (matches) { count++; if (data.attempts?.increment) record.attempts++; else Object.assign(record, data); }
  }
  return { count };
};
db.verificationCode.create = async ({ data }: any) => { const row = { id: `v${records.length}`, attempts: 0, consumedAt: null, createdAt: new Date(), ...data }; records.push(row); return row; };
db.verificationCode.findFirst = async ({ where }: any) => records.filter(row => (!where.identifier || row.identifier === where.identifier) && (!where.purpose || row.purpose === where.purpose) && (!where.codeHash || row.codeHash === where.codeHash) && (where.consumedAt !== null || row.consumedAt === null)).at(-1) ?? null;
db.verificationCode.findUnique = async ({ where }: any) => records.find(row => row.id === where.id) ?? null;
db.$queryRaw = async () => [];
db.$transaction = async (work: any) => Array.isArray(work) ? Promise.all(work) : work(db);
db.user.update = async () => user;
db.account.upsert = async ({ update }: any) => { password = update.password; return {}; };
db.session.deleteMany = async () => { sessionsRevoked = true; return { count: 1 }; };
db.verification.deleteMany = async () => ({ count: 1 });
async function invoke(path: string, body: any) {
  const route = router.stack.find((entry: any) => entry.route?.path === path).route;
  let status = 200; let payload: any;
  const res: any = { set() { return this; }, status(value: number) { status = value; return this; }, json(value: any) { payload = value; return this; } };
  await route.stack[0].handle({ body, ip: '127.0.0.1' }, res);
  return { status, payload };
}
async function main() {
  process.env.NODE_ENV = 'test'; process.env.SMS_PROVIDER = 'AAKASH'; process.env.AAKASH_SMS_AUTH_TOKEN = 'test';
  user = null; records = []; assert.deepEqual(await invoke('/forgot-password', { email: 'missing@example.test' }), { status: 200, payload: { success: true } });
  user = { id: 'admin', tenantId: 'tenant', email: 'admin@example.test', status: 'ACTIVE', phone: '9812345678', securityMobile: '9812345678', securityMobileVerifiedAt: new Date(), updatedAt: new Date() };
  deliveryFails = true; assert.equal((await invoke('/forgot-password', { email: user.email })).status, 200); assert.equal(records.length, 0);
  deliveryFails = false; assert.equal((await invoke('/forgot-password', { email: user.email })).status, 200); assert.equal(records.length, 1); assert.ok(sentCode);
  const identifier = records[0].identifier; assert.notEqual(identifier, user.email); assert.equal(JSON.parse(identifier).phone, user.phone);
  assert.equal((await invoke('/verify-reset-otp', { email: user.email, otp: '000000' })).status, 401);
  const verified = await invoke('/verify-reset-otp', { email: user.email, otp: sentCode }); assert.equal(verified.status, 200); assert.ok(verified.payload.resetToken);
  user.securityMobile = '9800000000'; assert.equal((await invoke('/reset-password', { resetToken: verified.payload.resetToken, newPassword: 'Strong!Pass9' })).status, 410);
  user.securityMobile = user.phone; const reset = await invoke('/reset-password', { resetToken: verified.payload.resetToken, newPassword: 'Strong!Pass9' });
  assert.equal(reset.status, 200); assert.equal(sessionsRevoked, true); assert.equal((await invoke('/reset-password', { resetToken: verified.payload.resetToken, newPassword: 'Strong!Pass9' })).status, 410);
  assert.notEqual(password, 'credential-hash'); assert.notEqual(hashCode(password), JSON.parse(identifier).credential);
  console.log('PASS generic reset request, failed delivery, trusted-mobile binding, wrong OTP, mobile-change invalidation, password update, session revocation and replay rejection');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
