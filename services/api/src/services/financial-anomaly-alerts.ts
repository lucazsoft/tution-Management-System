import prisma from '../utils/db';
import { MockPushNotificationService } from '../utils/notifications';
import { buildFinancialIntelligence } from '../utils/financial-intelligence';

type BranchRow = { id: string; name: string };
type ExpenseRow = { branchId: string | null; category: string; amount: number; date: Date };
type RecipientRow = { id: string };

type FinancialAnomalyDb = {
  branch: { findMany(args: any): Promise<BranchRow[]> };
  expense: { findMany(args: any): Promise<ExpenseRow[]> };
  user: { findMany(args: any): Promise<RecipientRow[]> };
};

type PushDelivery = (userId: string, title: string, body: string) => Promise<unknown>;

export type BranchExpenseAnomaly = {
  branchId: string;
  branchName: string;
  category: string;
  currentAmountNpr: number;
  baselineAmountNpr: number;
  message: string;
};

export async function runBranchExpenseAnomalyAlerts(input: {
  tenantId: string;
  now?: Date;
  db?: FinancialAnomalyDb;
  sendPush?: PushDelivery;
}) {
  const now = input.now ?? new Date();
  const db = input.db ?? (prisma as unknown as FinancialAnomalyDb);
  const sendPush = input.sendPush ?? MockPushNotificationService.sendPush.bind(MockPushNotificationService);
  const historyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const historyEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const branches = await db.branch.findMany({
    where: { tenantId: input.tenantId },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
  const branchIds = branches.map((branch) => branch.id);
  const expenses = branchIds.length === 0 ? [] : await db.expense.findMany({
    where: {
      tenantId: input.tenantId,
      branchId: { in: branchIds },
      date: { gte: historyStart, lt: historyEnd },
    },
    select: { branchId: true, category: true, amount: true, date: true },
  });

  const anomalies: BranchExpenseAnomaly[] = branches.flatMap((branch) => {
    const branchExpenses = expenses.filter((expense) => expense.branchId === branch.id);
    return buildFinancialIntelligence({
      now,
      expenses: branchExpenses,
      payrolls: [],
      projectedIncomeNpr: 0,
      activeEnrollments: 0,
    }).alerts
      .filter((alert) => alert.type === 'ANOMALY_DETECTION')
      .map((alert) => ({
        branchId: branch.id,
        branchName: branch.name,
        category: alert.category,
        currentAmountNpr: alert.currentAmountNpr,
        baselineAmountNpr: alert.baselineAmountNpr,
        message: alert.message,
      }));
  });

  const recipients = anomalies.length === 0 ? [] : await db.user.findMany({
    where: {
      tenantId: input.tenantId,
      status: 'ACTIVE',
      userRoles: { some: { branchId: null, role: { name: 'Tenant Admin' } } },
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  let delivered = 0;
  let failed = 0;
  for (const anomaly of anomalies) {
    for (const recipient of recipients) {
      try {
        const result = await sendPush(
          recipient.id,
          `Branch expense anomaly: ${anomaly.branchName}`,
          `${anomaly.message} Current: NPR ${anomaly.currentAmountNpr}; baseline: NPR ${anomaly.baselineAmountNpr}.`,
        );
        if (typeof result === 'object' && result !== null && 'success' in result && result.success === false) {
          failed += 1;
        } else {
          delivered += 1;
        }
      } catch {
        failed += 1;
      }
    }
  }

  return {
    analyzedBranches: branches.length,
    anomalies,
    attemptedDeliveries: delivered + failed,
    delivered,
    failed,
  };
}
