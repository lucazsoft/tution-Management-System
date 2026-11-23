import assert from 'node:assert/strict';
import type { UserPayload } from '@tms/types';
import prisma from '../utils/db';

// Stub session storage only: execute the real authentication and permission middleware.
let actor: UserPayload | null = { id: 'admin', tenantId: 'tenant-a', email: 'admin@example.test', firstName: 'Branch', lastName: 'Admin', roles: [{ roleName: 'Branch Admin', branchId: 'branch-a', permissions: ['manage_branch_calendar'] }] };
const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { auth: { api: { getSession: async () => actor ? { user: actor } : null } } } } as NodeModule;
const router = require('./academic-events').default;

async function invoke(method: string, path: string, body: any = {}, query: any = {}, id = 'own-event') {
  const route = router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route;
  const req: any = { headers: {}, body, query, params: { id } };
  let status = 200;
  let payload: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { payload = value; return this; } };
  for (const layer of route.stack) {
    let next = false;
    await layer.handle(req, res, () => { next = true; });
    if (!next) break;
  }
  return { status, payload };
}
async function main() {
  const findMany = prisma.class.findMany;
  const branchFindMany = prisma.branch.findMany;
  const updateMany = prisma.academicEvent.updateMany;
  let writes = 0;
  try {
    prisma.branch.findMany = (async ({ where }: any) => {
      assert.equal(where.tenantId, 'tenant-a');
      assert.deepEqual(where.id.in, ['branch-a'], 'branch admins only see their own branch as a target');
      return [{ id: 'branch-a', name: 'Branch A' }];
    }) as any;
    prisma.class.findMany = (async ({ where }: any) => {
      assert.equal(where.course.tenantId, 'tenant-a');
      assert.deepEqual(where.branchId.in, ['branch-a']);
      return [{ id: 'class-a', name: 'A', branchId: 'branch-a', branch: { name: 'Branch A' } }];
    }) as any;
    prisma.academicEvent.updateMany = (async ({ where }: any) => {
      assert.equal(where.tenantId, 'tenant-a');
      assert.deepEqual(where.branchId.in, ['branch-a']);
      if (where.id !== 'own-event') return { count: 0 };
      writes++; return { count: 1 };
    }) as any;
    assert.equal((await invoke('get', '/options')).status, 403);
    const options = (await invoke('get', '/options', {}, { branchId: 'branch-a' })).payload;
    assert.equal(options.classes[0].id, 'class-a');
    assert.deepEqual(options.branches, [{ id: 'branch-a', name: 'Branch A' }]);
    assert.equal((await invoke('get', '/options', {}, { branchId: 'branch-b' })).status, 403);
    assert.equal((await invoke('patch', '/:id/audience', { audience: 'ALL' })).status, 403);
    assert.equal((await invoke('patch', '/:id/audience', { audience: 'ALL', branchId: 'branch-a' })).status, 200);
    assert.equal((await invoke('patch', '/:id/audience', { audience: 'ALL', branchId: 'branch-b' })).status, 403);
    // Claiming the allowed branch must not grant access to another branch/tenant event.
    assert.equal((await invoke('patch', '/:id/audience', { audience: 'ALL', branchId: 'branch-a' }, {}, 'foreign-event')).status, 404);
    actor!.roles[0].permissions = [];
    assert.equal((await invoke('get', '/options', {}, { branchId: 'branch-a' })).status, 403);
    actor!.roles = [{ roleName: 'Accountant', branchId: 'branch-a', permissions: ['manage_billing', 'view_reports', 'manage_petty_cash'] }];
    assert.equal((await invoke('get', '/options', {}, { branchId: 'branch-a' })).status, 403);
    assert.equal((await invoke('patch', '/:id/audience', { audience: 'ALL', branchId: 'branch-a' })).status, 403);
    assert.equal((await invoke('post', '/', { branchId: 'branch-a' })).status, 403);
    actor = null;
    assert.equal((await invoke('get', '/options', {}, { branchId: 'branch-a' })).status, 401);
    assert.equal(writes, 1);
    console.log('Calendar route middleware checks passed: branch context, permissions, authentication, and resource scope.');
  } finally { prisma.class.findMany = findMany; prisma.branch.findMany = branchFindMany; prisma.academicEvent.updateMany = updateMany; }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
