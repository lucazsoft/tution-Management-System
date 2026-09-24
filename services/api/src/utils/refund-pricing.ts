export type RefundPolicy = 'PRO_RATA' | 'FIXED_DEDUCTION' | 'NO_REFUND';

export interface ProRataRefundInput {
  policy: RefundPolicy;
  paidAmount: number;
  totalDays: number;
  elapsedDays: number;
  fixedDeduction?: number;
}

export interface ProRataRefundResult {
  refundAmount: number;
  deductionAmount: number;
  refundRatio: number;
}

export interface RefundPolicySnapshotInput {
  policy: RefundPolicy;
  fixedDeduction: number;
  policyVersion: number;
}

export interface RefundPolicySnapshot {
  refundPolicy: RefundPolicy;
  fixedDeduction: number;
  policyVersion: number;
  snapshottedAt: string;
}

export interface ShortTermBillingInput {
  totalFee: number;
  durationDays: number;
}

export interface LongTermBillingInput {
  monthlyFee: number;
  months: number;
  discountPercent?: number;
}

export interface MusicBillingInput {
  amountPerInstallment: number;
  installmentCount: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}

export function calculateProRataRefund(input: ProRataRefundInput): ProRataRefundResult {
  const { policy, paidAmount, totalDays, elapsedDays, fixedDeduction = 0 } = input;
  assertPositiveFinite('paidAmount', paidAmount);
  if (!Number.isFinite(totalDays) || totalDays <= 0) {
    throw new Error('totalDays must be a positive finite number');
  }
  if (!Number.isFinite(elapsedDays)) {
    throw new Error('elapsedDays must be a finite number');
  }

  if (policy === 'NO_REFUND') {
    return { refundAmount: 0, deductionAmount: round2(paidAmount), refundRatio: 0 };
  }

  if (policy === 'FIXED_DEDUCTION') {
    if (!Number.isFinite(fixedDeduction) || fixedDeduction < 0) {
      throw new Error('fixedDeduction must be a non-negative finite number');
    }
    if (fixedDeduction > paidAmount) {
      throw new Error('Deduction cannot exceed paid amount');
    }
    const refundAmount = round2(paidAmount - fixedDeduction);
    const deductionAmount = round2(fixedDeduction);
    return { refundAmount, deductionAmount, refundRatio: round4(refundAmount / paidAmount) };
  }

  if (policy === 'PRO_RATA') {
    const clamped = Math.min(Math.max(elapsedDays, 0), totalDays);
    const remaining = totalDays - clamped;
    const refundAmount = round2((paidAmount * remaining) / totalDays);
    const deductionAmount = round2(paidAmount - refundAmount);
    return { refundAmount, deductionAmount, refundRatio: round4(remaining / totalDays) };
  }

  throw new Error(`Unknown refund policy: ${String(policy)}`);
}

// Snapshot the active tenant refund policy at withdrawal time so later
// policy edits never rewrite history. Pure/deterministic: the caller passes
// the already tenant-scoped active policy (from session/server), plus the
// withdrawal timestamp.
export function snapshotRefundPolicy(
  activePolicy: RefundPolicySnapshotInput,
  snapshottedAt: string | Date,
): RefundPolicySnapshot {
  if (!activePolicy || (activePolicy.policy !== 'PRO_RATA' && activePolicy.policy !== 'FIXED_DEDUCTION' && activePolicy.policy !== 'NO_REFUND')) {
    throw new Error('Unknown refund policy');
  }
  if (!Number.isFinite(activePolicy.fixedDeduction) || activePolicy.fixedDeduction < 0) {
    throw new Error('fixedDeduction must be a non-negative finite number');
  }
  if (!Number.isInteger(activePolicy.policyVersion) || activePolicy.policyVersion < 0) {
    throw new Error('policyVersion must be a non-negative integer');
  }
  const at = snapshottedAt instanceof Date ? snapshottedAt.toISOString() : snapshottedAt;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) {
    throw new Error('snapshottedAt must be a valid ISO timestamp');
  }
  return {
    refundPolicy: activePolicy.policy,
    fixedDeduction: activePolicy.fixedDeduction,
    policyVersion: activePolicy.policyVersion,
    snapshottedAt: at,
  };
}

export function calculateShortTermBilling(input: ShortTermBillingInput): {
  total: number;
  perDay: number;
  mode: 'FIXED_DURATION';
} {
  assertPositiveFinite('totalFee', input.totalFee);
  if (!Number.isFinite(input.durationDays) || input.durationDays <= 0) {
    throw new Error('durationDays must be a positive finite number');
  }
  return { total: round2(input.totalFee), perDay: round2(input.totalFee / input.durationDays), mode: 'FIXED_DURATION' };
}

export function calculateLongTermBilling(input: LongTermBillingInput): {
  total: number;
  perMonth: number;
  mode: 'STANDARD_MONTHLY';
} {
  assertPositiveFinite('monthlyFee', input.monthlyFee);
  if (!Number.isInteger(input.months) || input.months <= 0) {
    throw new Error('months must be a positive integer');
  }
  const discountPercent = input.discountPercent ?? 0;
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new Error('discountPercent must be between 0 and 100');
  }
  const perMonth = round2(input.monthlyFee * (1 - discountPercent / 100));
  return { total: round2(perMonth * input.months), perMonth, mode: 'STANDARD_MONTHLY' };
}

export function calculateMusicBilling(input: MusicBillingInput): {
  total: number;
  schedule: Array<{ installment: number; amount: number }>;
  mode: 'MUSIC_INSTALLMENT';
} {
  assertPositiveFinite('amountPerInstallment', input.amountPerInstallment);
  if (!Number.isInteger(input.installmentCount) || input.installmentCount < 1 || input.installmentCount > 12) {
    throw new Error('installmentCount must be an integer between 1 and 12');
  }
  const amount = round2(input.amountPerInstallment);
  const schedule = Array.from({ length: input.installmentCount }, (_, i) => ({
    installment: i + 1,
    amount,
  }));
  return { total: round2(amount * input.installmentCount), schedule, mode: 'MUSIC_INSTALLMENT' };
}
