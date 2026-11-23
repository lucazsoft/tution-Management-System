import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertFeed, type AlertFeedItem } from '../components/ui/AlertFeed';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { KPICard } from '../components/ui/KPICard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { type TenantDashboardData } from '../features/tenant/tenantPortalData';
import { api } from '../services/api';

interface ProfitLossData {
  revenue: number;
  operatingCosts: number;
  netMargin: number;
  month: string;
}

interface FinanceConfig {
  vatRate: number;
  gracePeriod: number;
  pettyCashCap: number;
  refundPolicy: string;
  lateFeeEnabled: boolean;
  lateFeeMode: string | null;
  lateFeeValue: number | null;
  lateFeeGraceDays: number;
  appointmentWindowHours: number;
  maintenanceEscalationDays: number;
  leavePolicy: Record<string, unknown> | null;
  performanceWeights: Record<string, number> | null;
}

function buildAlerts(dashboard: TenantDashboardData | null): AlertFeedItem[] {
  if (!dashboard) {
    return [];
  }

  const alerts: AlertFeedItem[] = [];

  if (dashboard.totalOverdueAmountNpr > 0) {
    alerts.push({
      id: 'alert-overdue',
      tag: 'Fee',
      tagVariant: 'gold',
      description: `NPR ${dashboard.totalOverdueAmountNpr.toLocaleString()} in overdue invoices needs follow-up.`,
      timestamp: 'Collect',
      href: '/tenant/fees',
    });
  }

  if (dashboard.pendingLeaveRequestsCount > 0) {
    alerts.push({
      id: 'alert-leaves',
      tag: 'Leave',
      tagVariant: 'warning',
      description: `${dashboard.pendingLeaveRequestsCount} leave request${dashboard.pendingLeaveRequestsCount === 1 ? '' : 's'} awaiting your final approval.`,
      timestamp: 'Review',
      href: '/tenant/leave-management',
    });
  }

  if (dashboard.activeStudentsCount === 0) {
    alerts.push({
      id: 'alert-no-students',
      tag: 'Setup',
      tagVariant: 'info',
      description: 'No students enrolled yet. Add students to start attendance and billing.',
      timestamp: 'Add',
      href: '/tenant/people',
    });
  }

  return alerts;
}

