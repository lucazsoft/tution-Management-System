import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { UserPayload } from '@tms/types';
import prisma from '../utils/db';

let actor: UserPayload = { id: 'branch-admin', tenantId: 'tenant-a', email: 'a@example.test', firstName: 'A', lastName: 'B', roles: [{ roleName: 'Branch Admin', branchId: 'branch-a', permissions: [] }] };
const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { auth: { api: { getSession: async () => ({ user: actor }) } } } } as NodeModule;

let row: any = { id: 'post-1', tenantId: 'tenant-a', platform: 'META', content: 'Hello', mediaUrls: [], status: 'APPROVED', scheduledFor: null, attemptCount: 0 };
(prisma as any).$transaction = async (operation: any) => operation(prisma);
(prisma as any).socialMediaPost = {
  updateMany: async ({ where, data }: any) => {
    if (where.id !== row.id || where.tenantId !== row.tenantId || where.status !== row.status) return { count: 0 };
    row = { ...row, ...data }; return { count: 1 };
  },
  findFirstOrThrow: async () => ({ ...row }),
};
(prisma as any).socialPublishAttempt = { create: async ({ data }: any) => data };

const router = require('./social').default;

async function invoke(body: any) {
  const route = router.stack.find((layer: any) => layer.route?.path === '/posts/:id/schedule' && layer.route.methods.post).route;
  const req: any = { headers: {}, body, params: { id: 'post-1' } };
  let status = 200; let payload: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { payload = value; return this; } };
  for (const layer of route.stack) { let next = false; await layer.handle(req, res, () => { next = true; }); if (!next) break; }
  return { status, payload };
}

async function main() {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.ts'), 'utf8');
  assert.match(serverSource, /app\.use\('\/api\/social', socialRouter\)/, 'social scheduling router must be mounted');
  assert.equal((await invoke({ scheduledFor: '2026-09-09T06:00:00.000Z' })).status, 403);
  assert.equal(row.status, 'APPROVED');

  actor = { ...actor, id: 'tenant-admin', roles: [{ roleName: 'Tenant Admin', branchId: null, permissions: [] }] };
  assert.equal((await invoke({ scheduledFor: 'not-a-date' })).status, 400);
  const result = await invoke({ scheduledFor: '2026-09-09T06:00:00.000Z' });
  assert.equal(result.status, 200);
  assert.equal(result.payload.post.status, 'SCHEDULED');
  assert.equal(result.payload.post.tenantId, 'tenant-a');
  assert.equal(row.scheduledById, 'tenant-admin');

  console.log('Social scheduling route tests passed: authenticated tenant-admin authorization, validation, and tenant-scoped scheduling.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
