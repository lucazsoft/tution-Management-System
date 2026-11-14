import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../utils/db';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware } from '../middleware/auth';
import { getSmsSender } from '../utils/sms';
import { previewFeeReminders, sendFeeReminders } from '../services/fee-reminders';
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
import { notifyEscalatedLeaves } from './leaves';

const router = Router();

/**
 * Reminder and alert tasks offered on the Control Center "Reminders" tab.
 * Only tasks that really deliver something are listed (petty-cash-reset and
 * contract-expiry-alerts only log a line today, so they are not offered).
 */
export const REMINDER_TASKS = [
  'fee-reminder-sms',
  'monthly-due-verification',
  'leave-escalation',
  'salary-reminder',
  'financial-anomaly-alerts',
  'task-escalation',
] as const;

/** A second fee-reminder SMS blast inside this window needs explicit confirmation. */
export const FEE_REMINDER_COOLDOWN_HOURS = 20;

async function lastRun(tenantId: string, taskName: string) {
  return prisma.automationRun.findFirst({
    where: { tenantId, taskName },
    orderBy: { createdAt: 'desc' },
  });
}

// Status for the Control Center Reminders tab: last run of each task and what
// a fee-reminder send would do right now.
router.get('/automation', authMiddleware, async (req: TenantRequest, res: Response) => {
  if (!isTenantAdmin(req.user!)) {
    return res.status(403).json({ error: 'Only the Tenant Admin may view institution automation.' });
  }
  try {
    const runs = await Promise.all(REMINDER_TASKS.map((taskName) => lastRun(req.tenantId!, taskName)));
    const starterIds = [...new Set(runs.flatMap((run) => (run ? [run.startedById] : [])))];
    const starters = starterIds.length
      ? await prisma.user.findMany({ where: { id: { in: starterIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const names = new Map(starters.map((user) => [user.id, `${user.firstName} ${user.lastName}`.trim()]));
    const feeReminderPreview = await previewFeeReminders(prisma, req.tenantId!);
    return res.json({
      tasks: REMINDER_TASKS.map((taskName, index) => {
        const run = runs[index];
        return {
          taskName,
          lastRun: run ? { at: run.createdAt, by: names.get(run.startedById) ?? 'Unknown user', summary: run.summary } : null,
        };
      }),
      feeReminderPreview,
      feeReminderCooldownHours: FEE_REMINDER_COOLDOWN_HOURS,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to load automation status.' });
  }
});

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
      if (taskName === 'fee-reminder-sms' && req.body.force !== true) {
        const previous = await lastRun(req.tenantId!, taskName);
        const cutoff = Date.now() - FEE_REMINDER_COOLDOWN_HOURS * 3_600_000;
        if (previous && previous.createdAt.getTime() > cutoff) {
          return res.status(409).json({
            error: `Fee reminders were already sent at ${previous.createdAt.toISOString()}. Confirm to send them again.`,
            code: 'RECENTLY_SENT',
            lastRunAt: previous.createdAt,
          });
        }
      }

      const logs = [];
      let financialAnomalyAlerts: Awaited<ReturnType<typeof runBranchExpenseAnomalyAlerts>> | undefined;

      if (taskName === 'monthly-due-verification') {
        await prisma.$transaction(tx => markOverdueInvoices(tx, req.tenantId!));

        logs.push('Marked past-due unpaid invoices OVERDUE and blocked active enrollments in their issuing branches.');
      } else if (taskName === 'fee-reminder-sms') {
        const reminders = await sendFeeReminders(prisma, getSmsSender(), req.tenantId!);
        logs.push(
          `Fee reminders for ${reminders.students} student(s) with overdue fees: ${reminders.sent} SMS sent, `
          + `${reminders.failed} failed, ${reminders.withoutPhone} parent(s) without a mobile number, `
          + `${reminders.withoutGuardian} student(s) with no linked parent.`,
        );
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
      } else if (taskName === 'leave-escalation') {
        const alerted = await notifyEscalatedLeaves(req.tenantId!);
        logs.push(`Alerted Tenant Admins about ${alerted} leave request(s) unanswered by their branch for 48 hours.`);
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

      // History for the Control Center; never fails the task that already ran.
      await prisma.automationRun.create({
        data: { tenantId: req.tenantId!, taskName, startedById: req.user!.id, summary: logs.join(' ').slice(0, 2000) },
      }).catch(() => undefined);

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
                status: 'APPROVED_LEVEL2',
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
