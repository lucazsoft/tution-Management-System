import assert from 'node:assert/strict';
import type { UserPayload } from '@tms/types';
import prisma from '../utils/db';

const actor: UserPayload = {
  id: 'admin-ledger',
  tenantId: 'tenant-a',
  email: 'ledger@example.test',
  firstName: 'Ledger',
  lastName: 'Admin',
  roles: [{ roleName: 'Tenant Admin', branchId: null, permissions: [] }],
};
const authPath = require.resolve('../utils/auth');
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: { auth: { api: { getSession: async () => ({ user: actor }) } } },
} as NodeModule;
const router = require('./finances').default;

(prisma as any).invoice = {
  findMany: async ({ where }: any) => {
    assert.equal(where.tenantId, 'tenant-a', 'ledger must scope to the session tenant');
    assert.ok(!('tenantId' in (where as object) && where.tenantId === 'tenant-evil'));
    return [
      {
        id: 'inv-1',
        invoiceType: 'TUITION',
        netPayable: 100,
        paymentDate: new Date('2026-08-10T00:00:00Z'),
        updatedAt: new Date('2026-08-10T00:00:00Z'),
      },
    ];
  },
} as any;
(prisma as any).expense = {
  findMany: async ({ where }: any) => {
    assert.equal(where.tenantId, 'tenant-a');
    return [{ id: 'exp-1', category: 'RENT', amount: 50, purpose: 'Office rent', date: new Date('2026-08-11T00:00:00Z') }];
  },
} as any;
(prisma as any).payroll = {
  findMany: async ({ where }: any) => {
    assert.equal(where.tenantId, 'tenant-a');
    return [{ id: 'pay-1', month: 8, year: 2026, netPayable: 200, paymentDate: new Date('2026-08-12T00:00:00Z'), updatedAt: new Date('2026-08-12T00:00:00Z') }];
  },
} as any;

async function invoke(method: 'get', path: string, query: any = {}) {
  const route = router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method])?.route;
  assert.ok(route, `route ${method.toUpperCase()} ${path} must exist`);
  const req: any = { headers: {}, query, params: {}, body: {} };
  let status = 200;
  let payload: any;
  const headers: Record<string, string> = {};
  let sent: any;
  const res: any = {
    status(code: number) { status = code; return this; },
    json(value: any) { payload = value; return this; },
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; return this; },
    set(name: string, value: string) { headers[name.toLowerCase()] = value; return this; },
    send(value: any) { sent = value; return this; },
  };
  for (const layer of route.stack) {
    let next = false;
    await layer.handle(req, res, () => { next = true; });
    if (!next) break;
  }
  return { status, payload, headers, sent };
}

async function main() {
  // General ledger: debits must equal credits.
  const general = await invoke('get', '/ledger/general');
  assert.equal(general.status, 200);
  assert.equal(general.payload.balanced, true);
  assert.equal(general.payload.totalDebitPaisa, general.payload.totalCreditPaisa);
  assert.ok(general.payload.totalDebitPaisa > 0);
  assert.ok(Array.isArray(general.payload.entries) && general.payload.entries.length === 3);

  // A client-supplied tenantId must never override the session tenant.
  const scoped = await invoke('get', '/ledger/general', { tenantId: 'tenant-evil' });
  assert.equal(scoped.status, 200);
  assert.equal(scoped.payload.balanced, true);

  // CSV export for audit compliance.
  const csv = await invoke('get', '/ledger/export', { format: 'csv' });
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'] ?? '', /text\/csv/);
  assert.ok(String(csv.sent).startsWith('Date,Debit Account,Credit Account,Amount (NPR),Description'));

  // PDF export for audit compliance.
  const pdf = await invoke('get', '/ledger/export', { format: 'pdf' });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers['content-type'] ?? '', /application\/pdf/);
  const bytes = Buffer.isBuffer(pdf.sent) ? pdf.sent : Buffer.from(pdf.sent ?? '');
  assert.equal(bytes.subarray(0, 4).toString(), '%PDF');

  // Unknown export format is rejected.
  const bad = await invoke('get', '/ledger/export', { format: 'xml' });
  assert.equal(bad.status, 400);

  console.log('PASS ledger routes balance debits/credits and export CSV/PDF under session tenant scope');
}

void main();
