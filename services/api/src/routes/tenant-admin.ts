import { Router, Response } from 'express';
import prisma from '../utils/db';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware } from '../middleware/auth';
import { isTenantAdmin } from '../utils/access-control';
import { isInvoiceOverdue } from '../utils/billing-rules';

const router = Router();

// Production Tenant Admin surface. This must remain independent from the
// development-only platform onboarding router.
router.get('/dashboard', authMiddleware, async (req: TenantRequest, res: Response) => {
  if (!isTenantAdmin(req.user!)) {
    return res.status(403).json({ error: 'Only the Tenant Admin may view institution-wide dashboard summaries.' });
  }

  try {
    const now = new Date();
    const [studentCount, teacherCount, overdueInvoices, pendingLeaves, pendingAtBranches, branches] = await Promise.all([
      prisma.student.count({ where: { user: { tenantId: req.tenantId!, status: 'ACTIVE' } } }),
      prisma.user.count({
        where: {
          tenantId: req.tenantId!,
          status: 'ACTIVE',
          userRoles: { some: { role: { name: 'Teacher' } } },
        },
      }),
      prisma.invoice.findMany({
        where: { tenantId: req.tenantId!, status: { in: ['UNPAID', 'OVERDUE'] } },
        select: { netPayable: true, status: true, dueDate: true },
      }),
      // Only what the Tenant Admin can act on: L2 approvals plus staff requests a branch left unanswered.
      prisma.leave.count({
        where: {
          tenantId: req.tenantId!,
          OR: [
            { status: 'APPROVED_LEVEL1' },
            { status: 'PENDING', subjectType: 'STAFF', escalatesAt: { lte: now } },
          ],
        },
      }),
      prisma.leave.count({
        where: {
          tenantId: req.tenantId!,
          status: 'PENDING',
          NOT: { subjectType: 'STAFF', escalatesAt: { lte: now } },
        },
      }),
      prisma.branch.findMany({
        where: { tenantId: req.tenantId! },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
      }),
    ]);

    const branchSummary = await Promise.all(
      branches.map(async (branch) => {
        const [activeStudents, activeStaff] = await Promise.all([
          prisma.user.count({
            where: {
              tenantId: req.tenantId!,
              status: 'ACTIVE',
              student: { isNot: null },
              userRoles: { some: { branchId: branch.id, role: { name: 'Student' } } },
            },
          }),
          prisma.user.count({
            where: {
              tenantId: req.tenantId!,
              status: 'ACTIVE',
              staffRecord: { isNot: null },
              userRoles: { some: { branchId: branch.id, role: { name: { not: 'Student' } } } },
            },
          }),
        ]);
        return { branchId: branch.id, branchName: branch.name, activeStudents, staffCount: activeStaff };
      }),
    );

    return res.json({
      activeStudentsCount: studentCount,
      activeTeachersCount: teacherCount,
      totalOverdueAmountNpr: overdueInvoices
        .filter((invoice) => isInvoiceOverdue(invoice.status, invoice.dueDate))
        .reduce((sum, invoice) => sum + Number(invoice.netPayable), 0),
      pendingLeaveRequestsCount: pendingLeaves,
      leavesPendingAtBranchesCount: pendingAtBranches,
      branchSummary,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to retrieve dashboard summaries.' });
  }
});

export default router;
