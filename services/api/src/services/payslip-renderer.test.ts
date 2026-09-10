import assert from 'node:assert/strict';
import { calculateMonthlyPayroll } from './payroll-automation';
import { renderPayslipPdf } from './payslip-renderer';

async function main() {
  const breakdown = calculateMonthlyPayroll({
    baseSalary: 60_000,
    bonuses: 5_000,
    manualDeductions: 0,
    year: 2026,
    month: 9,
    presentDayCount: 26,
    approvedLeaveDays: 2,
  });

  const pdf = await renderPayslipPdf({
    payslipNumber: 'PS-202609-ABCDE',
    staffName: 'Test Teacher',
    designation: 'Teacher',
    branchName: 'Kathmandu Branch',
    institutionName: 'Test Institution',
    month: 9,
    year: 2026,
    breakdown,
  });

  assert.ok(Buffer.isBuffer(pdf), 'payslip renders to a Buffer');
  assert.equal(pdf.subarray(0, 4).toString('latin1'), '%PDF');
  assert.ok(pdf.length > 1_000, `payslip PDF should be itemized, got ${pdf.length} bytes`);
  const raw = pdf.toString('latin1');
  assert.ok(raw.includes('PS-202609-ABCDE'), 'payslip number embedded in PDF metadata');
  assert.ok(raw.includes('SSF'), 'SSF breakdown line present');
  assert.ok(raw.includes('Income Tax'), 'income tax breakdown line present');
  assert.ok(raw.includes('50983.33'), 'net payable present in payslip');

  await assert.rejects(
    () => renderPayslipPdf({
      payslipNumber: '',
      staffName: 'Test Teacher',
      month: 9,
      year: 2026,
      breakdown,
    }),
    /payslipNumber is required/,
  );

  console.log('payslip renderer tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
