import { PettyCashFunding } from '../components/patterns/PettyCashFunding';
import { EventTargetFields } from '../components/calendar/EventTargetFields';
import type { EventAudience } from '../services/api/academicEvents';
import { NepaliDateTimeField } from '../components/calendar/NepaliDateTimeField';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { RemoteState } from '../components/patterns/RemoteState';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../components/ui/Toast';
import {
  type FinancialForecast,
  type FinancialSignal,
  type FinancialSuggestions,
} from '../features/tenant/tenantPortalData';
import { TenantAcademicCalendar } from '../features/tenant/TenantAcademicCalendar';
import { academicEventsApi, type AcademicEvent, type EventType } from '../services/api/academicEvents';
import { API_BASE_URL, ApiError, errorMessage, request } from '../services/api/client';
import { financeApi, type Expense, type PettyCashRecord } from '../services/api/finance';
import { hrApi, type DocumentAlert, type PayrollPreviewRecord, type PayrollRecord } from '../services/api/hr';
import { resourcesApi, type MaintenanceTask } from '../services/api/resources';
import { api } from '../services/api';
import { toBsMonthRangeLabel, toDualDateLabel, type CalendarSystem } from '../utils/nepaliDate';
import { englishDateLabel, nepaliDateHeading, nepalDateKey, nepalDateTimeInputToIso, NEPAL_TIME_ZONE } from '../utils/nepalCalendar';
import './staffFinance.css';

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 };
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--bg-card)', color: 'var(--color-text)' };
const row: React.CSSProperties = { borderTop: '1px solid var(--border)', padding: '14px 0', display: 'grid', gap: 8 };

function Header({ title, description }: { title: string; description: string }) {
  return <div><h2 style={{ fontSize: 23 }}>{title}</h2><p style={{ color: 'var(--text-muted)', marginTop: 4 }}>{description}</p></div>;
}

function useRemote<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await loader()); } catch (next) { setError(next); } finally { setLoading(false); }
  }, [loader]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, error, reload };
}

export function TenantPettyCashPage() {
  const { showToast } = useToast();
  const loader = useCallback(() => financeApi.pettyCash(), []);
  const { data, loading, error, reload } = useRemote(loader);
  const [status, setStatus] = useState('ALL');
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const filtered = (data ?? []).filter((item) => status === 'ALL' || item.status === status);
  const mutate = async (item: PettyCashRecord, action: 'APPROVE' | 'REJECT' | 'REVISION' | 'CLOSE') => {
    if ((action === 'REJECT' || action === 'REVISION') && !remarks[item.id]?.trim()) return showToast('Decision remarks are required.', 'error');
    if (action === 'APPROVE' && !window.confirm(`Record release of NPR ${Number(item.amount).toLocaleString()}? TMS will not transfer funds.`)) return;
    setBusy(item.id);
    try {
      if (action === 'APPROVE') await financeApi.approvePettyCash(item.id, remarks[item.id] ?? '');
      if (action === 'REJECT' || action === 'REVISION') await financeApi.decidePettyCash(item.id, action, remarks[item.id]);
      if (action === 'CLOSE') await financeApi.closePettyCash(item.id);
      showToast('Petty-cash record updated.', 'success'); await reload();
    } catch (next) { showToast(errorMessage(next), 'error'); if (next instanceof ApiError && next.isConflict) await reload(); }
    finally { setBusy(''); }
  };
  return <div style={{ display: 'grid', gap: 18 }}><Header title="Petty Cash" description="Approve additional branch funds, review escalated spending, and verify receipts." />
    <PettyCashFunding tenant key={busy} />
    <Card hoverable={false}><label>Filter status <select style={{ ...input, width: 220, marginLeft: 10 }} value={status} onChange={(e) => setStatus(e.target.value)}><option>ALL</option><option>PENDING</option><option>APPROVED_LEVEL1</option><option>RELEASED</option><option>RECEIPT_SUBMITTED</option><option>CLOSED</option><option>REJECTED</option></select></label></Card>
    {loading ? <RemoteState kind="loading" /> : error ? <RemoteState kind={error instanceof ApiError && error.isAccessDenied ? 'denied' : 'error'} message={errorMessage(error)} onRetry={() => void reload()} /> :
      !filtered.length ? <RemoteState kind="empty" message="No petty-cash records match this filter." /> :
      <Card hoverable={false}>{filtered.map((item) => <div key={item.id} style={row}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><strong>{item.purpose}</strong><p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(item.createdAt).toLocaleDateString()}</p></div><div style={{ textAlign: 'right' }}><strong>NPR {Number(item.amount).toLocaleString()}</strong><br/><StatusBadge variant="info">{item.status}</StatusBadge></div></div>
        {item.approvalChain?.length ? <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.approvalChain.map((step) => `${step.role}: ${step.action}`).join(' → ')}</p> : null}
        {['PENDING', 'APPROVED_LEVEL1'].includes(item.status) ? <><textarea style={input} aria-label="Decision remarks" placeholder="Decision remarks" value={remarks[item.id] ?? ''} onChange={(e) => setRemarks((old) => ({ ...old, [item.id]: e.target.value }))}/><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Button disabled={busy === item.id} onClick={() => void mutate(item, 'APPROVE')}>Approve & record release</Button><Button variant="outline" disabled={busy === item.id} onClick={() => void mutate(item, 'REVISION')}>Send back</Button><Button variant="danger" disabled={busy === item.id} onClick={() => void mutate(item, 'REJECT')}>Reject</Button></div></> : null}
        {item.receiptProofUrl && /^https?:\/\//i.test(item.receiptProofUrl) ? <a href={item.receiptProofUrl} target="_blank" rel="noreferrer">View receipt</a> : null}
        {item.status === 'RECEIPT_SUBMITTED' ? <Button disabled={busy === item.id} onClick={() => void mutate(item, 'CLOSE')}>Verify & close</Button> : null}
      </div>)}</Card>}
  </div>;
}

