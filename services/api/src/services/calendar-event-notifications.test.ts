import assert from 'node:assert/strict';
import {
  calendarNotificationText,
  notifyCalendarEventPublished,
  type PublishedCalendarEvent,
} from './calendar-event-notifications';

const cases: Array<[string, () => Promise<void>]> = [];
const test = (name: string, run: () => Promise<void>) => cases.push([name, run]);

const baseEvent: PublishedCalendarEvent = {
  id: 'event-1',
  tenantId: 'tenant-a',
  branchId: null,
  classId: null,
  audience: 'ALL',
  title: 'Dashain break',
  description: 'School closed for the festival.',
  eventType: 'HOLIDAY',
  startDate: new Date('2026-10-12T00:00:00Z'),
  endDate: new Date('2026-10-14T00:00:00Z'),
};

function fakeDb(fixtures: {
  students?: Array<{ userId: string; parents: string[] }>;
  classTeachers?: string[];
  branchTeachers?: string[];
  failCreate?: boolean;
}) {
  const calls = { student: [] as any[], class: [] as any[], userRole: [] as any[], created: [] as any[] };
  const db = {
    student: { findMany: async (args: any) => { calls.student.push(args); return (fixtures.students ?? []).map((s) => ({ userId: s.userId, studentParents: s.parents.map((userId) => ({ parent: { userId } })) })); } },
    class: { findMany: async (args: any) => { calls.class.push(args); return (fixtures.classTeachers ?? []).map((teacherId) => ({ teacherId })); } },
    userRole: { findMany: async (args: any) => { calls.userRole.push(args); return (fixtures.branchTeachers ?? []).map((userId) => ({ userId })); } },
    notification: { createMany: async (args: any) => { if (fixtures.failCreate) throw new Error('db down'); calls.created.push(...args.data); return { count: args.data.length }; } },
  };
  return { db, calls };
}

function fakePush() {
  const sends: Array<{ tenantId: string; userIds: string[]; title: string; data?: Record<string, string> }> = [];
  return {
    sends,
    push: {
      sendPushToUsers: async (tenantId: string, userIds: string[], title: string, _body: string, data?: Record<string, string>) => {
        sends.push({ tenantId, userIds: [...userIds].sort(), title, data });
        return { sent: userIds.length, failed: 0 };
      },
    },
  };
}

test('tenant-wide ALL event reaches students, their parents and teachers, never the author', async () => {
  const { db, calls } = fakeDb({
    students: [{ userId: 's1', parents: ['p1'] }, { userId: 's2', parents: ['p1', 'p2'] }],
    classTeachers: ['t1'],
    branchTeachers: ['t2', 'admin'],
  });
  const { push, sends } = fakePush();
  const result = await notifyCalendarEventPublished(baseEvent, { actorId: 'admin', db, push });

  assert.deepEqual(result, { recipients: 6, pushed: 6 });
  // Every query is pinned to the event's tenant and active accounts.
  assert.deepEqual(calls.student[0].where.user, { tenantId: 'tenant-a', status: 'ACTIVE' });
  assert.equal(calls.student[0].where.enrollments.some.class.course.tenantId, 'tenant-a');
  assert.equal(calls.class[0].where.course.tenantId, 'tenant-a');
  assert.equal(calls.userRole[0].where.user.tenantId, 'tenant-a');
  assert.equal('branchId' in calls.userRole[0].where, false);

  const destinations = Object.fromEntries(calls.created.map((row) => [row.userId, row.destination]));
  assert.deepEqual(destinations, {
    t1: '/teacher/calendar', t2: '/teacher/calendar',
    p1: '/parent/calendar', p2: '/parent/calendar',
    s1: '/student/calendar', s2: '/student/calendar',
  });
  for (const row of calls.created) {
    assert.equal(row.tenantId, 'tenant-a');
    assert.equal(row.category, 'CALENDAR');
    assert.equal(row.entityId, 'event-1');
    assert.equal(row.title, 'Holiday: Dashain break');
  }
  assert.deepEqual(sends.map((send) => [send.data?.deepLink, send.userIds]), [
    ['/teacher/calendar', ['t1', 't2']],
    ['/parent/calendar', ['p1', 'p2']],
    ['/student/calendar', ['s1', 's2']],
  ]);
  assert.equal(sends.every((send) => send.data?.eventId === 'event-1' && send.data?.category === 'CALENDAR'), true);
});

