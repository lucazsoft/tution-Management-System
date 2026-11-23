import { NepaliDateTimeField } from '../components/calendar/NepaliDateTimeField';
import { EventTargetFields, AUDIENCE_LABELS } from '../components/calendar/EventTargetFields';
import { academicEventsApi, type AcademicEvent, type EventAudience, type EventType } from '../services/api/academicEvents';
import { englishDateLabel, nepalDateKey, nepalDateTimeInputToIso, nepaliDateHeading, NEPAL_TIME_ZONE } from '../utils/nepalCalendar';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../components/ui/Toast';
import { api } from '../services/api';
import { type CalendarSystem } from '../utils/nepaliDate';
import { CalendarSystemToggle } from '../components/CalendarSystemToggle';
import { ReminderCenter } from '../features/tenant/ReminderCenter';

type Tab = 'policies' | 'approvals' | 'finance' | 'calendar' | 'hr' | 'reminders';
type Weights = Record<'attendance' | 'updateCompliance' | 'feedback' | 'leaveCompliance' | 'taskCompletion', number>;
type Forecast = { billingCycle?: string; metrics?: { baseForecastNpr?: number; estimatedAttritionNpr?: number; attritionPercentage?: string; netForecastNpr?: number; actualCollectedNpr?: number; varianceNpr?: number; activeEnrollments?: number } };
type FinancialAlert = { type?: string; severity?: string; message?: string; category?: string; currentAmountNpr?: number; baselineAmountNpr?: number };
type FinancialSuggestions = { alerts?: FinancialAlert[]; budgetAnalysis?: { activeEnrollments?: number; projectedIncomeNpr?: number; projectedCostsNpr?: number; projectedSurplusNpr?: number; basis?: string } };

const input: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #DCE4EE', borderRadius: '9px', background: '#fff', color: 'var(--color-text)' };
const label: React.CSSProperties = { display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text)' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' };
const defaultWeights: Weights = { attendance: 20, updateCompliance: 20, feedback: 20, leaveCompliance: 20, taskCompletion: 20 };
const metricGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '10px', marginTop: '16px' };
const metricCard: React.CSSProperties = { minWidth: 0, padding: '14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)' };

function money(value: unknown) {
  return `NPR ${Number(value ?? 0).toLocaleString('en-NP', { maximumFractionDigits: 2 })}`;
}

