import assert from 'node:assert/strict';
import type { UserPayload } from '@tms/types';
import prisma from '../utils/db';

// Route-level tests for the L1/L2 state machine with an in-memory Prisma double.
const branchAdmin: UserPayload = { id: 'ba', tenantId: 'tenant-a', email: 'ba@example.test', firstName: 'B', lastName: 'A', roles: [{ roleName: 'Branch Admin', branchId: 'branch-a', permissions: ['approve_leave_l1'] }] };
const otherBranchAdmin: UserPayload = { ...branchAdmin, id: 'ba2', roles: [{ roleName: 'Branch Admin', branchId: 'branch-b', permissions: ['approve_leave_l1'] }] };
const tenantAdmin: UserPayload = { id: 'ta', tenantId: 'tenant-a', email: 'ta@example.test', firstName: 'T', lastName: 'A', roles: [{ roleName: 'Tenant Admin', branchId: null, permissions: ['approve_leave_l2'] }] };
const teacher: UserPayload = { id: 'teacher', tenantId: 'tenant-a', email: 't@example.test', firstName: 'T', lastName: 'E', roles: [{ roleName: 'Teacher', branchId: 'branch-a', permissions: [] }] };
let actor: UserPayload = branchAdmin;

const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { auth: { api: { getSession: async () => ({ user: actor }) } } } } as NodeModule;
const pushPath = require.resolve('../utils/push');
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: { getPushSender: () => ({ sendPush: async () => undefined }) } } as NodeModule;
const router = require('./leaves').default;

let leave: any;
const decisions: any[] = [];
(prisma as any).$transaction = async (operation: any) => operation(prisma);
(prisma as any).notification = { create: async () => ({}) };
prisma.user.findMany = (async () => [{ id: 'ta' }]) as any;
prisma.leave.findFirst = (async ({ where }: any) => (where.id === leave.id && where.tenantId === leave.tenantId ? { ...leave } : null)) as any;
prisma.leave.updateMany = (async ({ where, data }: any) => {
  if (where.status !== leave.status) return { count: 0 };
  Object.assign(leave, data);
  return { count: 1 };
}) as any;
(prisma as any).leaveDecision = { create: async ({ data }: any) => { decisions.push(data); return data; } };

async function invoke(path: string, as: UserPayload, body: any = {}) {
  actor = as;
  const route = router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods.post).route;
  const req: any = { headers: {}, body, params: { leaveId: 'leave-a' } };
  let status = 200; let payload: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { payload = value; return this; } };
  for (const layer of route.stack) { let next = false; await layer.handle(req, res, () => { next = true; }); if (!next) break; }
  return { status, payload };
}
const approve = (as: UserPayload, extra: any = {}) => invoke('/approve/:leaveId', as, { action: 'APPROVE', ...extra });
const reject = (as: UserPayload, remarks?: string) => invoke('/approve/:leaveId', as, { action: 'REJECT', remarks });

function reset(overrides: any = {}) {
  decisions.length = 0;
  leave = {
    id: 'leave-a', tenantId: 'tenant-a', branchId: 'branch-a', userId: 'teacher', requestedById: 'teacher',
    leaveType: 'CASUAL', status: 'PENDING', subjectType: 'STAFF', days: 2, requiredLevel: 1,
    escalatesAt: new Date(Date.now() + 3_600_000), ...overrides,
  };
}

async function main() {
  // Short staff leave: branch decision is final.
  reset();
  assert.equal((await approve(branchAdmin)).status, 200);
  assert.equal(leave.status, 'APPROVED_LEVEL2');
  assert.equal(decisions[0].level, 1);
  assert.equal((await approve(branchAdmin)).status, 409, 'cannot decide twice');

  // Long staff leave: L1 forwards, only Tenant Admin finalizes.
  reset({ days: 4, requiredLevel: 2 });
  assert.equal((await approve(tenantAdmin)).status, 403, 'tenant admin waits for L1 before escalation');
  assert.equal((await approve(otherBranchAdmin)).status, 403, 'foreign branch admin');
  assert.equal((await approve(branchAdmin)).status, 200);
  assert.equal(leave.status, 'APPROVED_LEVEL1');
  assert.equal((await approve(branchAdmin)).status, 403, 'branch admin cannot do L2');
  assert.equal((await approve(tenantAdmin)).status, 200);
  assert.equal(leave.status, 'APPROVED_LEVEL2');
  assert.deepEqual(decisions.map((item) => item.level), [1, 2]);

  // Rejection needs a reason, at either level.
  reset({ requiredLevel: 2, status: 'APPROVED_LEVEL1' });
  assert.equal((await reject(tenantAdmin)).status, 400);
  assert.equal((await reject(tenantAdmin, '  ')).status, 400);
  assert.equal((await reject(tenantAdmin, 'Exam week')).status, 200);
  assert.equal(leave.status, 'REJECTED');
  assert.equal(leave.remarks, 'Exam week');

  // 48h escalation: Tenant Admin may decide an unanswered staff request, and that decision is final.
  reset({ days: 1, requiredLevel: 1, escalatesAt: new Date(Date.now() - 1000) });
  assert.equal((await approve(tenantAdmin)).status, 200);
  assert.equal(leave.status, 'APPROVED_LEVEL2');
  assert.equal(decisions[0].escalated, true);
  reset({ days: 5, requiredLevel: 2, escalatesAt: new Date(Date.now() - 1000) });
  assert.equal((await approve(tenantAdmin)).status, 200);
  assert.equal(leave.status, 'APPROVED_LEVEL2', 'escalated L2 request is finalized in one step');

  // Students never reach the Tenant Admin, even when long or unanswered.
  reset({ subjectType: 'STUDENT', days: 10, requiredLevel: 1, escalatesAt: null });
  assert.equal((await approve(tenantAdmin)).status, 403);
  assert.equal((await approve(branchAdmin)).status, 200);
  assert.equal(leave.status, 'APPROVED_LEVEL2');

  // Cancellation by the requester while undecided.
  reset({ status: 'APPROVED_LEVEL1', requiredLevel: 2 });
  assert.equal((await invoke('/:leaveId/cancel', branchAdmin)).status, 404, 'others cannot cancel');
  assert.equal((await invoke('/:leaveId/cancel', teacher)).status, 200);
  assert.equal(leave.status, 'CANCELLED');
  assert.equal(decisions[0].action, 'CANCEL');
  assert.equal((await invoke('/:leaveId/cancel', teacher)).status, 409);

  console.log('leave route tests passed');
}

main().catch((error) => { console.error(error); process.exit(1); });
