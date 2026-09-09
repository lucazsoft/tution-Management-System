import assert from 'node:assert/strict';
import prisma from '../utils/db';
let actor: any;
const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { auth: { api: { getSession: async () => actor ? { user: actor } : null } } } } as NodeModule;
const router = require('./users').default;
const db = prisma as any;
let updates: any[] = [];
let mobile: any = {};
db.user.findFirst = async ({ where }: any) => where.id === 'admin' && where.tenantId === 'tenant' ? { id: 'admin', phone: '9812345678', ...mobile, userRoles: [], staffRecord: null } : null;
db.user.updateMany = async (args: any) => { updates.push(args); return { count: 1 }; };
db.userRole.findFirst = async () => ({ roleId: 'tenant-admin' });
async function invoke(method: string, path = '/me/account', body: any = {}) {
  const route = router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route;
  const req: any = { headers: {}, body, params: { id: 'admin' }, query: {} };
  let status = 200; let payload: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { payload = value; return this; } };
  for (const layer of route.stack) { let next = false; await layer.handle(req, res, () => { next = true; }); if (!next) break; }
  return { status, payload };
}
async function main() {
  assert.equal((await invoke('get')).status, 401);
  for (const role of ['Student', 'Teacher', 'Branch Admin']) {
    actor = { id: 'admin', tenantId: 'tenant', roles: [{ roleName: role, branchId: 'branch', permissions: [] }] };
    assert.equal((await invoke('get')).status, 403);
    assert.equal((await invoke('patch', '/me/account', { firstName: 'New', lastName: 'Name' })).status, 403);
  }
  actor = { id: 'admin', tenantId: 'tenant', roles: [{ roleName: 'Tenant Admin', branchId: null, permissions: [] }] };
  assert.equal((await invoke('get')).status, 200);
  assert.equal((await invoke('get')).payload.mobileVerified, false);
  mobile = { securityMobile: '9812345678', securityMobileVerifiedAt: new Date() };
  assert.equal((await invoke('get')).payload.mobileVerified, true);
  mobile.securityMobile = '9800000000';
  assert.equal((await invoke('get')).payload.mobileVerified, false);
  assert.equal((await invoke('get')).payload.mobileVerifiedAt, null);
  for (const extra of [{ securityMobile: '9800000000' }, { securityMobileVerifiedAt: new Date().toISOString() }, { phone: '9800000000' }, { email: 'other@example.test' }, { tenantId: 'other' }, { id: 'other' }, { role: 'Super Admin' }]) {
    assert.equal((await invoke('patch', '/me/account', { firstName: 'New', lastName: 'Name', ...extra })).status, 400);
  }
  assert.equal((await invoke('patch', '/me/account', { firstName: ' ', lastName: 'Name' })).status, 400);
  assert.equal(updates.length, 0);
  assert.equal((await invoke('patch', '/me/account', { firstName: ' New ', lastName: ' Name ' })).status, 200);
  assert.deepEqual(updates[0], { where: { id: 'admin', tenantId: 'tenant' }, data: { firstName: 'New', lastName: 'Name', name: 'New Name' } });
  assert.equal((await invoke('put', '/:id', { phone: '9800000000' })).status, 403);
  console.log('PASS account ownership, role restrictions, name validation, forbidden fields, and protected security mobile');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
