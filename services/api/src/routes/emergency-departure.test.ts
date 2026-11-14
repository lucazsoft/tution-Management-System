import assert from 'node:assert/strict';
import type { UserPayload } from '@tms/types';
import prisma from '../utils/db';

// Route test for POST /leaves/emergency-out with an in-memory Prisma double.
const branchAdmin: UserPayload = {
  id: 'ba', tenantId: 'tenant-a', email: 'ba@example.test', firstName: 'B', lastName: 'A',
  roles: [{ roleName: 'Branch Admin', branchId: 'branch-a', permissions: ['manage_student_exceptions'] }],
};
let actor: UserPayload = branchAdmin;

const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { auth: { api: { getSession: async () => ({ user: actor }) } } } } as NodeModule;
const pushed: string[] = [];
const pushPath = require.resolve('../utils/push');
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: { getPushSender: () => ({ sendPush: async (userId: string) => { pushed.push(userId); } }) } } as NodeModule;
const texts: Array<{ to: string; message: string }> = [];
let smsWorks = true;
const smsPath = require.resolve('../utils/sms');
require.cache[smsPath] = {
  id: smsPath, filename: smsPath, loaded: true,
  exports: { getSmsSender: () => ({ sendSms: async (to: string, message: string) => { texts.push({ to, message }); return { success: smsWorks }; } }) },
} as NodeModule;
const router = require('./leaves').default;

let student: any;
const created: any[] = [];
(prisma as any).notification = { create: async () => ({}) };
prisma.student.findFirst = (async ({ where }: any) => (where.id === student?.id && where.user.tenantId === 'tenant-a' ? student : null)) as any;
prisma.branch.findFirst = (async () => ({ name: 'Damak' })) as any;
prisma.leave.create = (async ({ data }: any) => { const row = { id: `leave-${created.length + 1}`, ...data }; created.push(row); return row; }) as any;

function guardian(id: string, phone: string, status = 'ACTIVE') {
  return { parent: { user: { id, phone, status } } };
}

function reset(parents: any[]) {
  texts.length = 0; pushed.length = 0; created.length = 0; smsWorks = true;
  student = { id: 'stu-1', userId: 'stu-user', user: { firstName: 'Sushanta', lastName: 'Thapa' }, studentParents: parents };
}

async function depart(body: any = {}) {
  const route = router.stack.find((layer: any) => layer.route?.path === '/emergency-out').route;
  const req: any = { headers: {}, body: { studentId: 'stu-1', branchId: 'branch-a', reason: 'Fever', collectedBy: 'Father', ...body }, params: {} };
  let status = 200; let payload: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { payload = value; return this; } };
  for (const layer of route.stack) { let next = false; await layer.handle(req, res, () => { next = true; }); if (!next) break; }
  return { status, payload };
}

async function main() {
  // Texts each linked, active parent's real number; never the old placeholder.
  reset([guardian('mum', '9800000001'), guardian('dad', '+977 9800000002'), guardian('old', '9800000009', 'INACTIVE')]);
  let response = await depart();
  assert.equal(response.status, 201);
  assert.deepEqual(texts.map((t) => t.to).sort(), ['9800000001', '9800000002']);
  assert.ok(texts.every((t) => !t.to.includes('X')));
  assert.match(texts[0].message, /^ALERT: Sushanta Thapa left Damak early at .*Reason: Fever\. Collected by: Father\./);
  assert.deepEqual(response.payload.notified, { guardians: 2, attempted: 2, sent: 2, failed: 0, withoutPhone: 0 });
  assert.equal(response.payload.message, 'Emergency departure recorded. Parent SMS sent to 2 numbers.');
  assert.deepEqual(pushed.sort(), ['dad', 'mum'], 'parents also get an in-app/push alert');
  assert.equal(created.length, 1, 'departure is recorded');

  // No linked parent: still recorded, staff told to call the family.
  reset([]);
  response = await depart();
  assert.equal(response.status, 201);
  assert.equal(texts.length, 0);
  assert.match(response.payload.message, /No parent is linked/);
  assert.equal(created.length, 1);

  // Gateway failure never undoes the record and is reported honestly.
  reset([guardian('mum', '9800000001')]);
  smsWorks = false;
  response = await depart();
  assert.equal(response.status, 201);
  assert.equal(created.length, 1);
  assert.match(response.payload.message, /no parent SMS could be sent/);

  // Branch scope is still enforced.
  reset([guardian('mum', '9800000001')]);
  response = await depart({ branchId: 'branch-b' });
  assert.equal(response.status, 403);
  assert.equal(texts.length, 0);

  console.log('emergency departure route tests passed');
}

main().catch((error) => { console.error(error); process.exit(1); });