export function TenantReportsPage() {
  const { showToast } = useToast();
  const loader = useCallback(async () => {
    const [pl, expenses, forecast, suggestions, globalLedger] = await Promise.all([
      financeApi.pl(), financeApi.expenses(), financeApi.forecast(), financeApi.suggestions(), api.finances.getBillingLedger()
    ]);
    return {
      pl,
      expenses: expenses.expenses,
      forecast: forecast as unknown as FinancialForecast,
      suggestions: suggestions as unknown as FinancialSuggestions,
      globalLedger
    };
  }, []);
  const { data, loading, error, reload } = useRemote(loader);
  const download = async () => {
    try {
      const { entries } = await financeApi.ledger();
      const fields = ['date', 'accountDebit', 'accountCredit', 'amount', 'description'] as const;
      const csv = [fields.join(','), ...entries.map((entry) => fields.map((field) => `"${String(entry[field]).replaceAll('"', '""')}"`).join(','))].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = `tms-ledger-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch (next) { showToast(errorMessage(next), 'error'); }
  };
  if (loading) return <RemoteState kind="loading" />; if (error || !data) return <RemoteState kind="error" message={errorMessage(error)} onRetry={() => void reload()} />;
  const cards: Array<[string, number, string]> = [['Revenue', data.pl.revenue, 'var(--color-success)'], ['Operating costs', data.pl.operatingCosts, 'var(--color-error)'], ['Net margin', data.pl.netMargin, 'var(--color-primary)']];
  const forecastMetrics = data.forecast.metrics;
  const forecastProgress = forecastMetrics.netForecastNpr > 0
    ? Math.min(100, Math.round((forecastMetrics.actualCollectedNpr / forecastMetrics.netForecastNpr) * 100))
    : 0;
  const signalVariant = (signal: FinancialSignal): 'error' | 'warning' | 'info' => signal.severity === 'HIGH' ? 'error' : signal.severity === 'INFO' ? 'info' : 'warning';
  const projectedMonthlyRevenue = data.globalLedger.students.reduce((sum, student) => sum + student.monthlyAmount, 0);
  const projectedMonthlyPayroll = data.globalLedger.teachers.reduce((sum, teacher) => sum + teacher.baseSalary, 0);
  const collectedRevenue = data.globalLedger.students.flatMap((student) => student.invoices).filter((invoice) => invoice.status === 'PAID').reduce((sum, invoice) => sum + invoice.netPayable, 0);
  const projectedMargin = projectedMonthlyRevenue - projectedMonthlyPayroll;
  return <div style={{ display: 'grid', gap: 18 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
      <Header title="P&L and Ledger" description="Consolidated institution reporting from recorded financial transactions."/>
      <Button onClick={() => void download()}><span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>download</span>Download ledger</Button>
    </div>
    <div style={grid}>{cards.map(([name, value, color]) => <Card key={name} hoverable={false}><p style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 700 }}>{name}</p><strong style={{ display: 'block', marginTop: 8, fontSize: 25, color, fontVariantNumeric: 'tabular-nums' }}>NPR {value.toLocaleString()}</strong><p style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 12 }}>{data.pl.month}</p></Card>)}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(300px, 0.85fr)', gap: 18 }}>
      <Card hoverable={false}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}><div><h3>Institution billing projections</h3><p style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 13 }}>Derived from active student fees and staff contracts</p></div><StatusBadge variant={projectedMargin >= 0 ? 'success' : 'warning'}>{projectedMargin >= 0 ? 'Positive margin' : 'Projected deficit'}</StatusBadge></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 12, marginTop: 16 }}>
          {[
            ['Projected monthly tuition', projectedMonthlyRevenue],
            ['Projected annual tuition', projectedMonthlyRevenue * 12],
            ['Projected monthly payroll', projectedMonthlyPayroll],
            ['Recorded invoice collections', collectedRevenue],
            ['Projected monthly margin', projectedMargin]
          ].map(([label, value]) => <div key={String(label)} style={{ padding: 14, borderRadius: 10, background: 'var(--color-surface)', border: '1px solid var(--border)' }}><p style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</p><strong style={{ display: 'block', marginTop: 6, fontVariantNumeric: 'tabular-nums', color: String(label).includes('Net') ? (Number(value) > 0 ? 'var(--color-success)' : 'var(--color-error)') : 'inherit' }}>NPR {Number(value).toLocaleString()}</strong></div>)}
        </div>
      </Card>
      <Card hoverable={false}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}><div><h3>Legacy Monthly forecast</h3><p style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 13 }}>{data.forecast.billingCycle}</p></div><StatusBadge variant={forecastMetrics.varianceNpr >= 0 ? 'success' : 'warning'}>{forecastProgress}% collected</StatusBadge></div>
        <div style={{ height: 8, margin: '18px 0', overflow: 'hidden', borderRadius: 999, background: 'var(--border)' }}><div style={{ width: `${forecastProgress}%`, height: '100%', borderRadius: 'inherit', background: 'var(--color-primary)' }}/></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {[['Expected tuition', forecastMetrics.baseForecastNpr], ['Net forecast', forecastMetrics.netForecastNpr]].map(([label, value]) => <div key={String(label)} style={{ padding: 14, borderRadius: 10, background: 'var(--color-surface)', border: '1px solid var(--border)' }}><p style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</p><strong style={{ display: 'block', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>NPR {Number(value).toLocaleString()}</strong></div>)}
        </div>
        <p style={{ marginTop: 14, color: 'var(--text-muted)', fontSize: 13 }}>{forecastMetrics.activeEnrollments} active enrollments · Estimated attrition {forecastMetrics.attritionPercentage}</p>
      </Card>
    </div>
    <Card hoverable={false}>
      <div className="accountant-header" style={{ marginBottom: 16 }}>
        <div className="accountant-header-title">
          <h2>Global Ledger (All Branches)</h2>
          <p className="accountant-text-muted" style={{ marginTop: 4 }}>Consolidated view of all branch invoices and payrolls.</p>
        </div>
      </div>
      <div className="accountant-table-scroll">
        <table className="accountant-table">
          <thead><tr><th>ID</th><th>Type</th><th>Name</th><th>Branch</th><th>Billing date</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {data.globalLedger.students.flatMap((student) => student.invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td><strong>{invoice.id.slice(0, 8)}</strong></td><td>Invoice · {invoice.invoiceType}</td><td>{student.studentName}</td><td>{student.branchName}</td><td>{invoice.paymentDate ? `Paid ${toDualDateLabel(invoice.paymentDate)}` : `Due ${toDualDateLabel(invoice.dueDate)}`}</td><td className="is-amount">NPR {invoice.netPayable.toLocaleString()}</td><td><StatusBadge variant={invoice.status === 'PAID' ? 'success' : invoice.overdue ? 'error' : 'warning'}>{invoice.overdue && invoice.status !== 'PAID' ? 'OVERDUE' : invoice.status}</StatusBadge></td>
              </tr>
            )))}
            {data.globalLedger.teachers.flatMap((teacher) => teacher.payrolls.map((payroll) => (
              <tr key={payroll.id}>
                <td><strong>{payroll.id.slice(0, 8)}</strong></td><td>Payroll</td><td>{teacher.teacherName}</td><td>{teacher.branchName}</td><td>{payroll.paymentDate ? `Paid ${toDualDateLabel(payroll.paymentDate)}` : `${new Date(payroll.year, payroll.month - 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })} AD · ${toBsMonthRangeLabel(new Date(payroll.year, payroll.month - 1, 1))}`}</td><td className="is-amount">NPR {payroll.netPayable.toLocaleString()}</td><td><StatusBadge variant={payroll.status === 'MANUALLY_PAID' ? 'success' : 'warning'}>{payroll.status.replaceAll('_', ' ')}</StatusBadge></td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </Card>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(300px, 0.85fr)', gap: 18 }}>
      <Card hoverable={false}>
        <h3>Budget outlook</h3><p style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 13 }}>Projected operational surplus</p>
        <strong style={{ display: 'block', marginTop: 14, color: 'var(--color-success)', fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>NPR {data.suggestions.budgetAnalysis.projectedSurplusNpr.toLocaleString()}</strong>
        <p style={{ marginTop: 14, lineHeight: 1.6, color: 'var(--text-muted)', fontSize: 13 }}>{data.suggestions.budgetAnalysis.promptText}</p>
      </Card>
      <Card hoverable={false}>
        <h3>Recorded expenses</h3><p style={{ marginTop: 4, marginBottom: 8, color: 'var(--text-muted)', fontSize: 13 }}>Latest operating costs by category</p>{data.expenses.map((expense: Expense) => <div key={expense.id} style={row}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}><div><strong>{expense.category}</strong><p style={{ marginTop: 3, color: 'var(--text-muted)', fontSize: 12 }}>{expense.description}</p></div><strong style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>NPR {Number(expense.amount).toLocaleString()}</strong></div></div>)}
      </Card>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18 }}>
      <Card hoverable={false}><h3>Financial signals</h3><p style={{ marginTop: 4, marginBottom: 8, color: 'var(--text-muted)', fontSize: 13 }}>Items that may need review</p>{data.suggestions.alerts.map((signal: FinancialSignal, index: number) => <div key={`${signal.type}-${index}`} style={row}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><strong style={{ fontSize: 13 }}>{signal.type.replaceAll('_', ' ')}</strong><StatusBadge variant={signalVariant(signal)}>{signal.severity}</StatusBadge></div><p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.55 }}>{signal.message}</p></div>)}</Card>
    </div>
  </div>;
}

export function TenantPayrollPage() {
  const { showToast } = useToast();
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [status, setStatus] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [references, setReferences] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PayrollPreviewRecord[] | null>(null);
  const [year, month] = period.split('-').map(Number);
  const loader = useCallback(() => hrApi.payroll({ month, year, status, search }), [month, year, status, search]);
  const { data, loading, error, reload } = useRemote(loader);
  const mutate = async (record: PayrollRecord, action: 'APPROVE' | 'RECONCILE') => {
    if (action === 'RECONCILE' && !references[record.id]?.trim()) return showToast('External payment reference is required.', 'error');
    if (!window.confirm(action === 'APPROVE' ? 'Approve this salary obligation for external payment?' : 'Confirm salary was paid outside TMS?')) return;
    setBusy(record.id); try { if (action === 'APPROVE') await hrApi.approve(record.id); else await hrApi.reconcile(record.id, references[record.id]); showToast('Payroll updated.', 'success'); await reload(); } catch (next) { showToast(errorMessage(next), 'error'); if (next instanceof ApiError && next.isConflict) await reload(); } finally { setBusy(''); }
  };
  const loadPreview = async () => { setBusy('preview'); try { setPreview((await hrApi.preview(month, year)).payrolls); } catch (next) { showToast(errorMessage(next), 'error'); } finally { setBusy(''); } };
  const calculate = async () => { setBusy('calculate'); try { await hrApi.calculate(month, year); setPreview(null); showToast('Payroll calculated.', 'success'); await reload(); } catch (next) { showToast(errorMessage(next), 'error'); } finally { setBusy(''); } };
  const summary = data?.summary ?? { staffCount: 0, gross: 0, deductions: 0, netPayable: 0, counts: {} };
  const periodLabel = new Date(year, month - 1).toLocaleDateString('en-NP', { month: 'long', year: 'numeric' });
  const statusLabel = (value: string) => value === 'PENDING' ? 'Awaiting approval' : value === 'APPROVED_FOR_MANUAL_PAYMENT' ? 'Ready for payment' : 'Paid externally';
  const statusVariant = (value: string) => value === 'MANUALLY_PAID' ? 'success' : value === 'PENDING' ? 'warning' : 'info';
  return <div className="payroll-page">
    <div className="payroll-heading"><Header title="Payroll" description="Preview, prepare, approve, and reconcile salary obligations by period."/><Button disabled={Boolean(busy)} aria-busy={busy === 'preview'} onClick={() => void loadPreview()}>{busy === 'preview' ? 'Preparing preview…' : `Preview ${periodLabel}`}</Button></div>
    <Card hoverable={false}><div className="payroll-period-controls">
      <label htmlFor="payroll-period">Payroll period<input id="payroll-period" type="month" min="2000-01" max="2100-12" value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
      <label htmlFor="payroll-status">Status<select id="payroll-status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="PENDING">Awaiting approval</option><option value="APPROVED_FOR_MANUAL_PAYMENT">Ready for payment</option><option value="MANUALLY_PAID">Paid externally</option></select></label>
      <form className="payroll-search" onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); }}><label htmlFor="payroll-search">Search staff</label><div><span className="material-symbols-outlined" aria-hidden="true">search</span><input id="payroll-search" type="search" autoComplete="off" value={searchDraft} placeholder="Name or email" onChange={(event) => setSearchDraft(event.target.value)} /><Button type="submit" variant="secondary">Search</Button></div></form>
    </div></Card>
    <section className="payroll-summary" aria-label={`${periodLabel} payroll summary`}>
      <article><span>Staff records</span><strong>{summary.staffCount}</strong><small>{summary.counts.PENDING ?? 0} awaiting approval</small></article>
      <article><span>Gross payroll</span><strong>NPR {summary.gross.toLocaleString('en-NP')}</strong><small>Base salary plus bonuses</small></article>
      <article><span>Deductions</span><strong>NPR {summary.deductions.toLocaleString('en-NP')}</strong><small>Recorded for this view</small></article>
      <article><span>Net payable</span><strong>NPR {summary.netPayable.toLocaleString('en-NP')}</strong><small>{summary.counts.MANUALLY_PAID ?? 0} payments reconciled</small></article>
    </section>
    {preview ? <section className="payroll-preview"><header><div><span>Calculation preview</span><h3>{periodLabel} · {preview.length} staff members</h3><p>Review the exact calculation before writing payroll records.</p></div><div><Button variant="secondary" onClick={() => setPreview(null)}>Close</Button><Button disabled={Boolean(busy) || preview.some((item) => item.existingPayroll)} aria-busy={busy === 'calculate'} onClick={() => void calculate()}>{busy === 'calculate' ? 'Creating…' : 'Create payroll records'}</Button></div></header><div className="payroll-table-scroll"><table className="payroll-table"><thead><tr><th>Staff member</th><th>Contract</th><th>Base</th><th>Bonus</th><th>Deductions</th><th>Net payable</th><th>Availability</th></tr></thead><tbody>{preview.map((item) => <tr key={item.staffRecordId}><td><strong>{item.staffRecord.user.firstName} {item.staffRecord.user.lastName}</strong><small>{item.staffRecord.designation}</small></td><td>{String(item.breakdown.contractType).replace('_', ' ')}</td><td>NPR {item.baseSalary.toLocaleString('en-NP')}</td><td>NPR {item.bonuses.toLocaleString('en-NP')}</td><td>NPR {item.deductions.toLocaleString('en-NP')}</td><td className="payroll-net">NPR {item.netPayable.toLocaleString('en-NP')}</td><td><StatusBadge variant={item.existingPayroll ? 'warning' : 'success'}>{item.existingPayroll ? 'Already created' : 'Ready'}</StatusBadge></td></tr>)}</tbody></table></div></section> : null}
    {loading ? <div className="payroll-list-skeleton" aria-label="Loading payroll records" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div> : error ? <RemoteState kind="error" message={errorMessage(error)} onRetry={() => void reload()}/> : !data?.payrolls.length ? <div className="payroll-empty"><span className="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span><strong>No payroll found for {periodLabel}</strong><p>{search || status ? 'Clear the search or status filter, or choose another period.' : 'Preview this period to review salary obligations for active staff.'}</p>{search || status ? <Button variant="secondary" onClick={() => { setSearch(''); setSearchDraft(''); setStatus(''); }}>Clear filters</Button> : <Button disabled={Boolean(busy)} onClick={() => void loadPreview()}>Preview payroll</Button>}</div> :
    <Card hoverable={false}><div className="payroll-table-scroll"><table className="payroll-table"><thead><tr><th>Staff member</th><th>Period</th><th>Base salary</th><th>Deductions</th><th>Bonuses</th><th>Net payable</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.payrolls.map((record) => <tr key={record.id}><td><strong>{record.staffRecord.user.firstName} {record.staffRecord.user.lastName}</strong><small>{record.staffRecord.designation} · {record.staffRecord.user.email}</small></td><td>{new Date(record.year, record.month - 1).toLocaleDateString('en-NP', { month: 'short', year: 'numeric' })}</td><td>NPR {Number(record.baseSalary).toLocaleString('en-NP')}</td><td>NPR {Number(record.attendanceDeductions).toLocaleString('en-NP')}</td><td>NPR {Number(record.bonuses).toLocaleString('en-NP')}</td><td className="payroll-net">NPR {Number(record.netPayable).toLocaleString('en-NP')}</td><td><StatusBadge variant={statusVariant(record.status)}>{statusLabel(record.status)}</StatusBadge></td><td>{record.status === 'PENDING' ? <Button disabled={busy === record.id} aria-busy={busy === record.id} onClick={() => void mutate(record, 'APPROVE')}>{busy === record.id ? 'Approving…' : 'Approve'}</Button> : record.status === 'APPROVED_FOR_MANUAL_PAYMENT' ? <div className="payroll-reconcile"><label htmlFor={`payroll-reference-${record.id}`}>Payment reference</label><input id={`payroll-reference-${record.id}`} autoComplete="off" maxLength={160} placeholder="e.g. BANK-12345" value={references[record.id] ?? ''} onChange={(event) => setReferences((old) => ({ ...old, [record.id]: event.target.value }))}/><Button disabled={busy === record.id || !references[record.id]?.trim()} aria-busy={busy === record.id} onClick={() => void mutate(record, 'RECONCILE')}>{busy === record.id ? 'Saving…' : 'Mark paid'}</Button></div> : <span className="payroll-complete"><span className="material-symbols-outlined" aria-hidden="true">check_circle</span>Complete</span>}</td></tr>)}</tbody></table></div></Card>}
  </div>;
}

interface Branch { id: string; name: string; admissionFee?: number; }
export function TenantResourcesPage() {
  const [branches, setBranches] = useState<Branch[]>([]); const [branchId, setBranchId] = useState(''); const [tasks, setTasks] = useState<MaintenanceTask[]>([]); const [error, setError] = useState<unknown>(null); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); setError(null); try { const result = await request<{ branches: Branch[] }>('/branches'); setBranches(result.branches); const selected = branchId || result.branches[0]?.id || ''; setBranchId(selected); setTasks(selected ? (await resourcesApi.tasks(selected)).tasks : []); } catch (next) { setError(next); } finally { setLoading(false); } }, [branchId]);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => tasks.map((task) => ({ ...task, escalated: task.status !== 'COMPLETED' && Date.now() - new Date(task.createdAt).getTime() > task.escalationDaysSnapshot * 86400000 })), [tasks]);
  return <div style={{ display: 'grid', gap: 18 }}><Header title="Resource Oversight" description="Monitor maintenance work and policy-based escalation across branches."/><Card hoverable={false}><select style={{ ...input, maxWidth: 280 }} value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Card>{loading ? <RemoteState kind="loading"/> : error ? <RemoteState kind="error" message={errorMessage(error)} onRetry={() => void load()}/> : !visible.length ? <RemoteState kind="empty" message="No maintenance tasks for this branch."/> : <Card hoverable={false}>{visible.map((task) => <div key={task.id} style={row}><div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{task.description}</strong><StatusBadge variant={task.escalated ? 'error' : 'info'}>{task.escalated ? 'ESCALATED' : task.status}</StatusBadge></div><p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Escalates after {task.escalationDaysSnapshot} days · Assignee {task.assignedStaffId}</p></div>)}</Card>}</div>;
}

export function TenantCalendarPage() {
  const { showToast } = useToast(); const loader = useCallback(() => academicEventsApi.list(), []); const { data, loading, error, reload } = useRemote(loader);
  const [busy, setBusy] = useState(false); const [form, setForm] = useState({ title: '', description: '', eventType: 'EVENT' as EventType, audience: 'ALL' as EventAudience, classId: '', startDate: '', endDate: '' });
  const [calendarSystem, setCalendarSystem] = useState<CalendarSystem>('BS');
  const [targetingReady, setTargetingReady] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); try { if (!targetingReady) throw new Error('Wait for class targeting to load before publishing.'); if (!form.startDate.split('T')[0] || !form.endDate.split('T')[0]) throw new Error('Choose the start and end dates.'); if (form.endDate < form.startDate) throw new Error('End must be after the start date and time.'); await academicEventsApi.createTenantWide({ ...form, startDate: nepalDateTimeInputToIso(form.startDate), endDate: nepalDateTimeInputToIso(form.endDate) }); showToast('Institution-wide event published.', 'success'); setForm({ title: '', description: '', eventType: 'EVENT', audience: 'ALL', classId: '', startDate: '', endDate: '' }); await reload(); } catch (next) { showToast(errorMessage(next), 'error'); } finally { setBusy(false); } };
  const events = data?.events ?? [];
  return <div style={{ display: 'grid', gap: 18 }}><Header title="Academic Calendar" description="Plan institution-wide events and review the complete academic month."/>
    <TenantAcademicCalendar savingAudience={busy} onAudienceChange={async (event, audience) => { setBusy(true); try { await academicEventsApi.updateAudience(event.id, audience); await reload(); } catch (cause) { showToast(errorMessage(cause), 'error'); } finally { setBusy(false); } }} onCreateEvent={(date) => { setForm((old) => ({ ...old, startDate: `${date}T09:00`, endDate: `${date}T10:00` })); requestAnimationFrame(() => document.getElementById('tenant-event-form')?.scrollIntoView({ block: 'center' })); }} events={events} loading={loading} error={error ? errorMessage(error) : undefined} onRetry={() => void reload()} calendarSystem={calendarSystem} onCalendarSystemChange={setCalendarSystem} />
    <div className="tenant-calendar-page__lower"><Card hoverable={false}><h3>New institution event</h3><form id="tenant-event-form" onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: 14, marginTop: 14 }}>
      <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700 }}>Event title<input style={input} placeholder="Parent orientation" value={form.title} onChange={(e) => setForm((old) => ({ ...old, title: e.target.value }))} required/></label>
      <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700 }}>Event type<select style={input} value={form.eventType} onChange={(e) => setForm((old) => ({ ...old, eventType: e.target.value as EventType }))}><option value="EVENT">Event</option><option value="HOLIDAY">Holiday</option><option value="EXAM">Exam</option><option value="FEE_DUE">Fee due</option></select></label>
      <EventTargetFields onReadyChange={setTargetingReady} audience={form.audience} classId={form.classId} onAudienceChange={(audience) => setForm((old) => ({ ...old, audience }))} onClassChange={(classId) => setForm((old) => ({ ...old, classId }))} />
      <NepaliDateTimeField label="Starts" value={form.startDate} onChange={(value) => setForm((old) => ({ ...old, startDate: value }))} />
      <NepaliDateTimeField label="Ends" value={form.endDate} onChange={(value) => setForm((old) => ({ ...old, endDate: value }))} />
      <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700 }}>Description<textarea style={{ ...input, minHeight: 92, resize: 'vertical' }} placeholder="What should branches know about this event?" value={form.description} onChange={(e) => setForm((old) => ({ ...old, description: e.target.value }))}/></label>
      <Button disabled={busy || !targetingReady} aria-busy={busy} type="submit">{busy ? 'Publishing…' : 'Publish to all branches'}</Button></form></Card>
      <Card hoverable={false}><h3>Published events</h3><p style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 13 }}>Institution and branch events displayed in {calendarSystem}.</p>{events.map((item: AcademicEvent) => <div key={item.id} style={row}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}><div><strong>{item.title}</strong><p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>{calendarSystem === 'BS' ? nepaliDateHeading(nepalDateKey(item.startDate)) : englishDateLabel(nepalDateKey(item.startDate))} · {new Date(item.startDate).toLocaleTimeString([], { timeZone: NEPAL_TIME_ZONE, hour: '2-digit', minute: '2-digit' }) + ' NPT'} · {item.eventType.replace('_', ' ')}</p></div><StatusBadge variant={item.branchId ? 'info' : 'success'}>{item.branchId ? 'Branch' : 'Institution-wide'}</StatusBadge></div></div>)}</Card>
    </div>
  </div>;
}

export function TenantHrPage() {
  const loader = useCallback(() => hrApi.documentAlerts(), []); const { data, loading, error, reload } = useRemote(loader);
  const docs = data?.expiringDocs ?? [];
  return <div style={{ display: 'grid', gap: 18 }}><Header title="HR Management" description="Institution-wide document expiry alerts and final-settlement dependencies."/>
    {loading ? <RemoteState kind="loading"/> : error ? <RemoteState kind="error" message={errorMessage(error)} onRetry={() => void reload()}/> : !docs.length ? <RemoteState kind="empty" message="No staff documents expire within 30 days."/> : <Card hoverable={false}>{docs.map((doc: DocumentAlert) => { const days = Math.ceil((new Date(doc.expiryDate).getTime() - Date.now()) / 86400000); return <div key={doc.id} style={row}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div><strong>{doc.documentType}</strong><p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Staff record {doc.staffRecordId}</p></div><StatusBadge variant="warning">{days} days remaining</StatusBadge></div></div>; })}</Card>}
    <RemoteState kind="unavailable" message="Exit-case list/detail is blocked pending a tenant-scoped backend queue contract."/>
  </div>;
}

interface GradeOption { id: string; name: string; monthlyFee: number; billingMode: 'GRADE' | 'SUBJECT'; }
interface AdmissionClassOption { id: string; name: string; courseId: string; courseName: string; courseType: string; gradeId: string | null; branchId: string; feeStructure?: { monthlyBase?: number }; isTaxExempt?: boolean; taxPercentage?: number }
interface AdmissionResult {
  admission: {
    studentId: string; admissionNumber: string; admittedAt: string; status: 'PENDING_PAYMENT' | 'READY_FOR_LOGIN' | 'ACTIVE'; admissionFee: number | string;
    record: { institutionName: string; branchName: string; branchAddress: string; gradeName: string; className: string; admittedBy: { id: string; name: string }; primaryGuardian: { name: string; email: string; phone: string; relationship: string }; student: Record<string, string> };
  };
  loginDelivery: { delivered: boolean } | null;
  message: string;
}

function AdmissionPrintRecord({ result }: { result: AdmissionResult }) {
  const { admission } = result;
  const { record } = admission;
  const student = record.student;
  const details = [
    ['Admission number', admission.admissionNumber], ['Admitted', new Date(admission.admittedAt).toLocaleString('en-NP')],
    ['Student', `${student.firstName} ${student.lastName}`], ['Date of birth', student.dateOfBirth], ['Gender', student.gender],
    ['Blood group', student.bloodGroup || '—'], ['Nationality', student.nationality], ['Student phone', student.phone], ['Student email', student.email],
    ['Grade', record.gradeName], ['Class', record.className], ['Permanent address', student.permanentAddress],
    ['Temporary address', student.temporaryAddress || '—'], ['School', student.school || '—'], ['Medical/accessibility notes', student.medicalNotes || 'None recorded'],
  ];
  return <section className="admission-print-record" aria-label="Printable admission record">
    <header><div><h1>{record.institutionName}</h1><p>{record.branchName} · {record.branchAddress}</p></div><div><strong>STUDENT ADMISSION RECORD</strong><span>{admission.admissionNumber}</span></div></header>
    <h2>Student and admission information</h2><dl>{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="admission-print-columns"><section><h2>Father</h2><p><strong>{student.fatherName}</strong><br />{student.fatherPhone}<br />{student.fatherEmail || 'No email'}<br />{student.fatherOccupation || 'Occupation not recorded'}</p></section><section><h2>Mother</h2><p><strong>{student.motherName}</strong><br />{student.motherPhone}<br />{student.motherEmail || 'No email'}<br />{student.motherOccupation || 'Occupation not recorded'}</p></section></div>
    {student.optionalParentName ? <div className="admission-print-columns"><section><h2>Optional parent / guardian</h2><p><strong>{student.optionalParentName}</strong> ({student.optionalParentRelationship || 'Relationship not recorded'})<br />{student.optionalParentPhone || 'No phone'}<br />{student.optionalParentEmail || 'No email'}<br />{student.optionalParentOccupation || 'Occupation not recorded'}</p></section></div> : null}
    <div className="admission-print-columns"><section><h2>Primary parent account</h2><p><strong>{record.primaryGuardian.name}</strong> ({record.primaryGuardian.relationship})<br />{record.primaryGuardian.phone}<br />{record.primaryGuardian.email}</p></section><section><h2>Emergency contact</h2><p><strong>{student.emergencyContactName}</strong> ({student.emergencyContactRelationship})<br />{student.emergencyContactPhone}</p></section></div>
    <footer><div><span>Admitted by</span><strong>{record.admittedBy.name}</strong></div><div><span>Admission date and time</span><strong>{new Date(admission.admittedAt).toLocaleString('en-NP')}</strong></div><div className="admission-signature"><span>Parent/guardian signature</span></div><div className="admission-signature"><span>Authorized signature</span></div></footer>
  </section>;
}
export function TenantAdmissionsPage() {
  const { showToast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]); const [grades, setGrades] = useState<GradeOption[]>([]); const [classes, setClasses] = useState<AdmissionClassOption[]>([]);
  const [subjectClasses, setSubjectClasses] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<AdmissionResult | null>(null); const [printAfterSave, setPrintAfterSave] = useState(false);
  const localDateTime = () => { const value = new Date(); value.setMinutes(value.getMinutes() - value.getTimezoneOffset()); return value.toISOString().slice(0, 16); };
  const [form, setForm] = useState({ branchId: '', gradeId: '', classId: '', admittedAt: localDateTime(), studentFirst: '', studentLast: '', studentEmail: '', studentPhone: '', dateOfBirth: '', gender: '', bloodGroup: '', nationality: 'Nepali', permanentAddress: '', temporaryAddress: '', school: '', medicalNotes: '', fatherName: '', fatherPhone: '', fatherEmail: '', fatherOccupation: '', motherName: '', motherPhone: '', motherEmail: '', motherOccupation: '', optionalParentName: '', optionalParentPhone: '', optionalParentEmail: '', optionalParentOccupation: '', optionalParentRelationship: '', primaryParent: '', emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelationship: '' });
  useEffect(() => { void Promise.all([request<{ branches: Branch[] }>('/branches'), request<{ grades: GradeOption[] }>('/grades'), request<{ classes: any[] }>('/courses/classes')]).then(([b, g, c]) => { setBranches(b.branches); setGrades(g.grades); setClasses(c.classes); const branchId = b.branches[0]?.id ?? ''; const gradeId = g.grades[0]?.id ?? ''; const classId = c.classes.find((item) => item.branchId === branchId && item.gradeId === gradeId && item.courseType === 'REGULAR')?.id ?? ''; setForm((old) => ({ ...old, branchId, gradeId, classId })); }).catch((next) => showToast(errorMessage(next), 'error')); }, []);
  useEffect(() => { if (result && printAfterSave) { setPrintAfterSave(false); window.setTimeout(() => window.print(), 0); } }, [result, printAfterSave]);
  const availableClasses = classes.filter((item) => item.branchId === form.branchId && item.gradeId === form.gradeId && item.courseType === 'REGULAR');
  const selectedGrade = grades.find((grade) => grade.id === form.gradeId);
  const subjectBilling = selectedGrade?.billingMode === 'SUBJECT';
  const selectedSubjectClassIds = Object.values(subjectClasses).filter(Boolean);
  const requiredAdmissionFields = ['branchId','gradeId','admittedAt','studentFirst','studentLast','studentEmail','studentPhone','dateOfBirth','gender','nationality','permanentAddress','fatherName','fatherPhone','motherName','motherPhone','primaryParent','emergencyContactName','emergencyContactPhone','emergencyContactRelationship'] as const;
  const primaryParentRequirements: Array<{ key: keyof typeof form; label: string }> = form.primaryParent === 'Father'
    ? [{ key: 'fatherName', label: "father's name" }, { key: 'fatherPhone', label: "father's phone" }, { key: 'fatherEmail', label: "father's email" }]
    : form.primaryParent === 'Mother'
      ? [{ key: 'motherName', label: "mother's name" }, { key: 'motherPhone', label: "mother's phone" }, { key: 'motherEmail', label: "mother's email" }]
      : form.primaryParent === 'Optional parent'
        ? [{ key: 'optionalParentName', label: "guardian's name" }, { key: 'optionalParentPhone', label: "guardian's phone" }, { key: 'optionalParentEmail', label: "guardian's email" }, { key: 'optionalParentRelationship', label: "guardian's relationship" }]
        : [];
  const missingPrimaryParentFields = primaryParentRequirements.filter(({ key }) => !form[key].trim());
  const primaryParentReady = Boolean(form.primaryParent) && missingPrimaryParentFields.length === 0;
  const academicPlacementReady = subjectBilling ? selectedSubjectClassIds.length > 0 : true;
  const canPrint = requiredAdmissionFields.every((key) => form[key].trim()) && academicPlacementReady && primaryParentReady && !busy;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const shouldPrint = submitter?.value === 'save-and-print';
    setPrintAfterSave(shouldPrint); setBusy(true);
    try {
      const admissionDetails = Object.fromEntries(Object.entries(form).filter(([key]) => ['admittedAt','dateOfBirth','gender','bloodGroup','nationality','permanentAddress','temporaryAddress','school','medicalNotes','fatherName','fatherPhone','fatherEmail','fatherOccupation','motherName','motherPhone','motherEmail','motherOccupation','optionalParentName','optionalParentPhone','optionalParentEmail','optionalParentOccupation','optionalParentRelationship','primaryParent','emergencyContactName','emergencyContactPhone','emergencyContactRelationship'].includes(key)));
      const selectedParent = form.primaryParent === 'Father' ? { name: form.fatherName, email: form.fatherEmail, phone: form.fatherPhone } : form.primaryParent === 'Mother' ? { name: form.motherName, email: form.motherEmail, phone: form.motherPhone } : { name: form.optionalParentName, email: form.optionalParentEmail, phone: form.optionalParentPhone };
      if (form.studentEmail.trim().toLowerCase() === selectedParent.email.trim().toLowerCase()) throw new Error('Student and primary parent emails must be different.');
      const nameParts = selectedParent.name.trim().split(/\s+/); const firstName = nameParts.shift() ?? ''; const lastName = nameParts.join(' ') || firstName;
      const classIds = subjectBilling ? selectedSubjectClassIds : [];
      const admission = await request<AdmissionResult>('/users/admissions', { method: 'POST', body: JSON.stringify({ branchId: form.branchId, gradeId: form.gradeId, classIds, student: { firstName: form.studentFirst, lastName: form.studentLast, email: form.studentEmail, phone: form.studentPhone }, parent: { firstName, lastName, email: selectedParent.email, phone: selectedParent.phone }, admissionDetails }) });
      setResult(admission); showToast(admission.message, admission.loginDelivery && !admission.loginDelivery.delivered ? 'error' : 'success');
    } catch (next) { setPrintAfterSave(false); showToast(errorMessage(next), 'error'); } finally { setBusy(false); }
  };
  const acknowledge = () => { setResult(null); setForm((old) => ({ ...old, admittedAt: localDateTime(), studentFirst: '', studentLast: '', studentEmail: '', studentPhone: '', dateOfBirth: '', gender: '', bloodGroup: '', permanentAddress: '', temporaryAddress: '', school: '', medicalNotes: '', fatherName: '', fatherPhone: '', fatherEmail: '', fatherOccupation: '', motherName: '', motherPhone: '', motherEmail: '', motherOccupation: '', optionalParentName: '', optionalParentPhone: '', optionalParentEmail: '', optionalParentOccupation: '', optionalParentRelationship: '', primaryParent: '', emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelationship: '' })); };
  const selectedBranch = branches.find((branch) => branch.id === form.branchId);
  const subjectGroups = Array.from(new Map(availableClasses.map((item) => [item.courseId, { courseId: item.courseId, courseName: item.courseName, classes: availableClasses.filter((option) => option.courseId === item.courseId), fee: Number(item.feeStructure?.monthlyBase ?? 0) }])).values());
  const recurringEstimate = subjectBilling ? subjectGroups.filter((group) => subjectClasses[group.courseId]).reduce((sum, group) => { const option = group.classes[0]; return sum + group.fee * (option?.isTaxExempt ? 1 : 1 + Number(option?.taxPercentage ?? 0) / 100); }, 0) : Number(selectedGrade?.monthlyFee ?? 0);
  return <div style={{ display: 'grid', gap: 18 }}><Header title="Admissions" description="Complete admission first. Login IDs activate and are sent to the recorded phone numbers only after the branch fee is paid."/>
    {!result ? <Card hoverable={false}><form onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: 16 }} aria-busy={busy}>
      <div style={grid}>
        <label>Branch<select required style={input} value={form.branchId} onChange={(e) => { const branchId = e.target.value; const classId = classes.find((item) => item.branchId === branchId && item.gradeId === form.gradeId && item.courseType === 'REGULAR')?.id ?? ''; setSubjectClasses({}); setForm((old) => ({ ...old, branchId, classId })); }}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label>Grade<select required style={input} value={form.gradeId} onChange={(e) => { const gradeId = e.target.value; const nextGrade = grades.find((grade) => grade.id === gradeId); const classId = nextGrade?.billingMode === 'GRADE' ? classes.find((item) => item.branchId === form.branchId && item.gradeId === gradeId && item.courseType === 'REGULAR')?.id ?? '' : ''; setSubjectClasses({}); setForm((old) => ({ ...old, gradeId, classId })); }}>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>
        {subjectBilling ? <div><strong style={{ fontSize: 13 }}>Subject selection *</strong><small style={{ display: 'block', marginTop: 6, color: 'var(--text-muted)' }}>{selectedSubjectClassIds.length} subject{selectedSubjectClassIds.length === 1 ? '' : 's'} selected</small></div> : <div><strong style={{ fontSize: 13 }}>Regular admission</strong><small style={{ display: 'block', marginTop: 6, color: 'var(--text-muted)' }}>The student is admitted to the selected grade. Extra-class enrollment is managed separately.</small></div>}
        <label>Admission date and time *<input required type="datetime-local" style={input} value={form.admittedAt} onChange={(e) => setForm((old) => ({ ...old, admittedAt: e.target.value }))}/></label>
      </div>
      {subjectBilling ? <fieldset className="admission-fieldset"><legend>Class 11–12 subjects and classes</legend><p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Select the subjects this student will study. Each selected subject contributes to monthly billing.</p><div className="admission-subject-grid">{subjectGroups.map((group) => { const selectable = group.fee > 0 && group.classes.length > 0; return <label key={group.courseId} className={`admission-subject-card${subjectClasses[group.courseId] ? ' is-selected' : ''}${!selectable ? ' is-disabled' : ''}`}><span><input type="checkbox" disabled={!selectable} checked={Boolean(subjectClasses[group.courseId])} onChange={(event) => setSubjectClasses((current) => ({ ...current, [group.courseId]: event.target.checked ? group.classes[0]?.id ?? '' : '' }))} /><strong>{group.courseName}</strong></span><small>{group.fee <= 0 ? 'Set the subject price in Courses first' : !group.classes.length ? 'Create a class for this subject first' : `NPR ${group.fee.toLocaleString('en-NP')}/month before tax`}</small>{subjectClasses[group.courseId] ? <select aria-label={`${group.courseName} class`} value={subjectClasses[group.courseId]} onChange={(event) => setSubjectClasses((current) => ({ ...current, [group.courseId]: event.target.value }))}>{group.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : null}</label>; })}</div>{!subjectGroups.length ? <p role="alert" style={{ color: 'var(--color-error)' }}>Create priced subjects and classes for this grade before admission.</p> : null}</fieldset> : null}
      <div role="note" style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--color-surface)' }}>
        <strong>Admission fee for this branch: NPR {Number(selectedBranch?.admissionFee ?? 0).toLocaleString()}</strong>
        <p style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 13 }}>One-time amount due now. Estimated recurring tuition after activation: <strong>NPR {Math.round(recurringEstimate).toLocaleString('en-NP')}/month</strong>.</p>
      </div>
      <fieldset className="admission-fieldset"><legend>Student details</legend><div style={grid}>{[['studentFirst','First name'],['studentLast','Last name'],['studentEmail','Email'],['studentPhone','Phone']].map(([key, text]) => <label key={key}>{text} *<input required style={input} type={key.includes('Email') ? 'email' : key.includes('Phone') ? 'tel' : 'text'} autoComplete={key.includes('Email') ? 'email' : key.includes('Phone') ? 'tel' : key.includes('First') ? 'given-name' : 'family-name'} value={form[key as keyof typeof form]} onChange={(e) => setForm((old) => ({ ...old, [key]: e.target.value }))}/></label>)}<label>Date of birth *<input required type="date" max={new Date().toISOString().slice(0, 10)} style={input} value={form.dateOfBirth} onChange={(e) => setForm((old) => ({ ...old, dateOfBirth: e.target.value }))}/></label><label>Gender *<select required style={input} value={form.gender} onChange={(e) => setForm((old) => ({ ...old, gender: e.target.value }))}><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option></select></label><label>Blood group<input style={input} value={form.bloodGroup} onChange={(e) => setForm((old) => ({ ...old, bloodGroup: e.target.value }))} placeholder="O+" /></label><label>Nationality *<input required style={input} value={form.nationality} onChange={(e) => setForm((old) => ({ ...old, nationality: e.target.value }))}/></label><label>School<input style={input} value={form.school} onChange={(e) => setForm((old) => ({ ...old, school: e.target.value }))}/></label></div><label>Permanent address *<textarea required style={{ ...input, minHeight: 72 }} value={form.permanentAddress} onChange={(e) => setForm((old) => ({ ...old, permanentAddress: e.target.value }))}/></label><label>Temporary address<textarea style={{ ...input, minHeight: 72 }} value={form.temporaryAddress} onChange={(e) => setForm((old) => ({ ...old, temporaryAddress: e.target.value }))}/></label><label>Medical conditions, allergies, or accessibility notes<textarea style={{ ...input, minHeight: 72 }} value={form.medicalNotes} onChange={(e) => setForm((old) => ({ ...old, medicalNotes: e.target.value }))}/></label></fieldset>
      <fieldset className="admission-fieldset"><legend>Father's details</legend><div style={grid}>{[['fatherName','Full name *'],['fatherPhone','Phone *'],['fatherEmail',`Email${form.primaryParent === 'Father' ? ' *' : ''}`],['fatherOccupation','Occupation']].map(([key, text]) => <label key={key} htmlFor={`admission-${key}`}>{text}<input id={`admission-${key}`} required={key === 'fatherName' || key === 'fatherPhone' || (key === 'fatherEmail' && form.primaryParent === 'Father')} style={input} type={key.includes('Email') ? 'email' : key.includes('Phone') ? 'tel' : 'text'} autoComplete={key.includes('Email') ? 'email' : key.includes('Phone') ? 'tel' : 'off'} value={form[key as keyof typeof form]} onChange={(e) => setForm((old) => ({ ...old, [key]: e.target.value }))}/></label>)}</div></fieldset>
      <fieldset className="admission-fieldset"><legend>Mother's details</legend><div style={grid}>{[['motherName','Full name *'],['motherPhone','Phone *'],['motherEmail',`Email${form.primaryParent === 'Mother' ? ' *' : ''}`],['motherOccupation','Occupation']].map(([key, text]) => <label key={key} htmlFor={`admission-${key}`}>{text}<input id={`admission-${key}`} required={key === 'motherName' || key === 'motherPhone' || (key === 'motherEmail' && form.primaryParent === 'Mother')} style={input} type={key.includes('Email') ? 'email' : key.includes('Phone') ? 'tel' : 'text'} autoComplete={key.includes('Email') ? 'email' : key.includes('Phone') ? 'tel' : 'off'} value={form[key as keyof typeof form]} onChange={(e) => setForm((old) => ({ ...old, [key]: e.target.value }))}/></label>)}</div></fieldset>
      <fieldset className="admission-fieldset"><legend>Optional parent or guardian</legend><p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Leave this section empty if only the father and mother should be recorded.</p><div style={grid}>{[['optionalParentName',`Full name${form.primaryParent === 'Optional parent' ? ' *' : ''}`],['optionalParentPhone',`Phone${form.primaryParent === 'Optional parent' ? ' *' : ''}`],['optionalParentEmail',`Email${form.primaryParent === 'Optional parent' ? ' *' : ''}`],['optionalParentOccupation','Occupation'],['optionalParentRelationship',`Relationship${form.primaryParent === 'Optional parent' ? ' *' : ''}`]].map(([key, text]) => <label key={key} htmlFor={`admission-${key}`}>{text}<input id={`admission-${key}`} required={form.primaryParent === 'Optional parent' && key !== 'optionalParentOccupation'} style={input} type={key.includes('Email') ? 'email' : key.includes('Phone') ? 'tel' : 'text'} autoComplete={key.includes('Email') ? 'email' : key.includes('Phone') ? 'tel' : 'off'} value={form[key as keyof typeof form]} onChange={(e) => setForm((old) => ({ ...old, [key]: e.target.value }))}/></label>)}</div></fieldset>
      <fieldset className="admission-fieldset"><legend>Primary parent account</legend><p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Choose who will receive the parent login. You can select them before completing their details; a valid email is required to create the account.</p><label htmlFor="admission-primary-parent">Parent receiving credentials *<select id="admission-primary-parent" required style={input} value={form.primaryParent} aria-describedby={form.primaryParent && !primaryParentReady ? 'admission-primary-parent-help' : undefined} onChange={(e) => setForm((old) => ({ ...old, primaryParent: e.target.value }))}><option value="">Choose father, mother, or guardian</option><option value="Father">Father</option><option value="Mother">Mother</option><option value="Optional parent">Optional parent or guardian</option></select></label>{form.primaryParent && !primaryParentReady ? <div id="admission-primary-parent-help" className="admission-parent-warning" role="status" aria-live="polite"><div><strong>Complete the selected parent account</strong><p>Add {missingPrimaryParentFields.map(({ label }) => label).join(', ')} before completing admission.</p></div><button type="button" onClick={() => document.getElementById(`admission-${missingPrimaryParentFields[0]?.key}`)?.focus()}>Add missing details</button></div> : form.primaryParent ? <p className="admission-parent-ready" role="status">Ready — {form.primaryParent} will receive the parent login credentials.</p> : null}</fieldset>
      <fieldset className="admission-fieldset"><legend>Emergency contact</legend><div style={grid}>{[['emergencyContactName','Full name *'],['emergencyContactPhone','Phone *'],['emergencyContactRelationship','Relationship *']].map(([key, text]) => <label key={key}>{text}<input required style={input} type={key.includes('Phone') ? 'tel' : 'text'} value={form[key as keyof typeof form]} onChange={(e) => setForm((old) => ({ ...old, [key]: e.target.value }))}/></label>)}</div></fieldset>
      <div className="admission-result-actions">
        <Button disabled={busy || !form.branchId || !form.gradeId || !academicPlacementReady || !form.admittedAt} type="submit">{busy ? 'Saving admission…' : 'Complete admission'}</Button>
        <Button variant="outline" type="submit" name="admission-action" value="save-and-print" disabled={!canPrint} title={canPrint ? 'Save the admission and open the printable record' : 'Complete every required field to enable printing'}><span className="material-symbols-outlined" aria-hidden="true">print</span>Save and print admission</Button>
      </div>
      {!canPrint && !busy ? <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>Complete all required fields to enable printing.</p> : null}
    </form></Card> : <Card hoverable={false}><StatusBadge variant={result.admission.status === 'ACTIVE' ? 'success' : 'warning'}>{result.admission.status === 'ACTIVE' ? 'Active' : 'Payment pending'}</StatusBadge><h3 style={{ marginTop: 12 }}>Admission recorded</h3><div role="status" style={{ padding: 16, marginTop: 12, background: 'var(--color-warning-soft)', borderRadius: 10 }}><strong>{result.message}</strong><p style={{ marginTop: 12 }}>Amount due: <strong>NPR {Number(result.admission.admissionFee).toLocaleString()}</strong></p><p style={{ marginTop: 10, color: 'var(--text-muted)' }}>After confirmed payment, student and parent login IDs and temporary passwords are sent automatically to their admission phone numbers.</p></div><AdmissionPrintRecord result={result} /><div className="admission-result-actions"><Button onClick={() => window.print()}><span className="material-symbols-outlined" aria-hidden="true">print</span>Print admission record</Button><Button variant="outline" onClick={acknowledge}>Start another admission</Button></div></Card>}
  </div>;
}

export function TenantCertificatesPage() {
  const { showToast } = useToast();
  type CertificateOptions = Awaited<ReturnType<typeof api.branchAdmin.getCertificateOptions>>;
  const [templates, setTemplates] = useState<Array<CertificateOptions['templates'][number] & { status: string }>>([]);
  const [students, setStudents] = useState<CertificateOptions['students']>([]);
  const [form, setForm] = useState({ name: '', type: 'COMPLETION', theme: 'CLASSIC', title: 'Certificate of Completion', presentationLine: 'This certificate is proudly presented to', achievementLine: 'For successfully completing the learning program', signatoryName: '', signatoryTitle: 'Institution representative' });
  const [activeTab, setActiveTab] = useState<'ISSUE' | 'TEMPLATES' | 'ISSUED'>('ISSUE');
  const [issued, setIssued] = useState<Awaited<ReturnType<typeof api.branchAdmin.getIssuedCertificates>>['certificates']>([]);
  const [revokeId, setRevokeId] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [studentKey, setStudentKey] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [issuedId, setIssuedId] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadTemplates = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { const [result, history] = await Promise.all([api.branchAdmin.getCertificateOptions(), api.branchAdmin.getIssuedCertificates()]); setTemplates(result.templates); setStudents(result.students); setIssued(history.certificates); }
    catch (next) { const message = errorMessage(next); setLoadError(message); showToast(message, 'error'); }
    finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void loadTemplates(); }, [loadTemplates]);

  const addTemplate = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.title.trim() || !form.achievementLine.trim() || !form.signatoryName.trim()) return;
    setBusy(true);
    try {
      const layoutConfig = { renderMode: 'DESIGN', theme: form.theme, title: form.title.trim(), presentationLine: form.presentationLine.trim(), achievementLine: form.achievementLine.trim(), signatoryName: form.signatoryName.trim(), signatoryTitle: form.signatoryTitle.trim() };
      await request('/certificates/templates', { method: 'POST', body: JSON.stringify({ name: form.name.trim(), type: form.type, layoutConfig }) });
      setForm((current) => ({ ...current, name: '' }));
      await loadTemplates(); setActiveTab('TEMPLATES'); showToast('Certificate template created.', 'success');
    } catch (next) { showToast(errorMessage(next), 'error'); }
    finally { setBusy(false); }
  };

  const issueCertificate = async (event: FormEvent) => {
    event.preventDefault();
    const student = students.find((item) => `${item.studentId}:${item.branchId}` === studentKey);
    if (!student || !templateId) return;
    setIssuing(true); setIssuedId('');
    try {
      const result = await api.branchAdmin.issueCertificate({ studentId: student.studentId, templateId, branchId: student.branchId });
      setIssuedId(result.certificate.certificateId); showToast(`Certificate issued to ${student.studentName}.`, 'success');
    } catch (next) { showToast(errorMessage(next), 'error'); }
    finally { setIssuing(false); }
  };

  const issuedTemplate = templates.find((template) => template.id === templateId);
  const selectedStudent = students.find((item) => `${item.studentId}:${item.branchId}` === studentKey);
  const selectedTemplate = templates.find((item) => item.id === templateId);

  const revokeCertificate = async () => {
    if (!revokeId || revokeReason.trim().length < 5) return;
    setBusy(true);
    try { await api.branchAdmin.revokeCertificate(revokeId, revokeReason); setRevokeId(''); setRevokeReason(''); await loadTemplates(); showToast('Certificate revoked.', 'success'); }
    catch (next) { showToast(errorMessage(next), 'error'); }
    finally { setBusy(false); }
  };
  const archiveTemplate = async (id: string) => {
    setBusy(true);
    try { await api.branchAdmin.archiveCertificateTemplate(id); await loadTemplates(); showToast('Template archived. Existing certificates are unchanged.', 'success'); }
    catch (next) { showToast(errorMessage(next), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="tenant-certificate-page">
      <Header title="Certificates" description="Create trusted certificate designs, issue them to enrolled students, and manage their validity." />
      {loadError ? <RemoteState kind="error" message={`Certificate tools could not be loaded. ${loadError}`} onRetry={() => void loadTemplates()} /> : null}
      <nav className="tenant-certificate-tabs" aria-label="Certificate workspace">{([['ISSUE', 'Issue certificate'], ['TEMPLATES', 'Templates'], ['ISSUED', 'Issued certificates']] as const).map(([id, label]) => <button key={id} type="button" className={activeTab === id ? 'is-active' : ''} aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)}>{label}{id === 'TEMPLATES' ? <span>{templates.length}</span> : id === 'ISSUED' ? <span>{issued.length}</span> : null}</button>)}</nav>
      {activeTab === 'TEMPLATES' ? <div className="tenant-certificate-layout">
        <Card hoverable={false}>
          <div className="tenant-certificate-heading"><div><h3>Template library</h3><p>Reusable institution-level certificate designs.</p></div><StatusBadge variant="info">{templates.length} templates</StatusBadge></div>
          <div className="tenant-certificate-table-wrap"><table className="tenant-certificate-table">
            <thead>
              <tr><th>Template name</th><th>Type</th><th>Version</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id}><td>{t.name}<small>{t.layoutConfig?.renderMode === 'DESIGN' ? `${t.layoutConfig.theme ?? 'Classic'} design` : 'Legacy template'}</small></td><td>{t.type}</td><td>v{t.version}</td><td><StatusBadge variant={t.status === 'ACTIVE' ? 'success' : 'warning'}>{t.status}</StatusBadge></td><td><Button type="button" variant="ghost" disabled={busy} onClick={() => void archiveTemplate(t.id)}>Archive</Button></td>
                </tr>
              ))}
              {!loading && !templates.length ? <tr><td colSpan={5} className="tenant-certificate-empty">No certificate templates have been created.</td></tr> : null}
            </tbody>
          </table></div>
        </Card>

        <Card hoverable={false}>
          <div className="tenant-certificate-heading"><div><h3>Create template</h3><p>Build a reusable, print-ready design without writing code.</p></div></div>
          <form onSubmit={addTemplate} className="tenant-certificate-form">
            <label htmlFor="certificate-name">Template name<input id="certificate-name" style={input} placeholder="Special Achievement" value={form.name} onChange={e => setForm(old => ({ ...old, name: e.target.value }))} required /></label>
            <label htmlFor="certificate-type">Certificate type<select id="certificate-type" style={input} value={form.type} onChange={e => setForm(old => ({ ...old, type: e.target.value }))}>
                <option value="COMPLETION">Course Completion</option>
                <option value="ACHIEVEMENT">Achievement</option>
                <option value="ATTENDANCE">Attendance</option>
                <option value="CUSTOM">Custom</option>
              </select></label>
            <fieldset className="tenant-certificate-source"><legend>Visual style</legend><div>{(['CLASSIC', 'MODERN', 'ACADEMIC'] as const).map((theme) => <label key={theme} className={form.theme === theme ? 'is-selected' : ''}><input type="radio" name="certificate-theme" checked={form.theme === theme} onChange={() => setForm((old) => ({ ...old, theme }))} />{theme.charAt(0) + theme.slice(1).toLowerCase()}</label>)}</div></fieldset>
            <label htmlFor="certificate-title">Certificate heading<input id="certificate-title" style={input} value={form.title} onChange={(event) => setForm((old) => ({ ...old, title: event.target.value }))} required /></label>
            <label htmlFor="certificate-achievement">Achievement statement<textarea id="certificate-achievement" rows={3} value={form.achievementLine} onChange={(event) => setForm((old) => ({ ...old, achievementLine: event.target.value }))} required /><small>Describe exactly what the student earned or completed.</small></label>
            <div className="tenant-certificate-form-row"><label htmlFor="certificate-signatory">Signatory name<input id="certificate-signatory" style={input} value={form.signatoryName} onChange={(event) => setForm((old) => ({ ...old, signatoryName: event.target.value }))} required /></label><label htmlFor="certificate-signatory-title">Signatory role<input id="certificate-signatory-title" style={input} value={form.signatoryTitle} onChange={(event) => setForm((old) => ({ ...old, signatoryTitle: event.target.value }))} required /></label></div>
            <div className={`tenant-certificate-design-preview is-${form.theme.toLowerCase()}`} aria-label="Certificate design preview"><small>Main Branch</small><h4>{form.title || 'Certificate title'}</h4><p>{form.presentationLine}</p><strong>Sample Student</strong><p>{form.achievementLine || 'Achievement statement'}</p><footer><span>{form.signatoryName || 'Signatory name'}</span><span>Issue date</span></footer></div>
            <Button type="submit" disabled={busy || !form.name.trim() || !form.title.trim() || !form.achievementLine.trim() || !form.signatoryName.trim()} aria-busy={busy}>{busy ? 'Creating template…' : 'Create template'}</Button>
          </form>
        </Card>
      </div> : null}
      {activeTab === 'ISSUE' ? <Card hoverable={false}>
        <div className="tenant-certificate-heading"><div><h3>Issue certificate</h3><p>Choose the recipient and approved design, then review the final details.</p></div></div>
        <form onSubmit={issueCertificate} className="tenant-certificate-issue-form">
          <label htmlFor="certificate-student">Student *<select id="certificate-student" style={input} value={studentKey} onChange={(event) => { setStudentKey(event.target.value); setIssuedId(''); }} required><option value="">Select enrolled student</option>{students.map((student) => <option key={`${student.studentId}:${student.branchId}`} value={`${student.studentId}:${student.branchId}`}>{student.studentName} · {student.gradeName} · {student.branchName}</option>)}</select></label>
          <label htmlFor="certificate-template">Template *<select id="certificate-template" style={input} value={templateId} onChange={(event) => { setTemplateId(event.target.value); setIssuedId(''); }} required><option value="">Select certificate template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.layoutConfig?.renderMode === 'DESIGN' ? `${template.layoutConfig.theme ?? 'Classic'} design` : 'Legacy'}</option>)}</select></label>
          <Button type="submit" disabled={issuing || !studentKey || !templateId} aria-busy={issuing}>{issuing ? 'Issuing…' : 'Issue certificate'}</Button>
        </form>
        {selectedStudent && selectedTemplate ? <div className="tenant-certificate-issue-preview"><span className="material-symbols-outlined" aria-hidden="true">preview</span><div><strong>{selectedTemplate.name}</strong><p>{selectedStudent.studentName} · {selectedStudent.gradeName} · {selectedStudent.branchName}</p></div><StatusBadge variant="info">Ready to issue</StatusBadge></div> : <div className="tenant-certificate-empty-state"><span className="material-symbols-outlined" aria-hidden="true">workspace_premium</span><div><strong>Choose a student and template</strong><p>The final details will appear here before issuance.</p></div></div>}
        {issuedId ? <div className="tenant-certificate-issued" role="status"><span className="material-symbols-outlined" aria-hidden="true">verified</span><div><strong>Certificate issued successfully</strong><p>Verification ID: {issuedId}</p></div><div><Button type="button" variant="outline" onClick={() => window.open(`${API_BASE_URL}/certificates/${encodeURIComponent(issuedId)}/download`, '_blank', 'noopener,noreferrer')}>Download PDF</Button>{issuedTemplate?.layoutConfig?.renderMode === 'HTML' ? <Button type="button" onClick={() => window.open(`${API_BASE_URL}/certificates/${encodeURIComponent(issuedId)}/html`, '_blank', 'noopener,noreferrer')}>Open HTML</Button> : null}</div></div> : null}
      </Card> : null}
      {activeTab === 'ISSUED' ? <Card hoverable={false}><div className="tenant-certificate-heading"><div><h3>Issued certificates</h3><p>Permanent credential records with downloadable documents and live validity.</p></div></div>{issued.length ? <div className="tenant-certificate-table-wrap"><table className="tenant-certificate-table"><thead><tr><th>Student</th><th>Certificate</th><th>Branch</th><th>Issued</th><th>Status</th><th>Actions</th></tr></thead><tbody>{issued.map((item) => <tr key={item.certificateId}><td><strong>{item.studentName}</strong><small>{item.gradeName}</small></td><td>{item.templateName}<small>{item.certificateId}</small></td><td>{item.branchName}</td><td>{new Date(item.issuedDate).toLocaleDateString('en-GB')}</td><td><StatusBadge variant={item.status === 'ACTIVE' ? 'success' : 'warning'}>{item.status}</StatusBadge></td><td><div className="tenant-certificate-row-actions"><Button type="button" variant="outline" onClick={() => window.open(`${API_BASE_URL}/certificates/${encodeURIComponent(item.certificateId)}/download`, '_blank', 'noopener,noreferrer')}>Download</Button>{item.status === 'ACTIVE' ? <Button type="button" variant="ghost" onClick={() => { setRevokeId(item.certificateId); setRevokeReason(''); }}>Revoke</Button> : null}</div></td></tr>)}</tbody></table></div> : <div className="tenant-certificate-empty-state"><span className="material-symbols-outlined" aria-hidden="true">history_edu</span><div><strong>No certificates issued</strong><p>Issued certificates will appear here as permanent records.</p></div></div>}{revokeId ? <div className="tenant-certificate-revoke" role="alert"><div><strong>Revoke certificate?</strong><p>This marks {revokeId} invalid on public verification. The audit record remains.</p></div><label htmlFor="certificate-revoke-reason">Reason<textarea id="certificate-revoke-reason" rows={2} value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} placeholder="Explain why this credential is no longer valid" /></label><div><Button type="button" variant="danger" disabled={busy || revokeReason.trim().length < 5} onClick={() => void revokeCertificate()}>Revoke certificate</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setRevokeId('')}>Cancel</Button></div></div> : null}</Card> : null}
    </div>
  );
}

export function TenantLeaveRequestsPage() {
  const { showToast } = useToast();
  const [requests, setRequests] = useState<Awaited<ReturnType<typeof api.branchAdmin.getLeaves>>['leaves']>([]);
  const [busy, setBusy] = useState('');
  const [decisionRemarks, setDecisionRemarks] = useState<Record<string, string>>({});
  const [decisionErrors, setDecisionErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedDecision, setSelectedDecision] = useState<(typeof requests)[number] | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { setRequests((await api.branchAdmin.getLeaves('L2')).leaves); }
    catch (next) { setLoadError(errorMessage(next)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const interval = window.setInterval(() => { void load(); }, 15_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const mutate = async (id: string, action: 'APPROVE' | 'REJECT') => {
    const remarks = decisionRemarks[id]?.trim();
    if (action === 'REJECT' && !remarks) {
      setDecisionErrors((current) => ({ ...current, [id]: 'Add a reason so the teacher understands why this request was rejected.' }));
      document.getElementById(`leave-remarks-${id}`)?.focus();
      return;
    }
    setBusy(id); setDecisionErrors((current) => ({ ...current, [id]: '' }));
    try {
      await api.branchAdmin.decideLeave(id, action, action === 'REJECT' ? remarks : undefined);
      await load();
      setDecisionRemarks((current) => ({ ...current, [id]: '' }));
      showToast(action === 'APPROVE' ? 'Leave approved. The teacher can now see the final decision.' : 'Leave rejected. The teacher can now see the reason.', 'success');
    } catch (next) {
      showToast(errorMessage(next), 'error');
    } finally {
      setBusy('');
    }
  };

  const pending = requests.filter(r => r.status === 'APPROVED_LEVEL1');
  const history = requests.filter(r => r.status !== 'APPROVED_LEVEL1');

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Header title="Leave Requests (Level 2)" description="Final approval for long-duration or special leaves forwarded by Branch Admins." />
      
      <Card hoverable={false}>
        <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>Pending Final Approval</h3>
        {loading ? <RemoteState kind="loading" message="Loading Level 2 leave requests…" /> : loadError ? <RemoteState kind="error" message={loadError} onRetry={() => void load()} /> : !pending.length ? <RemoteState kind="empty" message="No pending Level 2 leave requests." /> :
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {pending.map(req => (
              <div key={req.id} style={{ ...row, padding: '16px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ fontSize: '15px' }}>{req.staffName}</strong> <span style={{ color: 'var(--text-muted)' }}>({req.branchName})</span>
                    <div style={{ marginTop: '8px', display: 'flex', gap: '12px', fontSize: '13px' }}>
                      <span style={{ fontWeight: 600 }}>{req.leaveType.replaceAll('_', ' ')}</span>
                      <span>{Math.max(1, Math.ceil((new Date(req.endDate).getTime() - new Date(req.startDate).getTime()) / 86_400_000) + 1)} days</span>
                      <span>Starts: {new Date(req.startDate).toLocaleDateString('en-NP')}</span>
                    </div>
                    <p style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>"{req.reason}"</p>
                    <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--color-primary)' }}>Level 1 approval recorded by the assigned Branch Admin.</p>
                  </div>
                  <StatusBadge variant="warning">L2 Review</StatusBadge>
                </div>
                <label style={{ display: 'grid', gap: 6, marginTop: 16, fontSize: 13, fontWeight: 700 }} htmlFor={`leave-remarks-${req.id}`}>Reason for rejection <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 400 }}>Required only when rejecting.</span><textarea id={`leave-remarks-${req.id}`} style={{ ...input, minHeight: 72 }} maxLength={2000} value={decisionRemarks[req.id] ?? ''} aria-invalid={Boolean(decisionErrors[req.id]) || undefined} aria-describedby={decisionErrors[req.id] ? `leave-remarks-error-${req.id}` : undefined} onChange={(event) => { setDecisionRemarks((old) => ({ ...old, [req.id]: event.target.value })); if (decisionErrors[req.id]) setDecisionErrors((current) => ({ ...current, [req.id]: '' })); }} placeholder="Explain the decision to the teacher" />{decisionErrors[req.id] ? <span id={`leave-remarks-error-${req.id}`} role="alert" style={{ color: 'var(--color-error)', fontSize: 12 }}>{decisionErrors[req.id]}</span> : null}</label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                  <Button disabled={busy === req.id} onClick={() => void mutate(req.id, 'APPROVE')}>{busy === req.id ? 'Saving decision…' : 'Approve leave'}</Button>
                  <Button disabled={busy === req.id} variant="danger" onClick={() => void mutate(req.id, 'REJECT')}>{busy === req.id ? 'Saving decision…' : 'Reject leave'}</Button>
                </div>
              </div>
            ))}
          </div>
        }
      </Card>

      {history.length > 0 && (
        <Card hoverable={false}>
          <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>Recent Decisions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {history.map(req => (
              <button type="button" key={req.id} onClick={() => setSelectedDecision(req)} aria-label={`View leave request details for ${req.staffName}`} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: 0, borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer', textAlign: 'left', minHeight: 48 }}>
                <div>
                  <strong>{req.staffName}</strong> · {req.leaveType.replaceAll('_', ' ')} ({req.branchName})
                  <span style={{ display: 'block', marginTop: 4, color: 'var(--text-muted)', fontSize: 12 }}>View request details</span>
                </div>
                <StatusBadge variant={req.status === 'APPROVED_LEVEL2' ? 'success' : 'error'}>{req.status === 'APPROVED_LEVEL2' ? 'Approved' : 'Rejected'}</StatusBadge>
              </button>
            ))}
          </div>
        </Card>
      )}
      {selectedDecision ? <div role="dialog" aria-modal="true" aria-labelledby="leave-decision-title" onClick={() => setSelectedDecision(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', padding: 16 }}><div onClick={(event) => event.stopPropagation()} style={{ width: 'min(560px, 100%)' }}><Card hoverable={false}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><div><StatusBadge variant={selectedDecision.status === 'APPROVED_LEVEL2' ? 'success' : 'error'}>{selectedDecision.status === 'APPROVED_LEVEL2' ? 'Approved' : 'Rejected'}</StatusBadge><h3 id="leave-decision-title" style={{ marginTop: 10 }}>{selectedDecision.staffName}</h3><p style={{ color: 'var(--text-muted)', marginTop: 4 }}>{selectedDecision.branchName}</p></div><Button variant="outline" onClick={() => setSelectedDecision(null)}>Close</Button></div><dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 20 }}><div><dt style={{ color: 'var(--text-muted)', fontSize: 12 }}>Leave type</dt><dd style={{ margin: '4px 0 0', fontWeight: 600 }}>{selectedDecision.leaveType.replaceAll('_', ' ')}</dd></div><div><dt style={{ color: 'var(--text-muted)', fontSize: 12 }}>Dates</dt><dd style={{ margin: '4px 0 0', fontWeight: 600 }}>{new Date(selectedDecision.startDate).toLocaleDateString('en-NP')} – {new Date(selectedDecision.endDate).toLocaleDateString('en-NP')}</dd></div></dl><div style={{ marginTop: 20, padding: 14, border: '1px solid var(--border)', borderRadius: 8 }}><strong style={{ fontSize: 12 }}>Request reason</strong><p style={{ marginTop: 6 }}>{selectedDecision.reason}</p></div></Card></div></div> : null}
    </div>
  );
}
