import { Router, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../utils/db';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware, hasPermission } from '../middleware/auth';
import { LeaveType, LeaveStatus, UserPayload } from '@tms/types';
import { getSmsSender } from '../utils/sms';
import { getPushSender } from '../utils/push';
import { canAccessBranch, hasBranchPermission, isTenantAdmin } from '../utils/access-control';
import { recordNotification } from '../services/notification-records';
import {
  countWorkingDays,
  isEscalated,
  loadWorkingDayContext,
  nepalDateKey,
  resolveLeavePolicy,
  routeLeave,
} from '../services/leave-routing';

const router = Router();

const LEAVE_TYPES: LeaveType[] = ['CASUAL', 'SICK', 'LONG_SICK', 'EARLY_OUT'];
const LEAVE_STATUSES: LeaveStatus[] = ['PENDING', 'APPROVED_LEVEL1', 'APPROVED_LEVEL2', 'REJECTED', 'CANCELLED'];
const MAX_LEAVE_SPAN_DAYS = 180;
const TYPE_LABEL: Record<string, string> = { CASUAL: 'casual', SICK: 'sick', LONG_SICK: 'long sick', EARLY_OUT: 'early-out' };

/** Tenant-level (L2) leave authority. */
function canDecideL2(actor: UserPayload): boolean {
  return isTenantAdmin(actor) || actor.roles.some((role) => role.branchId === null && role.permissions.includes('approve_leave_l2'));
}

/** Branch-level (L1) authority. Tenant Admins are deliberately not L1 approvers. */
function isL1Approver(actor: UserPayload, branchId: string): boolean {
  return !isTenantAdmin(actor) && hasBranchPermission(actor, 'approve_leave_l1', branchId);
}

function l1BranchIds(actor: UserPayload): string[] {
  return actor.roles
    .filter((role) => role.branchId && hasBranchPermission(actor, 'approve_leave_l1', role.branchId))
    .map((role) => role.branchId as string);
}

type LeaveRow = Prisma.LeaveGetPayload<{ include: typeof LEAVE_INCLUDE }>;
const LEAVE_INCLUDE = {
  user: { select: { firstName: true, lastName: true } },
  branch: { select: { name: true } },
  decisions: {
    orderBy: { createdAt: 'asc' as const },
    include: { actor: { select: { firstName: true, lastName: true } } },
  },
} satisfies Prisma.LeaveInclude;

/** What the given actor may do with a leave right now. */
function nextStepFor(actor: UserPayload, leave: Pick<LeaveRow, 'status' | 'branchId' | 'subjectType' | 'escalatesAt'>, now = new Date()) {
  if (leave.status === 'PENDING') {
    if (isL1Approver(actor, leave.branchId)) return { canAct: true, level: 1 as const, escalated: false };
    if (leave.subjectType === 'STAFF' && canDecideL2(actor) && isEscalated(leave, now)) {
      return { canAct: true, level: 2 as const, escalated: true };
    }
  }
  if (leave.status === 'APPROVED_LEVEL1' && canDecideL2(actor)) return { canAct: true, level: 2 as const, escalated: false };
  return { canAct: false, level: null, escalated: false };
}

function present(actor: UserPayload, leave: LeaveRow, now = new Date()) {
  return {
    id: leave.id,
    staffName: `${leave.user.firstName} ${leave.user.lastName}`.trim(),
    branchId: leave.branchId,
    branchName: leave.branch.name,
    leaveType: leave.leaveType,
    startDate: leave.startDate,
    endDate: leave.endDate,
    reason: leave.reason,
    status: leave.status,
    remarks: leave.remarks,
    approvedBy: leave.approvedBy,
    createdAt: leave.createdAt,
    subjectType: leave.subjectType,
    days: leave.days,
    requiredLevel: leave.requiredLevel,
    escalatesAt: leave.escalatesAt,
    escalated: leave.subjectType === 'STAFF' && isEscalated(leave, now),
    canAct: nextStepFor(actor, leave, now).canAct,
    decisions: leave.decisions.map((decision) => ({
      level: decision.level,
      action: decision.action,
      actorName: `${decision.actor.firstName} ${decision.actor.lastName}`.trim(),
      remarks: decision.remarks,
      escalated: decision.escalated,
      createdAt: decision.createdAt,
    })),
  };
}

function statusSentence(status: LeaveStatus, leaveType: string): string {
  const label = TYPE_LABEL[leaveType] ?? 'leave';
  if (status === 'APPROVED_LEVEL1') return `Your ${label} leave was approved by the Branch Admin and is awaiting final approval from the Tenant Admin.`;
  if (status === 'APPROVED_LEVEL2') return `Your ${label} leave has been approved.`;
  if (status === 'REJECTED') return `Your ${label} leave request was rejected.`;
  if (status === 'CANCELLED') return `Your ${label} leave request was cancelled.`;
  return `Your ${label} leave request is pending approval.`;
}

async function notify(userIds: Iterable<string>, input: { tenantId: string; branchId: string; title: string; body: string; entityId: string }) {
  await Promise.all([...new Set(userIds)].map(async (userId) => {
    await getPushSender().sendPush(userId, input.title, input.body);
    // Persistent inbox record. Fail-open: never rolls back the saved leave.
    await recordNotification(prisma, { ...input, userId, category: 'LEAVE', destination: 'leave' });
  }));
}

async function tenantAdminIds(tenantId: string): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { tenantId, status: 'ACTIVE', userRoles: { some: { role: { name: 'Tenant Admin' } } } },
    select: { id: true },
  });
  return admins.map((admin) => admin.id);
}

