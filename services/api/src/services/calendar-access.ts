import type { Prisma } from '@prisma/client';
import prisma from '../utils/db';
import { hasRole, isTenantAdmin, managedBranchIds } from '../utils/access-control';
import type { UserPayload } from '@tms/types';

export const CALENDAR_AUDIENCES = ['ALL', 'STAFF', 'STUDENTS', 'PARENTS'] as const;
export function readerCalendarWhere(tenantId: string, branchIds: string[], classIds: string[], audiences: string[]): Prisma.AcademicEventWhereInput {
  return { tenantId, audience: { in: audiences }, AND: [
    { OR: [{ branchId: null }, { branchId: { in: branchIds } }] },
    { OR: [{ classId: null }, { classId: { in: classIds } }] },
  ] };
}

export class CalendarAccessError extends Error {}

/** Build scope from verified roles and database relationships, never client branch IDs. */
export async function calendarAccessWhere(actor: UserPayload, tenantId: string, options: { branchId?: string; studentId?: string; viewerRole?: string } = {}): Promise<Prisma.AcademicEventWhereInput> {
  if (actor.tenantId !== tenantId) throw new CalendarAccessError('Institution access denied.');
  if (options.viewerRole) {
    if (!['Teacher', 'Student', 'Parent', 'Accountant'].includes(options.viewerRole) || !hasRole(actor, options.viewerRole)) throw new CalendarAccessError('Calendar role access denied.');
    actor = { ...actor, roles: actor.roles.filter((role) => role.roleName === options.viewerRole) };
  }
  // Academic events are institution-managed shared records. Mobile parent,
  // teacher and student calendars must present one canonical timeline; event
  // audience metadata remains useful to administrators but must not make the
  // same institution date disagree between portals.
  if (hasRole(actor, 'Teacher') || hasRole(actor, 'Student') || hasRole(actor, 'Parent')) {
    if (options.studentId && hasRole(actor, 'Parent')) {
      const linked = await prisma.student.findFirst({ where: {
        id: options.studentId,
        user: { tenantId },
        studentParents: { some: { parent: { userId: actor.id, user: { tenantId } } } },
      }, select: { id: true } });
      if (!linked) throw new CalendarAccessError('Linked student not found.');
    }
    if (options.studentId && hasRole(actor, 'Student')) {
      // Student identity is always derived from the session; accepting a
      // selector here would let a client probe another student's id.
      throw new CalendarAccessError('Student calendar access denied.');
    }
    return { tenantId };
  }
  if (options.studentId || hasRole(actor, 'Parent')) {
    if (!hasRole(actor, 'Parent')) throw new CalendarAccessError('A linked parent account is required.');
    const student = await prisma.student.findFirst({ where: {
      ...(options.studentId ? { id: options.studentId } : {}), user: { tenantId },
      studentParents: { some: { parent: { userId: actor.id, user: { tenantId } } } },
    }, include: { enrollments: { where: { status: { in: ['ACTIVE', 'BLOCKED'] }, class: { archivedAt: null }, OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] }, include: { class: true } } } });
    if (!student) throw new CalendarAccessError('Linked student not found.');
    return readerCalendarWhere(tenantId, student.enrollments.map((entry) => entry.class.branchId), student.enrollments.map((entry) => entry.classId), ['ALL', 'STUDENTS', 'PARENTS']);
  }
  if (isTenantAdmin(actor)) return { tenantId, ...(options.branchId ? { OR: [{ branchId: null }, { branchId: options.branchId }] } : {}) };
  const branches = managedBranchIds(actor);
  if (branches.length) {
    if (options.branchId && !branches.includes(options.branchId)) throw new CalendarAccessError('Branch access denied.');
    return { tenantId, OR: [{ branchId: null }, { branchId: { in: options.branchId ? [options.branchId] : branches } }] };
  }
  if (hasRole(actor, 'Accountant')) {
    const branchIds = actor.roles.filter((role) => role.roleName === 'Accountant' && role.branchId).map((role) => role.branchId!);
    if (options.branchId && !branchIds.includes(options.branchId)) throw new CalendarAccessError('Branch access denied.');
    return readerCalendarWhere(tenantId, options.branchId ? [options.branchId] : branchIds, [], ['ALL', 'STAFF']);
  }
  if (hasRole(actor, 'Teacher')) {
    const classes = await prisma.class.findMany({ where: { teacherId: actor.id, archivedAt: null, course: { tenantId } }, select: { id: true, branchId: true } });
    const branchIds = [...classes.map((entry) => entry.branchId), ...actor.roles.filter((role) => role.roleName === 'Teacher' && role.branchId).map((role) => role.branchId!)];
    return readerCalendarWhere(tenantId, branchIds, classes.map((entry) => entry.id), ['ALL', 'STAFF', 'STUDENTS']);
  }
  if (hasRole(actor, 'Student')) {
    const student = await prisma.student.findFirst({ where: { userId: actor.id, user: { tenantId } }, include: { enrollments: { where: { status: { in: ['ACTIVE', 'BLOCKED'] }, class: { archivedAt: null }, OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] }, include: { class: true } } } });
    if (!student) throw new CalendarAccessError('Student record not found.');
    return readerCalendarWhere(tenantId, student.enrollments.map((entry) => entry.class.branchId), student.enrollments.map((entry) => entry.classId), ['ALL', 'STUDENTS']);
  }
  throw new CalendarAccessError('Calendar access is unavailable for this account.');
}
