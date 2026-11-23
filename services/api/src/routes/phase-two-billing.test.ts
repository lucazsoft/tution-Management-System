import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import prisma from '../utils/db';
import { markOverdueInvoices, reconcileBranchBillingAccess } from '../services/billing-access';
import { nepalCalendarDate } from '../services/timetable-service';

const now = new Date('2026-09-07T12:00:00Z');
let invoices: any[] = [];
let enrollments: any[] = [];
let failEnrollmentWrite = false;
let admissionStatus = 'ACTIVE';
let deliveries = 0;
let deliverySucceeds = false;
let transitions = 0;
let pendingSession: any = null;
let stamps = 0;
const db = prisma as any;

function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
    if (key === 'OR') return value.some((part: any) => matches(row, part));
    if (key === 'AND') return value.every((part: any) => matches(row, part));
    const actual = row?.[key];
    if (value && typeof value === 'object') {
      if ('some' in value) return actual?.some((item: any) => matches(item, value.some));
      if ('none' in value) return !actual?.some((item: any) => matches(item, value.none));
      if ('in' in value) return value.in.includes(actual);
      if ('lt' in value) return actual != null && actual < value.lt;
      if ('lte' in value) return actual != null && actual <= value.lte;
      if ('gt' in value) return actual != null && actual > value.gt;
      return matches(actual, value);
    }
    return actual === value;
  });
}
const invoice = (id: string, branchId: string, dueDate: Date, status = 'UNPAID', tenantId = 'tenant-a') => ({
  id, studentId: 'student', branchId, tenantId, dueDate, status, netPayable: 100, invoiceType: 'TUITION', transactionId: null,
});
const enrollment = (id: string, branchId: string, status = 'ACTIVE', tenantId = 'tenant-a') => ({
  id, studentId: 'student', status, validFrom: null, validUntil: null,
  class: { branchId, course: { tenantId } },
});
db.invoice.updateMany = async ({ where, data }: any) => {
  const selected = invoices.filter(row => matches(row, where));
  selected.forEach(row => Object.assign(row, data));
  transitions += selected.length;
  return { count: selected.length };
};
db.invoice.findMany = async ({ where }: any) => invoices.filter(row => matches(row, where));
db.invoice.findFirst = async ({ where }: any) => invoices.find(row => matches(row, where)) ?? null;
db.invoice.findUnique = async ({ where }: any) => invoices.find(row => matches(row, where)) ?? null;
db.enrollment.updateMany = async ({ where, data }: any) => {
  if (failEnrollmentWrite) throw new Error('Injected enrollment failure');
  const selected = enrollments.filter(row => matches({ ...row, student: {
    admissionStatus, user: { tenantId: row.class.course.tenantId, status: 'ACTIVE' }, invoices,
  } }, where));
  selected.forEach(row => Object.assign(row, data));
  return { count: selected.length };
};
db.$transaction = async (run: any) => {
  const previousInvoices = structuredClone(invoices);
  const previousEnrollments = structuredClone(enrollments);
  try { return await run(db); }
  catch (error) { invoices = previousInvoices; enrollments = previousEnrollments; throw error; }
};
db.student.findFirst = async ({ where }: any) => {
  assert.equal(where.user.tenantId, 'tenant-a');
  return { admissionStatus };
};
db.student.updateMany = async ({ where, data }: any) => {
  if (!matches({ id: 'student', admissionStatus }, where)) return { count: 0 };
  admissionStatus = data.admissionStatus;
  return { count: 1 };
};
db.teacherSession.findFirst = async ({ where }: any) => pendingSession && matches(pendingSession, where) ? pendingSession : null;
db.branch.findFirst = async () => ({ latitude: 0, longitude: 0, radiusMeters: 100 });
// This fake counts stamps rather than storing them, so there is never a prior
// stamp to read back. Returning null keeps the IN sequence guard satisfied and
// leaves this suite testing what it is about: the daily-update gate. Sequencing
// itself is covered in routes/attendance.test.ts.
db.teacherAttendance.findFirst = async () => null;
db.teacherAttendance.create = async () => { stamps++; return { id: 'stamp' }; };
const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  auth: { api: { getSession: async () => ({ user: { id: 'teacher', tenantId: 'tenant-a', roles: [
    { roleName: 'Tenant Admin', branchId: null, permissions: [] },
  ] } }) } },
} } as NodeModule;
const admissionPath = require.resolve('../utils/admission-logins');
require.cache[admissionPath] = { id: admissionPath, filename: admissionPath, loaded: true, exports: {
  activateAdmissionAndSendLogins: async (tenantId: string, studentId: string) => {
    assert.equal(tenantId, 'tenant-a'); assert.equal(studentId, 'student');
    deliveries++;
    if (deliverySucceeds) admissionStatus = 'ACTIVE';
    return { delivered: deliverySucceeds };
  },
} } as NodeModule;
const attendance = require('./attendance').default;
const finances = require('./finances').default;
const cron = require('./cron').default;
process.env.NEPALPAY_WEBHOOK_SECRET = 'phase-two-test-secret';

async function invoke(router: any, path: string, body: any, signed = true) {
  const route = router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods.post).route;
  const signature = crypto.createHmac('sha256', process.env.NEPALPAY_WEBHOOK_SECRET!).update(JSON.stringify(body)).digest('hex');
  const req: any = { body, headers: {}, params: {}, query: {}, header: () => signed ? signature : 'invalid' };
  let status = 200; let payload: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { payload = value; return this; } };
  for (const layer of route.stack) {
    let next = false;
    await layer.handle(req, res, () => { next = true; });
    if (!next) break;
  }
  return { status, payload };
}

