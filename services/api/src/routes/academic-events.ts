import { calendarAccessWhere, CalendarAccessError, CALENDAR_AUDIENCES } from '../services/calendar-access';
import { Router, Response } from 'express';
import prisma from '../utils/db';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware, hasPermission } from '../middleware/auth';
import { EventType } from '@tms/types';
import { canAccessBranch, isTenantAdmin, managedBranchIds } from '../utils/access-control';

const router = Router();

// 1. Create a new Academic Event (Tenant Admin / Branch Admin)
router.post(
  '/',
  authMiddleware,
  hasPermission('manage_branch_calendar'),
  async (req: TenantRequest, res: Response) => {
    const { title, description, eventType, startDate, endDate, branchId, classId } = req.body;
    // Institution calendar entries are shared by default. Administrators may
    // still record a narrower audience for reporting, but mobile calendars use
    // one canonical institution timeline.
    const audience = req.body.audience ?? 'ALL';
    if (!CALENDAR_AUDIENCES.includes(audience) || !['HOLIDAY', 'EXAM', 'EVENT', 'FEE_DUE'].includes(eventType)) return res.status(400).json({ error: 'Invalid event type or audience.' });
    if (!Number.isFinite(Date.parse(startDate)) || !Number.isFinite(Date.parse(endDate)) || Date.parse(endDate) < Date.parse(startDate)) return res.status(400).json({ error: 'Choose valid start and end dates.' });

    if (!title || !eventType || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required parameters: title, eventType, startDate, endDate.',
      });
    }
    if (!isTenantAdmin(req.user!) && (!branchId || !canAccessBranch(req.user!, branchId))) {
      return res.status(403).json({ error: 'Branch Admins may only create events for their assigned branch.' });
    }

    try {
      if (branchId) {
        const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId: req.tenantId! } });
        if (!branch) return res.status(404).json({ error: 'Branch not found in your institution.' });
      }
      const targetClass = classId ? await prisma.class.findFirst({ where: { id: classId, archivedAt: null, course: { tenantId: req.tenantId! } } }) : null;
      if (classId && (!targetClass || (branchId && targetClass.branchId !== branchId) || !canAccessBranch(req.user!, targetClass.branchId))) return res.status(403).json({ error: 'Class access denied.' });
      const event = await prisma.academicEvent.create({
        data: {
          tenantId: req.tenantId!,
          branchId: targetClass?.branchId || branchId || null,
          classId: targetClass?.id || null,
          audience,
          title,
          description,
          eventType: eventType as EventType,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
        },
      });

      return res.status(201).json({ message: 'Academic event created successfully.', event });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to create academic event.' });
    }
  }
);

// 2. Retrieve all calendar events (filtered by tenant and branch)
router.get(
  '/',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const branchId = req.query.branchId as string | undefined;

    try {
      const where = await calendarAccessWhere(req.user!, req.tenantId!, { branchId, viewerRole: typeof req.query.viewerRole === 'string' ? req.query.viewerRole : undefined, studentId: typeof req.query.studentId === 'string' ? req.query.studentId : undefined });
      const events = await prisma.academicEvent.findMany({ where, include: { branch: { select: { name: true } }, class: { select: { name: true } } }, orderBy: { startDate: 'asc' } });
      return res.status(200).json({ events });
    } catch (error: any) {
      if (error instanceof CalendarAccessError) return res.status(403).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to load academic events.' });
    }
  }
);

// Administrator targeting options are restricted to managed classes.
router.get('/options', authMiddleware, hasPermission('manage_branch_calendar'), async (req: TenantRequest, res: Response) => {
  try {
    const classes = await prisma.class.findMany({ where: { archivedAt: null, course: { tenantId: req.tenantId! }, ...(isTenantAdmin(req.user!) ? {} : { branchId: { in: managedBranchIds(req.user!) } }) }, select: { id: true, name: true, branchId: true, branch: { select: { name: true } } }, orderBy: { name: 'asc' } });
    return res.json({ classes });
  } catch { return res.status(500).json({ error: 'Could not load event targeting options.' }); }
});

router.patch('/:id/audience', authMiddleware, hasPermission('manage_branch_calendar'), async (req: TenantRequest, res: Response) => {
  const audience = req.body.audience;
  if (!CALENDAR_AUDIENCES.includes(audience)) return res.status(400).json({ error: 'Invalid audience.' });
  try {
    const result = await prisma.academicEvent.updateMany({ where: { id: req.params.id, tenantId: req.tenantId!, ...(isTenantAdmin(req.user!) ? {} : { branchId: { in: managedBranchIds(req.user!) } }) }, data: { audience } });
    if (!result.count) return res.status(404).json({ error: 'Editable event not found.' });
    return res.json({ updated: true });
  } catch { return res.status(500).json({ error: 'Could not update event audience.' }); }
});

// 3. Payment Calendar: Retrieve fee deadlines, color-coded and complete with invoice + Nepal Pay QR
router.get(
  '/payments',
  authMiddleware,
  hasPermission('view_billing'),
  async (req: TenantRequest, res: Response) => {
    const studentId = req.query.studentId as string;

    try {
      // Find invoices for student or tenant
      const invoices = await prisma.invoice.findMany({
        where: {
          tenantId: req.tenantId!,
          studentId: studentId || undefined,
        },
      });

      const paymentEvents = invoices.map(invoice => {
        const dueDate = new Date(invoice.dueDate);
        const today = new Date();
        const diffTime = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let urgencyColor = 'green'; // Upcoming
        if (invoice.status === 'PAID') {
          urgencyColor = 'green';
        } else if (diffDays < 0) {
          urgencyColor = 'red'; // Overdue
        } else if (diffDays <= 3) {
          urgencyColor = 'amber'; // Due soon
        }

        return {
          invoiceId: invoice.id,
          studentId: invoice.studentId,
          dueDate: invoice.dueDate,
          amount: invoice.netPayable,
          status: invoice.status,
          urgencyColor,
          nepalPayQrCode: invoice.nepalPayQrCode,
        };
      });

      return res.status(200).json({ paymentEvents });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to load payment calendar.' });
    }
  }
);

export default router;