// Approval queues. Branch admins see their branches; tenant admins see the whole institution.
// Query: scope=awaiting-me | all (default all), level=L1|L2 (legacy), branchId, status, leaveType, subjectType, from, to.
router.get('/', authMiddleware, async (req: TenantRequest, res: Response) => {
  try {
    const actor = req.user!;
    const tenantAdmin = canDecideL2(actor);
    const branchIds = l1BranchIds(actor);
    if (!tenantAdmin && branchIds.length === 0) {
      return res.status(403).json({ error: 'You do not have access to a leave approval queue.' });
    }
    const now = new Date();
    const query = req.query as Record<string, string | undefined>;
    const and: Prisma.LeaveWhereInput[] = [{ tenantId: req.tenantId! }];
    if (!tenantAdmin) and.push({ branchId: { in: branchIds } });

    const level = String(query.level || '').toUpperCase();
    if (level === 'L2') and.push({ requiredLevel: 2, status: { in: ['APPROVED_LEVEL1', 'APPROVED_LEVEL2', 'REJECTED'] } });
    else if (level === 'L1') and.push({ status: { in: ['PENDING', 'APPROVED_LEVEL1', 'APPROVED_LEVEL2', 'REJECTED', 'CANCELLED'] } });

    if (query.scope === 'awaiting-me') {
      and.push(tenantAdmin
        ? { OR: [{ status: 'APPROVED_LEVEL1' }, { status: 'PENDING', subjectType: 'STAFF', escalatesAt: { lte: now } }] }
        : { status: 'PENDING' });
    }
    if (query.branchId) and.push({ branchId: query.branchId });
    if (query.status && LEAVE_STATUSES.includes(query.status as LeaveStatus)) and.push({ status: query.status as LeaveStatus });
    if (query.leaveType && LEAVE_TYPES.includes(query.leaveType as LeaveType)) and.push({ leaveType: query.leaveType as LeaveType });
    if (query.subjectType === 'STAFF' || query.subjectType === 'STUDENT') and.push({ subjectType: query.subjectType });
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && !Number.isNaN(from.getTime())) and.push({ endDate: { gte: from } });
    if (to && !Number.isNaN(to.getTime())) and.push({ startDate: { lte: to } });

    const leaves = await prisma.leave.findMany({
      where: { AND: and },
      include: LEAVE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return res.json({ leaves: leaves.map((leave) => present(actor, leave, now)) });
  } catch {
    return res.status(500).json({ error: 'Failed to load leave requests.' });
  }
});

// 1. Submit a Leave / Early Out Request (Staff/Parent/Student)
router.post('/request', authMiddleware, async (req: TenantRequest, res: Response) => {
  const { leaveType, startDate, endDate, reason, branchId, studentId } = req.body;
  const requesterUserId = req.user!.id;
  const tenantId = req.tenantId!;

  if (!leaveType || !startDate || !endDate || !reason || !branchId) {
    return res.status(400).json({
      error: 'Missing required parameters: leaveType, startDate, endDate, reason, branchId.',
    });
  }
  if (!LEAVE_TYPES.includes(leaveType as LeaveType)) {
    return res.status(400).json({ error: 'Select a valid leave type.' });
  }
  const parsedStart = new Date(startDate);
  const parsedEnd = new Date(endDate);
  if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime()) || parsedEnd < parsedStart) {
    return res.status(400).json({ error: 'Leave end date must be on or after the start date.' });
  }
  const now = new Date();
  if (nepalDateKey(parsedStart) < nepalDateKey(now)) {
    return res.status(400).json({ error: 'Leave start date cannot be in the past.' });
  }
  if ((parsedEnd.getTime() - parsedStart.getTime()) / 86_400_000 >= MAX_LEAVE_SPAN_DAYS) {
    return res.status(400).json({ error: `A single leave request cannot span more than ${MAX_LEAVE_SPAN_DAYS} days.` });
  }
  const normalizedReason = String(reason).trim();
  if (!normalizedReason || normalizedReason.length > 2000) {
    return res.status(400).json({ error: 'Provide a reason no longer than 2,000 characters.' });
  }
  try {
    const studentSelect = {
      userId: true,
      enrollments: {
        where: { status: { in: ['ACTIVE', 'BLOCKED'] as Array<'ACTIVE' | 'BLOCKED'> }, class: { branchId } },
        select: { class: { select: { teacherId: true } } },
      },
    } as const;
    const [tenantPolicy, branch, targetStudent, selfStudent] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.branch.findFirst({ where: { id: branchId, tenantId } }),
      studentId
        ? prisma.student.findFirst({
            where: {
              id: studentId,
              user: { tenantId },
              enrollments: { some: { class: { branchId }, status: { in: ['ACTIVE', 'BLOCKED'] } } },
              studentParents: { some: { parent: { userId: requesterUserId } } },
            },
            select: studentSelect,
          })
        : Promise.resolve(null),
      !studentId
        ? prisma.student.findFirst({
            where: {
              userId: requesterUserId,
              user: { tenantId },
              enrollments: { some: { class: { branchId }, status: { in: ['ACTIVE', 'BLOCKED'] } } },
            },
            select: studentSelect,
          })
        : Promise.resolve(null),
    ]);
    if (!tenantPolicy || !branch) return res.status(404).json({ error: 'Tenant or branch not found.' });
    const branchAssignment = req.user!.roles.some((role: any) => role.branchId === branchId);
    if (studentId && !targetStudent) {
      return res.status(404).json({ error: 'Linked student was not found in this branch.' });
    }
    if (!studentId && !selfStudent && !isTenantAdmin(req.user!) && !branchAssignment) {
      return res.status(403).json({ error: 'You cannot submit leave for this branch.' });
    }
    const leaveStudent = targetStudent ?? selfStudent;
    const leaveSubjectUserId = leaveStudent?.userId ?? requesterUserId;
    const subjectType = leaveStudent ? 'STUDENT' as const : 'STAFF' as const;

    const policy = resolveLeavePolicy(tenantPolicy.leavePolicy);
    const context = await loadWorkingDayContext(prisma, {
      tenantId, branchId, userId: leaveSubjectUserId, start: parsedStart, end: parsedEnd,
    });
    // Students are counted against the branch calendar only, not a teaching timetable.
    const days = countWorkingDays({
      start: parsedStart,
      end: parsedEnd,
      classes: subjectType === 'STAFF' ? context.classes : [],
      holidays: context.holidays,
    });
    if (days === 0) {
      return res.status(400).json({
        error: subjectType === 'STAFF'
          ? 'These dates have no working days on your timetable (Saturdays and holidays are already off).'
          : 'These dates fall entirely on Saturdays or holidays.',
      });
    }
    const routing = routeLeave({ subjectType, leaveType, days, policy, submittedAt: now });

    const overlapping = await prisma.leave.findFirst({
      where: {
        tenantId,
        branchId,
        userId: leaveSubjectUserId,
        status: { in: ['PENDING', 'APPROVED_LEVEL1', 'APPROVED_LEVEL2'] },
        startDate: { lte: parsedEnd },
        endDate: { gte: parsedStart },
      },
      select: { id: true },
    });
    if (overlapping) return res.status(409).json({ error: 'A pending or approved leave request already covers these dates.' });
    const leave = await prisma.leave.create({
      data: {
        tenantId,
        branchId,
        userId: leaveSubjectUserId,
        requestedById: requesterUserId,
        leaveType: leaveType as LeaveType,
        startDate: parsedStart,
        endDate: parsedEnd,
        reason: normalizedReason,
        status: 'PENDING',
        subjectType,
        days,
        requiredLevel: routing.requiredLevel,
        escalatesAt: routing.escalatesAt,
        policySnapshot: {
          leavePolicy: (tenantPolicy.leavePolicy ?? {}) as Prisma.InputJsonValue,
          resolvedPolicy: { ...policy },
          submittedAt: now.toISOString(),
        },
      },
    });

    const label = TYPE_LABEL[leaveType] ?? 'leave';
    const approvals = routing.requiredLevel === 2 ? 'Branch Admin and then Tenant Admin approval' : 'Branch Admin approval';
    await notify([requesterUserId], {
      tenantId, branchId, entityId: leave.id,
      title: 'Leave Request Submitted',
      body: `Your ${label} leave (${days} working day${days === 1 ? '' : 's'}) starting ${startDate} needs ${approvals}.`,
    });

    const branchAdmins = await prisma.user.findMany({
      where: { tenantId, status: 'ACTIVE', userRoles: { some: { branchId, role: { name: 'Branch Admin' } } } },
      select: { id: true },
    });
    const teacherIds = (leaveStudent?.enrollments ?? [])
      .map((enrollment) => enrollment.class.teacherId)
      .filter((id): id is string => Boolean(id));
    const reviewers = [...branchAdmins.map((admin) => admin.id), ...teacherIds].filter((id) => id !== requesterUserId);
    await Promise.all([...new Set(reviewers)].map((userId) => getPushSender().sendPush(
      userId,
      leaveStudent ? 'Student leave requested' : 'Staff leave requested',
      `${leaveStudent ? (targetStudent ? 'A linked parent' : 'A student') : 'A staff member'} requested ${label} leave from ${startDate} to ${endDate}.`,
    )));

    return res.status(201).json({ message: 'Leave request submitted successfully.', leave });
  } catch {
    return res.status(500).json({ error: 'Failed to submit leave request.' });
  }
});