async function main() {
  invoices = [invoice('past', 'a', new Date(now.getTime() - 1)), invoice('future', 'b', new Date(now.getTime() + 1)),
    invoice('boundary', 'b', now), invoice('foreign', 'a', new Date(0), 'UNPAID', 'tenant-b')];
  enrollments = [enrollment('a', 'a'), enrollment('b', 'b'), enrollment('ended', 'a', 'COMPLETED'), enrollment('foreign', 'a', 'ACTIVE', 'tenant-b')];
  await db.$transaction((tx: any) => markOverdueInvoices(tx, 'tenant-a', now));
  assert.deepEqual(invoices.map(row => row.status), ['OVERDUE', 'UNPAID', 'UNPAID', 'UNPAID']);
  assert.deepEqual(enrollments.map(row => row.status), ['BLOCKED', 'ACTIVE', 'COMPLETED', 'ACTIVE']);

  invoices = [invoice('rollback', 'a', new Date(0))];
  enrollments = [enrollment('a', 'a')];
  failEnrollmentWrite = true;
  assert.equal((await invoke(cron, '/trigger', { taskName: 'monthly-due-verification' })).status, 500);
  assert.equal(invoices[0].status, 'UNPAID');
  failEnrollmentWrite = false;

  invoices = [invoice('debt', 'a', new Date(0))];
  enrollments = [enrollment('a', 'a', 'BLOCKED'), enrollment('b', 'b', 'BLOCKED'), enrollment('expired', 'a', 'BLOCKED')];
  enrollments[2].validUntil = new Date(0);
  await reconcileBranchBillingAccess(db, 'tenant-a', 'student', 'a', now);
  assert.equal(enrollments[0].status, 'BLOCKED', 'past-due UNPAID debt blocks before cron');
  invoices[0].status = 'PAID';
  admissionStatus = 'READY_FOR_LOGIN';
  await reconcileBranchBillingAccess(db, 'tenant-a', 'student', 'a', now);
  assert.equal(enrollments[0].status, 'BLOCKED', 'payment must not bypass admission activation');
  admissionStatus = 'ACTIVE';
  await reconcileBranchBillingAccess(db, 'tenant-a', 'student', 'a', now);
  assert.deepEqual(enrollments.map(row => row.status), ['ACTIVE', 'BLOCKED', 'BLOCKED']);
  console.log('PASS overdue dates, issuing-branch scope, lifecycle guards, and transaction rollback simulation');

  const today = nepalCalendarDate();
  const geo = { branchId: 'a', latitude: 0, longitude: 0, gpsAccuracy: 1 };
  pendingSession = { id: 'today', teacherId: 'teacher', date: today, dailyUpdateSubmitted: false, class: { course: { tenantId: 'tenant-a' } } };
  assert.equal((await invoke(attendance, '/in', geo)).status, 200);
  pendingSession.date = new Date(today.getTime() - 86400000);
  assert.equal((await invoke(attendance, '/in', geo)).status, 403);
  pendingSession.dailyUpdateSubmitted = true;
  assert.equal((await invoke(attendance, '/in', geo)).status, 200);
  assert.equal(stamps, 2);
  assert.equal(nepalCalendarDate(new Date('2026-09-07T18:14:59Z')).toISOString(), '2026-09-07T00:00:00.000Z');
  assert.equal(nepalCalendarDate(new Date('2026-09-07T18:15:00Z')).toISOString(), '2026-09-08T00:00:00.000Z');
  console.log('PASS same-day check-in, previous-day gate, and Nepal midnight boundary');

  const callback = { invoiceId: 'payment', transactionId: 'txn', status: 'SUCCESS', paymentAmount: 100 };
  invoices = [invoice('payment', 'a', new Date(0)), invoice('remaining', 'a', new Date(0), 'OVERDUE')];
  enrollments = [enrollment('a', 'a', 'BLOCKED'), enrollment('b', 'b', 'BLOCKED')];
  assert.equal((await invoke(finances, '/nepalpay/webhook', callback, false)).status, 401);
  assert.equal(invoices[0].status, 'UNPAID');
  assert.equal((await invoke(finances, '/nepalpay/webhook', callback)).status, 200);
  assert.deepEqual(enrollments.map(row => row.status), ['BLOCKED', 'BLOCKED']);
  assert.equal((await invoke(finances, '/nepalpay/webhook', { ...callback, transactionId: 'different' })).status, 409);

  invoices = [{ ...invoice('payment', 'a', new Date(0)), invoiceType: 'ADMISSION' }];
  admissionStatus = 'PENDING_PAYMENT'; transitions = 0;
  assert.equal((await invoke(finances, '/nepalpay/webhook', callback)).status, 503);
  assert.equal(invoices[0].status, 'PAID');
  assert.equal(deliveries, 1);
  deliverySucceeds = true;
  assert.equal((await invoke(finances, '/nepalpay/webhook', callback)).status, 200);
  assert.equal(deliveries, 2);
  assert.equal((await invoke(finances, '/nepalpay/webhook', callback)).status, 200);
  assert.equal(deliveries, 2, 'completed delivery is not repeated');
  assert.equal(transitions, 1, 'callback retries do not repeat payment');
  console.log('PASS signed callback, remaining debt, authoritative tenant, failed delivery retry, and payment idempotency');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
