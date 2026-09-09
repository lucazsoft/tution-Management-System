import { Router, Response } from 'express';
import prisma from '../utils/db';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware, hasPermission } from '../middleware/auth';
import { LeaveType, LeaveStatus } from '@tms/types';
import { MockSmsSender } from '../utils/notifications';
import { PushNotificationService } from '../services/push-notification';
import { canAccessBranch, hasBranchPermission, isTenantAdmin } from '../utils/access-control';

const router = Router();

// Approval queues are read from the persisted leave workflow. Branch admins
// see requests for branches they manage; tenant admins see institution-wide
// records, including Long Sick requests awaiting Level 2 approval.
router.get('/', authMiddleware, async (req: TenantRequest, res: Response) => {
  try {
    const tenantAdmin = isTenantAdmin(req.user!);
    const branchIds = req.user!.roles
      .filter((role: any) => role.branchId && hasBranchPermission(req.user!, 'approve_leave_l1', role.branchId))
      .map((role: any) => role.branchId as string);
    if (!tenantAdmin && branchIds.length === 0) {
      return res.status(403).json({ error: 'You do not have access to a leave approval queue.' });
    }

    const requestedLevel = String(req.query.level || '').toUpperCase();
    const statusFilter: LeaveStatus[] | undefined = requestedLevel === 'L2'
      ? ['APPROVED_LEVEL1', 'APPROVED_LEVEL2', 'REJECTED']
      : requestedLevel === 'L1'
        ? ['PENDING', 'APPROVED_LEVEL1', 'APPROVED_LEVEL2', 'REJECTED']
        : undefined;
    const leaves = await prisma.leave.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(tenantAdmin ? {} : { branchId: { in: branchIds } }),
        ...(requestedLevel === 'L2' ? { leaveType: 'LONG_SICK' } : {}),
        ...(statusFilter ? { status: { in: statusFilter } } : {}),
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return res.json({
      leaves: leaves.map((leave) => ({
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
      })),
    });
  } catch {
    return res.status(500).json({ error: 'Failed to load leave requests.' });
  }
});

// 1. Submit a Leave / Early Out Request (Staff/Parent)
router.post(
  '/request',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const { leaveType, startDate, endDate, reason, branchId, studentId } = req.body;
    const requesterUserId = req.user!.id;
    const tenantId = req.tenantId!;
    const allowedLeaveTypes: LeaveType[] = ['CASUAL', 'SICK', 'LONG_SICK', 'EARLY_OUT'];

    if (!leaveType || !startDate || !endDate || !reason || !branchId) {
      return res.status(400).json({
        error: 'Missing required parameters: leaveType, startDate, endDate, reason, branchId.',
      });
    }
    if (!allowedLeaveTypes.includes(leaveType as LeaveType)) {
      return res.status(400).json({ error: 'Select a valid leave type.' });
    }
    const parsedStart = new Date(startDate);
    const parsedEnd = new Date(endDate);
    if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime()) || parsedEnd < parsedStart) {
      return res.status(400).json({ error: 'Leave end date must be on or after the start date.' });
    }
    const normalizedReason = String(reason).trim();
    if (!normalizedReason || normalizedReason.length > 2000) {
      return res.status(400).json({ error: 'Provide a reason no longer than 2,000 characters.' });
    }
    try {
      const [tenantPolicy, branch, targetStudent] = await Promise.all([
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
              select: {
                userId: true,
                enrollments: {
                  where: { status: { in: ['ACTIVE', 'BLOCKED'] }, class: { branchId } },
                  select: { class: { select: { teacherId: true } } },
                },
              },
            })
          : Promise.resolve(null),
      ]);
      if (!tenantPolicy || !branch) return res.status(404).json({ error: 'Tenant or branch not found.' });
      const branchAssignment = req.user!.roles.some((role: any) => role.branchId === branchId);
      if (studentId && !targetStudent) {
        return res.status(404).json({ error: 'Linked student was not found in this branch.' });
      }
      if (!studentId && !isTenantAdmin(req.user!) && !branchAssignment) {
        return res.status(403).json({ error: 'You cannot submit leave for this branch.' });
      }
      const leaveSubjectUserId = targetStudent?.userId ?? requesterUserId;
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
          leaveType: leaveType as LeaveType,
          startDate: parsedStart,
          endDate: parsedEnd,
          reason: normalizedReason,
          status: 'PENDING' as LeaveStatus,
          policySnapshot: {
            leavePolicy: tenantPolicy.leavePolicy ?? {},
            submittedAt: new Date().toISOString(),
          },
        },
      });

      // Notify the requester after persistence succeeds.
      await PushNotificationService.sendPush(
        tenantId,
        requesterUserId,
        'Leave Request Submitted',
        `Your request for ${leaveType} leave starting ${startDate} is pending approval.`
      );
      if (targetStudent) {
        const branchAdmins = await prisma.user.findMany({
          where: {
            tenantId,
            userRoles: { some: { branchId, role: { name: 'Branch Admin' } } },
          },
          select: { id: true },
        });
        const teacherIds = targetStudent.enrollments
          .map((enrollment) => enrollment.class.teacherId)
          .filter((id): id is string => Boolean(id));
        const recipients = [...new Set([...branchAdmins.map((admin) => admin.id), ...teacherIds])];
        await Promise.all(recipients.map((userId) => PushNotificationService.sendPush(
          tenantId,
          userId,
          'Student leave requested',
          `A linked parent requested ${leaveType} leave from ${startDate} to ${endDate}.`,
        )));
      }

      return res.status(201).json({ message: 'Leave request submitted successfully.', leave });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to submit leave request.' });
    }
  }
);

