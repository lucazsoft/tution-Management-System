import assert from 'node:assert/strict';
import type { UserPayload } from '@tms/types';
import prisma from '../utils/db';

let actor: UserPayload = { id: 'branch-admin', tenantId: 'tenant-a', email: 'a@example.test', firstName: 'A', lastName: 'B', roles: [{ roleName: 'Branch Admin', branchId: 'branch-a', permissions: [] }] };
const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { auth: { api: { getSession: async () => ({ user: actor }) } } } } as NodeModule;

let row: any = { id: 'post-1', tenantId: 'tenant-a', platform: 'LINKEDIN', content: 'Hello', mediaUrls: [], status: 'SCHEDULED', scheduledFor: new Date(0), attemptCount: 0 };
const audits: any[] = [];
(prisma as any).$transaction = async (operation: any) => operation(prisma);
(prisma as any).socialMediaPost = {
  findFirst: async ({ where }: any) => row.tenantId === where.tenantId && row.status === where.status && row.scheduledFor <= where.scheduledFor.lte ? { ...row } : null,
  findFirstOrThrow: async () => ({ ...row }),
  updateMany: async ({ where, data }: any) => {
    if (row.id !== where.id || row.tenantId !== where.tenantId || row.status !== where.status) return { count: 0 };
    const attemptCount = data.attemptCount; const { attemptCount: _ignored, ...rest } = data;
    row = { ...row, ...rest, attemptCount: row.attemptCount + (attemptCount?.increment ?? 0) };
    return { count: 1 };
  },
};
(prisma as any).socialPublishAttempt = { create: async ({ data }: any) => { audits.push(data); return data; } };

const router = require('./cron').default;
async function invoke() {
  const route = router.stack.find((layer: any) => layer.route?.path === '/trigger' && layer.route.methods.post).route;
  const req: any = { headers: {}, body: { taskName: 'social-publishing' }, params: {} };
  let status = 200; let payload: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { payload = value; return this; } };
  for (const layer of route.stack) { let next = false; await layer.handle(req, res, () => { next = true; }); if (!next) break; }
  return { status, payload };
}

async function main() {
  assert.equal((await invoke()).status, 403);
  actor = { ...actor, id: 'tenant-admin', roles: [{ roleName: 'Tenant Admin', branchId: null, permissions: [] }] };
  const result = await invoke();
  assert.equal(result.status, 200);
  assert.match(result.payload.executionLogs[0], /claimed 1.*blocked 1/i);
  assert.equal(row.status, 'BLOCKED');
  assert.equal(row.attemptCount, 1);
  assert.equal(audits[0].outcome, 'BLOCKED');
  assert.match(audits[0].detail, /credentials are not configured/);
  console.log('Social publishing cron tests passed: tenant-admin authorization and honest missing-credential persistence.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