export function TenantAdminDashboard() {
  const navigate = useNavigate();
  const [pl, setPl] = useState<ProfitLossData | null>(null);
  const [dashboard, setDashboard] = useState<TenantDashboardData | null>(null);
  const [vatRate, setVatRate] = useState(13);
  const [gracePeriod, setGracePeriod] = useState(15);
  const [pettyCashCap, setPettyCashCap] = useState(20000);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState('');
  const [policyConfig, setPolicyConfig] = useState<FinanceConfig | null>(null);

  const alerts = buildAlerts(dashboard);

  const loadDashboardData = async () => {
    setIsLoading(true);
    setErrorMsg('');

    try {
      const [plData, config, summary, period] = await Promise.all([
        api.finances.getPL() as Promise<ProfitLossData>,
        api.finances.getConfig() as Promise<FinanceConfig>,
        api.tenant.getDashboard() as Promise<TenantDashboardData>,
        api.finances.getBillingPeriod(),
      ]);
      setPl(plData);
      setDashboard(summary);
      setVatRate(config.vatRate);
      setGracePeriod(config.gracePeriod);
      setPettyCashCap(config.pettyCashCap);
      setPolicyConfig(config);
      setBillingPeriod(period.label);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Failed to load institution reporting.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboardData();
  }, []);

  const handleSaveConfigs = async () => {
    setSaveSuccess(false);
    setErrorMsg('');

    try {
      await api.finances.updateConfig(vatRate, gracePeriod, pettyCashCap, {
        refundPolicy: policyConfig?.refundPolicy ?? 'NO_REFUND',
        lateFeeEnabled: policyConfig?.lateFeeEnabled ?? false,
        lateFeeMode: policyConfig?.lateFeeMode ?? 'FLAT',
        lateFeeValue: policyConfig?.lateFeeValue ?? 0,
        lateFeeGraceDays: policyConfig?.lateFeeGraceDays ?? 0,
        appointmentWindowHours: policyConfig?.appointmentWindowHours ?? 24,
        maintenanceEscalationDays: policyConfig?.maintenanceEscalationDays ?? 3,
        leavePolicy: policyConfig?.leavePolicy ?? {},
        performanceWeights: policyConfig?.performanceWeights ?? {
          attendance: 20, updateCompliance: 20, feedback: 20, leaveCompliance: 20, taskCompletion: 20,
        },
      });
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Failed to save configurations');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 600, color: 'var(--color-text)', letterSpacing: '-0.2px' }}>Institution Overview</h2>
          <p style={{ marginTop: '3px', color: 'var(--text-muted)', fontSize: '13px' }}>
            Live snapshot across all branches.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadDashboardData()} disabled={isLoading} style={{ height: '38px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>refresh</span>
          Refresh
        </Button>
      </div>

      {errorMsg ? <StatusBadge variant="error">{errorMsg}</StatusBadge> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <KPICard
          title="Active Students"
          value={dashboard ? dashboard.activeStudentsCount.toLocaleString() : '—'}
          delta="Enrolled across branches"
          icon="school"
          loading={isLoading}
          onClick={() => navigate('/tenant/students')}
        />
        <KPICard
          title="Active Teachers"
          value={dashboard ? dashboard.activeTeachersCount.toLocaleString() : '—'}
          delta="Teaching staff"
          icon="badge"
          loading={isLoading}
          onClick={() => navigate('/tenant/teachers')}
        />
        <KPICard
          title="Overdue Fees"
          value={dashboard ? `NPR ${dashboard.totalOverdueAmountNpr.toLocaleString()}` : '—'}
          delta={dashboard && dashboard.totalOverdueAmountNpr > 0 ? 'Needs follow-up' : 'All clear'}
          icon="payments"
          accentColor={dashboard && dashboard.totalOverdueAmountNpr > 0 ? 'var(--color-warning)' : 'var(--color-success)'}
          loading={isLoading}
          onClick={() => navigate('/tenant/fees')}
        />
        <KPICard
          title="Pending Leaves"
          value={dashboard ? dashboard.pendingLeaveRequestsCount : '—'}
          delta={dashboard && dashboard.pendingLeaveRequestsCount > 0 ? 'Awaiting your approval' : dashboard?.leavesPendingAtBranchesCount ? `${dashboard.leavesPendingAtBranchesCount} with branches` : 'All clear'}
          icon="event_busy"
          accentColor={dashboard && dashboard.pendingLeaveRequestsCount > 0 ? 'var(--color-warning)' : 'var(--color-success)'}
          loading={isLoading}
          onClick={() => navigate('/tenant/leave-management')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
        <Card hoverable={false}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text)' }}>Branch Network</h3>
              <p style={{ marginTop: '4px', color: 'var(--text-muted)', fontSize: '13px' }}>Students and staff by center</p>
            </div>
            <Button variant="outline" onClick={() => navigate('/tenant/branches')} style={{ minHeight: '34px', height: '34px', padding: '6px 12px', borderColor: 'rgba(21, 96, 189, 0.16)' }}>
              Manage
            </Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {!dashboard || dashboard.branchSummary.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '18px 0' }}>
                {isLoading ? 'Loading branches…' : 'No branches yet.'}
              </p>
            ) : (
              dashboard.branchSummary.map((branch) => (
                <div
                  key={branch.branchId}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/tenant/branches')}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate('/tenant/branches'); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(248, 250, 252, 0.6)', cursor: 'pointer', transition: 'all 0.15s ease' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)', color: 'var(--color-primary)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>domain</span>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)' }}>{branch.branchName}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                    <StatusBadge variant="info">{branch.activeStudents} students</StatusBadge>
                    <StatusBadge variant="gold">{branch.staffCount} staff</StatusBadge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card hoverable={false}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text)' }}>Action Queue</h3>
              <p style={{ marginTop: '4px', color: 'var(--text-muted)', fontSize: '13px' }}>Items needing tenant attention</p>
            </div>
            <StatusBadge variant={alerts.length > 0 ? 'gold' : 'success'}>{alerts.length}</StatusBadge>
          </div>
          {alerts.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '28px 0', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '36px', color: 'var(--color-success)' }}>task_alt</span>
              <p style={{ fontSize: '14px' }}>{isLoading ? 'Checking…' : 'Nothing needs attention right now.'}</p>
            </div>
          ) : (
            <AlertFeed items={alerts} onSelect={(href) => navigate(href)} />
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
        <Card hoverable={false}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text)' }}>Profit &amp; Loss Statement</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              {billingPeriod ? <StatusBadge variant="gold">Billing: {billingPeriod} BS</StatusBadge> : null}
              <StatusBadge variant="info">{pl?.month ?? '—'}</StatusBadge>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px' }}>
            <div style={{ padding: '16px 18px', borderRadius: '12px', background: 'rgba(0, 171, 102, 0.06)' }}>
              <p style={{ color: 'rgba(44, 62, 80, 0.7)', fontSize: '12px', fontWeight: 700 }}>COLLECTED REVENUE</p>
              <p style={{ marginTop: '8px', fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 600, color: 'var(--color-success)' }}>
                NPR {(pl?.revenue ?? 0).toLocaleString()}
              </p>
              <p style={{ marginTop: '6px', color: 'rgba(44, 62, 80, 0.62)', fontSize: '11px' }}>Paid tuition invoices</p>
            </div>
            <div style={{ padding: '16px 18px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.06)' }}>
              <p style={{ color: 'rgba(44, 62, 80, 0.7)', fontSize: '12px', fontWeight: 700 }}>OPERATING COSTS</p>
              <p style={{ marginTop: '8px', fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 600, color: 'var(--color-error)' }}>
                NPR {(pl?.operatingCosts ?? 0).toLocaleString()}
              </p>
              <p style={{ marginTop: '6px', color: 'rgba(44, 62, 80, 0.62)', fontSize: '11px' }}>Expenses + payroll + petty cash</p>
            </div>
            <div style={{ padding: '16px 18px', borderRadius: '12px', background: 'linear-gradient(135deg, #0F172A 0%, var(--color-primary-light) 100%)', color: '#FFFFFF' }}>
              <p style={{ opacity: 0.78, fontSize: '12px', fontWeight: 700 }}>NET MARGIN</p>
              <p style={{ marginTop: '8px', fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 600 }}>
                NPR {(pl?.netMargin ?? 0).toLocaleString()}
              </p>
              <p style={{ marginTop: '6px', opacity: 0.8, fontSize: '11px' }}>Net surplus for the month</p>
            </div>
          </div>
        </Card>

        <Card hoverable={false}>
          <h3 style={{ marginBottom: '20px', fontSize: '18px', fontWeight: 700, color: 'var(--color-text)' }}>Institution Policy Settings</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '18px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}>Standard VAT Percentage</label>
              <input
                type="number"
                value={vatRate}
                onChange={(event) => setVatRate(Number(event.target.value))}
                style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: 'var(--color-text)', fontFamily: 'var(--font-ui)', fontSize: '14px' }}
              />
              <p style={{ color: 'rgba(44, 62, 80, 0.62)', fontSize: '11px' }}>Required for Nepalese VAT compliance.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}>Grace Period (Minutes)</label>
              <input
                type="number"
                value={gracePeriod}
                onChange={(event) => setGracePeriod(Number(event.target.value))}
                style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: 'var(--color-text)', fontFamily: 'var(--font-ui)', fontSize: '14px' }}
              />
              <p style={{ color: 'rgba(44, 62, 80, 0.62)', fontSize: '11px' }}>Late attendance buffer before automatic mark out.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}>Monthly Petty Cash Limit</label>
              <input
                type="number"
                value={pettyCashCap}
                onChange={(event) => setPettyCashCap(Number(event.target.value))}
                style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: 'var(--color-text)', fontFamily: 'var(--font-ui)', fontSize: '14px' }}
              />
              <p style={{ color: 'rgba(44, 62, 80, 0.62)', fontSize: '11px' }}>Resets automatically on the first day of each month.</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '20px' }}>
            <Button onClick={() => void handleSaveConfigs()} style={{ background: 'var(--color-primary-light)' }}>Save Configurations</Button>
            {saveSuccess ? <StatusBadge variant="success">Settings synchronized</StatusBadge> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
