import assert from 'node:assert/strict';
import type { UserPayload } from '@tms/types';
import prisma from '../utils/db';
import { calendarAccessWhere, CalendarAccessError, readerCalendarWhere } from './calendar-access';

const actor = (roleName: string, branchId: string | null = null) => ({ id: 'viewer', email: 'viewer@example.test', firstName: 'Test', lastName: 'Viewer', tenantId: 'tenant-a', roles: [{ roleName, branchId, permissions: [] }] }) as UserPayload;
// Evaluate the generated Prisma scalar predicate against adversarial event fixtures.
function matches(row: Record<string, unknown>, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'AND') return value.every((item: any) => matches(row, item));
    if (key === 'OR') return value.some((item: any) => matches(row, item));
    return value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value;
  });
}
async function main() {
  const student = readerCalendarWhere('tenant-a', ['branch-a'], ['class-a'], ['ALL', 'STUDENTS']);
  const event = { tenantId: 'tenant-a', branchId: 'branch-a', classId: 'class-a', audience: 'STUDENTS' };
  assert.ok(matches(event, student));
  for (const override of [{ tenantId: 'tenant-b' }, { branchId: 'branch-b' }, { classId: 'class-b' }, { audience: 'STAFF' }, { audience: 'PARENTS' }]) assert.equal(matches({ ...event, ...override }, student), false);
  assert.ok(matches({ ...event, branchId: null, classId: null, audience: 'ALL' }, student));
  assert.equal(matches(event, readerCalendarWhere('tenant-a', [], [], ['ALL'])), false);
  await assert.rejects(() => calendarAccessWhere(actor('Branch Admin', 'branch-a'), 'tenant-a', { branchId: 'branch-b' }), CalendarAccessError);
  const admin = await calendarAccessWhere(actor('Branch Admin', 'branch-a'), 'tenant-a');
  assert.equal(matches({ ...event, branchId: 'branch-b' }, admin), false);
  assert.ok(matches({ ...event, audience: 'STAFF' }, admin));
  assert.deepEqual(await calendarAccessWhere(actor('Tenant Admin'), 'tenant-a'), { tenantId: 'tenant-a' });
  await assert.rejects(() => calendarAccessWhere(actor('Student'), 'tenant-a', { studentId: 'another-child' }), CalendarAccessError);
  await assert.rejects(() => calendarAccessWhere(actor('Unknown'), 'tenant-a'), CalendarAccessError);
  await assert.rejects(() => calendarAccessWhere(actor('Tenant Admin'), 'tenant-b'), CalendarAccessError);
  await assert.rejects(() => calendarAccessWhere(actor('Student'), 'tenant-a', { viewerRole: 'Teacher' }), CalendarAccessError);

  const accountantActor = actor('Accountant', 'branch-a');
  const accountant = await calendarAccessWhere(accountantActor, 'tenant-a', { viewerRole: 'Accountant' });
  const staffEvent = { ...event, classId: null, audience: 'STAFF' };
  assert.ok(matches(staffEvent, accountant));
  assert.ok(matches({ ...staffEvent, branchId: null, audience: 'ALL' }, accountant));
  for (const override of [{ tenantId: 'tenant-b' }, { branchId: 'branch-b' }, { classId: 'class-a' }, { audience: 'STUDENTS' }, { audience: 'PARENTS' }]) {
    assert.equal(matches({ ...staffEvent, ...override }, accountant), false);
  }
  await assert.rejects(() => calendarAccessWhere(accountantActor, 'tenant-a', { viewerRole: 'Accountant', branchId: 'branch-b' }), CalendarAccessError);
  await assert.rejects(() => calendarAccessWhere(actor('Student'), 'tenant-a', { viewerRole: 'Accountant' }), CalendarAccessError);
  const mixed = { ...accountantActor, roles: [...accountantActor.roles, ...actor('Parent').roles, ...actor('Tenant Admin').roles] };
  assert.deepEqual(await calendarAccessWhere(mixed, 'tenant-a', { viewerRole: 'Accountant' }), accountant);
  const unassigned = await calendarAccessWhere(actor('Accountant'), 'tenant-a', { viewerRole: 'Accountant' });
  assert.equal(matches(staffEvent, unassigned), false);
  assert.ok(matches({ ...staffEvent, branchId: null }, unassigned));

  const originalStudent = prisma.student.findFirst;
  const originalStudents = prisma.student.findMany;
  const originalClass = prisma.class.findMany;
  try {
    const linked: Record<string, { classId: string; branchId: string }> = {
      'linked-child': { classId: 'class-a', branchId: 'branch-a' },
      'sibling': { classId: 'class-s', branchId: 'branch-s' },
    };
    prisma.student.findMany = (async (args: any) => {
      assert.equal(args.where.user.tenantId, 'tenant-a');
      assert.equal(args.where.studentParents.some.parent.userId, 'viewer');
      assert.equal(args.where.studentParents.some.parent.user.tenantId, 'tenant-a');
      const ids = args.where.id ? [args.where.id] : Object.keys(linked);
      return ids.filter((id) => linked[id]).map((id) => ({ id, enrollments: [{ classId: linked[id].classId, class: { branchId: linked[id].branchId } }] }));
    }) as any;
    prisma.student.findFirst = (async (args: any) => {
      assert.equal(args.where.user.tenantId, 'tenant-a');
      assert.equal(args.where.userId, 'viewer');
      return { enrollments: [{ classId: 'class-a', class: { branchId: 'branch-a' } }] };
    }) as any;

    // Parents see their child's branch/class plus tenant-wide events, for
    // everyone, students-and-parents and parents-only audiences.
    const parent = await calendarAccessWhere(actor('Parent'), 'tenant-a', { studentId: 'linked-child' });
    for (const audience of ['ALL', 'STUDENTS', 'PARENTS']) assert.ok(matches({ ...event, audience }, parent));
    assert.ok(matches({ ...event, branchId: null, classId: null, audience: 'ALL' }, parent));
    assert.equal(matches({ ...event, audience: 'STAFF' }, parent), false);
    assert.equal(matches({ ...event, classId: 'other-class', audience: 'ALL' }, parent), false);
    assert.equal(matches({ ...event, branchId: 'branch-b', audience: 'ALL' }, parent), false);
    await assert.rejects(() => calendarAccessWhere(actor('Parent'), 'tenant-a', { studentId: 'unlinked-child' }), CalendarAccessError);
    // Without a selected child, a parent sees every linked child's events.
    const family = await calendarAccessWhere(actor('Parent'), 'tenant-a');
    assert.ok(matches({ ...event, branchId: 'branch-s', classId: 'class-s', audience: 'PARENTS' }, family));
    assert.ok(matches({ ...event, audience: 'PARENTS' }, family));

    // Students see only their enrolled branch/class; a client branch hint is ignored.
    const own = await calendarAccessWhere(actor('Student'), 'tenant-a', { branchId: 'branch-b' });
    assert.ok(matches({ ...event, audience: 'STUDENTS' }, own));
    assert.equal(matches({ ...event, branchId: 'branch-b', audience: 'ALL' }, own), false);
    assert.equal(matches({ ...event, audience: 'PARENTS' }, own), false);

    prisma.class.findMany = (async (args: any) => { assert.equal(args.where.teacherId, 'viewer'); assert.equal(args.where.course.tenantId, 'tenant-a'); return [{ id: 'class-a', branchId: 'branch-a' }]; }) as any;
    const teacher = await calendarAccessWhere(actor('Teacher'), 'tenant-a');
    assert.ok(matches({ ...event, audience: 'ALL' }, teacher));
    assert.ok(matches({ ...event, audience: 'STAFF' }, teacher));
    assert.equal(matches({ ...event, classId: 'unassigned-class', audience: 'ALL' }, teacher), false);
    assert.equal(matches({ ...event, audience: 'PARENTS' }, teacher), false);

    // A teacher who is also a parent sees the union of both scopes.
    const both = { ...actor('Teacher'), roles: [...actor('Teacher').roles, ...actor('Parent').roles] };
    const union = await calendarAccessWhere(both, 'tenant-a');
    assert.ok(matches({ ...event, audience: 'STAFF' }, union));
    assert.ok(matches({ ...event, branchId: 'branch-s', classId: 'class-s', audience: 'PARENTS' }, union));
  } finally { prisma.student.findFirst = originalStudent; prisma.student.findMany = originalStudents; prisma.class.findMany = originalClass; }
  console.log('Calendar access checks passed: branch/class/audience targeting, parent linkage, and denied roles.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
