import { decideAppointment, AppointmentDecisionError } from '../services/appointment-decisions';
import { Router, Response } from 'express';
import prisma from '../utils/db';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware } from '../middleware/auth';
import { getSmsSender } from '../utils/sms';
import { PushNotificationService } from '../services/push-notification';
import { recordNotification } from '../services/notification-records';
import { canAccessBranch, isTenantAdmin, managedBranchIds } from '../utils/access-control';

const router = Router();

async function linkedStudent(parentUserId: string, tenantId: string, studentId: string) {
  return prisma.student.findFirst({
    where: {
      id: studentId,
      user: { tenantId },
      studentParents: { some: { parent: { userId: parentUserId } } },
    },
    include: { user: true, enrollments: { where: { status: { in: ['ACTIVE', 'BLOCKED'] } }, include: { class: true } } },
  });
}

async function notifyAppointmentUsers(tenantId: string, userIds: string[], title: string, message: string) {
  const uniqueIds = [...new Set(userIds)];
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, phone: true },
  });
  const smsSender = getSmsSender();
  const results = await Promise.all(users.flatMap((user) => [
    PushNotificationService.sendPush(tenantId, user.id, title, message),
    recordNotification(prisma, {
      tenantId,
      userId: user.id,
      category: 'GENERAL',
      title,
      body: message,
      destination: 'appointments',
    }).then(() => ({ success: true })),
    ...(user.phone ? [smsSender.sendSms(user.phone, `${title}: ${message}`)] : []),
  ]));
  return results.every((result) => result.success);
}

router.post('/request', authMiddleware, async (req: TenantRequest, res: Response) => {
  const { studentId, teacherId: requestedTeacherId, branchId, target = 'TEACHER', scheduledTime, remarks, isGroup = false, participantIds = [] } = req.body;
  if (typeof isGroup !== 'boolean' || !Array.isArray(participantIds)
    || participantIds.some((id) => typeof id !== 'string' || !id.trim())) {
    return res.status(400).json({ error: 'isGroup must be a boolean and participantIds must be an array of non-empty user IDs.' });
  }
  if (!['TEACHER', 'BRANCH_ADMIN'].includes(target)) return res.status(400).json({ error: 'Appointment target must be TEACHER or BRANCH_ADMIN.' });
  if (!studentId || !scheduledTime || (target === 'TEACHER' && !requestedTeacherId) || (target === 'BRANCH_ADMIN' && !branchId)) {
    return res.status(400).json({ error: 'Student, appointment recipient, and preferred date and time are required.' });
  }
  try {
    const [student, tenant] = await Promise.all([
      linkedStudent(req.user!.id, req.tenantId!, studentId),
      prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { appointmentWindowHours: true } }),
    ]);
    if (!student || !tenant) return res.status(404).json({ error: 'Linked student was not found.' });
    const scheduledDate = new Date(scheduledTime);
    if (Number.isNaN(scheduledDate.getTime())) return res.status(422).json({ error: 'Choose a valid appointment date and time.' });
    const minimum = Date.now() + tenant.appointmentWindowHours * 60 * 60 * 1000;
    if (scheduledDate.getTime() < minimum) {
      return res.status(422).json({ error: `Appointments must be scheduled at least ${tenant.appointmentWindowHours} hours in advance.` });
    }

    const assignedTeacherIds = new Set(student.enrollments.map((enrollment) => enrollment.class.teacherId).filter((id): id is string => Boolean(id)));
    let teacherId = requestedTeacherId as string;
    let uniqueParticipants: string[];
    if (target === 'BRANCH_ADMIN') {
      if (!student.enrollments.some((enrollment) => enrollment.class.branchId === branchId)) {
        return res.status(403).json({ error: 'This child is not enrolled in the selected branch.' });
      }
      const assignedAdmin = await prisma.userRole.findFirst({
        where: { branchId, role: { name: 'Branch Admin' }, user: { tenantId: req.tenantId!, status: 'ACTIVE' } },
        select: { userId: true },
      });
      if (!assignedAdmin) return res.status(422).json({ error: 'No active Branch Admin is assigned to this branch.' });
      teacherId = assignedAdmin.userId;
      uniqueParticipants = [teacherId];
    } else {
      if (!assignedTeacherIds.has(teacherId)) return res.status(403).json({ error: 'You can only book with teachers assigned to this child.' });
      if (!isGroup && participantIds.some((id) => id !== teacherId)) {
        return res.status(403).json({ error: 'A single appointment may only include the selected teacher.' });
      }
      uniqueParticipants = isGroup ? [...new Set([teacherId, ...participantIds])] : [teacherId];
      if (uniqueParticipants.some((id) => !assignedTeacherIds.has(id))) {
        return res.status(403).json({ error: 'Every group participant must be assigned to this child.' });
      }
    }
    const approvals = Object.fromEntries(uniqueParticipants.map((id) => [id, 'PENDING']));
    const appointment = await prisma.appointment.create({
      data: {
        tenantId: req.tenantId!,
        studentId,
        requestedById: req.user!.id,
        teacherId,
        scheduledTime: scheduledDate,
        remarks: remarks?.trim() || null,
        isGroup: target === 'BRANCH_ADMIN' ? false : Boolean(isGroup),
        participantIds: uniqueParticipants,
        participantApprovals: approvals,
      },
      include: { teacher: { select: { firstName: true, lastName: true } } },
    });
    const branchIds = [...new Set(student.enrollments.map((enrollment) => enrollment.class.branchId))];
    const branchAdmins = await prisma.user.findMany({
      where: { tenantId: req.tenantId!, status: 'ACTIVE', userRoles: { some: { branchId: { in: branchIds }, role: { name: 'Branch Admin' } } } },
      select: { id: true },
    });
    const notificationDelivered = await notifyAppointmentUsers(req.tenantId!, [...uniqueParticipants, ...branchAdmins.map((admin) => admin.id)], 'Appointment requested', `A parent requested an appointment about ${student.user.firstName}.`);
    return res.status(201).json({ message: 'Appointment requested.', appointment, bookingWindowHours: tenant.appointmentWindowHours, notificationDelivered });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to request appointment.', details: error.message });
  }
});

