/**
 * Automated monthly payroll calculation (P3.2).
 *
 * Deterministic, pure functions: given the same inputs they always produce the
 * same outputs. Tenant scope is never read here — the caller (cron route /
 * service wiring) passes an already tenant-scoped tenantId through.
 *
 * Nepal payroll rules applied (documented FY 2081/82, unmarried individual):
 * - SSF employee share: flat 11% of base salary.
 * - Income tax slabs (annual): first 500k @1%, next 200k @10%, next 300k @20%,
 *   next 1000k @30%, remainder @36%. Monthly gross is annualized, taxed, then
 *   prorated back to the month.
 * - Attendance: absent days = daysInMonth - presentDays - approvedLeaveDays
 *   (clamped at zero); each absent day deducts baseSalary / daysInMonth.
 */

export const NEPAL_SSF_EMPLOYEE_RATE = 0.11;

const APPROVED_LEAVE_STATUSES = new Set(['APPROVED_LEVEL1', 'APPROVED_LEVEL2']);

const ANNUAL_TAX_SLABS: Array<{ upTo: number; rate: number }> = [
  { upTo: 500_000, rate: 0.01 },
  { upTo: 700_000, rate: 0.1 },
  { upTo: 1_000_000, rate: 0.2 },
  { upTo: 2_000_000, rate: 0.3 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.36 },
];

export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('year must be an integer between 2000 and 2100.');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('month must be an integer between 1 and 12.');
  }
  return new Date(year, month, 0).getDate();
}

export function ssfEmployeeShare(baseSalary: number): number {
  if (!Number.isFinite(baseSalary) || baseSalary < 0) {
    throw new Error('base salary must be non-negative.');
  }
  return money(baseSalary * NEPAL_SSF_EMPLOYEE_RATE);
}

export function annualIncomeTax(annualIncome: number): number {
  if (!Number.isFinite(annualIncome) || annualIncome < 0) {
    throw new Error('annual income must be non-negative.');
  }
  let tax = 0;
  let lower = 0;
  for (const slab of ANNUAL_TAX_SLABS) {
    if (annualIncome <= lower) break;
    tax += (Math.min(annualIncome, slab.upTo) - lower) * slab.rate;
    lower = slab.upTo;
  }
  return money(tax);
}

export function monthlyIncomeTax(grossMonthly: number): number {
  if (!Number.isFinite(grossMonthly) || grossMonthly < 0) {
    throw new Error('gross monthly income must be non-negative.');
  }
  if (grossMonthly === 0) return 0;
  return money(annualIncomeTax(money(grossMonthly) * 12) / 12);
}

export interface LeaveReference {
  startDate: Date | string;
  endDate: Date | string;
  status: string;
}

