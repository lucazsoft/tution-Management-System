import { Router, Response } from 'express';
import prisma from '../utils/db';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware } from '../middleware/auth';
import { PushNotificationService } from '../services/push-notification';
import { canAccessBranch, hasBranchPermission, hasRole } from '../utils/access-control';

const router = Router();

// 1. Submit Resource Log
router.post(
  '/log',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const { classroomId, itemsCondition, actionRequired, remarks, branchId } = req.body;
    const staffId = req.user!.id;

    if (!classroomId || !itemsCondition || typeof actionRequired !== 'boolean' || !branchId) {
      return res.status(400).json({
        error: 'Missing required parameters: classroomId, itemsCondition, actionRequired, branchId.',
      });
    }
    if (!hasBranchPermission(req.user!, 'manage_resource_tasks', branchId)) {
      return res.status(403).json({ error: 'You cannot manage resources for this branch.' });
    }

    try {
      const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId: req.tenantId! } });
      if (!branch) return res.status(404).json({ error: 'Branch not found in your institution.' });
      const defaultAssignee = actionRequired ? await prisma.userRole.findFirst({
        where: { branchId, user: { tenantId: req.tenantId! }, role: { name: 'Janitor' } },
        select: { userId: true },
      }) : null;
      if (actionRequired && !defaultAssignee) {
        return res.status(422).json({ error: 'No Janitor is assigned to this branch. Assign one before logging maintenance work.' });
      }
      const assignedStaffId = defaultAssignee?.userId;
      const tenantPolicy = actionRequired ? await prisma.tenant.findUniqueOrThrow({ where: { id: req.tenantId! } }) : null;
      const { resourceLog, maintenanceTask } = await prisma.$transaction(async tx => {
        const resourceLog = await tx.resourceLog.create({
          data: {
            branchId,
            classroomId,
            staffId,
            itemsCondition,
            actionRequired,
            remarks,
          },
        });

        const maintenanceTask = actionRequired && assignedStaffId && tenantPolicy
          ? await tx.maintenanceTask.create({
            data: {
              branchId,
              classroomId,
              description: `Issues logged by staff: ${remarks || 'None specified'}. Condition: ${JSON.stringify(itemsCondition)}`,
              assignedStaffId,
              status: 'PENDING',
              escalationDaysSnapshot: tenantPolicy.maintenanceEscalationDays,
            },
          }) : null;
        return { resourceLog, maintenanceTask };
      });

      let notificationDelivered = true;
      if (maintenanceTask && assignedStaffId) {
        try {
          await PushNotificationService.sendPush(
            req.tenantId!,
            assignedStaffId,
            'New Maintenance Task Auto-Assigned',
            `Room ${classroomId} requires check. Reason: ${remarks}`
          );
        } catch {
          // The records have committed. Do not invite a duplicate POST by
          // reporting a database failure when only notification failed.
          notificationDelivered = false;
        }
      }

      return res.status(201).json({
        message: 'Resource log successfully registered.',
        resourceLog,
        maintenanceTask,
        notificationDelivered,
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to log resource condition.', details: error.message });
    }
  }
);

