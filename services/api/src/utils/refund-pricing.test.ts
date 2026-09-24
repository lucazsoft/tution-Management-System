import assert from 'node:assert/strict';
import {
  calculateLongTermBilling,
  calculateMusicBilling,
  calculateProRataRefund,
  calculateShortTermBilling,
  snapshotRefundPolicy,
} from './refund-pricing';

// P3.3.1 — pro-rata refund calculator (Day 10 of 30-day course => 66.67% refund)
const day10 = calculateProRataRefund({ policy: 'PRO_RATA', paidAmount: 3000, totalDays: 30, elapsedDays: 10 });
assert.equal(day10.refundAmount, 2000, 'Day 10 of 30-day course refunds 20/30 of paid amount');
assert.equal(day10.deductionAmount, 1000);
assert.equal(day10.refundRatio, 0.6667);

assert.deepEqual(
  calculateProRataRefund({ policy: 'PRO_RATA', paidAmount: 3000, totalDays: 30, elapsedDays: 0 }),
  { refundAmount: 3000, deductionAmount: 0, refundRatio: 1 },
  'withdrawal before start refunds in full',
);
assert.deepEqual(
  calculateProRataRefund({ policy: 'PRO_RATA', paidAmount: 3000, totalDays: 30, elapsedDays: 30 }),
  { refundAmount: 0, deductionAmount: 3000, refundRatio: 0 },
  'withdrawal at end refunds nothing',
);
assert.equal(
  calculateProRataRefund({ policy: 'PRO_RATA', paidAmount: 3000, totalDays: 30, elapsedDays: 45 }).refundAmount,
  0,
  'elapsed days clamp to course length',
);
assert.equal(
  calculateProRataRefund({ policy: 'PRO_RATA', paidAmount: 1000, totalDays: 3, elapsedDays: 1 }).refundAmount,
  666.67,
  'refunds round half-up to 2dp',
);

// Policy variants
assert.deepEqual(
  calculateProRataRefund({ policy: 'FIXED_DEDUCTION', paidAmount: 5000, totalDays: 30, elapsedDays: 10, fixedDeduction: 500 }),
  { refundAmount: 4500, deductionAmount: 500, refundRatio: 0.9 },
);
assert.deepEqual(
  calculateProRataRefund({ policy: 'NO_REFUND', paidAmount: 5000, totalDays: 30, elapsedDays: 2 }),
  { refundAmount: 0, deductionAmount: 5000, refundRatio: 0 },
);
assert.throws(
  () => calculateProRataRefund({ policy: 'FIXED_DEDUCTION', paidAmount: 5000, totalDays: 30, elapsedDays: 1, fixedDeduction: 6000 }),
  /Deduction cannot exceed paid amount/,
);
assert.throws(() => calculateProRataRefund({ policy: 'PRO_RATA', paidAmount: -5, totalDays: 30, elapsedDays: 1 }), /paidAmount/);
assert.throws(() => calculateProRataRefund({ policy: 'PRO_RATA', paidAmount: 100, totalDays: 0, elapsedDays: 1 }), /totalDays/);

// Policy snapshot is deterministic for a given timestamp
assert.deepEqual(
  snapshotRefundPolicy({ policy: 'PRO_RATA', fixedDeduction: 0, policyVersion: 4 }, '2026-09-10T00:00:00.000Z'),
  { refundPolicy: 'PRO_RATA', fixedDeduction: 0, policyVersion: 4, snapshottedAt: '2026-09-10T00:00:00.000Z' },
);

// P3.3.2 — course billing engines (deterministic, no I/O)
const shortTerm = calculateShortTermBilling({ totalFee: 9000, durationDays: 90 });
assert.equal(shortTerm.total, 9000);
assert.equal(shortTerm.perDay, 100);
assert.equal(shortTerm.mode, 'FIXED_DURATION');

const longTerm = calculateLongTermBilling({ monthlyFee: 2500, months: 12, discountPercent: 10 });
assert.equal(longTerm.total, 27000, '12 x 2500 with 10% discount');
assert.equal(longTerm.perMonth, 2250);
assert.equal(longTerm.mode, 'STANDARD_MONTHLY');

const music = calculateMusicBilling({ amountPerInstallment: 2500, installmentCount: 3 });
assert.equal(music.total, 7500);
assert.equal(music.schedule.length, 3);
assert.deepEqual(music.schedule.map((s: { amount: number }) => s.amount), [2500, 2500, 2500]);
assert.throws(() => calculateShortTermBilling({ totalFee: 0, durationDays: 90 }), /totalFee/);
assert.throws(() => calculateLongTermBilling({ monthlyFee: 2500, months: 0 }), /months/);
assert.throws(() => calculateMusicBilling({ amountPerInstallment: 2500, installmentCount: 13 }), /installmentCount/);

console.log('refund pricing tests passed');
