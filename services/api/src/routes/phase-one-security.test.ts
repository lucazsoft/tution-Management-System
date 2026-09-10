import assert from 'node:assert/strict';
import prisma from '../utils/db';

// Exercise the real route middleware and handlers with deterministic persistence.
// These tests neither connect to PostgreSQL nor send provider requests.
let actor: any;
const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  auth: { api: { getSession: async () => actor ? { user: actor } : null } },
} } as NodeModule;
const performance = require('./performance').default;
const appointments = require('./appointments').default;
const certificates = require('./certificates').default;

function login(id = 'admin', roleName = 'Tenant Admin', branchId: string | null = null) {
  actor = { id, tenantId: 'tenant-a', email: 'test@example.test', firstName: 'Test', lastName: 'User',
    roles: [{ roleName, branchId, permissions: ['manage_grades', 'issue_certificates'] }] };
}

function matches(record: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, expected]: [string, any]) => {
    if (expected === undefined) return true;
    const value = record?.[key];
    if (expected && typeof expected === 'object') {
      if ('some' in expected) return Array.isArray(value) && value.some(item => matches(item, expected.some));
      if ('in' in expected) return expected.in.includes(value);
      return matches(value, expected);
    }
    return value === expected;
  });
}

function project(record: any, args: any): any {
  if (!record) return record;
  const output: any = args?.select ? {} : { ...record };
  for (const [key, spec] of Object.entries(args?.select ?? args?.include ?? {})) {
    if (spec === true) output[key] = record[key];
    else if (spec) output[key] = Array.isArray(record[key])
      ? record[key].filter((item: any) => matches(item, (spec as any).where)).map((item: any) => project(item, spec))
      : project(record[key], spec);
  }
  return output;
}

const enrollment = (branchId: string, teacherId: string, status = 'ACTIVE') => ({ status,
  class: { branchId, teacherId, course: { tenantId: 'tenant-a' } } });
const students = [
  { id: 'own', user: { tenantId: 'tenant-a', firstName: 'Student', lastName: 'One' },
    enrollments: [enrollment('branch-a', 'teacher'), enrollment('branch-b', 'teacher-two')],
    studentParents: [{ parent: { userId: 'parent' } }] },
  { id: 'foreign', user: { tenantId: 'tenant-b' }, enrollments: [] },
  { id: 'other-branch', user: { tenantId: 'tenant-a' }, enrollments: [enrollment('branch-b', 'other-teacher')] },
  { id: 'inactive', user: { tenantId: 'tenant-a' }, enrollments: [enrollment('branch-a', 'teacher', 'COMPLETED')] },
  { id: 'blocked', user: { tenantId: 'tenant-a' }, enrollments: [enrollment('branch-a', 'teacher', 'BLOCKED')] },
];
let writes: any[] = [];
let savedAppointment: any;
let parentView = false;
const db = prisma as any;
db.student.findFirst = async (args: any) => project(students.find(student => matches(student, args.where)), args) ?? null;
db.enrollment.findFirst = async ({ where }: any) => students.flatMap(student => student.enrollments.map(item => ({ studentId: student.id, ...item }))).find(item => matches(item, where)) ?? null;
db.enrollment.findMany = async ({ where }: any) => students.flatMap(student => student.enrollments.map(item => ({ studentId: student.id, ...item }))).filter(item => matches(item, where));
for (const model of ['studentScore', 'studentRemark', 'certificate', 'appointment']) {
  db[model].create = async ({ data }: any) => { writes.push(data); return { id: 'created', ...data }; };
}
db.appointment.update = async ({ data }: any) => { writes.push(data); return { id: 'appointment', ...data }; };
db.tenant.findUnique = async () => ({ appointmentWindowHours: 1 });
db.user.findMany = async () => [];
db.parent.findFirst = async () => parentView ? { id: 'parent-record' } : null;
db.branch.findFirst = async ({ where }: any) => where.tenantId === 'tenant-a' && where.id === 'branch-a' ? { id: 'branch-a', name: 'Branch A' } : null;
db.certificateTemplate.findFirst = async ({ where }: any) => where.tenantId === 'tenant-a' && where.id === 'template' ? { id: 'template', name: 'Completion', type: 'COMPLETION', version: 1, status: 'ACTIVE', layoutConfig: { renderMode: 'DESIGN' }, tenant: { name: 'Tenant A' } } : null;
db.appointment.findFirst = async () => savedAppointment;
db.$transaction = async (run: any) => run(db);
db.$queryRaw = async () => [];
db.appointment.findMany = async (args: any) => [project({ id: 'appointment', teacher: { firstName: 'Teacher', lastName: 'One' },
  student: { id: 'own', user: { firstName: 'Student', lastName: 'One', passwordHash: 'sensitive-hash', email: 'private@example.test', twoFactorEnabled: true } },
}, args)];

async function invoke(router: any, path: string, body: any = {}, method = 'post') {
  const route = router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route;
  const req: any = { headers: {}, body, query: {}, params: { appointmentId: 'appointment' } };
  let status = 200; let payload: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { payload = value; return this; } };
  for (const layer of route.stack) {
    let next = false;
    await layer.handle(req, res, () => { next = true; });
    if (!next) break;
  }
  return { status, payload };
}

const cases: Array<[string, () => Promise<void>]> = [];
const test = (name: string, run: () => Promise<void>) => cases.push([name, run]);
const scoreBody = { subject: 'Math', assessment: 'Quiz', score: 80, branchId: 'branch-a' };
const remarkBody = { subject: 'Math', message: 'Progress' };
const booking = { studentId: 'own', teacherId: 'teacher', scheduledTime: '2099-01-01T10:00:00Z' };

