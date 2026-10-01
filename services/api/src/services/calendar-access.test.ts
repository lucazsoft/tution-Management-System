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
  const originalClass = prisma.class.findMany;
  try {
    prisma.student.findFirst = (async (args: any) => {
      assert.equal(args.where.user.tenantId, 'tenant-a');
      if (args.where.studentParents) {
        assert.equal(args.where.studentParents.some.parent.userId, 'viewer');
        return args.where.id === 'linked-child' ? { enrollments: [{ classId: 'class-a', class: { branchId: 'branch-a' } }] } : null;
      }
      assert.equal(args.where.userId, 'viewer');
      return { enrollments: [{ classId: 'class-a', class: { branchId: 'branch-a' } }] };
    }) as any;
    const parent = await calendarAccessWhere(actor('Parent'), 'tenant-a', { studentId: 'linked-child' });
    assert.ok(matches({ ...event, audience: 'PARENTS' }, parent));
    assert.ok(matches({ ...event, audience: 'STAFF' }, parent));
    assert.ok(matches({ ...event, classId: 'sibling-class' }, parent));
    await assert.rejects(() => calendarAccessWhere(actor('Parent'), 'tenant-a', { studentId: 'unlinked-child' }), CalendarAccessError);
    const own = await calendarAccessWhere(actor('Student'), 'tenant-a', { branchId: 'branch-b' });
    assert.ok(matches({ ...event, branchId: 'branch-b' }, own));
    prisma.class.findMany = (async (args: any) => { assert.equal(args.where.teacherId, 'viewer'); assert.equal(args.where.course.tenantId, 'tenant-a'); return [{ id: 'class-a', branchId: 'branch-a' }]; }) as any;
    const teacher = await calendarAccessWhere(actor('Teacher'), 'tenant-a');
    assert.ok(matches({ ...event, audience: 'STAFF' }, teacher));
    assert.ok(matches({ ...event, classId: 'unassigned-class' }, teacher));
  } finally { prisma.student.findFirst = originalStudent; prisma.class.findMany = originalClass; }
  console.log('Calendar access checks passed: canonical institution timeline, parent linkage, and denied roles.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
