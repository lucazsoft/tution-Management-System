import assert from 'node:assert/strict';
import prisma from '../utils/db';
import { hashCode } from '../utils/otp';
import { approveMobileRecovery, confirmMobileRecovery, deliverRecoveryNotices, sendRecoveryCode } from './mobile-recovery';

const db = prisma as any;
let user: any;
let grant: any;
let notices: any[];
let sessionsDeleted: boolean;
let codesInvalidated: boolean;
let providerSuccess = true;
let lastCode = '';
let sentTo = '';
let failCommit = false;
let eligible = true;
let passwordHash = 'stored-password-hash';
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'OR') return value.some((clause: any) => matches(row, clause));
    if (value instanceof Date) return row[key]?.getTime() === value.getTime();
    if (value && typeof value === 'object') {
      return Object.entries(value).every(([op, operand]: [string, any]) =>
        op === 'gt' ? row[key] != null && row[key] > operand : op === 'lt' ? row[key] != null && row[key] < operand : op === 'not' ? row[key] !== operand : false);
    }
    return row[key] === value;
  });
}
function apply(row: any, data: any) {
  for (const [key, value] of Object.entries(data) as [string, any][]) row[key] = value?.increment ? row[key] + value.increment : value;
}
db.$queryRaw = async () => [];
db.account.findFirst = async () => ({ password: passwordHash });
db.$transaction = async (run: any) => {
  const snapshot = structuredClone({ user, grant, notices, sessionsDeleted, codesInvalidated });
  try { return await run(db); } catch (error) {
    ({ user, grant, notices, sessionsDeleted, codesInvalidated } = snapshot);
    throw error;
  }
};
db.user.findFirst = async ({ where }: any) => {
  const { userRoles, ...rest } = where;
  return eligible && matches(user, rest) ? { ...user } : null;
};
db.user.updateMany = async ({ where, data }: any) => {
  if (!matches(user, where)) return { count: 0 };
  apply(user, data); user.updatedAt = new Date(user.updatedAt.getTime() + 1); return { count: 1 };
};
db.mobileRecovery.create = async ({ data }: any) => grant = { id: 'grant', consumedAt: null, revokedAt: null, attempts: 0, sends: 0, codeHash: null, codeExpiresAt: null, lastSentAt: null, ...data };
db.mobileRecovery.findFirst = async ({ where }: any) => grant && matches(grant, where) ? { ...grant } : null;
db.mobileRecovery.updateMany = async ({ where, data }: any) => {
  if (!grant || !matches(grant, where)) return { count: 0 };
  apply(grant, data); return { count: 1 };
};
db.session.deleteMany = async () => { sessionsDeleted = true; return { count: 1 }; };
db.verification.deleteMany = async () => ({ count: 1 });
db.verificationCode.updateMany = async () => { codesInvalidated = true; return { count: 1 }; };
db.recoverySmsNotice.createMany = async ({ data }: any) => { if (failCommit) throw new Error('Injected database failure'); notices.push(...data); return { count: data.length }; };
db.recoverySmsNotice.findMany = async () => []; // Delivery queue is inspected, not sent by confirmation tests.
require('../utils/sms').getSmsSender = () => ({ sendSms: async (phone: string, message: string) => {
  sentTo = phone; lastCode = message.match(/\b\d{6}\b/)?.[0] ?? ''; return { success: providerSuccess };
} });
async function setup() {
  user = { id: 'admin', tenantId: 'tenant', email: 'admin@example.test', status: 'ACTIVE', phone: '9812345678', updatedAt: new Date('2026-09-08T00:00:00Z') };
  grant = null; notices = []; sessionsDeleted = false; codesInvalidated = false; failCommit = false; providerSuccess = true; eligible = true; passwordHash = 'stored-password-hash';
  process.env.SMS_PROVIDER = 'AAKASH'; process.env.AAKASH_SMS_AUTH_TOKEN = 'test-only';
  return approveMobileRecovery({ tenantId: 'tenant', userId: 'admin', phone: '+977 9800000000', reviewer: 'host/operator', reference: 'SUPPORT-123' });
}
async function main() {
  let issued = await setup();
  assert.equal(grant.tokenHash, hashCode(issued.token)); assert.notEqual(grant.tokenHash, issued.token);
  assert.equal(grant.reviewer, 'host/operator'); assert.equal(user.phone, '9812345678');
  await assert.rejects(sendRecoveryCode('unknown'));
  await sendRecoveryCode(issued.token); assert.equal(sentTo, '9800000000');
  await assert.rejects(sendRecoveryCode(issued.token), /one minute/);
  await assert.rejects(confirmMobileRecovery(issued.token, lastCode === '000000' ? '111111' : '000000'));
  assert.equal(grant.attempts, 1); assert.equal(user.phone, '9812345678');
  assert.equal((await confirmMobileRecovery(issued.token, lastCode)).success, true);
  assert.equal(user.phone, '9800000000'); assert.equal(user.securityMobile, user.phone); assert.ok(user.securityMobileVerifiedAt);
  assert.equal(sessionsDeleted, true); assert.equal(codesInvalidated, true); assert.equal(notices.length, 2);
  await assert.rejects(confirmMobileRecovery(issued.token, lastCode));

  issued = await setup(); providerSuccess = false;
  await assert.rejects(sendRecoveryCode(issued.token), /could not be sent/);
  assert.equal(grant.codeHash, null); await assert.rejects(confirmMobileRecovery(issued.token, lastCode));
  issued = await setup(); await sendRecoveryCode(issued.token); grant.expiresAt = new Date(0);
  await assert.rejects(confirmMobileRecovery(issued.token, lastCode));
  issued = await setup(); await sendRecoveryCode(issued.token); grant.codeExpiresAt = new Date(0);
  await assert.rejects(confirmMobileRecovery(issued.token, lastCode));
  issued = await setup(); await sendRecoveryCode(issued.token); user.updatedAt = new Date();
  await assert.rejects(confirmMobileRecovery(issued.token, lastCode)); assert.equal(grant.consumedAt, null);
  issued = await setup(); await sendRecoveryCode(issued.token); eligible = false;
  await assert.rejects(confirmMobileRecovery(issued.token, lastCode));
  issued = await setup(); await sendRecoveryCode(issued.token); grant.attempts = 5;
  await assert.rejects(confirmMobileRecovery(issued.token, lastCode)); await assert.rejects(sendRecoveryCode(issued.token));
  issued = await setup(); await sendRecoveryCode(issued.token); failCommit = true;
  await assert.rejects(confirmMobileRecovery(issued.token, lastCode));
  assert.equal(user.phone, '9812345678'); assert.equal(grant.consumedAt, null); assert.equal(sessionsDeleted, false);
  failCommit = false; assert.equal((await confirmMobileRecovery(issued.token, lastCode)).success, true);
  issued = await setup(); user.tenantId = 'other';
  await assert.rejects(sendRecoveryCode(issued.token));
  issued = await setup(); await sendRecoveryCode(issued.token); passwordHash = 'changed-password';
  await assert.rejects(confirmMobileRecovery(issued.token, lastCode));
  issued = await setup(); await sendRecoveryCode(issued.token); grant.revokedAt = new Date();
  await assert.rejects(confirmMobileRecovery(issued.token, lastCode));
  notices = [{ id: 'notice', recoveryId: 'grant', recipient: '9800000000', message: 'Security mobile changed.', acceptedAt: null, leaseUntil: null, attempts: 0 }];
  db.recoverySmsNotice.findMany = async ({ where }: any) => notices.filter(row => matches(row, where)).map(row => ({ ...row }));
  db.recoverySmsNotice.updateMany = async ({ where, data }: any) => {
    const row = notices.find(item => matches(item, where));
    if (!row) return { count: 0 }; apply(row, data); return { count: 1 };
  };
  providerSuccess = false;
  await deliverRecoveryNotices('grant'); assert.equal(notices[0].acceptedAt, null); assert.equal(notices[0].attempts, 1);
  providerSuccess = true;
  await deliverRecoveryNotices('grant'); assert.ok(notices[0].acceptedAt); assert.equal(notices[0].attempts, 2);
  await deliverRecoveryNotices('grant'); assert.equal(notices[0].attempts, 2, 'Accepted notices are not resent');
  console.log('PASS approval binding, fixed SMS destination, cooldown, wrong code, expiry, lockout, replay, stale account, role/tenant eligibility, delivery failure, transactional rollback and security alerts');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
