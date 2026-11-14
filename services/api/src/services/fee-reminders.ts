import type { PrismaClient } from '@prisma/client';
import { isInvoiceOverdue } from '../utils/billing-rules';
import { activeGuardians, formatRupees, GUARDIAN_LINKS_INCLUDE, smsGuardians, type SmsSender } from './guardian-sms';

/**
 * Overdue-fee reminder SMS: one message per student with overdue invoices,
 * sent to that student's own active guardians with the real amount owed.
 */

export interface FeeReminderResult {
  /** Students with at least one overdue invoice. */
  students: number;
  sent: number;
  failed: number;
  /** Guardians with no usable mobile number on file. */
  withoutPhone: number;
  /** Students with no active guardian linked at all. */
  withoutGuardian: number;
}

export function feeReminderMessage(input: {
  studentName: string;
  amount: number;
  branchName: string;
  blocked: boolean;
}): string {
  const access = input.blocked ? ' and class access is blocked until it is paid' : '';
  return `Dear Parent, NPR ${formatRupees(input.amount)} in fees for ${input.studentName} is overdue${access}. `
    + `Please pay at ${input.branchName} or with the payment QR in the TMS app.`;
}

type ReminderDb = Pick<PrismaClient, 'invoice'>;

export async function sendFeeReminders(
  db: ReminderDb,
  sender: SmsSender,
  tenantId: string,
  now = new Date(),
): Promise<FeeReminderResult> {
  const invoices = await db.invoice.findMany({
    where: { tenantId, status: { in: ['UNPAID', 'OVERDUE'] }, dueDate: { lt: now } },
    select: {
      status: true,
      dueDate: true,
      netPayable: true,
      studentId: true,
      branch: { select: { name: true } },
      student: {
        select: {
          user: { select: { firstName: true, lastName: true } },
          enrollments: { where: { status: 'BLOCKED' }, select: { id: true } },
          ...GUARDIAN_LINKS_INCLUDE,
        },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  const byStudent = new Map<string, { amount: number; invoice: (typeof invoices)[number] }>();
  for (const invoice of invoices) {
    if (!isInvoiceOverdue(invoice.status, invoice.dueDate, now)) continue;
    const entry = byStudent.get(invoice.studentId) ?? { amount: 0, invoice };
    entry.amount += Number(invoice.netPayable);
    byStudent.set(invoice.studentId, entry);
  }

  const result: FeeReminderResult = { students: byStudent.size, sent: 0, failed: 0, withoutPhone: 0, withoutGuardian: 0 };
  for (const { amount, invoice } of byStudent.values()) {
    if (amount <= 0) continue;
    const guardians = activeGuardians(invoice.student.studentParents);
    if (!guardians.length) {
      result.withoutGuardian += 1;
      continue;
    }
    const delivery = await smsGuardians(sender, guardians, feeReminderMessage({
      studentName: `${invoice.student.user.firstName} ${invoice.student.user.lastName}`.trim(),
      amount,
      branchName: invoice.branch.name,
      blocked: invoice.student.enrollments.length > 0,
    }));
    result.sent += delivery.sent;
    result.failed += delivery.failed;
    result.withoutPhone += delivery.withoutPhone;
  }
  return result;
}
