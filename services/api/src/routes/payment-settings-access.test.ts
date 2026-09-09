import assert from 'node:assert/strict';
import prisma from '../utils/db';

let actor: any;
const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  auth: { api: { getSession: async () => actor ? { user: actor } : null } },
} } as NodeModule;
const verificationService = require('../services/payment-settings-verification');
verificationService.consumePaymentCode = async (_tenant: string, _user: string, _branch: string, _action: string, _config: any, verification: any) => verification?.code === '123456';
const router = require('./finances').default;
const db = prisma as any;
const branches = [
  { id: 'a', tenantId: 'tenant', name: 'Alpha', address: 'North' },
  { id: 'b', tenantId: 'tenant', name: 'Beta', address: 'South' },
  { id: 'foreign', tenantId: 'other', name: 'Other', address: 'West' },
];
const configs = new Map<string, any>();
let writes = 0;
db.branch.findFirst = async ({ where }: any) => branches.find(b => b.id === where.id && b.tenantId === where.tenantId) ?? null;
db.branch.findMany = async ({ where }: any) => branches.filter(b => b.tenantId === where.tenantId).map(b => ({ ...b, paymentSettings: configs.get(b.id) ?? null }));
db.branchPaymentSettings.findUnique = async ({ where }: any) => configs.get(where.branchId) ?? null;
db.branchPaymentSettings.upsert = async ({ where, create, update }: any) => {
  writes++; const value = configs.has(where.branchId) ? { ...configs.get(where.branchId), ...update } : create;
  configs.set(where.branchId, value); return value;
};
db.branchPaymentSettings.deleteMany = async ({ where }: any) => {
  writes++; if (configs.get(where.branchId)?.tenantId === where.tenantId) configs.delete(where.branchId);
  return { count: 1 };
};
db.invoice.findFirst = async ({ where }: any) => {
  if (!['invoice-a', 'invoice-b', 'invoice-foreign'].includes(where.id)) return null;
  const tenantId = where.id === 'invoice-foreign' ? 'other' : 'tenant';
  if (where.tenantId !== tenantId) return null;
  return { id: where.id, tenantId, branchId: where.id === 'invoice-a' ? 'a' : 'b', student: {
    userId: 'student', studentParents: [{ parent: { userId: 'parent' } }],
  } };
};
function login(roleName = 'Tenant Admin', branchId: string | null = null, id = 'admin') {
  actor = { id, tenantId: 'tenant', roles: [{ roleName, branchId, permissions: [] }] };
}
async function invoke(path: string, method = 'get', options: any = {}) {
  const route = router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route;
  const req: any = { headers: {}, body: {}, query: {}, params: {}, ...options };
  let status = 200; let payload: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { payload = value; return this; } };
  for (const layer of route.stack) { let next = false; await layer.handle(req, res, () => { next = true; }); if (!next) break; }
  return { status, payload };
}
const get = (branchId?: unknown) => invoke('/payment-settings', 'get', { query: branchId === undefined ? {} : { branchId } });
const config = { staticQrEnabled: true, staticQrImageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=', accountName: 'Alpha', accountNumber: '0012345', bankName: 'Bank' };
const mutate = (method: string, branchId = 'a', body: any = config) => invoke('/branches/:branchId/payment-settings', method, { params: { branchId }, body: { ...body, verification: { code: '123456' } } });
const checkout = (invoiceId: string) => invoke('/invoices/:invoiceId/payment-settings', 'get', { params: { invoiceId } });

async function main() {
  process.env.STATIC_PAYMENT_QR_ENABLED = 'true';
  process.env.STATIC_PAYMENT_QR_IMAGE_URL = 'https://example.test/default.png';
  process.env.CONNECTIPS_ENABLED = 'true';
  actor = null;
  assert.equal((await get('a')).status, 401);
  assert.equal((await checkout('invoice-a')).status, 401);
  login();
  assert.equal((await get(['a'])).status, 400);
  assert.equal((await mutate('put')).status, 200);
  assert.equal((await mutate('put', 'b', { ...config, staticQrImageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=' })).status, 200);
  assert.equal((await get('a')).payload.source, 'branch');
  const audit = await invoke('/admin/branches/payment-settings');
  assert.equal(audit.status, 200); assert.equal(audit.payload.branches.length, 2);
  assert.equal(audit.payload.branches[0].branch.location, 'North');
  for (const id of ['foreign', 'missing']) {
    assert.equal((await get(id)).status, 404);
    assert.equal((await mutate('put', id)).status, 404);
    assert.equal((await mutate('delete', id)).status, 404);
  }
  assert.equal((await invoke('/branches/:branchId/payment-settings', 'put', { params: { branchId: 'a' }, body: config })).status, 403);
  assert.equal((await invoke('/branches/:branchId/payment-settings', 'delete', { params: { branchId: 'a' }, body: {} })).status, 403);
  const before = writes;
  for (const role of ['Branch Admin', 'Teacher', 'Student', 'Parent', 'Accountant', 'Receptionist']) {
    login(role, 'a');
    assert.equal((await get('a')).status, role === 'Branch Admin' ? 200 : 403);
    assert.equal((await get('b')).status, 403);
    assert.equal((await get()).status, 403);
    assert.equal((await mutate('put')).status, 403);
    assert.equal((await mutate('delete')).status, 403);
    assert.equal((await invoke('/admin/branches/payment-settings')).status, 403);
  }
  assert.equal(writes, before, 'Denied writes must never reach persistence');
  for (const [role, id] of [['Student', 'student'], ['Parent', 'parent']]) {
    login(role, 'a', id);
    assert.equal((await checkout('invoice-a')).payload.staticQrImageUrl, config.staticQrImageUrl);
    assert.equal((await checkout('invoice-b')).payload.staticQrImageUrl, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=');
    assert.equal((await checkout('invoice-foreign')).status, 404);
  }
  login('Student', 'a', 'unrelated');
  assert.equal((await checkout('invoice-a')).status, 404);
  login();
  for (const body of [{ ...config, staticQrImageUrl: 'http://example.test/qr' }, { ...config, accountNumber: '1234' }, { ...config, accountName: ' '.repeat(3) }, { ...config, bankName: 2 }, { ...config, instructions: 'x'.repeat(501) }]) {
    assert.equal((await mutate('put', 'a', body)).status, 400);
  }
  assert.equal((await mutate('put', 'a', { staticQrEnabled: false })).status, 200);
  assert.equal((await get('a')).payload.source, 'tenant_default');
  assert.equal((await checkout('invoice-a')).payload.staticQrImageUrl, process.env.STATIC_PAYMENT_QR_IMAGE_URL);
  assert.equal((await mutate('delete', 'b')).status, 200);
  assert.equal((await get('b')).payload.source, 'tenant_default');
  console.log('PASS payment settings route permissions, validation, tenant isolation, invoice QR selection, disable/reset fallback');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
