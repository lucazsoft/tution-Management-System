import assert from 'node:assert/strict';
import prisma from '../utils/db';

let actor: any;
const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true,
  exports: { auth: { api: { getSession: async () => actor ? { user: actor } : null } } } } as NodeModule;
const router = require('./users').default;
const db = prisma as any;
let target: any;
let writes = 0;
const assignment = (name: string, branchId: string | null) => ({ branchId, role: { name } });
db.user.findFirst = async ({ where }: any) => target.id === where.id && target.tenantId === where.tenantId ? target : null;
db.user.update = async () => { writes++; return target; };
db.user.updateMany = async () => { writes++; return { count: 1 }; };
db.session.deleteMany = async () => { writes++; return { count: 1 }; };
db.$transaction = async (run: any) => run(db);

async function invoke(method: string, body = { status: 'SUSPENDED' }) {
  const route = router.stack.find((layer: any) => layer.route?.path === '/:id' && layer.route.methods[method]).route;
  const req: any = { headers: {}, body, params: { id: target.id } };
  let status = 200;
  const res: any = { status(code: number) { status = code; return this; }, json() { return this; } };
  for (const layer of route.stack) {
    let next = false;
    await layer.handle(req, res, () => { next = true; });
    if (!next) break;
  }
  return status;
}

async function main() {
  actor = { id: 'manager', tenantId: 'tenant', roles: [{ roleName: 'Branch Admin', branchId: 'branch' }] };
  target = { id: 'target', tenantId: 'tenant', phone: '9812345678', student: null, staffRecord: null, userRoles: [] };
  for (const method of ['put', 'delete']) {
    for (const role of ['Branch Admin', 'Tenant Admin', 'Super Admin']) {
      // Ordinary assignment first: no branch match may override an admin role elsewhere.
      target.userRoles = [assignment('Teacher', 'branch'), assignment(role, role === 'Branch Admin' ? 'other-branch' : null)];
      writes = 0;
      assert.equal(await invoke(method), 403, `${method} must reject multi-role ${role}`);
      assert.equal(writes, 0, 'Denied requests must not mutate users or sessions');
    }
    target.userRoles = [assignment('Branch Admin', 'branch')];
    assert.equal(await invoke(method), 403, 'Same-branch managers are protected');
    for (const role of ['Teacher', 'Accountant', 'Receptionist', 'Janitor', 'Student', 'Parent']) {
      target.userRoles = [assignment(role, 'branch')];
      writes = 0;
      assert.equal(await invoke(method), 200, `${method} must allow in-branch ${role}`);
      assert.ok(writes > 0);
    }
    target.userRoles = [assignment('Teacher', 'other-branch')];
    writes = 0;
    assert.equal(await invoke(method), 403);
    assert.equal(writes, 0);
    target.tenantId = 'other-tenant';
    assert.equal(await invoke(method), 404);
    target.tenantId = 'tenant';
    actor.roles = [{ roleName: 'Tenant Admin', branchId: null }];
    target.userRoles = [assignment('Branch Admin', 'other-branch')];
    assert.equal(await invoke(method), 200, 'Tenant admin retains manager control');
    actor.roles = [{ roleName: 'Branch Admin', branchId: 'branch' }];
  }
  console.log('PASS target admin protection, multi-role accounts, ordinary roles, branch/tenant boundaries, and tenant-admin control');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
