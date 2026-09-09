import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import prisma from '../utils/db';
import { decideAppointment } from '../services/appointment-decisions';
import { encryptDeliveryPayload, decryptDeliveryPayload } from '../utils/delivery-payload';

process.env.ADMISSION_DELIVERY_SECRET = 'phase-three-test-key-at-least-thirty-two-characters';
const db = prisma as any;
let state: any = { appointment: null, alternatives: [], logs: [], tasks: [], jobs: [], users: {}, admissionStatus: 'READY_FOR_LOGIN' };
let failTask = false, failAlternative = false, failCompletion = false, janitor = true, failPush = false;
const sent: string[] = [];
let accountCount = 1;
let tail = Promise.resolve();
// Serial transaction simulation; real PostgreSQL validation remains pending.
db.$transaction = async (run: any) => {
  const previous = tail; let release!: () => void;
  tail = new Promise<void>(resolve => { release = resolve; });
  await previous;
  const snapshot = structuredClone(state);
  try { return await run(db); }
  catch (error) { state = snapshot; throw error; }
  finally { release(); }
};
db.$queryRaw = async () => [];
function matches(row: any, where: any): boolean {
  return Object.entries(where || {}).every(([key, value]: [string, any]) => {
    if (key === 'OR') return value.some((item: any) => matches(row, item));
    const actual = row?.[key];
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(actual);
      if ('not' in value) return actual !== value.not;
      if ('lte' in value) return actual != null && actual <= value.lte;
      return matches(actual, value);
    }
    return value === actual;
  });
}
const teacher = (id: string): any => ({ id, tenantId: 'tenant', roles: [{ roleName: 'Teacher', branchId: 'branch', permissions: [] }] });
function appointment() {
  return { id: 'appointment', tenantId: 'tenant', studentId: 'student', requestedById: 'parent', teacherId: 'one',
    status: 'REQUESTED', isGroup: true, participantIds: ['one', 'two'], participantApprovals: {},
    student: { enrollments: [{ class: { teacherId: 'one', branchId: 'branch' } }, { class: { teacherId: 'two', branchId: 'branch' } }] },
    teacher: { userRoles: [], passwordHash: 'never-return-this' } };
}
db.appointment.findFirst = async ({ where }: any) => matches(state.appointment, where) ? structuredClone(state.appointment) : null;
db.appointment.findUniqueOrThrow = async () => ({ id: state.appointment.id, status: state.appointment.status, participantApprovals: state.appointment.participantApprovals });
db.appointment.update = async ({ data }: any) => { Object.assign(state.appointment, data); return db.appointment.findUniqueOrThrow(); };
db.appointment.create = async ({ data }: any) => { if (failAlternative) throw new Error('injected create failure'); state.alternatives.push(data); return data; };