// A deliberately narrow worker view: Janitors only receive tasks assigned to
// their authenticated identity and no student, finance, or HR records.
router.get('/my-tasks', authMiddleware, async (req: TenantRequest, res: Response) => {
  if (!hasRole(req.user!, 'Janitor')) {
    return res.status(403).json({ error: 'Only maintenance staff may access this task list.' });
  }

  try {
    const now = new Date();
    const candidates = await prisma.maintenanceTask.findMany({
      where: {
        assignedStaffId: req.user!.id,
        status: { not: 'COMPLETED' },
        escalatedAt: null,
        branch: { tenantId: req.tenantId! },
      },
      select: { id: true, createdAt: true, escalationDaysSnapshot: true },
    });
    const overdueIds = candidates
      .filter((task) => task.createdAt.getTime() + task.escalationDaysSnapshot * 86_400_000 < now.getTime())
      .map((task) => task.id);
    if (overdueIds.length) {
      await prisma.maintenanceTask.updateMany({
        where: { id: { in: overdueIds }, escalatedAt: null },
        data: { status: 'ESCALATED', escalatedAt: now },
      });
    }

    const tasks = await prisma.maintenanceTask.findMany({
      where: { assignedStaffId: req.user!.id, branch: { tenantId: req.tenantId! } },
      include: { branch: { select: { name: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    const completerIds = [...new Set(tasks.flatMap((task) => task.completedById ? [task.completedById] : []))];
    const completers = completerIds.length ? await prisma.user.findMany({
      where: { id: { in: completerIds }, tenantId: req.tenantId! },
      select: { id: true, firstName: true, lastName: true },
    }) : [];
    const names = new Map(completers.map((user) => [user.id, `${user.firstName} ${user.lastName}`.trim()]));

    return res.status(200).json({
      tasks: tasks.map((task) => {
        const dueAt = new Date(task.createdAt.getTime() + task.escalationDaysSnapshot * 86_400_000);
        return {
          id: task.id,
          classroomId: task.classroomId,
          location: task.branch.name,
          description: task.description,
          status: task.status,
          createdAt: task.createdAt,
          dueAt,
          overdue: task.status !== 'COMPLETED' && dueAt < now,
          escalatedAt: task.escalatedAt,
          completionTimestamp: task.completionTimestamp,
          completedBy: task.completedById ? { id: task.completedById, name: names.get(task.completedById) ?? 'Maintenance staff' } : null,
        };
      }),
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to retrieve assigned maintenance tasks.', details: error.message });
  }
});

// 2. Get Maintenance Tasks
router.get(
  '/tasks',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const branchId = req.query.branchId as string | undefined;
    if (!branchId) return res.status(400).json({ error: 'branchId is required.' });
    if (!canAccessBranch(req.user!, branchId) && !hasBranchPermission(req.user!, 'view_tasks', branchId)) {
      return res.status(403).json({ error: 'You cannot view tasks for this branch.' });
    }
    try {
      const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId: req.tenantId! } });
      if (!branch) return res.status(404).json({ error: 'Branch not found in your institution.' });
      const tasks = await prisma.maintenanceTask.findMany({
          where: { branchId },
        });
      return res.status(200).json({ tasks });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to retrieve tasks.' });
    }
  }
);

// 3. Complete Maintenance Task
router.post(
  '/tasks/complete/:taskId',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const { taskId } = req.params;

    try {
      const task = await prisma.maintenanceTask.findFirst({
        where: { id: taskId, branch: { tenantId: req.tenantId! } },
      });
      if (!task) return res.status(404).json({ error: 'Maintenance task not found.' });
      const ownsTask = task.assignedStaffId === req.user!.id;
      if (!ownsTask && !hasBranchPermission(req.user!, 'manage_resource_tasks', task.branchId)) {
        return res.status(403).json({ error: 'You cannot complete this maintenance task.' });
      }
      if (task.status === 'COMPLETED') {
        return res.status(409).json({ error: 'Maintenance task is already completed.' });
      }
      const completedAt = new Date();
      const transition = await prisma.maintenanceTask.updateMany({
          where: { id: taskId, status: { not: 'COMPLETED' }, branch: { tenantId: req.tenantId! } },
          data: {
            status: 'COMPLETED',
            completionTimestamp: completedAt,
            completedById: req.user!.id,
          },
        });
      if (transition.count !== 1) {
        return res.status(409).json({ error: 'Maintenance task was completed by another request.' });
      }

      return res.status(200).json({
        message: 'Maintenance task successfully resolved.',
        task: {
          id: taskId,
          status: 'COMPLETED',
          completionTimestamp: completedAt,
          completedBy: { id: req.user!.id, name: `${req.user!.firstName} ${req.user!.lastName}`.trim() },
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to complete task.', details: error.message });
    }
  }
);

export default router;