// 2. Approve/Reject Leave Request
router.post(
  '/approve/:leaveId',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const { leaveId } = req.params;
    const { action, remarks } = req.body; // action: APPROVE or REJECT
    const approverId = req.user!.id;

    if (!action || !['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ error: 'Missing required parameter: action (APPROVE or REJECT).' });
    }
    if (action === 'REJECT' && (!remarks || !String(remarks).trim())) {
      return res.status(400).json({ error: 'A rejection reason is required.' });
    }

    try {
      // Find current leave record to evaluate approval logic
      const leave = await prisma.leave.findFirst({ where: { id: leaveId, tenantId: req.tenantId! } });

      if (!leave) {
        return res.status(404).json({ error: 'Leave request not found.' });
      }

      let newStatus: LeaveStatus = 'PENDING';

      const tenantAdmin = isTenantAdmin(req.user!);
      const isBranchAdmin = !tenantAdmin && hasBranchPermission(req.user!, 'approve_leave_l1', leave.branchId);
      if (leave.leaveType === 'LONG_SICK') {
        // Long Sick: Branch Admin performs L1; Tenant Admin performs the final L2 decision.
        const validL1 = isBranchAdmin && leave.status === 'PENDING';
        const validL2 = tenantAdmin && leave.status === 'APPROVED_LEVEL1';
        if (!validL1 && !validL2) {
          return res.status(403).json({ error: 'Long Sick Leave requires Branch Admin L1, then Tenant Admin L2 approval.' });
        }
        newStatus = action === 'REJECT' ? 'REJECTED' : validL1 ? 'APPROVED_LEVEL1' : 'APPROVED_LEVEL2';
      } else {
        // Casual, sick, and early-out requests are branch decisions only; Tenant Admin is not an alternate approver.
        if (!isBranchAdmin || leave.status !== 'PENDING') {
          return res.status(403).json({ error: 'Only the assigned Branch Admin can finalize this leave type.' });
        }
        newStatus = action === 'REJECT' ? 'REJECTED' : 'APPROVED_LEVEL2';
      }

      const transition = await prisma.leave.updateMany({
          where: { id: leaveId, tenantId: req.tenantId!, status: leave.status },
          data: {
            status: newStatus,
            approvedBy: approverId,
            remarks,
          },
        });
      if (transition.count !== 1) {
        return res.status(409).json({ error: 'Leave request was already processed.' });
      }

      await PushNotificationService.sendPush(
        req.tenantId!,
        leave.userId,
        `Leave Request Update`,
        `Your request has been ${newStatus.toLowerCase()}.`
      );

      return res.status(200).json({
        message: `Leave request successfully updated. Status: ${newStatus}`,
        leave: {
          ...leave,
          status: newStatus,
          approvedBy: approverId,
          remarks,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Leave approval failed.', details: error.message });
    }
  }
);

// 3. Student Emergency Departure (Branch Admin)
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
      const emergencyLeave = await prisma.leave.create({
          data: {
            tenantId: req.tenantId!,
            branchId,
            userId: student.userId,
            leaveType: 'EARLY_OUT',
            startDate: departureTime ? new Date(departureTime) : new Date(),
            endDate: departureTime ? new Date(departureTime) : new Date(),
            reason: `Emergency Out: ${reason}${collectedBy?.trim() ? ` | Collected by: ${collectedBy.trim()}` : ''}`,
            status: 'APPROVED_LEVEL2',
            approvedBy: req.user!.id,
          },
        });

      // Dispatch urgent SMS notification to parents
      const smsSender = new MockSmsSender();
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