function toUtcDayKey(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Distinct UTC calendar days from geo-attendance timestamps, sorted ascending. */
export function distinctPresentDays(timestamps: Array<Date | string>): string[] {
  const days = new Set<string>();
  for (const timestamp of timestamps) {
    const key = toUtcDayKey(timestamp);
    if (key) days.add(key);
  }
  return [...days].sort();
}

/** Inclusive count of approved-leave days overlapping the payroll month. */
export function countApprovedLeaveDaysInMonth(
  leaves: LeaveReference[] | undefined | null,
  year: number,
  month: number,
): number {
  daysInMonth(year, month); // validates the period
  const monthStart = Date.UTC(year, month - 1, 1);
  const monthEnd = Date.UTC(year, month, 1);
  const days = new Set<string>();
  for (const leave of leaves ?? []) {
    if (!APPROVED_LEAVE_STATUSES.has(leave.status)) continue;
    const start = leave.startDate instanceof Date ? leave.startDate : new Date(leave.startDate);
    const end = leave.endDate instanceof Date ? leave.endDate : new Date(leave.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) continue;
    let cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    while (cursor <= last) {
      if (cursor >= monthStart && cursor < monthEnd) {
        days.add(new Date(cursor).toISOString().slice(0, 10));
      }
      cursor += 86_400_000;
    }
  }
  return days.size;
}

export interface MonthlyPayrollInput {
  baseSalary: number;
  bonuses?: number;
  manualDeductions?: number;
  year: number;
  month: number;
  presentDayCount: number;
  approvedLeaveDays: number;
}

export interface MonthlyPayrollBreakdown {
  daysInMonth: number;
  dailyRate: number;
  presentDays: number;
  approvedLeaveDays: number;
  absentDays: number;
  baseSalary: number;
  bonuses: number;
  grossEarnings: number;
  attendanceDeduction: number;
  manualDeductions: number;
  ssfEmployeeShare: number;
  incomeTax: number;
  totalDeductions: number;
  netPayable: number;
}

function requireNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be non-negative.`);
  return value;
}

export function computeAttendanceDeduction(
  baseSalary: number,
  year: number,
  month: number,
  presentDayCount: number,
  approvedLeaveDays: number,
  manualDeductions = 0,
): number {
  requireNonNegative(baseSalary, 'base salary');
  requireNonNegative(presentDayCount, 'present day count');
  requireNonNegative(approvedLeaveDays, 'approved leave days');
  requireNonNegative(manualDeductions, 'manual deductions');
  const totalDays = daysInMonth(year, month);
  const dailyRate = money(baseSalary / totalDays);
  const present = Math.min(presentDayCount, totalDays);
  const approved = Math.min(approvedLeaveDays, totalDays);
  const absent = Math.max(0, totalDays - present - approved);
  return money(money(absent * dailyRate) + money(manualDeductions));
}

export function calculateMonthlyPayroll(input: MonthlyPayrollInput): MonthlyPayrollBreakdown {
  const baseSalary = requireNonNegative(input.baseSalary, 'base salary');
  const bonuses = money(requireNonNegative(input.bonuses ?? 0, 'bonuses'));
  const manualDeductions = money(requireNonNegative(input.manualDeductions ?? 0, 'manual deductions'));
  const presentDayCount = requireNonNegative(input.presentDayCount, 'present day count');
  const approvedLeaveDays = requireNonNegative(input.approvedLeaveDays, 'approved leave days');
  const totalDays = daysInMonth(input.year, input.month);
  const dailyRate = money(baseSalary / totalDays);
  const presentDays = Math.min(presentDayCount, totalDays);
  const approved = Math.min(approvedLeaveDays, totalDays);
  const absentDays = Math.max(0, totalDays - presentDays - approved);
  const attendanceDeduction = money(absentDays * dailyRate);
  const grossEarnings = money(baseSalary + bonuses);
  const ssf = ssfEmployeeShare(baseSalary);
  const incomeTax = monthlyIncomeTax(grossEarnings);
  const totalDeductions = money(attendanceDeduction + manualDeductions + ssf + incomeTax);
  if (totalDeductions > grossEarnings) {
    throw new Error('Deductions exceed gross earnings; review attendance and manual deductions.');
  }
  return {
    daysInMonth: totalDays,
    dailyRate,
    presentDays,
    approvedLeaveDays: approved,
    absentDays,
    baseSalary: money(baseSalary),
    bonuses,
    grossEarnings,
    attendanceDeduction,
    manualDeductions,
    ssfEmployeeShare: ssf,
    incomeTax,
    totalDeductions,
    netPayable: money(grossEarnings - totalDeductions),
  };
}

export interface AutomationStaffInput {
  staffRecordId: string;
  branchId: string;
  baseSalary: number;
  bonuses?: number;
  manualDeductions?: number;
  presentDayCount: number;
  approvedLeaveDays: number;
  alreadyPaid: boolean;
}

export interface AutomationPersistRow {
  staffRecordId: string;
  branchId: string;
  month: number;
  year: number;
  baseSalary: number;
  bonuses: number;
  attendanceDeduction: number;
  manualDeductions: number;
  ssfEmployeeShare: number;
  incomeTax: number;
  netPayable: number;
  breakdown: MonthlyPayrollBreakdown;
  calculatedBy?: string;
}

export interface AutomationSummary {
  created: number;
  skipped: number;
  rows: AutomationPersistRow[];
}

/**
 * Runs monthly payroll for pre-loaded, tenant-scoped staff rows.
 * Idempotent: rows flagged alreadyPaid are counted as skipped, never persisted.
 */
export async function runMonthlyPayrollAutomation(args: {
  tenantId: string;
  month: number;
  year: number;
  calculatedBy?: string;
  loadStaff: (tenantId: string) => Promise<AutomationStaffInput[]>;
  persist: (rows: AutomationPersistRow[]) => Promise<number>;
}): Promise<AutomationSummary> {
  if (!args.tenantId || typeof args.tenantId !== 'string' || !args.tenantId.trim()) {
    throw new Error('tenantId is required.');
  }
  daysInMonth(args.year, args.month);
  const staff = await args.loadStaff(args.tenantId);
  const rows: AutomationPersistRow[] = [];
  let skipped = 0;
  for (const member of staff) {
    if (member.alreadyPaid) {
      skipped += 1;
      continue;
    }
    const breakdown = calculateMonthlyPayroll({
      baseSalary: member.baseSalary,
      bonuses: member.bonuses ?? 0,
      manualDeductions: member.manualDeductions ?? 0,
      year: args.year,
      month: args.month,
      presentDayCount: member.presentDayCount,
      approvedLeaveDays: member.approvedLeaveDays,
    });
    rows.push({
      staffRecordId: member.staffRecordId,
      branchId: member.branchId,
      month: args.month,
      year: args.year,
      baseSalary: money(member.baseSalary),
      bonuses: money(member.bonuses ?? 0),
      attendanceDeduction: breakdown.attendanceDeduction,
      manualDeductions: money(member.manualDeductions ?? 0),
      ssfEmployeeShare: breakdown.ssfEmployeeShare,
      incomeTax: breakdown.incomeTax,
      netPayable: breakdown.netPayable,
      breakdown,
      calculatedBy: args.calculatedBy,
    });
  }
  const created = rows.length ? await args.persist(rows) : 0;
  return { created, skipped, rows };
}