router.post('/respond/:appointmentId', authMiddleware, async (req: TenantRequest, res: Response) => {
  try {
    const result = await decideAppointment(req.user!, req.params.appointmentId, req.body);
    let notificationDelivered = true;
    if (result.notify) {
      try {
        notificationDelivered = await notifyAppointmentUsers(req.tenantId!, [result.requestedById], 'Appointment updated', `Appointment status: ${result.appointment.status}.`);
      } catch {
        notificationDelivered = false;
      }
    }
    return res.json({ message: 'Appointment decision recorded.', appointment: result.appointment, notificationDelivered });
  } catch (error) {
    if (error instanceof AppointmentDecisionError) return res.status(error.status).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to respond to appointment.' });
  }
});

router.post('/parent-respond/:appointmentId', authMiddleware, async (req: TenantRequest, res: Response) => {
  const action = typeof req.body?.action === 'string' ? req.body.action : '';
  const remarks = typeof req.body?.remarks === 'string' ? req.body.remarks.trim() : '';
  if (!['ACCEPT_ALTERNATIVE', 'REJECT_ALTERNATIVE', 'PROPOSE_ALTERNATIVE'].includes(action)) {
    return res.status(400).json({ error: 'Action must accept, reject, or counter the proposed time.' });
  }
  if (remarks.length > 5000) return res.status(400).json({ error: 'Remarks must be 5000 characters or fewer.' });
  try {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: req.params.appointmentId,
        tenantId: req.tenantId!,
        requestedById: req.user!.id,
        student: { studentParents: { some: { parent: { userId: req.user!.id } } } },
      },
    });
    if (!appointment) return res.status(404).json({ error: 'Appointment negotiation was not found.' });
    if (!['REQUESTED', 'APPROVED', 'ALTERNATIVE_PROPOSED'].includes(appointment.status)) {
      return res.status(409).json({ error: 'This appointment is already closed.' });
    }
    const rootId = appointment.originalAppointmentId ?? appointment.id;
    const linkedAlternative = appointment.status === 'ALTERNATIVE_PROPOSED'
      ? await prisma.appointment.findFirst({ where: { tenantId: req.tenantId!, originalAppointmentId: appointment.id }, orderBy: { createdAt: 'desc' } })
      : appointment;
    if (action === 'ACCEPT_ALTERNATIVE') {
      if (!linkedAlternative || appointment.status !== 'ALTERNATIVE_PROPOSED') return res.status(409).json({ error: 'There is no alternative time to accept.' });
      const updated = await prisma.appointment.update({
        where: { id: linkedAlternative.id },
        data: { responseRemarks: remarks || 'Parent accepted the proposed time.' },
      });
      await notifyAppointmentUsers(req.tenantId!, (Array.isArray(updated.participantIds) ? updated.participantIds : [updated.teacherId]).filter((id): id is string => typeof id === 'string'), 'Alternative time accepted', 'The parent accepted the proposed appointment time.');
      return res.json({ message: 'Alternative time accepted. Waiting for final participant approval.', appointment: updated });
    }
    if (action === 'REJECT_ALTERNATIVE') {
      if (!linkedAlternative || appointment.status !== 'ALTERNATIVE_PROPOSED') return res.status(409).json({ error: 'There is no alternative time to reject.' });
      const updated = await prisma.appointment.update({ where: { id: linkedAlternative.id }, data: { status: 'REJECTED', responseRemarks: remarks || 'Parent rejected the proposed time.' } });
      await notifyAppointmentUsers(req.tenantId!, (Array.isArray(updated.participantIds) ? updated.participantIds : [updated.teacherId]).filter((id): id is string => typeof id === 'string'), 'Alternative time rejected', 'The parent rejected the proposed appointment time.');
      return res.json({ message: 'Alternative time rejected.', appointment: updated });
    }
    const alternativeDate = new Date(req.body?.alternativeSlot);
    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { appointmentWindowHours: true } });
    const minimum = Date.now() + (tenant?.appointmentWindowHours ?? 24) * 3600000;
    if (!Number.isFinite(alternativeDate.getTime()) || alternativeDate.getTime() < minimum) {
      return res.status(422).json({ error: `Choose a time at least ${tenant?.appointmentWindowHours ?? 24} hours in advance.` });
    }
    const participants = (Array.isArray(appointment.participantIds) ? appointment.participantIds : [appointment.teacherId]).filter((id): id is string => typeof id === 'string');
    const created = await prisma.$transaction(async (tx) => {
      await tx.appointment.update({ where: { id: appointment.id }, data: { status: 'ALTERNATIVE_PROPOSED', alternativeTime: alternativeDate, responseRemarks: remarks || 'Parent proposed another time.' } });
      return tx.appointment.create({ data: {
        tenantId: appointment.tenantId, studentId: appointment.studentId, requestedById: appointment.requestedById,
        teacherId: appointment.teacherId, scheduledTime: alternativeDate, status: 'REQUESTED', isGroup: appointment.isGroup,
        participantIds: participants, participantApprovals: Object.fromEntries(participants.map((id) => [id, 'PENDING'])),
        remarks: appointment.remarks, responseRemarks: remarks || 'Parent proposed another time.', originalAppointmentId: rootId,
      } });
    });
    await notifyAppointmentUsers(req.tenantId!, participants, 'New appointment time proposed', 'The parent proposed another appointment time.');
    return res.status(201).json({ message: 'Another time proposed.', appointment: created });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update appointment negotiation.', details: error.message });
  }
});
router.get('/branch', authMiddleware, async (req: TenantRequest, res: Response) => {
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId.trim() : '';
  if (!branchId || (!isTenantAdmin(req.user!) && !managedBranchIds(req.user!).includes(branchId))) {
    return res.status(403).json({ error: 'You cannot view appointments for this branch.' });
  }
  try {
    const appointments = await prisma.appointment.findMany({
      where: {
        tenantId: req.tenantId!, teacherId: req.user!.id,
        student: { enrollments: { some: { status: { in: ['ACTIVE', 'BLOCKED'] }, class: { branchId } } } },
      },
      include: { requestedBy: { select: { firstName: true, lastName: true, phone: true } }, student: { include: { user: { select: { firstName: true, lastName: true } } } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return res.json({ appointments });
  } catch {
    return res.status(500).json({ error: 'Failed to load branch appointments.' });
  }
});

router.get('/', authMiddleware, async (req: TenantRequest, res: Response) => {
  try {
    const parent = await prisma.parent.findFirst({ where: { userId: req.user!.id }, select: { id: true } });
    const where = parent
      ? { tenantId: req.tenantId!, student: { studentParents: { some: { parentId: parent.id } } } }
      : { tenantId: req.tenantId!, teacherId: req.user!.id };
    const appointments = await prisma.appointment.findMany({
      where,
      include: { teacher: { select: { firstName: true, lastName: true } }, student: { include: { user: { select: { firstName: true, lastName: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ appointments });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to load appointments.' });
  }
});

export default router;
