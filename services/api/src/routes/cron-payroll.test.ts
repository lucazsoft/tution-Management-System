import assert from 'node:assert/strict';
import { handlePayrollCron } from './cron-payroll';

async function main() {
  // Non-admin callers are rejected before any payroll work runs.
  let automationCalls = 0;
  const forbidden = await handlePayrollCron({
    tenantId: 'tenant-1',
    isTenantAdmin: false,
    month: 9,
    year: 2026,
    runAutomation: async () => {
      automationCalls += 1;
      return { created: 0, skipped: 0, rows: [] };
    },
  });
  assert.equal(forbidden.status, 403);
  assert.equal(automationCalls, 0);

  // Invalid periods are rejected with 400.
  const badPeriod = await handlePayrollCron({
    tenantId: 'tenant-1',
    isTenantAdmin: true,
    month: 13,
    year: 2026,
    runAutomation: async () => ({ created: 0, skipped: 0, rows: [] }),
  });
  assert.equal(badPeriod.status, 400);

  // Tenant scope comes from the session caller, never the request body.
  const seen: string[] = [];
  const ok = await handlePayrollCron({
    tenantId: 'tenant-9',
    isTenantAdmin: true,
    month: 9,
    year: 2026,
    runAutomation: async (args: { tenantId: string; month: number; year: number }) => {
      seen.push(args.tenantId);
      assert.equal(args.month, 9);
      assert.equal(args.year, 2026);
      return { created: 2, skipped: 1, rows: [] };
    },
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(seen, ['tenant-9']);
  assert.equal((ok.body as { created: number }).created, 2);
  assert.equal((ok.body as { skipped: number }).skipped, 1);

  console.log('cron payroll handler tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
