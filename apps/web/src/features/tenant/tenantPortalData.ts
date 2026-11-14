export interface TenantDashboardData {
  activeStudentsCount: number;
  activeTeachersCount: number;
  totalOverdueAmountNpr: number;
  pendingLeaveRequestsCount: number;
  leavesPendingAtBranchesCount?: number;
  branchSummary: Array<{
    branchId: string;
    branchName: string;
    activeStudents: number;
    staffCount: number;
  }>;
}

export interface FinancialForecast {
  billingCycle: string;
  metrics: {
    baseForecastNpr: number;
    estimatedAttritionNpr: number;
    attritionPercentage: string;
    netForecastNpr: number;
    actualCollectedNpr: number;
    varianceNpr: number;
    activeEnrollments: number;
  };
}

export interface FinancialSignal {
  type: string;
  severity: 'HIGH' | 'MEDIUM' | 'WARNING' | 'INFO';
  message: string;
}

export interface FinancialSuggestions {
  alerts: FinancialSignal[];
  budgetAnalysis: {
    projectedSurplusNpr: number;
    promptText: string;
  };
}