test('tenant admins cannot write scores or remarks to foreign or missing students', async () => {
  login();
  for (const studentId of ['foreign', 'missing']) {
    for (const [path, body] of [['/student/scores', scoreBody], ['/student/remarks', remarkBody]] as const) {
      writes = [];
      assert.equal((await invoke(performance, path, { ...body, studentId })).status, 404);
      assert.equal(writes.length, 0);
    }
  }
});
test('tenant admins retain access to their own students without active enrollments', async () => {
  login();
  assert.equal((await invoke(performance, '/student/scores', { ...scoreBody, studentId: 'inactive' })).status, 201);
  assert.equal((await invoke(performance, '/student/remarks', { ...remarkBody, studentId: 'inactive' })).status, 201);
});
test('teachers can score assigned students but cannot score other branches', async () => {
  login('teacher', 'Teacher', 'branch-a');
  assert.equal((await invoke(performance, '/student/scores', { ...scoreBody, studentId: 'own' })).status, 201);
  writes = [];
  assert.ok([403, 404].includes((await invoke(performance, '/student/scores', { ...scoreBody, studentId: 'other-branch' })).status));
  assert.equal(writes.length, 0);
});
test('remarks preserve teaching permissions within the tenant', async () => {
  login('teacher', 'Teacher', 'branch-a');
  assert.equal((await invoke(performance, '/student/remarks', { ...remarkBody, studentId: 'own' })).status, 201);
  writes = [];
  assert.equal((await invoke(performance, '/student/remarks', { ...remarkBody, studentId: 'other-branch' })).status, 403);
  assert.equal(writes.length, 0);
});
test('appointment lists expose only student display names to teachers and parents', async () => {
  for (const isParent of [false, true]) {
    parentView = isParent;
    login(isParent ? 'parent' : 'teacher', isParent ? 'Parent' : 'Teacher', 'branch-a');
    const result = await invoke(appointments, '/', {}, 'get');
    assert.equal(result.status, 200);
    assert.deepEqual(result.payload.appointments[0].student.user, { firstName: 'Student', lastName: 'One' });
    assert.equal(JSON.stringify(result.payload).includes('sensitive-hash'), false);
  }
});
test('single appointments cannot grant the parent or unrelated users participant rights', async () => {
  login('parent', 'Parent');
  for (const id of ['parent', 'unrelated', 'teacher-two']) {
    writes = [];
    const result = await invoke(appointments, '/request', { ...booking, isGroup: false, participantIds: [id] });
    assert.equal(result.status, 403);
    assert.equal(writes.length, 0);
  }
});
test('valid single and group appointments preserve the intended participants', async () => {
  login('parent', 'Parent');
  const single = await invoke(appointments, '/request', booking);
  assert.equal(single.status, 201);
  assert.deepEqual(single.payload.appointment.participantIds, ['teacher']);
  const group = await invoke(appointments, '/request', { ...booking, isGroup: true, participantIds: ['teacher-two', 'teacher-two'] });
  assert.equal(group.status, 201);
  assert.deepEqual(group.payload.appointment.participantIds, ['teacher', 'teacher-two']);
  writes = [];
  assert.equal((await invoke(appointments, '/request', { ...booking, isGroup: true, participantIds: ['parent'] })).status, 403);
  assert.equal(writes.length, 0);
});
test('malformed participant controls are rejected', async () => {
  login('parent', 'Parent');
  for (const extra of [{ isGroup: 'false' }, { participantIds: 'teacher' }, { participantIds: [42] }, { participantIds: [''] }]) {
    writes = [];
    assert.equal((await invoke(appointments, '/request', { ...booking, ...extra })).status, 400);
    assert.equal(writes.length, 0);
  }
});
test('legacy forged participant lists cannot authorize a parent to respond', async () => {
  login('parent', 'Parent');
  for (const isGroup of [false, true]) {
    savedAppointment = { id: 'appointment', status: 'REQUESTED', teacherId: 'teacher', isGroup, participantIds: ['teacher', 'parent'],
      student: students[0], teacher: { userRoles: [] } };
    writes = [];
    assert.equal((await invoke(appointments, '/respond/:appointmentId', { action: 'REJECT' })).status, 403);
    assert.equal(writes.length, 0);
  }
  login('teacher', 'Teacher', 'branch-a');
  savedAppointment.requestedById = 'parent';
  assert.equal((await invoke(appointments, '/respond/:appointmentId', { action: 'REJECT' })).status, 200);
});
test('certificate issue requires eligible enrollment in the issuing branch', async () => {
  for (const role of ['Tenant Admin', 'Branch Admin']) {
    login('admin', role, role === 'Tenant Admin' ? null : 'branch-a');
    for (const studentId of ['foreign', 'missing', 'other-branch', 'inactive']) {
      writes = [];
      assert.equal((await invoke(certificates, '/issue', { studentId, branchId: 'branch-a', templateId: 'template' })).status, 404);
      assert.equal(writes.length, 0);
    }
    for (const studentId of ['own', 'blocked']) {
      assert.equal((await invoke(certificates, '/issue', { studentId, branchId: 'branch-a', templateId: 'template' })).status, 201);
    }
  }
});
test('Phase 1 endpoints still require authentication', async () => {
  actor = null;
  for (const [router, path, method] of [[performance, '/student/scores', 'post'], [performance, '/student/remarks', 'post'],
    [appointments, '/', 'get'], [appointments, '/request', 'post'], [certificates, '/issue', 'post']]) {
    assert.equal((await invoke(router, path, {}, method)).status, 401);
  }
});

async function main() {
  let failed = 0;
  for (const [name, run] of cases) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}`, error); }
  }
  assert.equal(failed, 0, `${failed} Phase 1 security scenarios failed`);
  console.log(`Phase 1 security: ${cases.length} scenarios passed (mocked persistence).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
