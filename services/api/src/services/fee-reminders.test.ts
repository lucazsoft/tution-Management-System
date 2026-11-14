import assert from 'node:assert/strict';
import { feeReminderMessage, sendFeeReminders } from './fee-reminders';
import { formatRupees } from './guardian-sms';

const NOW = new Date('2026-11-15T06:00:00Z');

function guardian(id: string, phone: string | null, status = 'ACTIVE') {
  return { parent: { user: { id, phone, status } } };
}

function invoice(input: {
  studentId: string;
  name: string;
  amount: number;
  due: string;
  status?: string;
  branch?: string;
  blocked?: boolean;
  parents?: ReturnType<typeof guardian>[];
}) {
  return {
    status: input.status ?? 'UNPAID',
    dueDate: new Date(input.due),
    netPayable: input.amount,
    studentId: input.studentId,
    branch: { name: input.branch ?? 'Damak' },
    student: {
      user: { firstName: input.name, lastName: 'Thapa' },
      enrollments: input.blocked ? [{ id: 'enr-1' }] : [],
      studentParents: input.parents ?? [],
    },
  };
}

async function main() {
  assert.equal(formatRupees(125000), '1,25,000');
  assert.equal(formatRupees(4499.6), '4,500');

  assert.equal(
    feeReminderMessage({ studentName: 'Sushanta Thapa', amount: 4500, branchName: 'Damak', blocked: true }),
    'Dear Parent, NPR 4,500 in fees for Sushanta Thapa is overdue and class access is blocked until it is paid. Please pay at Damak or with the payment QR in the TMS app.',
  );
  assert.ok(!feeReminderMessage({ studentName: 'A', amount: 1, branchName: 'B', blocked: false }).includes('blocked'));

  const rows = [
    // Two overdue invoices for one student → one SMS with the total.
    invoice({ studentId: 's1', name: 'Sushanta', amount: 3000, due: '2026-10-01', blocked: true, parents: [guardian('mum', '9800000001'), guardian('dad', '9800000001')] }),
    invoice({ studentId: 's1', name: 'Sushanta', amount: 1500, due: '2026-11-01', status: 'OVERDUE', parents: [guardian('mum', '9800000001'), guardian('dad', '9800000001')] }),
    // Parent without a usable number.
    invoice({ studentId: 's2', name: 'Rupak', amount: 2000, due: '2026-10-15', parents: [guardian('p2', '01-4412345')] }),
    // No guardian linked.
    invoice({ studentId: 's3', name: 'Samyuak', amount: 1130, due: '2026-10-28' }),
    // Inactive guardian only → counts as no guardian.
    invoice({ studentId: 's4', name: 'Aarav', amount: 900, due: '2026-10-28', parents: [guardian('p4', '9800000004', 'INACTIVE')] }),
  ];
  let where: any;
  const db: any = { invoice: { findMany: async (args: any) => { where = args.where; return rows; } } };
  const texts: Array<{ to: string; message: string }> = [];
  const sender = { sendSms: async (to: string, message: string) => { texts.push({ to, message }); return { success: true }; } };

  const result = await sendFeeReminders(db, sender, 'tenant-a', NOW);

  assert.equal(where.tenantId, 'tenant-a', 'scoped to the tenant');
  assert.deepEqual(where.status, { in: ['UNPAID', 'OVERDUE'] });
  assert.equal(texts.length, 1, 'shared parent number texted once');
  assert.equal(texts[0].to, '9800000001');
  assert.match(texts[0].message, /NPR 4,500 in fees for Sushanta Thapa is overdue and class access is blocked/);
  assert.ok(texts.every((text) => !text.to.includes('X')), 'never the old placeholder');
  assert.deepEqual(result, { students: 4, sent: 1, failed: 0, withoutPhone: 1, withoutGuardian: 2 });

  // Nothing overdue → nothing sent.
  texts.length = 0;
  const none = await sendFeeReminders({ invoice: { findMany: async () => [] } } as any, sender, 'tenant-a', NOW);
  assert.deepEqual(none, { students: 0, sent: 0, failed: 0, withoutPhone: 0, withoutGuardian: 0 });
  assert.equal(texts.length, 0);

  console.log('fee reminder tests passed');
}

main().catch((error) => { console.error(error); process.exit(1); });