db.branch.findFirst = async () => ({ id: 'branch' });
db.userRole.findFirst = async () => janitor ? { userId: 'janitor' } : null;
db.tenant.findUniqueOrThrow = async () => ({ maintenanceEscalationDays: 3 });
db.resourceLog.create = async ({ data }: any) => { state.logs.push(data); return data; };
db.maintenanceTask.create = async ({ data }: any) => { if (failTask) throw new Error('injected task failure'); state.tasks.push(data); return data; };
const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { auth: { api: { getSession: async () => ({ user: {
  id: 'admin', tenantId: 'tenant', roles: [{ roleName: 'Tenant Admin', branchId: null, permissions: [] }],
} }) } } } } as NodeModule;
const notifications = require('../services/push-notification');
notifications.PushNotificationService.sendPush = async () => { if (failPush) throw new Error('injected push failure'); return { success: true }; };
const resources = require('./resources').default;
const smsPath = require.resolve('../utils/sms');
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: { default: {
  sendSms: async (_phone: string, message: string) => { sent.push(message); return { success: true, messageId: 'provider-id' }; },
}, __esModule: true } } as NodeModule;
const { prepareAdmissionDeliveries, sendAdmissionDelivery, finalizeAdmissionDeliveries } = require('../services/admission-delivery');
db.student.findFirst = async () => ({ id: 'student', userId: 'student-user', admissionStatus: state.admissionStatus,
  user: { id: 'student-user', email: 'student@example.test', phone: '9800000001' },
  studentParents: [{ parent: { user: { id: 'parent-user', email: 'parent@example.test', phone: '9800000002' } } }],
  invoices: [{ status: 'PAID', paymentDate: new Date('2026-09-01') }],
});
db.student.update = async ({ data }: any) => { state.admissionStatus = data.admissionStatus; };
db.student.updateMany = async ({ where, data }: any) => {
  if (!matches({ id: 'student', user: { tenantId: 'tenant' }, admissionStatus: state.admissionStatus }, where)) return { count: 0 };
  state.admissionStatus = data.admissionStatus; return { count: 1 };
};
db.user.update = async ({ where, data }: any) => { state.users[where.id] = { ...state.users[where.id], ...data }; };
db.account.updateMany = async () => ({ count: accountCount });
db.enrollment.updateMany = async () => ({ count: 0 });
db.enrollment.findMany = async () => [];
db.admissionLoginDelivery.findMany = async ({ where }: any) => state.jobs.filter((job: any) => matches(job, where)).map((job: any) => ({ ...job }));
db.admissionLoginDelivery.upsert = async ({ where, create, update }: any) => {
  const job = state.jobs.find((item: any) => matches(item, where.studentId_recipient));
  if (job) Object.assign(job, update);
  else state.jobs.push({ status: 'PENDING', attemptCount: 0, leaseUntil: null, leaseToken: null, nextAttemptAt: new Date(0), ...create });
};
db.admissionLoginDelivery.findFirstOrThrow = async ({ where }: any) => {
  const job = state.jobs.find((item: any) => matches(item, where));
  assert.ok(job); return { ...job };
};
db.admissionLoginDelivery.updateMany = async ({ where, data }: any) => {
  if (data.status === 'SENT' && failCompletion) { failCompletion = false; throw new Error('crash after provider accepted'); }
  const jobs = state.jobs.filter((job: any) => matches(job, where));
  for (const job of jobs) {
    const count = job.attemptCount;
    Object.assign(job, data);
    if (data.attemptCount?.increment) job.attemptCount = count + data.attemptCount.increment;
  }
  return { count: jobs.length };
};
async function log(actionRequired: any) {
  const route = resources.stack.find((layer: any) => layer.route?.path === '/log').route;
  const req: any = { headers: {}, body: { branchId: 'branch', classroomId: 'room', itemsCondition: {}, actionRequired } };
  let status = 200; let payload: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { payload = value; return this; } };
  for (const layer of route.stack) { let next = false; await layer.handle(req, res, () => { next = true; }); if (!next) break; }
  return { status, payload };
}

