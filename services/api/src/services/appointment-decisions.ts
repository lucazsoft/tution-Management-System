import { Prisma } from '@prisma/client';
import { UserPayload } from '@tms/types';
import prisma from '../utils/db';
import { isTenantAdmin, managedBranchIds } from '../utils/access-control';

export class AppointmentDecisionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function decideAppointment(actor: UserPayload, id: string, input: any) {
  const { action, alternativeSlot, scheduledTime, remarks } = input;
  if (!['APPROVE', 'REJECT', 'PROPOSE_ALTERNATIVE'].includes(action)) {
    throw new AppointmentDecisionError(400, 'Action must be APPROVE, REJECT, or PROPOSE_ALTERNATIVE.');
  }
  if (remarks != null && (typeof remarks !== 'string' || remarks.length > 5000)) {
    throw new AppointmentDecisionError(400, 'Remarks must be text of at most 5000 characters.');
  }
  return prisma.$transaction(async tx => {
    // Read only after obtaining the lock, so approvals are merged from the
    // latest committed JSON and terminal transitions cannot race.
    await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id" = ${id} AND "tenantId" = ${actor.tenantId} FOR UPDATE`;
    const appointment = await tx.appointment.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        student: { include: { enrollments: { where: { status: { in: ['ACTIVE', 'BLOCKED'] } }, include: { class: true } } } },
        teacher: { include: { userRoles: { include: { role: true } } } },
      },
    });
    if (!appointment) throw new AppointmentDecisionError(404, 'Appointment not found.');
    const teacherIds = new Set(appointment.student.enrollments.map(entry => entry.class.teacherId));
    const participants = appointment.isGroup && Array.isArray(appointment.participantIds)
      ? appointment.participantIds.filter((value): value is string => typeof value === 'string' && teacherIds.has(value))
      : [appointment.teacherId];
    const branches = appointment.student.enrollments.map(entry => entry.class.branchId);
    const staffAccess = isTenantAdmin(actor) || managedBranchIds(actor).some(branch => branches.includes(branch));
    if (!participants.includes(actor.id) && !staffAccess) throw new AppointmentDecisionError(403, 'You are not an invited appointment participant.');
    if (!['REQUESTED', 'APPROVED', 'ALTERNATIVE_PROPOSED'].includes(appointment.status)) {
      throw new AppointmentDecisionError(409, 'This appointment is already closed for decisions.');
    }
    const responseRemarks = remarks?.trim() || null;
    let updated;
    if (action === 'PROPOSE_ALTERNATIVE') {
      const date = new Date(alternativeSlot);
      if (!alternativeSlot || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
        throw new AppointmentDecisionError(422, 'A valid future alternative time is required.');
      }
      if (appointment.proposedById === actor.id && appointment.status === 'ALTERNATIVE_PROPOSED') {
        throw new AppointmentDecisionError(409, 'Wait for the parent to respond before proposing another time.');
      }
      if (appointment.status === 'ALTERNATIVE_PROPOSED' && appointment.proposedById !== appointment.requestedById) {
        throw new AppointmentDecisionError(409, 'The parent must respond to the proposed time before it can be changed again.');
      }
      updated = await tx.appointment.update({ where: { id }, data: {
        status: 'ALTERNATIVE_PROPOSED', alternativeTime: date, proposedById: actor.id,
        responseRemarks, participantApprovals: Object.fromEntries(participants.map(person => [person, 'PENDING'])),
      } });
    } else if (action === 'REJECT') {
      updated = await tx.appointment.update({ where: { id }, data: {
        status: 'REJECTED', responseRemarks, alternativeTime: null, proposedById: null,
      } });
    } else {
      if (appointment.status === 'ALTERNATIVE_PROPOSED') {
        if (appointment.proposedById === actor.id) {
          throw new AppointmentDecisionError(409, 'The parent must respond to your proposed time.');
        }
        if (appointment.proposedById !== appointment.requestedById) {
          throw new AppointmentDecisionError(409, 'The parent must respond to the proposed time before teachers can approve it.');
        }
        if (!appointment.alternativeTime) {
          throw new AppointmentDecisionError(409, 'The proposed meeting time is unavailable.');
        }
        if (!participants.includes(actor.id)) {
          throw new AppointmentDecisionError(403, 'Only invited teachers may approve their participation.');
        }
        const approvals = { ...((appointment.participantApprovals as Record<string, string> | null) ?? {}) };
        approvals[actor.id] = 'APPROVED';
        const allApproved = participants.every(person => approvals[person] === 'APPROVED');
        updated = await tx.appointment.update({ where: { id }, data: {
          ...(allApproved ? {
            scheduledTime: appointment.alternativeTime,
            alternativeTime: null,
            proposedById: null,
          } : {}),
          status: allApproved ? 'CONFIRMED' : 'APPROVED',
          responseRemarks,
          participantApprovals: approvals as Prisma.InputJsonObject,
        } });
        return { appointment: updated, notify: allApproved, requestedById: appointment.requestedById };
      }
      const branchRecipient = appointment.teacher.userRoles.some(role => role.role.name === 'Branch Admin' && branches.includes(role.branchId || ''));
      if (branchRecipient) {
        if (appointment.teacherId !== actor.id && !isTenantAdmin(actor)) throw new AppointmentDecisionError(403, 'Only the assigned Branch Admin may confirm this appointment.');
        const date = new Date(scheduledTime || alternativeSlot || appointment.scheduledTime);
        if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) throw new AppointmentDecisionError(422, 'Choose a valid future appointment date and time.');
        updated = await tx.appointment.update({ where: { id }, data: { scheduledTime: date, status: 'CONFIRMED', responseRemarks, alternativeTime: null, proposedById: null, participantApprovals: { [appointment.teacherId]: 'APPROVED' } } });
      } else {
        if (!participants.includes(actor.id)) throw new AppointmentDecisionError(403, 'Only invited teachers may approve their participation.');
        const approvals = { ...((appointment.participantApprovals as Record<string, string> | null) ?? {}) };
        // Retrying an individual approval before the group is complete is a no-op.
        if (approvals[actor.id] === 'APPROVED') return {
          appointment: await tx.appointment.findUniqueOrThrow({ where: { id } }),
          notify: false, requestedById: appointment.requestedById,
        };
        approvals[actor.id] = 'APPROVED';
        updated = await tx.appointment.update({ where: { id }, data: {
          participantApprovals: approvals as Prisma.InputJsonObject,
          status: participants.every(person => approvals[person] === 'APPROVED') ? 'CONFIRMED' : 'APPROVED', responseRemarks,
        } });
      }
    }
    return { appointment: updated, notify: true, requestedById: appointment.requestedById };
  });
}