// 2. Approve/Reject Leave Request
router.post('/approve/:leaveId', authMiddleware, async (req: TenantRequest, res: Response) => {
  const { leaveId } = req.params;
  const { action } = req.body; // action: APPROVE or REJECT
  const remarks = typeof req.body.remarks === 'string' ? req.body.remarks.trim().slice(0, 2000) || null : null;
  const actor = req.user!;

  if (!action || !['APPROVE', 'REJECT'].includes(action)) {
    return res.status(400).json({ error: 'Missing required parameter: action (APPROVE or REJECT).' });
  }
  if (action === 'REJECT' && !remarks) {
    return res.status(400).json({ error: 'A rejection reason is required.' });
  }

  try {
    const leave = await prisma.leave.findFirst({ where: { id: leaveId, tenantId: req.tenantId! } });
    if (!leave) return res.status(404).json({ error: 'Leave request not found.' });
    if (!['PENDING', 'APPROVED_LEVEL1'].includes(leave.status)) {
      return res.status(409).json({ error: 'Leave request was already processed.' });
    }

    const step = nextStepFor(actor, leave);
    if (!step.canAct) {
      if (leave.status === 'PENDING' && canDecideL2(actor)) {
        return res.status(403).json({
          error: leave.subjectType === 'STUDENT'
            ? 'Student leave is decided by the Branch Admin.'
            : 'The Branch Admin reviews this request first. It reaches you after their approval, or if they have not answered within 48 hours.',
        });
      }
      return res.status(403).json({
        error: leave.status === 'APPROVED_LEVEL1'
          ? 'This request is awaiting final approval from the Tenant Admin.'
          : 'Only the assigned Branch Admin can decide this request.',
      });
    }

    const newStatus: LeaveStatus = action === 'REJECT'
      ? 'REJECTED'
      : step.level === 1 && leave.requiredLevel === 2 ? 'APPROVED_LEVEL1' : 'APPROVED_LEVEL2';

    const updated = await prisma.$transaction(async (tx) => {
      const transition = await tx.leave.updateMany({
        where: { id: leaveId, tenantId: req.tenantId!, status: leave.status },
        data: { status: newStatus, approvedBy: actor.id, remarks },
      });
      if (transition.count !== 1) return false;
      await tx.leaveDecision.create({
        data: { leaveId, level: step.level!, action, actorId: actor.id, remarks, escalated: step.escalated },
      });
      return true;
    });
    if (!updated) return res.status(409).json({ error: 'Leave request was already processed.' });

    await notify([leave.userId, leave.requestedById ?? leave.userId], {
      tenantId: req.tenantId!, branchId: leave.branchId, entityId: leave.id,
      title: 'Leave Request Update',
      body: statusSentence(newStatus, leave.leaveType) + (newStatus === 'REJECTED' && remarks ? ` Reason: ${remarks}` : ''),
    });
    if (newStatus === 'APPROVED_LEVEL1') {
      await notify(await tenantAdminIds(req.tenantId!), {
        tenantId: req.tenantId!, branchId: leave.branchId, entityId: leave.id,
        title: 'Leave awaiting your approval',
        body: `A ${leave.days}-day ${TYPE_LABEL[leave.leaveType] ?? ''} leave was approved by the Branch Admin and needs your final decision.`,
      });
    }

    return res.status(200).json({
      message: `Leave request successfully updated. Status: ${newStatus}`,
      leave: { ...leave, status: newStatus, approvedBy: actor.id, remarks },
    });
  } catch {
    return res.status(500).json({ error: 'Leave approval failed.' });
  }
});