async function main() {
  state.appointment = appointment();
  await Promise.all([decideAppointment(teacher('one'), 'appointment', { action: 'APPROVE' }), decideAppointment(teacher('two'), 'appointment', { action: 'APPROVE' })]);
  assert.equal(state.appointment.status, 'CONFIRMED');
  assert.deepEqual(state.appointment.participantApprovals, { one: 'APPROVED', two: 'APPROVED' });
  await assert.rejects(decideAppointment(teacher('one'), 'appointment', { action: 'REJECT' }), (error: any) => error.status === 409);
  state.appointment = appointment();
  await decideAppointment(teacher('one'), 'appointment', { action: 'APPROVE' });
  const retry = await decideAppointment(teacher('one'), 'appointment', { action: 'APPROVE' });
  assert.equal(retry.notify, false);
  assert.equal(JSON.stringify(retry).includes('never-return-this'), false);
  const alternative = { action: 'PROPOSE_ALTERNATIVE', alternativeSlot: '2099-01-01' };
  const proposals = await Promise.allSettled([decideAppointment(teacher('one'), 'appointment', alternative), decideAppointment(teacher('two'), 'appointment', alternative)]);
  assert.equal(proposals.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(state.alternatives.length, 1);
  assert.deepEqual(state.alternatives[0].participantApprovals, { one: 'PENDING', two: 'PENDING' });
  state.appointment = appointment(); failAlternative = true;
  await assert.rejects(decideAppointment(teacher('one'), 'appointment', alternative));
  assert.equal(state.appointment.status, 'REQUESTED'); failAlternative = false;
  console.log('PASS serialized approvals, terminal states, idempotent partial approval, atomic alternatives');

  janitor = false;
  assert.equal((await log(false)).status, 201);
  assert.equal((await log(true)).status, 422);
  assert.equal((await log('false')).status, 400);
  janitor = true; failTask = true;
  assert.equal((await log(true)).status, 500);
  assert.equal(state.logs.length, 1); assert.equal(state.tasks.length, 0);
  failTask = false; failPush = true;
  const logged = await log(true);
  assert.equal(logged.status, 201); assert.equal(logged.payload.notificationDelivered, false);
  assert.equal(state.logs.length, 2); assert.equal(state.tasks.length, 1);
  console.log('PASS maintenance atomicity, informational logs, and post-commit notification failure');

  const encrypted = encryptDeliveryPayload('job', { phone: 'phone', message: 'secret-password' });
  assert.equal(encrypted.includes('secret-password'), false);
  assert.equal(decryptDeliveryPayload('job', encrypted).message, 'secret-password');
  assert.throws(() => decryptDeliveryPayload('other-job', encrypted));
  accountCount = 0;
  await assert.rejects(prepareAdmissionDeliveries('tenant', 'student'));
  assert.deepEqual(state.users, {}, 'credential preparation rolls back when account is missing');
  assert.equal(state.jobs.length, 0);
  accountCount = 1;
  await prepareAdmissionDeliveries('tenant', 'student');
  assert.equal(state.jobs.length, 2);
  const [studentJob, parentJob] = state.jobs;
  const message = decryptDeliveryPayload(studentJob.id, studentJob.encryptedPayload).message;
  const password = message.split('Temporary password: ')[1];
  const hash = state.users['student-user'].passwordHash;
  assert.equal(await bcrypt.compare(password, hash), true);
  await prepareAdmissionDeliveries('tenant', 'student');
  assert.equal(state.users['student-user'].passwordHash, hash, 'restart must preserve queued credentials');
  await Promise.all([sendAdmissionDelivery(studentJob.id, 'tenant'), sendAdmissionDelivery(studentJob.id, 'tenant')]);
  assert.equal(sent.length, 1, 'only one worker claims an available message');
  assert.equal(state.jobs[0].encryptedPayload, null, 'erase sensitive payload after acknowledged success');
  failCompletion = true;
  await assert.rejects(sendAdmissionDelivery(parentJob.id, 'tenant'));
  assert.equal(state.jobs[1].status, 'PENDING');
  await sendAdmissionDelivery(parentJob.id, 'tenant');
  assert.equal(sent.length, 2, 'live lease prevents premature recovery');
  await sendAdmissionDelivery(parentJob.id, 'tenant', new Date(Date.now() + 121000));
  assert.equal(sent.length, 3);
  assert.equal(sent[1], sent[2], 'ambiguous acceptance retries the same credentials');
  assert.equal((await finalizeAdmissionDeliveries('tenant', 'student')).delivered, true);
  assert.equal(state.admissionStatus, 'ACTIVE');
  assert.equal((await finalizeAdmissionDeliveries('tenant', 'student')).delivered, true);
  await prepareAdmissionDeliveries('tenant', 'student');
  assert.equal(state.users['student-user'].passwordHash, hash);
  await sendAdmissionDelivery(parentJob.id, 'tenant'); assert.equal(sent.length, 3);
  console.log('PASS encrypted durable queue, competing claims, crash/lease recovery, stable credentials, repeatable finalization');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
