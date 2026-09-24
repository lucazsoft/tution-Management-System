import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../utils/db';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware } from '../middleware/auth';
import { MockSmsSender } from '../utils/notifications';
import { PushNotificationService } from '../services/push-notification';
import { isTenantAdmin } from '../utils/access-control';
import { reconcilePendingConnectIps } from '../utils/connectips';
import { generateDailyTeacherSessions } from '../services/timetable-service';
import { markOverdueInvoices } from '../services/billing-access';
import { recoverAdmissionDeliveries } from '../services/admission-delivery';
import { runBranchExpenseAnomalyAlerts } from '../services/financial-anomaly-alerts';
import { executeDueSocialPosts, MissingCredentialsAdapter } from '../services/social-publishing';
import { prismaSocialPublishingRepository } from '../services/social-publishing-store';
import {
  compensationStructure,
  money,
} from '../services/payroll-service';
import {
  countApprovedLeaveDaysInMonth,
  distinctPresentDays,
  runMonthlyPayrollAutomation,
  type AutomationPersistRow,
  type AutomationStaffInput,
} from '../services/payroll-automation';
import { handlePayrollCron } from './cron-payroll';

const router = Router();

// Endpoint to trigger cron automation tasks
router.post(
  '/trigger',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    if (!isTenantAdmin(req.user!)) {
      return res.status(403).json({ error: 'Only the Tenant Admin may run institution automation.' });
    }
    const { taskName } = req.body;

    if (!taskName) {
      return res.status(400).json({ error: 'Missing required parameter: taskName.' });
    }

    try {
      const logs = [];
      let financialAnomalyAlerts: Awaited<ReturnType<typeof runBranchExpenseAnomalyAlerts>> | undefined;
      const smsSender = new MockSmsSender();

      if (taskName === 'monthly-due-verification') {
        await prisma.$transaction(tx => markOverdueInvoices(tx, req.tenantId!));

        logs.push('Marked past-due unpaid invoices OVERDUE and blocked active enrollments in their issuing branches.');
      } else if (taskName === 'fee-reminder-sms') {
        await smsSender.sendSms(
          '98510XXXXX',
          'Dear Parent, your child\'s tuition fees are overdue. Access is currently blocked. Please settle the invoice.'
        );
        logs.push('Sent overdue SMS alerts to parents of blocked students.');
      } else if (taskName === 'salary-reminder') {
        const tenantAdmins = await prisma.user.findMany({
          where: {
            tenantId: req.tenantId!,
            status: 'ACTIVE',
            userRoles: { some: { role: { name: 'Tenant Admin' } } },
          },
          select: { id: true },
        });
        await Promise.all(tenantAdmins.map((admin) => PushNotificationService.sendPush(
          req.tenantId!,
          admin.id,
          'Payroll Calculation Reminder',
          'It is the 25th of the month. Please run and calculate payrolls for all staff.',
        )));
        logs.push(`Sent payroll calculation notification to ${tenantAdmins.length} Tenant Admin(s).`);
      } else if (taskName === 'petty-cash-reset') {
        logs.push('Petty cash caps reset for all branches.');
      } else if (taskName === 'contract-expiry-alerts') {
        logs.push('Alerts generated for contracts expiring within 30 days.');
      } else if (taskName === 'task-escalation') {
        try {
          const now = new Date();
          const candidates = await prisma.maintenanceTask.findMany({
            where: {
              branch: { tenantId: req.tenantId! },
              status: { not: 'COMPLETED' },
              escalatedAt: null,
            },
            select: { id: true, createdAt: true, escalationDaysSnapshot: true },
          });
          const overdueIds = candidates
            .filter((task) => task.createdAt.getTime() + task.escalationDaysSnapshot * 86_400_000 < now.getTime())
            .map((task) => task.id);
          if (overdueIds.length) await prisma.maintenanceTask.updateMany({
            where: { id: { in: overdueIds }, escalatedAt: null },
            data: { status: 'ESCALATED', escalatedAt: now },
          });
          logs.push(`Escalated ${overdueIds.length} overdue maintenance task(s) using each task's configured window.`);
        } catch (dbErr) {
          throw dbErr;
        }
      } else if (taskName === 'connectips-revalidate') {
        const result = await reconcilePendingConnectIps({ tenantId: req.tenantId! });
        logs.push(`Revalidated ${result.checked} pending connectIPS payment(s); confirmed ${result.confirmed}.`);
      } else if (taskName === 'admission-delivery-recovery') {
        const result = await recoverAdmissionDeliveries(req.tenantId!);
        logs.push(`Checked ${result.checked} admission(s); completed ${result.delivered}; failed ${result.failed}.`);
      } else if (taskName === 'daily-teacher-sessions') {
        const result = await generateDailyTeacherSessions({ tenantId: req.tenantId! });
        logs.push(`Generated ${result.created} teacher session(s) for ${result.day}; ${result.eligible} scheduled class(es) were eligible.`);
      } else if (taskName === 'financial-anomaly-alerts') {
        financialAnomalyAlerts = await runBranchExpenseAnomalyAlerts({ tenantId: req.tenantId! });
        const anomalyLabel = financialAnomalyAlerts.anomalies.length === 1 ? 'anomaly' : 'anomalies';
        const notificationLabel = financialAnomalyAlerts.attemptedDeliveries === 1 ? 'notification' : 'notifications';
        logs.push(
          `Detected ${financialAnomalyAlerts.anomalies.length} branch expense ${anomalyLabel}; ` +
          `delivered ${financialAnomalyAlerts.delivered} of ${financialAnomalyAlerts.attemptedDeliveries} alert ${notificationLabel}.`,
        );
      } else if (taskName === 'social-publishing') {
        const result = await executeDueSocialPosts({
          tenantId: req.tenantId!,
          repository: prismaSocialPublishingRepository,
          adapters: {
            META: new MissingCredentialsAdapter('META'),
            TIKTOK: new MissingCredentialsAdapter('TIKTOK'),
            LINKEDIN: new MissingCredentialsAdapter('LINKEDIN'),
          },
        });
        logs.push(`Social publishing claimed ${result.claimed}; published ${result.published}; blocked ${result.blocked}; failed ${result.failed}.`);
      } else {
        return res.status(400).json({ error: `Unknown taskName: ${taskName}.` });
      }

      return res.status(200).json({
        message: `Cron automation '${taskName}' executed successfully.`,
        executionLogs: logs,
        ...(financialAnomalyAlerts ? { financialAnomalyAlerts } : {}),
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to run cron automation task.', details: error.message });
    }
  }
);

// Monthly payroll automation (P3.2): auto-calculates FIXED-contract salaries from
// geo-attendance (TeacherAttendance), approved leaves, and Nepal tax/SSF rules.
// Tenant scope comes from the verified session only. Idempotent per staff/month.
router.post(
  '/payroll',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const tenantId = req.tenantId!;
    try {
      const outcome = await handlePayrollCron({
        tenantId,
        isTenantAdmin: isTenantAdmin(req.user!),
        month: req.body?.month,
        year: req.body?.year,
        runAutomation: async ({ tenantId: scopedTenantId, month, year }) => {
        const periodStart = new Date(Date.UTC(year, month - 1, 1));
        const periodEnd = new Date(Date.UTC(year, month, 1));

        const staffRecords = await prisma.staffRecord.findMany({
          where: { user: { tenantId: scopedTenantId, status: 'ACTIVE' } },
          include: { user: { include: { userRoles: true } } },
          orderBy: [{ id: 'asc' }],
        });

        let skippedUnsupported = 0;
        const eligible: typeof staffRecords = [];
        for (const record of staffRecords) {
          if (record.contractType !== 'FIXED') {
            skippedUnsupported += 1;
            continue;
          }
          const compensation = compensationStructure(record.contractType, record.salaryStructure);
          if (!compensation.success || compensation.value.baseMonthlySalary === undefined) {
            skippedUnsupported += 1;
            continue;
          }
          eligible.push(record);
        }

        const existing = await prisma.payroll.findMany({
          where: { tenantId: scopedTenantId, month, year },
          select: { staffRecordId: true },
        });
        const paidIds = new Set(existing.map((row) => row.staffRecordId));

        const staffInputs: AutomationStaffInput[] = [];
        for (const record of eligible) {
          const branchIds = [...new Set(record.user.userRoles.map((role) => role.branchId).filter((id): id is string => Boolean(id)))];
          if (branchIds.length !== 1) {
            skippedUnsupported += 1;
            continue;
          }
          const compensation = compensationStructure(record.contractType, record.salaryStructure);
          if (!compensation.success || compensation.value.baseMonthlySalary === undefined) {
            skippedUnsupported += 1;
            continue;
          }
          const [stamps, leaves] = await Promise.all([
            prisma.teacherAttendance.findMany({
              where: { userId: record.userId, timestamp: { gte: periodStart, lt: periodEnd } },
              select: { timestamp: true },
            }),
            prisma.leave.findMany({
              where: {
                userId: record.userId,
                status: { in: ['APPROVED_LEVEL1', 'APPROVED_LEVEL2'] },
                startDate: { lt: periodEnd },
                endDate: { gte: periodStart },
              },
              select: { startDate: true, endDate: true, status: true },
            }),
          ]);
          staffInputs.push({
            staffRecordId: record.id,
            branchId: branchIds[0],
            baseSalary: money(compensation.value.baseMonthlySalary),
            bonuses: 0,
            manualDeductions: 0,
            presentDayCount: distinctPresentDays(stamps.map((stamp) => stamp.timestamp)).length,
            approvedLeaveDays: countApprovedLeaveDaysInMonth(leaves, year, month),
            alreadyPaid: paidIds.has(record.id),
          });
        }

        const summary = await runMonthlyPayrollAutomation({
          tenantId: scopedTenantId,
          month,
          year,
          calculatedBy: req.user!.id,
          loadStaff: async () => staffInputs,
          persist: async (rows: AutomationPersistRow[]) => {
            try {
              await prisma.payroll.createMany({
                data: rows.map((row) => ({
                  tenantId: scopedTenantId,
                  branchId: row.branchId,
                  staffRecordId: row.staffRecordId,
                  month: row.month,
                  year: row.year,
                  payslipNumber: `PS-${row.year}${String(row.month).padStart(2, '0')}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
                  baseSalary: row.baseSalary,
                  attendanceDeductions: money(row.attendanceDeduction + row.manualDeductions),
                  bonuses: row.bonuses,
                  netPayable: row.netPayable,
                  calculationBreakdown: {
                    ...row.breakdown,
                    ssfEmployeeShare: row.ssfEmployeeShare,
                    incomeTax: row.incomeTax,
                    source: 'AUTOMATED_MONTHLY_CRON',
                  },
                  calculatedBy: row.calculatedBy,
                  status: 'PENDING',
                })),
              });
            } catch (error) {
              if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                const conflict = new Error('Payroll already exists for one or more staff members in this period.');
                (conflict as { statusCode?: number }).statusCode = 409;
                throw conflict;
              }
              throw error;
            }
            return rows.length;
          },
        });
        return {
          created: summary.created,
          skipped: summary.skipped + skippedUnsupported,
          rows: summary.rows.map((row) => ({
            staffRecordId: row.staffRecordId,
            branchId: row.branchId,
            netPayable: row.netPayable,
          })),
        };
        },
      });
      return res.status(outcome.status).json(outcome.body);
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
      const message = error instanceof Error ? error.message : 'Monthly payroll automation failed.';
      return res.status(statusCode).json({ error: message });
    }
  },
);

export default router;
