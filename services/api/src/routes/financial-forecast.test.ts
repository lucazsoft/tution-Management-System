import assert from 'node:assert/strict';
import prisma from '../utils/db';

let actor: any;
const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  auth: { api: { getSession: async () => actor ? { user: actor } : null } },
} } as NodeModule;
const router = require('./finances').default;
const db = prisma as any;

const seen: { findManyWhere?: any; aggregateWhere?: any; countWhere?: any } = {};
const enrollments = [
  { course: { feeStructure: { monthlyBase: 1000 } } },
  { course: { feeStructure: { monthlyBase: 2000 } } },
  { course: { feeStructure: { monthlyBase: 3000 } } },
];
db.enrollment.findMany = async ({ where }: any) => { seen.findManyWhere = where; return enrollments; };
db.invoice.aggregate = async ({ where }: any) => { seen.aggregateWhere = where; return { _sum: { netPayable: 2500 } }; };
db.enrollment.count = async ({ where }: any) => { seen.countWhere = where; return 5; };

function login(roleName: string, branchId: string | null, permissions: string[] = []) {
  actor = { id: 'user', tenantId: 'tenant-a', roles: [{ roleName, branchId, permissions }] };
}

async function get() {
  const route = router.stack.find((layer: any) => layer.route?.path === '/forecast' && layer.route.methods.get).route;
  const req: any = { headers: {}, body: {}, query: {}, params: {} };
  let status = 200; let payload: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { payload = value; return this; } };
  for (const layer of route.stack) { let next = false; await layer.handle(req, res, () => { next = true; }); if (!next) break; }
  return { status, payload };
}

async function main() {
  actor = null;
  assert.equal((await get()).status, 401, 'unauthenticated forecast request must be rejected');

  for (const role of ['Branch Admin', 'Accountant', 'Teacher', 'Receptionist', 'Student', 'Parent']) {
    login(role, 'branch-a');
    assert.equal((await get()).status, 403, `${role} must not access institution-wide forecast`);
  }

  // Tenant-wide non-admin holding view_reports still blocked by the Tenant Admin gate.
  login('Accountant', null, ['view_reports']);
  assert.equal((await get()).status, 403, 'tenant-wide non-admin must not access institution-wide forecast');

  login('Tenant Admin', null);
  const response = await get();
  assert.equal(response.status, 200);
  assert.equal(seen.findManyWhere?.course?.tenantId, 'tenant-a', 'active-enrollment query must be tenant-scoped');
  assert.equal(seen.findManyWhere?.status, 'ACTIVE');
  assert.equal(seen.aggregateWhere?.tenantId, 'tenant-a', 'collections aggregate must be tenant-scoped');
  assert.equal(seen.aggregateWhere?.status, 'PAID');
  assert.equal(seen.countWhere?.course?.tenantId, 'tenant-a', 'attrition baseline must be tenant-scoped');
  const metrics = response.payload.metrics;
  assert.equal(metrics.baseForecastNpr, 6000);
  assert.equal(metrics.estimatedAttritionNpr, 2400);
  assert.equal(metrics.attritionPercentage, '40.0%');
  assert.equal(metrics.netForecastNpr, 3600);
  assert.equal(metrics.actualCollectedNpr, 2500);
  assert.equal(metrics.varianceNpr, -1100);
  assert.equal(metrics.activeEnrollments, 3);
  assert.ok(typeof response.payload.billingCycle === 'string' && response.payload.billingCycle.length > 0);
  console.log('PASS fee forecast-versus-actual auth, tenant scope, and variance math');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
