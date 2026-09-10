import assert from 'node:assert/strict';
import prisma from '../utils/db';
let actor: any;
const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { auth: { api: { getSession: async () => actor ? { user: actor } : null } } } } as NodeModule;
const router = require('./users').default;
const db = prisma as any;
let updates: any[] = [];
let mobile: any = {};
let assignments: any[] = [];
let reads: any[] = [];
db.user.findFirst = async ({ where }: any) => { reads.push(where); return where.id === 'admin' && where.tenantId === 'tenant' ? { id: 'admin', phone: '9812345678', ...mobile, userRoles: assignments, staffRecord: null } : null; };
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
  for (const role of ['Student', 'Parent', 'Teacher', 'Accountant', 'Branch Admin']) {
    actor = { id: 'admin', tenantId: 'tenant', roles: [{ roleName: role, branchId: 'branch', permissions: [] }] };
    assignments = [{ id: 'assignment', role: { name: role }, branchId: 'branch', branch: { name: 'North branch', tenantId: 'tenant' } }];
    const response = await invoke('get');
    assert.equal(response.status, 200);
    assert.deepEqual(response.payload.roles, [{ id: 'assignment', name: role, branchId: 'branch', branchName: 'North branch' }]);
    assert.deepEqual(response.payload.capabilities, { manageInstitution: false, manageSecurityMobile: false });
    assert.equal((await invoke('patch', '/me/account', { firstName: 'New', lastName: 'Name' })).status, 200);
    assert.deepEqual(updates.at(-1).where, { id: 'admin', tenantId: 'tenant' });
    assert.equal((await invoke('patch', '/me/account', { firstName: 'New', lastName: 'Name', id: 'victim' })).status, 400);

  }
  actor = { id: 'admin', tenantId: 'tenant', roles: [{ roleName: 'Tenant Admin', branchId: null, permissions: [] }] };
  assignments = [
    { id: 'tenant-role', role: { name: 'Tenant Admin' }, branchId: null, branch: null },
    { id: 'teacher-role', role: { name: 'Teacher' }, branchId: 'branch', branch: { name: 'North branch', tenantId: 'tenant' } },
    { id: 'foreign-role', role: { name: 'Teacher' }, branchId: 'foreign', branch: { name: 'Private branch', tenantId: 'other' } },
  ];
  const profile = (await invoke('get')).payload;
  assert.equal(profile.roles.length, 2);
  assert.equal(profile.roles[0].branchId, null);
  assert.equal(profile.capabilities.manageInstitution, true);
  assert.equal(profile.capabilities.manageSecurityMobile, true);
  assert.equal(profile.securityMobile, undefined);
  assert.deepEqual(reads.at(-1), { id: 'admin', tenantId: 'tenant' });
  actor.tenantId = 'foreign';
  assert.equal((await invoke('get')).status, 404);
  actor.tenantId = 'tenant';
  updates = [];

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
  console.log('PASS account ownership across six roles, role and branch metadata, capability restrictions, name validation, forbidden fields, and protected security mobile');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
