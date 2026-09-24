import PDFDocument from 'pdfkit';
import type { MonthlyPayrollBreakdown } from './payroll-automation';

export interface PayslipSnapshot {
  payslipNumber: string;
  staffName: string;
  designation?: string;
  branchName?: string;
  institutionName?: string;
  month: number;
  year: number;
  breakdown: MonthlyPayrollBreakdown;
  calculatedAt?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function periodLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1] ?? 'Month'} ${year}`;
}

function amount(value: number): string {
  return `Rs. ${value.toFixed(2)}`;
}

/** Itemized payslip PDF with Nepal tax/SSF breakdown. Resolves with the PDF bytes. */
export function renderPayslipPdf(snapshot: PayslipSnapshot): Promise<Buffer> {
  if (!snapshot.payslipNumber || !snapshot.payslipNumber.trim()) {
    return Promise.reject(new Error('payslipNumber is required.'));
  }
  if (!snapshot.staffName || !snapshot.staffName.trim()) {
    return Promise.reject(new Error('staffName is required.'));
  }
  const breakdown = snapshot.breakdown;
  const period = periodLabel(snapshot.month, snapshot.year);
  const institution = snapshot.institutionName?.trim() || 'Institution';
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const document = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: `Payslip ${snapshot.payslipNumber} - ${period}`,
        Author: institution,
        Subject: snapshot.staffName,
        Keywords: `payslip, SSF, Income Tax, ${snapshot.payslipNumber}, ${breakdown.netPayable.toFixed(2)}`,
      },
    });
    document.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    document.fillColor('#0F2A44').font('Helvetica-Bold').fontSize(18).text(institution, { align: 'center' });
    document.fillColor('#526174').font('Helvetica').fontSize(10)
      .text(snapshot.branchName?.trim() ? snapshot.branchName.trim() : 'All Branches', { align: 'center' });
    document.moveDown(0.5);
    document.fillColor('#0F2A44').font('Helvetica-Bold').fontSize(14)
      .text(`Payslip ${snapshot.payslipNumber}`, { align: 'center' });
    document.fillColor('#33475B').font('Helvetica').fontSize(10).text(`Pay period: ${period}`, { align: 'center' });
    document.moveDown();

    const meta: Array<[string, string]> = [
      ['Staff', snapshot.staffName],
      ['Designation', snapshot.designation?.trim() || '—'],
      ['Present days', `${breakdown.presentDays} of ${breakdown.daysInMonth}`],
      ['Approved leave', `${breakdown.approvedLeaveDays} day(s)`],
      ['Absent days', `${breakdown.absentDays} day(s)`],
    ];
    if (snapshot.calculatedAt) meta.push(['Calculated', snapshot.calculatedAt]);
    for (const [label, value] of meta) {
      document.fillColor('#33475B').font('Helvetica').fontSize(10).text(`${label}: `, { continued: true });
      document.font('Helvetica-Bold').text(value);
    }
    document.moveDown();

    const line = (label: string, value: number, bold = false) => {
      document.fillColor('#1B1F3B').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10)
        .text(label, { continued: true });
      document.text(amount(value), { align: 'right' });
    };

    document.fillColor('#0F2A44').font('Helvetica-Bold').fontSize(12).text('Earnings');
    line('Base salary', breakdown.baseSalary);
    line('Bonuses', breakdown.bonuses);
    line('Gross earnings', breakdown.grossEarnings, true);
    document.moveDown(0.5);

    document.fillColor('#0F2A44').font('Helvetica-Bold').fontSize(12).text('Deductions');
    line(`Attendance deduction (${breakdown.absentDays} day(s) @ ${amount(breakdown.dailyRate)}/day)`, breakdown.attendanceDeduction);
    line('Manual deductions', breakdown.manualDeductions);
    line('SSF employee share (11% of base)', breakdown.ssfEmployeeShare);
    line('Income Tax (Nepal FY 2081/82 slabs)', breakdown.incomeTax);
    line('Total deductions', breakdown.totalDeductions, true);
    document.moveDown(0.5);

    document.fillColor('#0F2A44').font('Helvetica-Bold').fontSize(13)
      .text(`Net payable: ${amount(breakdown.netPayable)}`, { align: 'right' });
    document.moveDown();
    document.fillColor('#718096').font('Helvetica').fontSize(8)
      .text('SSF: Social Security Fund employee contribution. Income Tax computed on annualized gross earnings per Nepal individual slabs, prorated monthly. Attendance deducted from geo-attendance after approved leaves.', { align: 'justify' });
    document.end();
  });
}
