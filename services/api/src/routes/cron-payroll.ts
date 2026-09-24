/**
 * Payroll cron handler (P3.2).
 *
 * Thin, tenant-safe boundary: tenantId always comes from the verified session
 * (req.tenantId), never from the request body. The month/year are validated
 * here; the math lives in payroll-automation and is injected via runAutomation
 * so this handler stays unit-testable without a database.
 */

export interface PayrollCronResult {
  created: number;
  skipped: number;
  rows: unknown[];
}

export async function handlePayrollCron(args: {
  tenantId: string | undefined | null;
  isTenantAdmin: boolean;
  month: unknown;
  year: unknown;
  runAutomation: (params: { tenantId: string; month: number; year: number }) => Promise<PayrollCronResult>;
}): Promise<{ status: number; body: unknown }> {
  if (!args.isTenantAdmin) {
    return { status: 403, body: { error: 'Only the Tenant Admin may run payroll automation.' } };
  }
  const month = Number(args.month);
  const year = Number(args.year);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { status: 400, body: { error: 'month must be an integer between 1 and 12.' } };
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { status: 400, body: { error: 'year must be an integer between 2000 and 2100.' } };
  }
  if (!args.tenantId) {
    return { status: 400, body: { error: 'Tenant scope is missing from the session.' } };
  }
  const result = await args.runAutomation({ tenantId: args.tenantId, month, year });
  return {
    status: 200,
    body: {
      message: `Monthly payroll automation for ${year}-${String(month).padStart(2, '0')} completed.`,
      created: result.created,
      skipped: result.skipped,
      rows: result.rows,
    },
  };
}