// 3. Withdraw a request that has not been finally decided (the person on leave or whoever submitted it).
router.post('/:leaveId/cancel', authMiddleware, async (req: TenantRequest, res: Response) => {
  const actor = req.user!;
  try {
    const leave = await prisma.leave.findFirst({ where: { id: req.params.leaveId, tenantId: req.tenantId! } });
    if (!leave || (leave.userId !== actor.id && leave.requestedById !== actor.id)) {
      return res.status(404).json({ error: 'Leave request not found.' });
    }
    if (!['PENDING', 'APPROVED_LEVEL1'].includes(leave.status)) {
      return res.status(409).json({ error: 'Only requests still awaiting approval can be cancelled.' });
    }
    const cancelled = await prisma.$transaction(async (tx) => {
      const transition = await tx.leave.updateMany({
        where: { id: leave.id, tenantId: req.tenantId!, status: leave.status },
        data: { status: 'CANCELLED' },
      });
      if (transition.count !== 1) return false;
      await tx.leaveDecision.create({
        data: { leaveId: leave.id, level: leave.status === 'PENDING' ? 1 : 2, action: 'CANCEL', actorId: actor.id },
      });
      return true;
    });
    if (!cancelled) return res.status(409).json({ error: 'Leave request was already processed.' });
    return res.json({ message: 'Leave request cancelled.', leave: { ...leave, status: 'CANCELLED' } });
  } catch {
    return res.status(500).json({ error: 'Failed to cancel leave request.' });
  }
});