test('class-targeted staff event notifies only that class teacher', async () => {
  const { db, calls } = fakeDb({ classTeachers: ['t1'], branchTeachers: ['t-branch'] });
  const { push, sends } = fakePush();
  const result = await notifyCalendarEventPublished({ ...baseEvent, branchId: 'branch-a', classId: 'class-a', audience: 'STAFF' }, { db, push });

  assert.equal(result.recipients, 1);
  assert.equal(calls.student.length, 0, 'staff events never load students');
  assert.equal(calls.userRole.length, 0, 'class events skip branch-wide teachers');
  assert.equal(calls.class[0].where.id, 'class-a');
  assert.deepEqual(sends.map((send) => send.userIds), [['t1']]);
});

test('branch "students and parents" event scopes students to the branch and skips teachers', async () => {
  const { db, calls } = fakeDb({ students: [{ userId: 's1', parents: ['p1'] }], classTeachers: ['t1'] });
  const { push } = fakePush();
  const result = await notifyCalendarEventPublished({ ...baseEvent, branchId: 'branch-a', audience: 'STUDENTS' }, { db, push });

  assert.equal(result.recipients, 2);
  assert.equal(calls.student[0].where.enrollments.some.class.branchId, 'branch-a');
  assert.equal(calls.student[0].where.enrollments.some.class.archivedAt, null);
  assert.equal(calls.class.length, 0);
  assert.deepEqual(calls.created.map((row) => row.userId).sort(), ['p1', 's1']);
});

test('parents-only event does not notify the students themselves', async () => {
  const { db, calls } = fakeDb({ students: [{ userId: 's1', parents: ['p1'] }] });
  const { push } = fakePush();
  await notifyCalendarEventPublished({ ...baseEvent, audience: 'PARENTS' }, { db, push });
  assert.deepEqual(calls.created.map((row) => row.userId), ['p1']);
});

test('a teacher who is also a parent gets one notification', async () => {
  const { db, calls } = fakeDb({ students: [{ userId: 's1', parents: ['t1'] }], classTeachers: ['t1'] });
  const { push, sends } = fakePush();
  const result = await notifyCalendarEventPublished(baseEvent, { db, push });
  assert.equal(result.recipients, 2);
  assert.equal(calls.created.filter((row) => row.userId === 't1').length, 1);
  assert.equal(sends.flatMap((send) => send.userIds).filter((id) => id === 't1').length, 1);
});

test('delivery failures never throw back into event creation', async () => {
  const { db } = fakeDb({ students: [{ userId: 's1', parents: [] }], failCreate: true });
  const { push, sends } = fakePush();
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (line: string) => { warnings.push(line); };
  try {
    assert.deepEqual(await notifyCalendarEventPublished(baseEvent, { db, push }), { recipients: 0, pushed: 0 });
  } finally { console.warn = originalWarn; }
  assert.equal(sends.length, 0);
  assert.match(warnings[0], /CALENDAR_NOTIFICATION_FAILED/);
});

test('notification text shows the Nepal-time date range and trims long details', async () => {
  const single = calendarNotificationText({ ...baseEvent, eventType: 'EXAM', description: null, endDate: baseEvent.startDate });
  assert.equal(single.title, 'Exam: Dashain break');
  assert.equal(single.body.includes('–'), false);
  const range = calendarNotificationText({ ...baseEvent, description: 'x'.repeat(300) });
  assert.ok(range.body.includes('–'));
  assert.ok(range.body.endsWith('…'));
  assert.ok(range.body.length < 220);
});

async function main() {
  let failed = 0;
  for (const [name, run] of cases) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}`, error); }
  }
  assert.equal(failed, 0, `${failed} calendar notification scenarios failed`);
  console.log(`Calendar event notifications: ${cases.length} scenarios passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
