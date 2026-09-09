import assert from 'node:assert/strict';
import { runBranchExpenseAnomalyAlerts } from './financial-anomaly-alerts';

const now = new Date('2026-08-15T12:00:00.000Z');
const queries: { branches?: any; expenses?: any; recipients?: any } = {};
const deliveries: Array<{ userId: string; title: string; body: string }> = [];

const db = {
  branch: {
    findMany: async (args: any) => {
      queries.branches = args;
      return [
        { id: 'branch-a', name: 'Lalitpur' },
        { id: 'branch-b', name: 'Bhaktapur' },
      ];
    },
  },
  expense: {
    findMany: async (args: any) => {
      queries.expenses = args;
      return [
        { branchId: 'branch-a', category: 'UTILITIES', amount: 10_000, date: new Date('2026-05-10T00:00:00.000Z') },
        { branchId: 'branch-a', category: 'UTILITIES', amount: 10_000, date: new Date('2026-06-10T00:00:00.000Z') },
        { branchId: 'branch-a', category: 'UTILITIES', amount: 18_000, date: new Date('2026-08-10T00:00:00.000Z') },
        { branchId: 'branch-b', category: 'RENT', amount: 20_000, date: new Date('2026-06-01T00:00:00.000Z') },
        { branchId: 'branch-b', category: 'RENT', amount: 20_000, date: new Date('2026-07-01T00:00:00.000Z') },
        { branchId: 'branch-b', category: 'RENT', amount: 20_000, date: new Date('2026-08-01T00:00:00.000Z') },
      ];
    },
  },
  user: {
    findMany: async (args: any) => {
      queries.recipients = args;
      return [{ id: 'admin-ok' }, { id: 'admin-declines' }, { id: 'admin-fails' }];
    },
  },
};

async function main() {
  const result = await runBranchExpenseAnomalyAlerts({
    tenantId: 'tenant-a',
    now,
    db: db as any,
    sendPush: async (userId: string, title: string, body: string) => {
      deliveries.push({ userId, title, body });
      if (userId === 'admin-declines') return { success: false };
      if (userId === 'admin-fails') throw new Error('injected notification outage');
      return { success: true };
    },
  });

  assert.deepEqual(queries.branches.where, { tenantId: 'tenant-a' });
  assert.equal(queries.expenses.where.tenantId, 'tenant-a');
  assert.deepEqual(queries.expenses.where.branchId, { in: ['branch-a', 'branch-b'] });
  assert.equal(queries.expenses.where.date.gte.toISOString(), '2026-05-01T00:00:00.000Z');
  assert.equal(queries.expenses.where.date.lt.toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(queries.recipients.where.tenantId, 'tenant-a');
  assert.equal(queries.recipients.where.userRoles.some.role.name, 'Tenant Admin');

  assert.deepEqual(result, {
    analyzedBranches: 2,
    anomalies: [{
      branchId: 'branch-a',
      branchName: 'Lalitpur',
      category: 'UTILITIES',
      currentAmountNpr: 18_000,
      baselineAmountNpr: 10_000,
      message: 'UTILITIES expenses are 80% above the recent monthly baseline.',
    }],
    attemptedDeliveries: 3,
    delivered: 1,
    failed: 2,
  });
  assert.equal(deliveries.length, 3, 'one failed recipient must not stop remaining deliveries');
  assert.deepEqual(deliveries[0], {
    userId: 'admin-ok',
    title: 'Branch expense anomaly: Lalitpur',
    body: 'UTILITIES expenses are 80% above the recent monthly baseline. Current: NPR 18000; baseline: NPR 10000.',
  });

  console.log('PASS tenant-scoped branch expense anomaly detection and fail-open notification delivery');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