/**
 * Alerts Tenant Admins once about staff requests their branch left unanswered.
 * The escalation itself is time-based (see `escalatesAt`), so requests become
 * actionable even if this never runs; this only sends the alert.
 */
export async function notifyEscalatedLeaves(tenantId: string, now = new Date()): Promise<number> {
  const due = await prisma.leave.findMany({
    where: { tenantId, status: 'PENDING', subjectType: 'STAFF', escalatesAt: { lte: now }, escalationNotifiedAt: null },
    select: { id: true, branchId: true, days: true, leaveType: true },
  });
  if (!due.length) return 0;
  const admins = await tenantAdminIds(tenantId);
  for (const leave of due) {
    const claimed = await prisma.leave.updateMany({
      where: { id: leave.id, escalationNotifiedAt: null },
      data: { escalationNotifiedAt: now },
    });
    if (claimed.count !== 1) continue;
    await notify(admins, {
      tenantId, branchId: leave.branchId, entityId: leave.id,
      title: 'Leave escalated to you',
      body: `A ${leave.days}-day ${TYPE_LABEL[leave.leaveType] ?? ''} leave has had no branch decision for 48 hours. You can now decide it.`,
    });
  }
  return due.length;
}

// 4. Student Emergency Departure (Branch Admin)
router.post(
  '/emergency-out',
  authMiddleware,
  hasPermission('manage_student_exceptions'),
  async (req: TenantRequest, res: Response) => {
    const { studentId, reason, branchId, collectedBy, departureTime } = req.body;

    if (!studentId || !reason || !branchId) {
      return res.status(400).json({ error: 'Missing required parameters: studentId, reason, branchId.' });
    }
    if (!canAccessBranch(req.user!, branchId)) {
      return res.status(403).json({ error: 'You cannot approve emergency departure for this branch.' });
    }

    try {
      const student = await prisma.student.findFirst({
        where: {
          id: studentId,
          user: { tenantId: req.tenantId!, userRoles: { some: { branchId } } },
        },
      });
      if (!student) return res.status(404).json({ error: 'Student not found in your institution.' });
      const at = departureTime ? new Date(departureTime) : new Date();
      const emergencyLeave = await prisma.leave.create({
        data: {
          tenantId: req.tenantId!,
          branchId,
          userId: student.userId,
          requestedById: req.user!.id,
          leaveType: 'EARLY_OUT',
          startDate: at,
          endDate: at,
          reason: `Emergency Out: ${reason}${collectedBy?.trim() ? ` | Collected by: ${collectedBy.trim()}` : ''}`,
          status: 'APPROVED_LEVEL2',
          approvedBy: req.user!.id,
          subjectType: 'STUDENT',
          days: 1,
          requiredLevel: 1,
          decisions: { create: { level: 1, action: 'APPROVE', actorId: req.user!.id, remarks: 'Emergency departure' } },
        },
      });

      // Dispatch urgent SMS notification to parents
      const smsSender = getSmsSender();
      await smsSender.sendSms(
        '98510XXXXX',
        `ALERT: Emergency departure logged for your child. Reason: ${reason}. Please contact the center.`
      );

      return res.status(201).json({
        message: 'Emergency departure successfully registered. Parents notified immediately.',
        leave: emergencyLeave,
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to process emergency departure.', details: error.message });
    }
  }
);

export default router;
