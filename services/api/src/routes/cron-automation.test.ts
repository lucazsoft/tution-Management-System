import assert from 'node:assert/strict';
import type { UserPayload } from '@tms/types';
import prisma from '../utils/db';

// Control Center reminders: GET /cron/automation and the fee-reminder cooldown
// on POST /cron/trigger, with an in-memory Prisma double.
const tenantAdmin: UserPayload = { id: 'ta', tenantId: 'tenant-a', email: 'ta@example.test', firstName: 'Jeena', lastName: 'Bhattarai', roles: [{ roleName: 'Tenant Admin', branchId: null, permissions: [] }] };
const branchAdmin: UserPayload = { id: 'ba', tenantId: 'tenant-a', email: 'ba@example.test', firstName: 'B', lastName: 'A', roles: [{ roleName: 'Branch Admin', branchId: 'branch-a', permissions: [] }] };
let actor: UserPayload = tenantAdmin;

const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { auth: { api: { getSession: async () => ({ user: actor }) } } } } as NodeModule;
const texts: string[] = [];
const smsPath = require.resolve('../utils/sms');
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: { getSmsSender: () => ({ sendSms: async (to: string) => { texts.push(to); return { success: true }; } }) } } as NodeModule;
const router = require('./cron').default;

const runs: any[] = [];
(prisma as any).automationRun = {
  findFirst: async ({ where }: any) => runs.filter((run) => run.tenantId === where.tenantId && run.taskName === where.taskName)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
  create: async ({ data }: any) => { const row = { id: `run-${runs.length + 1}`, createdAt: new Date(), ...data }; runs.push(row); return row; },
};
prisma.user.findMany = (async () => [{ id: 'ta', firstName: 'Jeena', lastName: 'Bhattarai' }]) as any;
prisma.invoice.findMany = (async () => [{
  status: 'OVERDUE', dueDate: new Date('2026-10-01'), netPayable: 4500, studentId: 's1', branch: { name: 'Damak' },
  student: {
    user: { firstName: 'Sushanta', lastName: 'Thapa' },
    enrollments: [],
    studentParents: [
      { parent: { user: { id: 'mum', phone: '9800000001', status: 'ACTIVE' } } },
      { parent: { user: { id: 'dad', phone: null, status: 'ACTIVE' } } },
    ],
  },
}]) as any;

async function call(method: 'get' | 'post', path: string, body: any = {}, as: UserPayload = tenantAdmin) {
  actor = as;
  const route = router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route;
  const req: any = { headers: {}, body, params: {}, query: {} };
  let status = 200; let payload: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { payload = value; return this; } };
  for (const layer of route.stack) { let next = false; await layer.handle(req, res, () => { next = true; }); if (!next) break; }
  return { status, payload };
}

async function main() {
  // Only the Tenant Admin may view or run reminders.
  assert.equal((await call('get', '/automation', {}, branchAdmin)).status, 403);
  assert.equal((await call('post', '/trigger', { taskName: 'fee-reminder-sms' }, branchAdmin)).status, 403);

  // Status: never run, with a live preview of who would be texted.
  let status = await call('get', '/automation');
  assert.equal(status.status, 200);
  assert.ok(status.payload.tasks.every((task: any) => task.lastRun === null));
  assert.ok(!status.payload.tasks.some((task: any) => ['petty-cash-reset', 'contract-expiry-alerts'].includes(task.taskName)),
    'log-only tasks are not offered');
  assert.deepEqual(status.payload.feeReminderPreview, { students: 1, parentNumbers: 1, withoutPhone: 1, withoutGuardian: 0, totalOverdue: 4500 });
  assert.equal(texts.length, 0, 'preview sends nothing');

  // First send goes out and is recorded.
  let sent = await call('post', '/trigger', { taskName: 'fee-reminder-sms' });
  assert.equal(sent.status, 200);
  assert.deepEqual(texts, ['9800000001']);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].startedById, 'ta');
  assert.match(runs[0].summary, /1 SMS sent/);

  // A second send inside the cooldown is refused until confirmed.
  sent = await call('post', '/trigger', { taskName: 'fee-reminder-sms' });
  assert.equal(sent.status, 409);
  assert.equal(sent.payload.code, 'RECENTLY_SENT');
  assert.equal(texts.length, 1, 'no second SMS without confirmation');
  sent = await call('post', '/trigger', { taskName: 'fee-reminder-sms', force: true });
  assert.equal(sent.status, 200);
  assert.equal(texts.length, 2);

  // Old runs do not block.
  runs.forEach((run) => { run.createdAt = new Date(Date.now() - 21 * 3_600_000); });
  sent = await call('post', '/trigger', { taskName: 'fee-reminder-sms' });
  assert.equal(sent.status, 200);

  // Status now shows who ran it.
  status = await call('get', '/automation');
  const fee = status.payload.tasks.find((task: any) => task.taskName === 'fee-reminder-sms');
  assert.equal(fee.lastRun.by, 'Jeena Bhattarai');

  console.log('cron automation tests passed');
}

main().catch((error) => { console.error(error); process.exit(1); });
