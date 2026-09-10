import assert from 'node:assert/strict';
import {
  NEPAL_SSF_EMPLOYEE_RATE,
  calculateMonthlyPayroll,
  computeAttendanceDeduction,
  countApprovedLeaveDaysInMonth,
  daysInMonth,
  distinctPresentDays,
  monthlyIncomeTax,
  runMonthlyPayrollAutomation,
  ssfEmployeeShare,
} from './payroll-automation';

// --- Calendar helpers (deterministic) ---
assert.equal(daysInMonth(2026, 2), 28);
assert.equal(daysInMonth(2024, 2), 29);
assert.equal(daysInMonth(2026, 9), 30);
assert.throws(() => daysInMonth(2026, 13), /month must be an integer between 1 and 12/);
assert.throws(() => daysInMonth(2026, 0), /month must be an integer between 1 and 12/);

// --- Nepal SSF: employee share is a flat 11% of base salary ---
assert.equal(NEPAL_SSF_EMPLOYEE_RATE, 0.11);
assert.equal(ssfEmployeeShare(50_000), 5_500);
assert.equal(ssfEmployeeShare(32_000), 3_520);
assert.equal(ssfEmployeeShare(33_333), 3_666.63);
assert.throws(() => ssfEmployeeShare(-100), /base salary must be non-negative/);

// --- Nepal individual income tax (FY 2081/82 unmarried slabs), annualized then monthly ---
// Annual slabs: first 500k @1%, next 200k @10%, next 300k @20%, next 1000k @30%, rest @36%.
assert.equal(monthlyIncomeTax(0), 0);
assert.equal(monthlyIncomeTax(40_000), 400); // 480k annual * 1% / 12
assert.equal(monthlyIncomeTax(50_000), 1_250); // (5000 + 10000) / 12
assert.equal(monthlyIncomeTax(100_000), 12_083.33); // (5000 + 20000 + 60000 + 60000) / 12
assert.throws(() => monthlyIncomeTax(-1), /gross monthly income must be non-negative/);

// --- Approved leave overlap with the payroll month (inclusive day count) ---
const leaves = [
  { startDate: '2026-09-29T00:00:00Z', endDate: '2026-10-02T00:00:00Z', status: 'APPROVED_LEVEL2' },
  { startDate: '2026-09-15T00:00:00Z', endDate: '2026-09-15T00:00:00Z', status: 'APPROVED_LEVEL1' },
  { startDate: '2026-09-10T00:00:00Z', endDate: '2026-09-12T00:00:00Z', status: 'PENDING' },
  { startDate: '2026-09-05T00:00:00Z', endDate: '2026-09-06T00:00:00Z', status: 'REJECTED' },
];
assert.equal(countApprovedLeaveDaysInMonth(leaves, 2026, 9), 3); // Sep 29, 30 + Sep 15
assert.equal(countApprovedLeaveDaysInMonth(leaves, 2026, 10), 2); // Oct 1, 2
assert.equal(countApprovedLeaveDaysInMonth([], 2026, 9), 0);

// --- Geo-attendance: distinct UTC calendar days deduped and sorted ---
assert.deepEqual(
  distinctPresentDays(['2026-09-02T09:00:00Z', '2026-09-01T09:00:00Z', '2026-09-01T18:00:00Z']),
  ['2026-09-01', '2026-09-02'],
);
assert.deepEqual(distinctPresentDays([]), []);

// --- Attendance deduction: absent days * daily rate + manual deductions ---
// September 2026 has 30 days; base 30,000 -> daily rate 1,000.
assert.equal(computeAttendanceDeduction(30_000, 2026, 9, 25, 3, 500), 2_500); // 2 absent * 1000 + 500
assert.equal(computeAttendanceDeduction(30_000, 2026, 9, 27, 3, 0), 0); // full month covered
assert.equal(computeAttendanceDeduction(30_000, 2026, 9, 30, 5, 0), 0); // over-cover clamps to zero

// --- Full deterministic monthly calculation ---
// Base 60,000 + 5,000 bonus, Sep 2026 (30d): present 26 + 2 approved leave -> 2 absent * 2000 = 4000.
// Gross 65,000; SSF 6,600; tax (780k annual -> 41000 / 12) = 3,416.67; total 14,016.67; net 50,983.33.
const breakdown = calculateMonthlyPayroll({
  baseSalary: 60_000,
  bonuses: 5_000,
  manualDeductions: 0,
  year: 2026,
  month: 9,
  presentDayCount: 26,
  approvedLeaveDays: 2,
});
assert.equal(breakdown.daysInMonth, 30);
assert.equal(breakdown.dailyRate, 2_000);
assert.equal(breakdown.absentDays, 2);
assert.equal(breakdown.grossEarnings, 65_000);
assert.equal(breakdown.attendanceDeduction, 4_000);
assert.equal(breakdown.ssfEmployeeShare, 6_600);
assert.equal(breakdown.incomeTax, 3_416.67);
assert.equal(breakdown.totalDeductions, 14_016.67);
assert.equal(breakdown.netPayable, 50_983.33);

assert.throws(
  () => calculateMonthlyPayroll({ baseSalary: 1_000, year: 2026, month: 9, presentDayCount: 0, approvedLeaveDays: 0 }),
  /Deductions exceed gross earnings/,
);

// --- Automation runner: tenant-scoped, idempotent, deterministic ---
async function main() {
  const seen: string[] = [];
  const persisted: Array<{ staffRecordId: string; netPayable: number }> = [];
  const summary = await runMonthlyPayrollAutomation({
    tenantId: 'tenant-1',
    month: 9,
    year: 2026,
    calculatedBy: 'admin-1',
    loadStaff: async (tenantId: string) => {
      seen.push(tenantId);
      return [
        {
          staffRecordId: 'staff-a', branchId: 'branch-1', baseSalary: 60_000, bonuses: 5_000,
          manualDeductions: 0, presentDayCount: 26, approvedLeaveDays: 2, alreadyPaid: false,
        },
        {
          staffRecordId: 'staff-b', branchId: 'branch-1', baseSalary: 30_000, bonuses: 0,
          manualDeductions: 0, presentDayCount: 30, approvedLeaveDays: 0, alreadyPaid: true,
        },
      ];
    },
    persist: async (rows: Array<{ staffRecordId: string; netPayable: number }>) => {
      persisted.push(...rows.map((row) => ({ staffRecordId: row.staffRecordId, netPayable: row.netPayable })));
      return rows.length;
    },
  });
  assert.deepEqual(seen, ['tenant-1']); // tenant scope flows from the caller only
  assert.equal(summary.created, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0].staffRecordId, 'staff-a');
  assert.equal(summary.rows[0].netPayable, 50_983.33);
  assert.equal(summary.rows[0].calculatedBy, 'admin-1');
  assert.deepEqual(persisted, [{ staffRecordId: 'staff-a', netPayable: 50_983.33 }]);

  await assert.rejects(
    () => runMonthlyPayrollAutomation({ tenantId: '', month: 9, year: 2026, loadStaff: async () => [], persist: async () => 0 }),
    /tenantId is required/,
  );
  await assert.rejects(
    () => runMonthlyPayrollAutomation({ tenantId: 't', month: 13, year: 2026, loadStaff: async () => [], persist: async () => 0 }),
    /month must be an integer between 1 and 12/,
  );

  console.log('payroll automation tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
