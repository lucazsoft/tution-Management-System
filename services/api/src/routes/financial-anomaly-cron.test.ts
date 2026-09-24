import assert from 'node:assert/strict';

let calledTenantId: string | undefined;
const summary = {
  analyzedBranches: 2,
  anomalies: [{ branchId: 'branch-a', category: 'UTILITIES' }],
  attemptedDeliveries: 1,
  delivered: 1,
  failed: 0,
};

const authPath = require.resolve('../utils/auth');
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: {
    auth: { api: { getSession: async () => ({ user: {
      id: 'admin-a',
      tenantId: 'tenant-a',
      roles: [{ roleName: 'Tenant Admin', branchId: null, permissions: [] }],
    } }) } },
  },
} as NodeModule;

const anomalyService = require('../services/financial-anomaly-alerts');
anomalyService.runBranchExpenseAnomalyAlerts = async ({ tenantId }: { tenantId: string }) => {
  calledTenantId = tenantId;
  return summary;
};
const cron = require('./cron').default;

async function invoke(body: any) {
  const route = cron.stack.find((layer: any) => layer.route?.path === '/trigger' && layer.route.methods.post).route;
  const req: any = { body, headers: {}, params: {}, query: {} };
  let status = 200;
  let payload: any;
  const res: any = {
    status(code: number) { status = code; return this; },
    json(value: any) { payload = value; return this; },
  };
  for (const layer of route.stack) {
    let next = false;
    await layer.handle(req, res, () => { next = true; });
    if (!next) break;
  }
  return { status, payload };
}

async function main() {
  const response = await invoke({ taskName: 'financial-anomaly-alerts', tenantId: 'tenant-from-client' });
  assert.equal(response.status, 200);
  assert.equal(calledTenantId, 'tenant-a', 'cron must use the authenticated session tenant, never request input');
  assert.deepEqual(response.payload.financialAnomalyAlerts, summary);
  assert.equal(response.payload.executionLogs[0], 'Detected 1 branch expense anomaly; delivered 1 of 1 alert notification.');
  console.log('PASS authenticated cron trigger runs tenant-scoped financial anomaly alerts');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
