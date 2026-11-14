import type { Prisma } from '@prisma/client';
import prisma from '../utils/db';
import { hasRole, isTenantAdmin, managedBranchIds } from '../utils/access-control';
import type { UserPayload } from '@tms/types';

export const CALENDAR_AUDIENCES = ['ALL', 'STAFF', 'STUDENTS', 'PARENTS'] as const;
export type CalendarAudience = (typeof CALENDAR_AUDIENCES)[number];
export type CalendarReader = 'STUDENT' | 'PARENT' | 'TEACHER';

/**
 * Which event audiences each reader role sees. This single table drives both
 * calendar visibility and who is notified when an event is published, so an
 * event never notifies someone whose calendar would not show it.
 */
export const READER_AUDIENCES: Record<CalendarReader, CalendarAudience[]> = {
  STUDENT: ['ALL', 'STUDENTS'],
  // "Students and their parents" events reach parents through their children.
  PARENT: ['ALL', 'STUDENTS', 'PARENTS'],
  TEACHER: ['ALL', 'STAFF', 'STUDENTS'],
};

/** Readers that are actively notified for each audience. */
export const AUDIENCE_NOTIFIES: Record<CalendarAudience, CalendarReader[]> = {
  ALL: ['STUDENT', 'PARENT', 'TEACHER'],
  STUDENTS: ['STUDENT', 'PARENT'],
  PARENTS: ['PARENT'],
  STAFF: ['TEACHER'],
};

/** Enrollments that currently place a student in a class. */
export function currentEnrollmentWhere(now = new Date()): Prisma.EnrollmentWhereInput {
  return {
    status: { in: ['ACTIVE', 'BLOCKED'] },
    class: { archivedAt: null },
    OR: [{ validUntil: null }, { validUntil: { gt: now } }],
  };
}

export function readerCalendarWhere(tenantId: string, branchIds: string[], classIds: string[], audiences: string[]): Prisma.AcademicEventWhereInput {
  return { tenantId, audience: { in: audiences }, AND: [
    { OR: [{ branchId: null }, { branchId: { in: [...new Set(branchIds)] } }] },
    { OR: [{ classId: null }, { classId: { in: [...new Set(classIds)] } }] },
  ] };
}

export class CalendarAccessError extends Error {}

async function parentScope(actor: UserPayload, tenantId: string, studentId?: string) {
  const students = await prisma.student.findMany({ where: {
    ...(studentId ? { id: studentId } : {}), user: { tenantId },
    studentParents: { some: { parent: { userId: actor.id, user: { tenantId } } } },
  }, include: { enrollments: { where: currentEnrollmentWhere(), include: { class: true } } } });
  if (!students.length) {
    if (studentId) throw new CalendarAccessError('Linked student not found.');
    return null;
  }
  const enrollments = students.flatMap((student) => student.enrollments);
  return readerCalendarWhere(tenantId, enrollments.map((entry) => entry.class.branchId), enrollments.map((entry) => entry.classId), READER_AUDIENCES.PARENT);
}

async function teacherScope(actor: UserPayload, tenantId: string) {
  const classes = await prisma.class.findMany({ where: { teacherId: actor.id, archivedAt: null, course: { tenantId } }, select: { id: true, branchId: true } });
  const branchIds = [...classes.map((entry) => entry.branchId), ...actor.roles.filter((role) => role.roleName === 'Teacher' && role.branchId).map((role) => role.branchId!)];
  return readerCalendarWhere(tenantId, branchIds, classes.map((entry) => entry.id), READER_AUDIENCES.TEACHER);
}

async function studentScope(actor: UserPayload, tenantId: string) {
  const student = await prisma.student.findFirst({ where: { userId: actor.id, user: { tenantId } }, include: { enrollments: { where: currentEnrollmentWhere(), include: { class: true } } } });
  if (!student) return null;
  return readerCalendarWhere(tenantId, student.enrollments.map((entry) => entry.class.branchId), student.enrollments.map((entry) => entry.classId), READER_AUDIENCES.STUDENT);
}

/**
 * Build scope from verified roles and database relationships, never client
 * branch IDs. Readers see an event only when it is tenant-wide or targets one
 * of their branches/classes, and its audience includes their role.
 */
export async function calendarAccessWhere(actor: UserPayload, tenantId: string, options: { branchId?: string; studentId?: string; viewerRole?: string } = {}): Promise<Prisma.AcademicEventWhereInput> {
  if (actor.tenantId !== tenantId) throw new CalendarAccessError('Institution access denied.');
  if (options.viewerRole) {
    if (!['Teacher', 'Student', 'Parent', 'Accountant'].includes(options.viewerRole) || !hasRole(actor, options.viewerRole)) throw new CalendarAccessError('Calendar role access denied.');
    actor = { ...actor, roles: actor.roles.filter((role) => role.roleName === options.viewerRole) };
  }
  if (options.studentId) {
    // Student identity is always derived from the session; only a linked
    // parent may select a child, so a client cannot probe other students.
    if (!hasRole(actor, 'Parent')) throw new CalendarAccessError('A linked parent account is required.');
    return (await parentScope(actor, tenantId, options.studentId))!;
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
  // A person can hold several reader roles (e.g. a teacher who is also a
  // parent); without an explicit viewerRole they see the union of them.
  const scopes: Prisma.AcademicEventWhereInput[] = [];
  const missing: string[] = [];
  if (hasRole(actor, 'Parent')) {
    const scope = await parentScope(actor, tenantId);
    if (scope) scopes.push(scope); else missing.push('Linked student not found.');
  }
  if (hasRole(actor, 'Teacher')) scopes.push(await teacherScope(actor, tenantId));
  if (hasRole(actor, 'Student')) {
    const scope = await studentScope(actor, tenantId);
    if (scope) scopes.push(scope); else missing.push('Student record not found.');
  }
  if (!scopes.length) throw new CalendarAccessError(missing[0] ?? 'Calendar access is unavailable for this account.');
  return scopes.length === 1 ? scopes[0] : { OR: scopes };
}