function Metric({ label: text, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div style={metricCard}>
    <p style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>{text}</p>
    <strong style={{ display: 'block', marginTop: 6, color: emphasis ? 'var(--color-primary)' : 'var(--color-text)', fontSize: 20, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{value}</strong>
  </div>;
}

function downloadCsv(entries: any[]) {
  const columns = ['date', 'accountDebit', 'accountCredit', 'amount', 'description'];
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [columns.join(','), ...entries.map((entry) => columns.map((key) => escape(entry[key])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `tms-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function TenantControlCenter() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('policies');
  const [calendarSystem, setCalendarSystem] = useState<CalendarSystem>('BS');
  const [targetingReady, setTargetingReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [weights, setWeights] = useState<Weights>(defaultWeights);
  const [pettyCash, setPettyCash] = useState<any[]>([]);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [suggestions, setSuggestions] = useState<FinancialSuggestions | null>(null);
  const [events, setEvents] = useState<AcademicEvent[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [eventForm, setEventForm] = useState({ title: '', description: '', eventType: 'HOLIDAY' as EventType, audience: 'ALL' as EventAudience, classId: '', startDate: '', endDate: '' });
  const weightTotal = useMemo(() => Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0), [weights]);

  const load = async () => {
    setLoading(true);
    try {
      const [nextConfig, cash, nextForecast, nextSuggestions, calendar, documents] = await Promise.all([
        api.finances.getConfig(),
        api.finances.getPettyCash(),
        api.finances.getForecast(),
        api.finances.getSuggestions(),
        api.tenant.listCalendarEvents(),
        api.tenant.getDocumentAlerts(),
      ]);
      setConfig(nextConfig);
      setWeights({ ...defaultWeights, ...(nextConfig.performanceWeights ?? {}) });
      setPettyCash(cash);
      setForecast(nextForecast);
      setSuggestions(nextSuggestions);
      setEvents(calendar.events ?? []);
      setAlerts(documents.expiringDocs ?? []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load institution controls.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const savePolicies = async () => {
    if (weightTotal !== 100) {
      showToast(`Performance weights total ${weightTotal}%. They must equal exactly 100%.`, 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await api.finances.updateConfig(config.vatRate, config.gracePeriod, config.pettyCashCap, {
        refundPolicy: config.refundPolicy,
        lateFeeEnabled: config.lateFeeEnabled,
        lateFeeMode: config.lateFeeMode || 'FLAT',
        lateFeeValue: Number(config.lateFeeValue || 0),
        lateFeeGraceDays: config.lateFeeGraceDays,
        appointmentWindowHours: config.appointmentWindowHours,
        maintenanceEscalationDays: config.maintenanceEscalationDays,
        leavePolicy: config.leavePolicy ?? {},
        performanceWeights: weights,
      });
      showToast(`Policies saved as version ${result.tenant.policyVersion}. Existing requests keep their original rules.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Policy save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const decidePettyCash = async (id: string, action: 'APPROVE_L2' | 'REJECT' | 'REVISION') => {
    try {
      if (action === 'APPROVE_L2') await api.finances.approvePettyCash(id, action, remarks[id]);
      else await api.finances.decidePettyCash(id, action, remarks[id]);
      showToast(action === 'APPROVE_L2' ? 'Funds released and the branch monthly balance was updated.' : action === 'REJECT' ? 'Request rejected with remarks.' : 'Request returned to the Accountant for revision.', 'success');
      await load();
      setTab('approvals');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Approval failed.', 'error');
    }
  };

  const publishEvent = async (event: FormEvent) => {
    event.preventDefault();
    if (publishing) return;
    setPublishing(true);
    try {
      if (!eventForm.title.trim() || !eventForm.startDate.split('T')[0] || !eventForm.endDate.split('T')[0]) throw new Error('Enter a title and choose both Nepali dates.');
      const startDate = nepalDateTimeInputToIso(eventForm.startDate);
      const endDate = nepalDateTimeInputToIso(eventForm.endDate);
      if (endDate < startDate) throw new Error('End must be on or after the start date and time.');
      if (!targetingReady) throw new Error('Wait for class targeting to load before publishing.');
      await academicEventsApi.createTenantWide({
        ...eventForm,
        title: eventForm.title.trim(),
        classId: eventForm.classId || null,
        startDate,
        endDate,
      });
      showToast('Event published to the selected audience.', 'success');
      setEventForm({ title: '', description: '', eventType: 'HOLIDAY', audience: 'ALL', classId: '', startDate: '', endDate: '' });
      await load();
      setTab('calendar');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Event could not be published.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const tabs: Array<[Tab, string, string]> = [
    ['policies', 'Policies', 'tune'], ['approvals', 'Approvals', 'approval'], ['finance', 'Finance', 'monitoring'],
    ['calendar', 'Calendar', 'calendar_month'], ['hr', 'HR alerts', 'badge'], ['reminders', 'Reminders', 'notifications_active'],
  ];
  if (loading || !config) return <Card hoverable={false}><p>Loading institution controls…</p></Card>;
  const set = (key: string, value: unknown) => setConfig((current: any) => ({ ...current, [key]: value }));
  const pendingL2 = pettyCash.filter((item) => item.status === 'APPROVED_LEVEL1');

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div>
        <h2 style={{ fontSize: '23px', fontWeight: 700 }}>Institution Control Center</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Govern policies, final approvals, finance, and institution-wide operations.</p>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {tabs.map(([id, text, icon]) => <Button key={id} variant={tab === id ? 'primary' : 'outline'} onClick={() => setTab(id)}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>{text}
          {id === 'approvals' && pendingL2.length ? <StatusBadge variant="gold">{pendingL2.length}</StatusBadge> : null}
        </Button>)}
      </div>

      {tab === 'policies' ? <div style={{ display: 'grid', gap: '16px' }}>
        <Card hoverable={false}>
          <h3 style={{ marginBottom: 16 }}>Fee, refund & operational policy</h3>
          <div style={grid}>
            <label style={label}>VAT rate (%)<input style={input} type="number" value={config.vatRate} onChange={(e) => set('vatRate', Number(e.target.value))} /></label>
            <label style={label}>Refund policy<select style={input} value={config.refundPolicy} onChange={(e) => set('refundPolicy', e.target.value)}>
              <option value="PRO_RATA">Pro-rata</option><option value="FIXED_DEDUCTION">Fixed deduction</option><option value="NO_REFUND">No refund</option>
            </select></label>
            <label style={label}>Attendance grace (minutes)<input style={input} type="number" value={config.gracePeriod} onChange={(e) => set('gracePeriod', Number(e.target.value))} /></label>
            <label style={label}>Monthly petty cash cap (NPR)<input style={input} type="number" value={config.pettyCashCap} onChange={(e) => set('pettyCashCap', Number(e.target.value))} /></label>
            <label style={label}>Appointment minimum notice (hours)<input style={input} type="number" value={config.appointmentWindowHours} onChange={(e) => set('appointmentWindowHours', Number(e.target.value))} /></label>
            <label style={label}>Maintenance escalation (days)<input style={input} type="number" value={config.maintenanceEscalationDays} onChange={(e) => set('maintenanceEscalationDays', Number(e.target.value))} /></label>
          </div>
          <div style={{ marginTop: 18, padding: 14, background: '#F8FAFC', borderRadius: 10 }}>
            <label style={{ ...label, display: 'flex', alignItems: 'center' }}><input type="checkbox" checked={config.lateFeeEnabled} onChange={(e) => set('lateFeeEnabled', e.target.checked)} /> Enable late fees</label>
            {config.lateFeeEnabled ? <div style={{ ...grid, marginTop: 12 }}>
              <label style={label}>Mode<select style={input} value={config.lateFeeMode || 'FLAT'} onChange={(e) => set('lateFeeMode', e.target.value)}><option value="FLAT">Flat NPR</option><option value="PERCENTAGE">Percentage</option></select></label>
              <label style={label}>Value<input style={input} type="number" value={config.lateFeeValue ?? 0} onChange={(e) => set('lateFeeValue', Number(e.target.value))} /></label>
              <label style={label}>Grace window (days)<input style={input} type="number" value={config.lateFeeGraceDays} onChange={(e) => set('lateFeeGraceDays', Number(e.target.value))} /></label>
            </div> : null}
          </div>
        </Card>
        <Card hoverable={false}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div><h3>Staff performance score</h3><p style={{ color: 'var(--text-muted)', fontSize: 13 }}>All five components must total exactly 100%.</p></div>
            <StatusBadge variant={weightTotal === 100 ? 'success' : 'error'}>{weightTotal}% total</StatusBadge>
          </div>
          <div style={grid}>{(Object.keys(weights) as Array<keyof Weights>).map((key) =>
            <label style={label} key={key}>{key.replace(/([A-Z])/g, ' $1')} (%)<input style={input} type="number" min="0" max="100" value={weights[key]} onChange={(e) => setWeights((old) => ({ ...old, [key]: Number(e.target.value) }))} /></label>
          )}</div>
          <Button style={{ marginTop: 18 }} disabled={saving || weightTotal !== 100} onClick={() => void savePolicies()}>{saving ? 'Saving…' : 'Save versioned policies'}</Button>
        </Card>
      </div> : null}

      {tab === 'approvals' ? <Card hoverable={false}>
        <h3>Petty cash — final review</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 16px' }}>Only Branch Admin-approved requests appear here.</p>
        {!pendingL2.length ? <p style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No Level 2 requests awaiting review.</p> :
          pendingL2.map((item) => <div key={item.id} style={{ borderTop: '1px solid #E8EDF3', padding: '15px 0', display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><strong>{item.branch?.name ?? 'Branch request'}</strong><p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{item.purpose}</p></div><strong>NPR {Number(item.amount).toLocaleString()}</strong></div>
            <textarea style={input} placeholder="Decision remarks" value={remarks[item.id] ?? ''} onChange={(e) => setRemarks((old) => ({ ...old, [item.id]: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8 }}><Button onClick={() => void decidePettyCash(item.id, 'APPROVE_L2')}>Approve & release</Button><Button variant="outline" onClick={() => void decidePettyCash(item.id, 'REVISION')}>Send back</Button><Button variant="outline" onClick={() => void decidePettyCash(item.id, 'REJECT')}>Reject</Button></div>
          </div>)}
      </Card> : null}

      {tab === 'finance' ? <div style={{ display: 'grid', gap: 16 }}>
        <Card hoverable={false}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div><h3>Fee income forecast</h3><p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{forecast?.billingCycle ?? 'Current billing cycle'} · based on active course fees</p></div>
            <StatusBadge variant="info">{forecast?.metrics?.activeEnrollments ?? 0} active enrollments</StatusBadge>
          </div>
          <div style={metricGrid}>
            <Metric label="Expected fees" value={money(forecast?.metrics?.baseForecastNpr)} />
            <Metric label="Attrition estimate" value={money(forecast?.metrics?.estimatedAttritionNpr)} />
            <Metric label="Net forecast" value={money(forecast?.metrics?.netForecastNpr)} emphasis />
            <Metric label="Collected" value={money(forecast?.metrics?.actualCollectedNpr)} />
            <Metric label="Variance" value={money(forecast?.metrics?.varianceNpr)} />
            <Metric label="Estimated attrition" value={forecast?.metrics?.attritionPercentage ?? '0.0%'} />
          </div>
        </Card>

        <div style={grid}>
          <Card hoverable={false}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div><h3>Expense anomaly signals</h3><p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Compared with the previous three months.</p></div>
              <StatusBadge variant={suggestions?.alerts?.length ? 'warning' : 'success'}>{suggestions?.alerts?.length ?? 0} alerts</StatusBadge>
            </div>
            {!suggestions?.alerts?.length ? <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '20px 0 4px' }}>
              <span className="material-symbols-outlined" aria-hidden="true" style={{ color: 'var(--color-success)', fontSize: 24 }}>check_circle</span>
              <div><strong>All clear</strong><p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 3 }}>No recurring expense or payroll anomalies were detected.</p></div>
            </div> : <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>{suggestions.alerts.map((alert, index) => <div key={`${alert.category}-${index}`} style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><strong>{alert.category ?? 'Expense alert'}</strong><StatusBadge variant={alert.severity === 'HIGH' ? 'error' : 'warning'}>{alert.severity ?? 'Warning'}</StatusBadge></div>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>{alert.message}</p>
              <p style={{ fontSize: 12, marginTop: 8 }}>Current: <strong>{money(alert.currentAmountNpr)}</strong> · Baseline: <strong>{money(alert.baselineAmountNpr)}</strong></p>
            </div>)}</div>}
          </Card>

          <Card hoverable={false}>
            <h3>Operating outlook</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Income projection against costs recorded this month.</p>
            <div style={metricGrid}>
              <Metric label="Projected income" value={money(suggestions?.budgetAnalysis?.projectedIncomeNpr)} />
              <Metric label="Recorded costs" value={money(suggestions?.budgetAnalysis?.projectedCostsNpr)} />
              <Metric label="Projected surplus" value={money(suggestions?.budgetAnalysis?.projectedSurplusNpr)} emphasis />
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5, marginTop: 12 }}>{suggestions?.budgetAnalysis?.basis ?? 'Calculated from current tenant finance records.'}</p>
          </Card>
        </div>

        <Card hoverable={false}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div><h3>Accountant reconciliation</h3><p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 13 }}>Export the tenant-scoped double-entry ledger for reconciliation.</p></div>
            <Button onClick={() => void api.finances.exportLedger().then((data) => downloadCsv(data.entries)).catch((error) => showToast(error.message, 'error'))}><span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>download</span>Download CSV ledger</Button>
          </div>
        </Card>
      </div> : null}

      {tab === 'calendar' ? <div style={grid}>
        <Card hoverable={false}><h3>Publish institution event</h3><form onSubmit={(e) => void publishEvent(e)} style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          <label style={label}>Title<input style={input} value={eventForm.title} onChange={(e) => setEventForm((old) => ({ ...old, title: e.target.value }))} required /></label>
          <label style={label}>Type<select style={input} value={eventForm.eventType} onChange={(e) => setEventForm((old) => ({ ...old, eventType: e.target.value as EventType }))}><option value="HOLIDAY">Holiday</option><option value="EXAM">Exam</option><option value="EVENT">Event</option><option value="FEE_DUE">Fee deadline</option></select></label>
          <EventTargetFields onReadyChange={setTargetingReady} audience={eventForm.audience} classId={eventForm.classId} onAudienceChange={(audience) => setEventForm((old) => ({ ...old, audience }))} onClassChange={(classId) => setEventForm((old) => ({ ...old, classId }))} />
          <NepaliDateTimeField label="Starts" value={eventForm.startDate} onChange={(startDate) => setEventForm((old) => ({ ...old, startDate }))} />
          <NepaliDateTimeField label="Ends" value={eventForm.endDate} onChange={(endDate) => setEventForm((old) => ({ ...old, endDate }))} />
          <label style={label}>Description<textarea style={input} value={eventForm.description} onChange={(e) => setEventForm((old) => ({ ...old, description: e.target.value }))} /></label>
          <Button type="submit" disabled={publishing || !targetingReady} aria-busy={publishing}>{publishing ? 'Publishing...' : 'Publish event'}</Button>
        </form></Card>
        <Card hoverable={false}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><h3>Institution calendar</h3><CalendarSystemToggle value={calendarSystem} onChange={setCalendarSystem} /></div>{events.map((item) => <div key={item.id} style={{ borderTop: '1px solid #E8EDF3', padding: '12px 0' }}><strong>{item.title}</strong><p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{calendarSystem === 'BS' ? nepaliDateHeading(nepalDateKey(item.startDate)) : englishDateLabel(nepalDateKey(item.startDate))} · {new Date(item.startDate).toLocaleTimeString([], { timeZone: NEPAL_TIME_ZONE, hour: '2-digit', minute: '2-digit' }) + ' NPT'} · {item.eventType} / {AUDIENCE_LABELS[item.audience ?? 'STAFF']}</p>{!item.branchId ? <StatusBadge variant="info">Read-only institution event</StatusBadge> : null}</div>)}</Card>
      </div> : null}

      {tab === 'reminders' ? <ReminderCenter /> : null}

      {tab === 'hr' ? <Card hoverable={false}><h3>Contracts & documents expiring within 30 days</h3>
        {!alerts.length ? <p style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No document expiries in the next 30 days.</p> :
          alerts.map((item) => <div key={item.id} style={{ borderTop: '1px solid #E8EDF3', padding: '13px 0', display: 'flex', justifyContent: 'space-between' }}><div><strong>{item.documentType}</strong><p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.fileUrl}</p></div><StatusBadge variant="warning">{new Date(item.expiryDate).toLocaleDateString()}</StatusBadge></div>)}
      </Card> : null}
    </div>
  );
}
