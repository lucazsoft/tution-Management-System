import { PettyCashFunding } from '../components/patterns/PettyCashFunding';
import { financeApi, type BranchAllowance } from '../services/api/finance';
import { NepaliDateTimeField } from '../components/calendar/NepaliDateTimeField';
import { nepalDateTimeInput, nepaliDateHeading, NEPAL_TIME_ZONE } from '../utils/nepalCalendar';
import { EventTargetFields } from '../components/calendar/EventTargetFields';
import { academicEventsApi, type EventAudience } from '../services/api/academicEvents';
import { NepalCalendar } from '../components/calendar/NepalCalendar';
import { NepaliDatePicker } from '../components/calendar/NepaliDatePicker';
import { nepalDateKey, nepalDateTimeInputToIso } from '../utils/nepalCalendar';
import type { AcademicEvent, EventType } from '../services/api/academicEvents';
import { useCallback, useEffect, useState, useMemo, useRef, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { AcademicFees } from './AcademicFees';
import { api, type BranchAppointment } from '../services/api';
import { resourcesApi, type MaintenanceTask } from '../services/api/resources';
import { API_BASE_URL, request } from '../services/api/client';
import { normalizeSchedule, type ScheduleSlot } from '../utils/schedule';
import { calendarDateLabel, calendarDayNumber, calendarMonthCells, calendarMonthLabel, isInCalendarMonth, moveCalendarMonth, toDualDateLabel, type CalendarSystem } from '../utils/nepaliDate';
import { CalendarSystemToggle } from '../components/CalendarSystemToggle';
import { BranchClassesWorkspace as BranchClassesView } from '../features/classes/BranchClassesWorkspace';

function calendarDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
import { TimetableWorkspace } from '../components/timetable/TimetableWorkspace';
import './staffFinance.css';

function CalendarGrid({ onDateClick, events, calendarSystem = 'AD', onCalendarSystemChange }: { onDateClick: (date: Date) => void; events: Record<string, string>; calendarSystem?: CalendarSystem; onCalendarSystemChange?: (system: CalendarSystem) => void }) {
  const [visibleMonth, setVisibleMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  
  const monthCells = useMemo(() => calendarMonthCells(visibleMonth, calendarSystem), [visibleMonth, calendarSystem]);

  const moveMonth = (amount: number) => setVisibleMonth(m => moveCalendarMonth(m, amount, calendarSystem));
  
  const today = new Date();
  
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', marginBottom: '16px' }}>
        <div><h3 style={{ fontSize: '16px', fontWeight: 600 }}>{calendarMonthLabel(visibleMonth, calendarSystem)}</h3></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {onCalendarSystemChange ? <CalendarSystemToggle value={calendarSystem} onChange={onCalendarSystemChange} /> : null}
          <Button variant="outline" style={{ minHeight: '32px', height: '32px', padding: '0 8px' }} onClick={() => moveMonth(-1)}>&larr;</Button>
          <Button variant="outline" style={{ minHeight: '32px', height: '32px', padding: '0 12px' }} onClick={() => setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</Button>
          <Button variant="outline" style={{ minHeight: '32px', height: '32px', padding: '0 8px' }} onClick={() => moveMonth(1)}>&rarr;</Button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{d}</div>
        ))}
        {monthCells.map((date) => {
          // Adjust to local date string to avoid timezone shift on ISO string
          const dateStr = calendarDateKey(date);
          
          const hasEvent = !!events[dateStr];
          const isOutside = !isInCalendarMonth(date, visibleMonth, calendarSystem);
          const isToday = date.toDateString() === today.toDateString();
          
          return (
            <button
              type="button"
              key={date.toISOString()}
              onClick={() => onDateClick(date)}
              aria-label={`${calendarDateLabel(date, calendarSystem)}${hasEvent ? `, ${events[dateStr]}` : ''}`}
              style={{
                padding: '12px 4px', textAlign: 'center', border: `1px solid ${isToday ? 'var(--color-primary)' : 'var(--border)'}`,
                borderRadius: '8px', cursor: 'pointer', background: hasEvent ? 'var(--color-primary-soft, #e6f0fa)' : isOutside ? 'var(--color-surface)' : '#fff',
                color: hasEvent ? 'var(--color-primary)' : isOutside ? 'var(--text-muted)' : 'var(--text)', fontWeight: hasEvent || isToday ? 700 : 400, fontFamily: 'inherit',
                opacity: isOutside ? 0.6 : 1
              }}
            >
              <div style={{ fontSize: '14px' }}>{calendarDayNumber(date, calendarSystem)}</div>
              {hasEvent && <div style={{ fontSize: '10px', marginTop: '4px', color: 'var(--color-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 2px' }}>{events[dateStr]}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const field = { width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--color-border, rgba(21,96,189,.2))', background: 'var(--color-surface, #fff)', color: 'var(--color-text)' } as const;
const label = { display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--color-text)' } as const;
const form = { display: 'grid', gap: 16 } as const;

function Page({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: 20 }}>
    <header><h1 style={{ fontSize: 24, color: 'var(--color-text)' }}>{title}</h1><p style={{ marginTop: 6, color: 'var(--color-text-muted, rgba(44,62,80,.7))' }}>{description}</p></header>
    {children}
  </main>;
}

function Feedback({ message, error }: { message: string; error: string }) {
  if (!message && !error) return null;
  return <div role="status" style={{ padding: 12, borderRadius: 10, background: error ? 'var(--color-error-soft, #fff0f0)' : 'var(--color-success-soft, #eaf8f0)', color: error ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 700 }}>{error || message}</div>;
}

function AdminDetailDialog({ open, title, eyebrow, onClose, children }: { open: boolean; title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={dialogRef} className="admin-detail-dialog" aria-labelledby="admin-detail-dialog-title" onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
    <div className="admin-detail-dialog__header"><div><span>{eyebrow}</span><h2 id="admin-detail-dialog-title">{title}</h2></div><button type="button" aria-label={`Close ${title}`} onClick={() => dialogRef.current?.close()}><span className="material-symbols-outlined" aria-hidden="true">close</span></button></div>
    <div className="admin-detail-dialog__body">{children}</div>
  </dialog>;
}

function useAction() {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const run = async (action: () => Promise<unknown>, success: string | ((result: any) => string)) => { setBusy(true); setError(''); setMessage(''); try { const result = await action(); setMessage(typeof success === 'function' ? success(result) : success); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The action could not be completed. Try again.'); } finally { setBusy(false); } };
  return { busy, message, error, run };
}

function LeaveRequestsView() {
  const action = useAction(); 
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [reason, setReason] = useState(''); 
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  
  // Mock pending requests
  const pendingLeaves = [
    { id: 'LR-101', requester: 'Sanjay Rai', date: '2026-08-10', type: 'Casual Leave', reason: 'Family function' },
    { id: 'LR-102', requester: 'Aisha Tamang', date: '2026-08-12', type: 'Sick Leave', reason: 'Fever and cold' }
  ];

  const submit = (event: FormEvent) => { 
    event.preventDefault(); 
    if (decision === 'REJECT' && !reason.trim()) return; 
    
    const apiCall = api.branchAdmin.decideLeave(selectedRequest.id, decision, reason);
    const successMessage = decision === 'APPROVE' ? 'Leave approved (Level 1). Forwarded to Tenant Admin for final decision.' : 'Leave request rejected.';
    
    void action.run(async () => {
      await apiCall;
      setSelectedRequest(null);
      setReason('');
    }, successMessage); 
  };
  
  const reasonMissing = decision === 'REJECT' && !reason.trim();
  
  return <Page title="Leave Approvals" description="Branch Admin gives first-level approval/rejection, then it forwards to Tenant Admin for final.">
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
      {/* List of requests */}
      <Card hoverable={false} style={{ padding: '16px' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Pending Requests</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pendingLeaves.map(req => (
            <div 
              key={req.id} 
              onClick={() => setSelectedRequest(req)}
              style={{ padding: '12px', border: `1px solid ${selectedRequest?.id === req.id ? 'var(--color-primary)' : 'var(--border)'}`, borderRadius: '8px', cursor: 'pointer', background: selectedRequest?.id === req.id ? 'var(--color-primary-soft)' : 'var(--color-surface)' }}
            >
              <div style={{ fontWeight: 600, fontSize: '14px' }}>{req.requester}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{req.type}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{req.date}</div>
            </div>
          ))}
          {pendingLeaves.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No pending requests.</p>}
        </div>
      </Card>

      {/* Detail & Action Form */}
      <div>
        {selectedRequest ? (
          <Card hoverable={false}>
            <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>Request Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px', padding: '16px', background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Requester</div>
                <div style={{ fontWeight: 600 }}>{selectedRequest.requester}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Date Requested</div>
                <div style={{ fontWeight: 600 }}>{selectedRequest.date}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Leave Type</div>
                <div style={{ fontWeight: 600 }}>{selectedRequest.type}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Reason</div>
                <div style={{ fontWeight: 600 }}>{selectedRequest.reason}</div>
              </div>
            </div>

            <form onSubmit={submit} style={form} aria-busy={action.busy}>
              <label style={label} htmlFor="approval-decision">Decision<select id="approval-decision" value={decision} onChange={e => setDecision(e.target.value as 'APPROVE' | 'REJECT')} style={field}><option value="APPROVE">Approve</option><option value="REJECT">Reject</option></select></label>
              <label style={label} htmlFor="approval-reason">Admin Note {decision === 'REJECT' ? '(required for rejection)' : '(optional)'}<textarea id="approval-reason" value={reason} onChange={e => setReason(e.target.value)} aria-invalid={reasonMissing || undefined} aria-describedby={reasonMissing ? 'approval-reason-error' : undefined} style={{ ...field, minHeight: 84 }} />{reasonMissing && <span id="approval-reason-error" style={{ color: 'var(--color-error)', fontWeight: 600 }}>Enter a reason before rejecting this request.</span>}</label>
              <Feedback message={action.message} error={action.error} />
              <Button type="submit" disabled={action.busy || reasonMissing}>{action.busy ? 'Saving decision…' : 'Save decision'}</Button>
            </form>
          </Card>
        ) : (
          <Card hoverable={false} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px' }}>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '48px', opacity: 0.5 }}>touch_app</span>
              <p style={{ marginTop: '8px' }}>Select a request from the list to review</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  </Page>;
}

function PettyCashView() {
  const action = useAction(); 
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [reason, setReason] = useState(''); 
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [pettyCash, setPettyCash] = useState<any[]>([]);
  const [allowances, setAllowances] = useState<BranchAllowance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const loadPettyCash = useCallback(async () => { setLoading(true); setLoadError(''); try { const [records, config] = await Promise.all([api.finances.getPettyCash(), financeApi.funding()]); setPettyCash(records); setAllowances(config.allowances); } catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'Petty-cash requests could not be loaded.'); } finally { setLoading(false); } }, []);
  useEffect(() => { void loadPettyCash(); }, [loadPettyCash]);
  const pendingPettyCash = pettyCash.filter((item) => item.status === 'PENDING').map((item) => ({ ...item, requester: item.requesterName || 'Branch accountant', date: new Date(item.createdAt).toLocaleDateString('en-NP') }));
  const allowance = allowances.find(item => item.branchId === selectedRequest?.branchId);
  const currentUsage = allowance?.used ?? 0;
  const availableLimit = allowance?.available ?? 0;
  const requestAmount = selectedRequest?.amount || 0;
  const isOutOfLimit = requestAmount > availableLimit;

  const submit = (event: FormEvent) => { 
    event.preventDefault(); 
    if (decision === 'REJECT' && !reason.trim()) return; 
    
    void action.run(async () => {
      if (decision === 'APPROVE') await api.finances.approvePettyCash(selectedRequest.id, 'APPROVE_L1', reason);
      else await api.finances.decidePettyCash(selectedRequest.id, 'REJECT', reason);
      setSelectedRequest(null); setReason(''); await loadPettyCash();
    }, decision === 'REJECT' ? 'Petty cash request rejected.' : 'Decision saved. Requests within the allowance are released; excess requests go to the Tenant Admin.');
  };

  const reasonMissing = decision === 'REJECT' && !reason.trim();
  
  return <Page title="Petty Cash Approvals" description="Manage petty cash requests. If within limit, grant directly. If out of limit, forward to Tenant Admin.">
    <PettyCashFunding key={JSON.stringify(allowances)} onUpdated={() => void loadPettyCash()} />
    <Feedback message={action.message} error={action.error} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
      {/* List of requests */}
      <Card hoverable={false} style={{ padding: '16px' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Pending Requests</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {loading ? <p aria-busy="true" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading requests…</p> : loadError ? <div><Feedback message="" error={loadError} /><Button variant="outline" onClick={() => void loadPettyCash()}>Try again</Button></div> : pendingPettyCash.map(req => (
            <button type="button"
              key={req.id} 
              onClick={() => setSelectedRequest(req)}
              style={{ padding: '12px', width: '100%', textAlign: 'left', color: 'var(--color-text)', border: `1px solid ${selectedRequest?.id === req.id ? 'var(--color-primary)' : 'var(--border)'}`, borderRadius: '8px', cursor: 'pointer', background: selectedRequest?.id === req.id ? 'var(--color-primary-soft)' : 'var(--color-surface)' }}
            >
              <div style={{ fontWeight: 600, fontSize: '14px' }}>{req.requester}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>NPR {req.amount}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{req.date}</div>
            </button>
          ))}
          {!loading && !loadError && pendingPettyCash.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No pending requests.</p>}
        </div>
      </Card>

      {/* Detail & Action Form */}
      <div>
        {selectedRequest ? (
          <>
            <Card hoverable={false} style={{ marginBottom: '16px', background: isOutOfLimit && requestAmount > 0 ? 'var(--color-warning-soft)' : '#fff' }}>
              <h3 style={{ fontSize: '16px' }}>Monthly Limit Status</h3>
              <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
                <div><span style={{ color: 'var(--text-muted)' }}>Available Limit:</span> <strong style={{ color: 'var(--color-success)' }}>NPR {availableLimit.toLocaleString()}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Used:</span> NPR {currentUsage.toLocaleString()}</div>
              </div>
              {isOutOfLimit && requestAmount > 0 && (
                <div style={{ marginTop: '12px', color: 'var(--color-warning)', fontWeight: 600 }}>
                  ⚠️ Requested amount exceeds available limit. Approving will forward the request to the Tenant Admin.
                </div>
              )}
            </Card>
            
            <Card hoverable={false}>
              <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>Request Details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px', padding: '16px', background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Requester</div>
                  <div style={{ fontWeight: 600 }}>{selectedRequest.requester}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Date Requested</div>
                  <div style={{ fontWeight: 600 }}>{selectedRequest.date}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Amount</div>
                  <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>NPR {requestAmount.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Purpose</div>
                  <div style={{ fontWeight: 600 }}>{selectedRequest.purpose}</div>
                </div>
              </div>

              <form onSubmit={submit} style={form} aria-busy={action.busy}>
                <label style={label} htmlFor="approval-decision">Decision<select id="approval-decision" value={decision} onChange={e => setDecision(e.target.value as 'APPROVE' | 'REJECT')} style={field}><option value="APPROVE">Approve</option><option value="REJECT">Reject</option></select></label>
                <label style={label} htmlFor="approval-reason">Admin Note {decision === 'REJECT' ? '(required for rejection)' : '(optional)'}<textarea id="approval-reason" value={reason} onChange={e => setReason(e.target.value)} aria-invalid={reasonMissing || undefined} aria-describedby={reasonMissing ? 'approval-reason-error' : undefined} style={{ ...field, minHeight: 84 }} />{reasonMissing && <span id="approval-reason-error" style={{ color: 'var(--color-error)', fontWeight: 600 }}>Enter a reason before rejecting this request.</span>}</label>
                <Feedback message={action.message} error={action.error} />
                <Button type="submit" disabled={action.busy || reasonMissing}>{action.busy ? 'Saving decision…' : 'Save decision'}</Button>
              </form>
            </Card>
          </>
        ) : (
          <Card hoverable={false} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px' }}>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '48px', opacity: 0.5 }}>touch_app</span>
              <p style={{ marginTop: '8px' }}>Select a request from the list to review</p>
            </div>
          </Card>
        )}
      </div>
    </div>
    <Card hoverable={false}><h3>Request history and receipts</h3>
      {pettyCash.filter(item => item.status !== 'PENDING').map(item => <div key={item.id} style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
        <strong>{item.purpose} - NPR {Number(item.amount).toLocaleString()}</strong><p>{item.status === 'APPROVED_LEVEL1' ? 'Awaiting Tenant Admin decision' : item.status}</p>
        {item.receiptProofUrl && /^https?:\/\//i.test(item.receiptProofUrl) && <a href={item.receiptProofUrl} target="_blank" rel="noreferrer">View receipt</a>}
        {item.status === 'RECEIPT_SUBMITTED' && <Button disabled={action.busy} onClick={() => void action.run(async () => { await financeApi.closePettyCash(item.id); await loadPettyCash(); }, 'Receipt verified and request closed.')}>Verify & close</Button>}
      </div>)}
    </Card>
  </Page>;
}

function StudentExceptions() {
  const action = useAction(); const [mode, setMode] = useState<'departure' | 'remark' | 'fee'>('departure'); const [studentId, setStudentId] = useState(''); const [branchId, setBranchId] = useState(''); const [text, setText] = useState(''); const [collector, setCollector] = useState(''); const [parentVisible, setParentVisible] = useState(false); const [scope, setScope] = useState<'ONE_SESSION' | 'ONE_DAY'>('ONE_SESSION');
  const submit = (event: FormEvent) => { event.preventDefault(); if (!text.trim()) return; const request = mode === 'departure' ? api.branchAdmin.emergencyDeparture({ studentId, branchId, reason: text, collectedBy: collector, departureTime: new Date().toISOString() }) : mode === 'remark' ? api.branchAdmin.addRemark({ studentId, subject: 'Administrative remark', message: text, parentVisible }) : api.branchAdmin.grantFeeOverride({ studentId, branchId, scope, reason: text }); void action.run(() => request, mode === 'departure' ? 'Departure permanently recorded and the parent notification was sent.' : mode === 'remark' ? 'Remark saved with your identity and timestamp.' : 'Temporary access granted and added to fee-status history.'); };
  return <Page title="Student exceptions" description="Record attributable exceptions. Fee-block access remains scoped and never becomes a permanent unblock."><Card hoverable={false}><form onSubmit={submit} style={form} aria-busy={action.busy}>
    <label style={label} htmlFor="exception-type">Action<select id="exception-type" value={mode} onChange={e => setMode(e.target.value as 'departure' | 'remark' | 'fee')} style={field}><option value="departure">Emergency departure</option><option value="fee">Temporary fee access</option><option value="remark">Administrative remark</option></select></label>
    <label style={label} htmlFor="exception-student">Student ID (required)<input id="exception-student" required value={studentId} onChange={e => setStudentId(e.target.value)} style={field} /></label>
    {mode !== 'remark' && <label style={label} htmlFor="exception-branch">Branch ID (required)<input id="exception-branch" required value={branchId} onChange={e => setBranchId(e.target.value)} style={field} /></label>}
    {mode === 'departure' && <label style={label} htmlFor="exception-collector">Collected by (optional)<input id="exception-collector" value={collector} onChange={e => setCollector(e.target.value)} autoComplete="name" style={field} /></label>}
    {mode === 'fee' && <label style={label} htmlFor="override-scope">Access scope<select id="override-scope" value={scope} onChange={e => setScope(e.target.value as 'ONE_SESSION' | 'ONE_DAY')} style={field}><option value="ONE_SESSION">One session</option><option value="ONE_DAY">One day</option></select></label>}
    <label style={label} htmlFor="exception-reason">{mode === 'departure' ? 'Departure reason' : mode === 'fee' ? 'Override reason' : 'Remark'} (required)<textarea id="exception-reason" required value={text} onChange={e => setText(e.target.value)} style={{ ...field, minHeight: 96 }} /></label>
    {mode === 'remark' && <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}><input type="checkbox" checked={parentVisible} onChange={e => setParentVisible(e.target.checked)} />Visible to parents</label>}
    <Feedback message={action.message} error={action.error} /><Button type="submit" disabled={action.busy || !studentId.trim() || !text.trim()}>{action.busy ? 'Recording…' : mode === 'departure' ? 'Record and notify parent' : mode === 'fee' ? 'Grant temporary access' : 'Save remark'}</Button>
  </form></Card><Card hoverable={false}><h2 style={{ fontSize: 18 }}>Fee override safeguards</h2><p style={{ marginTop: 8, color: 'var(--color-text-muted, rgba(44,62,80,.7))' }}>Every override records its reason, scope, expiry, and granting admin in visible fee-status history.</p><StatusBadge variant="info">Permanent unblock unavailable</StatusBadge></Card></Page>;
}

function PersonalizedClassesView() {
  const [activeTab, setActiveTab] = useState<'classes' | 'teachers' | 'students' | 'editClass'>('classes');
  const action = useAction();
  
  const [classes, setClasses] = useState([
    { id: 'c1', name: 'Advanced Physics Tutoring (1:1)', teacher: 'Sanjay Rai', student: 'Aakash Bista', fee: 'NPR 10,000 / month' }
  ]);
  const [editingClass, setEditingClass] = useState<any>(null);

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this personalized class?')) {
      setClasses(prev => prev.filter(c => c.id !== id));
    }
  };

  const handleEdit = (c: any) => {
    setEditingClass(c);
    setActiveTab('editClass');
  };

  const handleCreate = () => {
    setEditingClass(null);
    setActiveTab('editClass');
  };

  const submitClass = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      await new Promise(r => setTimeout(r, 600));
      if (editingClass?.id) {
        setClasses(prev => prev.map(c => c.id === editingClass.id ? { ...c, ...editingClass } : c));
      } else {
        setClasses(prev => [...prev, { ...editingClass, id: `c${Date.now()}` }]);
      }
      setActiveTab('classes');
    }, `Class ${editingClass?.id ? 'updated' : 'created'} successfully.`);
  };

  return (
    <Page title="Personalized Classes" description="Manage 1:1 or small-group classes. Manage their specific teachers and students here.">
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <Button variant={activeTab === 'classes' || activeTab === 'editClass' ? 'primary' : 'outline'} onClick={() => setActiveTab('classes')}>Classes</Button>
        <Button variant={activeTab === 'teachers' ? 'primary' : 'outline'} onClick={() => setActiveTab('teachers')}>Manage Teachers</Button>
        <Button variant={activeTab === 'students' ? 'primary' : 'outline'} onClick={() => setActiveTab('students')}>Manage Students</Button>
      </div>
      <Card hoverable={false}>
        {activeTab === 'classes' ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px' }}>Active Classes</h2>
              <Button onClick={handleCreate}>Create Class</Button>
            </div>
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {classes.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--color-surface)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '16px' }}>{c.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>Teacher: {c.teacher} | Student: {c.student}</div>
                    <div style={{ color: 'var(--color-primary)', fontSize: '13px', marginTop: '4px', fontWeight: 600 }}>{c.fee}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="outline" onClick={() => handleEdit(c)}>Edit</Button>
                    <Button variant="outline" style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }} onClick={() => handleDelete(c.id)}>Delete</Button>
                  </div>
                </div>
              ))}
              {classes.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No active personalized classes.</p>}
            </div>
          </div>
        ) : activeTab === 'editClass' ? (
          <div>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px' }}>{editingClass?.id ? 'Edit Class' : 'Create New Class'}</h2>
              <Button variant="outline" onClick={() => setActiveTab('classes')}>Cancel</Button>
            </div>
            <form onSubmit={submitClass} style={form} aria-busy={action.busy}>
              <label style={label}>Class Name<input required style={field} value={editingClass?.name || ''} onChange={e => setEditingClass({ ...editingClass, name: e.target.value })} placeholder="e.g. Advanced Physics (1:1)" /></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label style={label}>Assign Teacher
                  <select required style={field} value={editingClass?.teacher || ''} onChange={e => setEditingClass({ ...editingClass, teacher: e.target.value })}>
                    <option value="" disabled>Select a teacher</option>
                    <option value="Sanjay Rai">Sanjay Rai</option>
                    <option value="Rina Karki">Rina Karki</option>
                    <option value="Bikash Thapa">Bikash Thapa</option>
                  </select>
                </label>
                <label style={label}>Assign Student
                  <select required style={field} value={editingClass?.student || ''} onChange={e => setEditingClass({ ...editingClass, student: e.target.value })}>
                    <option value="" disabled>Select a student</option>
                    <option value="Aakash Bista">Aakash Bista</option>
                    <option value="Priya Gurung">Priya Gurung</option>
                    <option value="Rohan Sharma">Rohan Sharma</option>
                  </select>
                </label>
              </div>
              <label style={label}>Monthly Fee<input required style={field} value={editingClass?.fee || ''} onChange={e => setEditingClass({ ...editingClass, fee: e.target.value })} placeholder="e.g. NPR 10,000 / month" /></label>
              <Feedback message={action.message} error={action.error} />
              <Button type="submit" disabled={action.busy} style={{ width: 'fit-content' }}>
                {action.busy ? 'Saving...' : 'Save Class'}
              </Button>
            </form>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', textTransform: 'capitalize' }}>Personalized Class {activeTab}</h2>
              <Button>Add {activeTab.slice(0, -1)}</Button>
            </div>
            <p style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Add specific details for {activeTab} participating in personalized classes. This is separate from the main directory.
            </p>
            <table style={{ width: '100%', marginTop: '16px', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Name</th>
                  <th style={{ padding: '8px' }}>Contact</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 8px' }}>{activeTab === 'teachers' ? 'Sanjay Rai' : 'Aakash Bista'}</td>
                  <td style={{ padding: '12px 8px' }}>{activeTab === 'teachers' ? 'sanjay@example.com' : 'aakash@example.com'}</td>
                  <td style={{ padding: '12px 8px' }}><StatusBadge variant="success">Active</StatusBadge></td>
                  <td style={{ padding: '12px 8px', display: 'flex', gap: '8px' }}>
                    <Button variant="outline" style={{ padding: '4px 8px', minHeight: 'unset', height: '28px', fontSize: '12px' }}>Edit</Button>
                    <Button variant="outline" style={{ padding: '4px 8px', minHeight: 'unset', height: '28px', fontSize: '12px', color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>Remove</Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  );
}

function AppointmentsView() {
  const action = useAction();
  const [items, setItems] = useState<BranchAppointment[]>([]);
  const [selected, setSelected] = useState<BranchAppointment | null>(null);
  const [scheduledTime, setScheduledTime] = useState('');
  const [description, setDescription] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); setLoadError(''); try { const dashboard = await api.branchAdmin.getDashboard(); const result = await api.branchAdmin.getAppointments(dashboard.selectedBranch.id); setItems(result.appointments); } catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'Appointments could not be loaded.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const choose = (item: BranchAppointment) => { setSelected(item); setScheduledTime(nepalDateTimeInput(item.scheduledTime)); setDescription(item.responseRemarks || 'Appointment confirmed with the branch administration.'); };
  const decide = async (decision: 'APPROVE' | 'REJECT') => { if (!selected) return; await api.branchAdmin.respondToAppointment(selected.id, { action: decision, scheduledTime: decision === 'APPROVE' ? nepalDateTimeInputToIso(scheduledTime) : undefined, remarks: description }); setSelected(null); setScheduledTime(''); setDescription(''); await load(); };
  const pending = items.filter((item) => item.status === 'REQUESTED');
  return <Page title="Parent Appointments" description="Review parent requests and allocate the confirmed appointment date and time."><Feedback message={action.message} error={loadError || action.error} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}><Card hoverable={false} style={{ padding: 16 }}><h2 style={{ fontSize: 16, marginBottom: 12 }}>Pending requests</h2>{loading ? <p>Loading appointments...</p> : pending.length ? <div style={{ display: 'grid', gap: 8 }}>{pending.map((item) => <button key={item.id} type="button" onClick={() => choose(item)} style={{ minHeight: 76, padding: 12, textAlign: 'left', border: `1px solid ${selected?.id === item.id ? 'var(--color-primary)' : 'var(--border)'}`, borderRadius: 8, background: selected?.id === item.id ? 'var(--color-primary-soft)' : 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer' }}><strong>{item.student.user.firstName} {item.student.user.lastName}</strong><span style={{ display: 'block', marginTop: 4, color: 'var(--text-muted)', fontSize: 12 }}>{item.requestedBy.firstName} {item.requestedBy.lastName}</span><span style={{ display: 'block', marginTop: 4, color: 'var(--text-muted)', fontSize: 12 }}>Preferred: {nepaliDateHeading(nepalDateKey(item.scheduledTime))} / {new Date(item.scheduledTime).toLocaleTimeString('en-GB', { timeZone: NEPAL_TIME_ZONE, hour: '2-digit', minute: '2-digit' })} NPT</span></button>)}</div> : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No parent requests are waiting.</p>}</Card>{selected ? <Card hoverable={false}><StatusBadge variant="warning">Awaiting decision</StatusBadge><h2 style={{ marginTop: 12, fontSize: 18 }}>{selected.student.user.firstName} {selected.student.user.lastName}</h2><p style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 13 }}>Requested by {selected.requestedBy.firstName} {selected.requestedBy.lastName}{selected.requestedBy.phone ? ` · ${selected.requestedBy.phone}` : ''}</p><div style={{ margin: '16px 0', padding: 14, border: '1px solid var(--border)', borderRadius: 8 }}><strong style={{ fontSize: 12 }}>Parent's request</strong><p style={{ marginTop: 6 }}>{selected.remarks || 'No description provided.'}</p></div><form onSubmit={(event) => { event.preventDefault(); void action.run(() => decide('APPROVE'), 'Appointment accepted and scheduled.'); }} style={form}><NepaliDateTimeField label="Confirmed appointment" value={scheduledTime} onChange={setScheduledTime} /><label style={label} htmlFor="appointment-description">Description for parent<textarea id="appointment-description" value={description} onChange={(event) => setDescription(event.target.value)} style={{ ...field, minHeight: 96 }} required /></label><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><Button type="submit" disabled={action.busy || !scheduledTime || !description.trim()}>Accept and schedule</Button><Button type="button" variant="danger" disabled={action.busy || !description.trim()} onClick={() => void action.run(() => decide('REJECT'), 'Appointment request rejected.')}>Reject request</Button></div></form></Card> : <Card hoverable={false} style={{ minHeight: 300, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', textAlign: 'center' }}><p>Select an appointment request to review.</p></Card>}</div></Page>;
}

function FeeBillingView() {
  return <AcademicFees />;
}
function BranchCalendarView() {
  const action = useAction();
  const [events, setEvents] = useState<AcademicEvent[]>([]);
  const [branchId, setBranchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEventDate, setNewEventDate] = useState(nepalDateKey());
  const [newEventTitle, setNewEventTitle] = useState('');
  const [targetingReady, setTargetingReady] = useState(false);
  const [eventType, setEventType] = useState<EventType>('EVENT');
  const [audience, setAudience] = useState<EventAudience>('ALL');
  const [classId, setClassId] = useState('');
  const [description, setDescription] = useState('');
  const formRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const dashboard = await api.branchAdmin.getDashboard();
      const id = dashboard.selectedBranch.id;
      const response = await request<{ events: AcademicEvent[] }>(`/academic-events?branchId=${encodeURIComponent(id)}`);
      setBranchId(id);
      setEvents(response.events.filter((event) => !event.branchId || event.branchId === id));
    } catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'Calendar events could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  function openEvent(date: string) {
    setNewEventDate(date); if (!showAddEvent) setTargetingReady(false); setShowAddEvent(true);
    requestAnimationFrame(() => { formRef.current?.scrollIntoView({ block: 'center' }); formRef.current?.querySelector('input')?.focus({ preventScroll: true }); });
  }
  function submitEvent(event: FormEvent) {
    event.preventDefault();
    void action.run(async () => {
      if (!targetingReady) throw new Error('Wait for class targeting to load before saving.');
      if (!newEventTitle.trim() || !newEventDate) throw new Error('Enter an event title and choose a date.');
      await api.branchAdmin.createCalendarEvent({ branchId, title: newEventTitle.trim(), description, eventType, audience, classId: classId || undefined, startDate: nepalDateTimeInputToIso(`${newEventDate}T00:00`), endDate: nepalDateTimeInputToIso(`${newEventDate}T23:59`) });
      setNewEventTitle(''); setDescription(''); setShowAddEvent(false);
      await load();
    }, 'Branch event added successfully.');
  }
  return <Page title="Branch Academic Calendar" description="Select a day to review events or add a branch event. Dates use the Nepali calendar.">
    <Feedback message={action.message} error={action.error} />
    <NepalCalendar savingAudience={action.busy} canManageEvent={(event) => event.branchId === branchId} onAudienceChange={(event, audience) => { void action.run(async () => { await academicEventsApi.updateAudience(event.id, audience, branchId); await load(); }, 'Event audience updated.'); }} events={events} loading={loading} error={loadError || undefined} onRetry={() => void load()} onCreateEvent={branchId ? openEvent : undefined} />
    {showAddEvent && <div ref={formRef} style={{ marginTop: 16 }}><Card hoverable={false}>
      <h3>New branch event</h3>
      <form onSubmit={submitEvent} style={{ ...form, marginTop: 16 }}>
        <label style={label}>Event title<input style={field} value={newEventTitle} onChange={(event) => setNewEventTitle(event.target.value)} required /></label>
        <EventTargetFields onReadyChange={setTargetingReady} audience={audience} classId={classId} branchId={branchId} onAudienceChange={setAudience} onClassChange={setClassId} />
        <NepaliDatePicker label="Event date (BS)" value={newEventDate} onChange={setNewEventDate} disabled={action.busy} />
        <label style={label}>Event type<select style={field} value={eventType} onChange={(event) => setEventType(event.target.value as EventType)}><option value="EVENT">Event</option><option value="HOLIDAY">Holiday</option><option value="EXAM">Exam</option><option value="FEE_DUE">Fee due</option></select></label>
        <label style={label}>Description<textarea style={field} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>This event covers the selected Nepal day and applies only to your branch.</p>
        <div style={{ display: 'flex', gap: 8 }}><Button type="submit" disabled={action.busy || !targetingReady || !branchId || !newEventDate}>{action.busy ? 'Saving...' : 'Save event'}</Button><Button type="button" variant="outline" disabled={action.busy} onClick={() => setShowAddEvent(false)}>Cancel</Button></div>
      </form>
    </Card></div>}
  </Page>;
}
function ResourceTasks() {
  const action = useAction();
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [branchId, setBranchId] = useState('');
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async (requestedBranchId?: string) => {
    setLoading(true); setLoadError('');
    try {
      const dashboard = await api.branchAdmin.getDashboard(requestedBranchId);
      const selected = requestedBranchId || dashboard.selectedBranch.id;
      setBranches(dashboard.branches);
      setBranchId(selected);
      setTasks((await resourcesApi.tasks(selected)).tasks);
    } catch (cause) {
      setTasks([]);
      setLoadError(cause instanceof Error ? cause.message : 'Maintenance tasks could not be loaded.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleComplete = (id: string) => {
    void action.run(async () => {
      await resourcesApi.complete(id);
      await load(branchId);
    }, 'Task marked complete with actor and timestamp recorded.');
  };

  const openTasks = tasks.filter((task) => task.status !== 'COMPLETED');

  return (
    <Page title="Resource and maintenance" description="Action-required logs auto-assign maintenance staff; escalated tasks remain visible for direct follow-up.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
        <Card hoverable={false}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end', marginBottom: 16 }}><h2 style={{ fontSize: '18px' }}>Pending Maintenance Tasks</h2>{branches.length > 1 ? <label style={label}>Branch<select style={field} value={branchId} disabled={loading} onChange={(event) => void load(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label> : null}</div>
          <Feedback message={action.message} error={loadError || action.error} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {loading ? <p aria-busy="true" style={{ color: 'var(--text-muted)' }}>Loading maintenance tasks…</p> : openTasks.map(task => (
              <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--color-surface)' }}>
                <div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, fontSize: '15px' }}>{task.id}</span>
                    <StatusBadge variant={task.status === 'ESCALATED' ? 'error' : 'warning'}>{task.status.replaceAll('_', ' ')}</StatusBadge>
                  </div>
                  <div style={{ color: 'var(--color-text)', fontSize: '14px' }}>{task.description}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>Classroom: {task.classroomId} · Logged {new Date(task.createdAt).toLocaleString('en-NP')}</div>
                </div>
                <Button disabled={action.busy} onClick={() => handleComplete(task.id)}>Mark Complete</Button>
              </div>
            ))}
            {!loading && !loadError && !openTasks.length ? <p role="status" style={{ color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>All caught up. No maintenance tasks need action.</p> : null}
          </div>
        </Card>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Card hoverable={false}>
            <h2 style={{ fontSize: 16 }}>Escalation policy</h2>
            <p style={{ marginTop: 8, color: 'var(--color-text-muted, rgba(44,62,80,.7))', fontSize: '13px' }}>Tasks unresolved after the Tenant Admin-configured threshold are marked escalated. Default assignment remains branch-scoped.</p>
            <div style={{ marginTop: '12px' }}>
              <StatusBadge variant="warning">Requires follow-up</StatusBadge>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
function AttendanceView() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [filter, setFilter] = useState<'All' | 'Present' | 'Absent'>('All');
  const events = { '2026-08-01': '98% Present', '2026-08-02': '95% Present', '2026-08-03': '97% Present', '2026-08-04': '99% Present' };

  // Mock lists to show who is present/absent
  const teacherList = [
    { id: 'T1', name: 'Sanjay Rai', status: 'Present' },
    { id: 'T2', name: 'Rina Karki', status: 'Absent (Leave)' }
  ];
  
  const staffList = [
    { id: 'S1', name: 'Bikash Thapa', status: 'Present' },
    { id: 'S2', name: 'Aisha Tamang', status: 'Present' }
  ];

  const studentList = [
    { id: 'ST1', name: 'Aakash Bista', course: 'Grade 10 Math', status: 'Present' },
    { id: 'ST2', name: 'Priya Gurung', course: 'Grade 10 Science', status: 'Absent' },
    { id: 'ST3', name: 'Rohan Sharma', course: 'Grade 12 Physics', status: 'Blocked' }
  ];

  const applyFilter = (list: any[]) => {
    if (filter === 'All') return list;
    if (filter === 'Present') return list.filter(i => i.status === 'Present');
    return list.filter(i => i.status !== 'Present');
  };

  return (
    <Page title="Branch Attendance" description="Click on any date to view complete attendance records for all staff, teachers, and students.">
      <Card hoverable={false}>
        <h2 style={{ fontSize: '18px' }}>Attendance Calendar</h2>
        <CalendarGrid onDateClick={setSelectedDate} events={events} />
      </Card>
      {selectedDate && (
        <Card hoverable={false}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h2 style={{ fontSize: '18px' }}>Records for {selectedDate.toLocaleDateString()}</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant={filter === 'All' ? 'primary' : 'outline'} onClick={() => setFilter('All')} style={{ padding: '6px 12px', minHeight: 'unset', height: '32px' }}>All</Button>
              <Button variant={filter === 'Present' ? 'primary' : 'outline'} onClick={() => setFilter('Present')} style={{ padding: '6px 12px', minHeight: 'unset', height: '32px' }}>Present</Button>
              <Button variant={filter === 'Absent' ? 'primary' : 'outline'} onClick={() => setFilter('Absent')} style={{ padding: '6px 12px', minHeight: 'unset', height: '32px' }}>Absent</Button>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Teachers */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '16px' }}>Teachers</h3>
                <StatusBadge variant="warning">50% Present</StatusBadge>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {applyFilter(teacherList).map(t => (
                  <div key={t.id} style={{ display: 'flex', flexDirection: 'column', padding: '10px 12px', background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>{t.name}</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button variant={t.status.includes('Present') ? 'primary' : 'outline'} style={{ minHeight: '28px', height: '28px', padding: '0 12px', fontSize: '12px' }} onClick={() => alert(`Marking ${t.name} as Present. Details: Verified via bio-metric.`)}>Present</Button>
                        <Button variant={t.status.includes('Absent') ? 'primary' : 'outline'} style={{ minHeight: '28px', height: '28px', padding: '0 12px', fontSize: '12px', borderColor: 'var(--color-error)', color: t.status.includes('Absent') ? '#fff' : 'var(--color-error)', background: t.status.includes('Absent') ? 'var(--color-error)' : 'transparent' }} onClick={() => alert(`Marking ${t.name} as Absent. Details: Unnotified absence.`)}>Absent</Button>
                      </div>
                    </div>
                    {t.status.includes('Leave') && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>Status Info: On approved leave.</div>}
                  </div>
                ))}
                {applyFilter(teacherList).length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No teachers match this filter.</p>}
              </div>
            </div>

            {/* Support Staff */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '16px' }}>Support Staff</h3>
                <StatusBadge variant="success">100% Present</StatusBadge>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {applyFilter(staffList).map(s => (
                  <div key={s.id} style={{ display: 'flex', flexDirection: 'column', padding: '10px 12px', background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>{s.name}</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button variant={s.status.includes('Present') ? 'primary' : 'outline'} style={{ minHeight: '28px', height: '28px', padding: '0 12px', fontSize: '12px' }} onClick={() => alert(`Marking ${s.name} as Present. Details: Verified via RFID.`)}>Present</Button>
                        <Button variant={s.status.includes('Absent') ? 'primary' : 'outline'} style={{ minHeight: '28px', height: '28px', padding: '0 12px', fontSize: '12px', borderColor: 'var(--color-error)', color: s.status.includes('Absent') ? '#fff' : 'var(--color-error)', background: s.status.includes('Absent') ? 'var(--color-error)' : 'transparent' }} onClick={() => alert(`Marking ${s.name} as Absent.`)}>Absent</Button>
                      </div>
                    </div>
                  </div>
                ))}
                {applyFilter(staffList).length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No staff match this filter.</p>}
              </div>
            </div>

            {/* Students */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '16px' }}>Students</h3>
                <StatusBadge variant="warning">33% Present</StatusBadge>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {applyFilter(studentList).map(st => (
                  <div key={st.id} style={{ display: 'flex', flexDirection: 'column', padding: '10px 12px', background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{st.name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>{st.course}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button variant={st.status.includes('Present') ? 'primary' : 'outline'} style={{ minHeight: '28px', height: '28px', padding: '0 12px', fontSize: '12px' }} onClick={() => alert(`Marking ${st.name} as Present. Details: ID Scanned at entry.`)}>Present</Button>
                        <Button variant={st.status.includes('Absent') || st.status.includes('Blocked') ? 'primary' : 'outline'} style={{ minHeight: '28px', height: '28px', padding: '0 12px', fontSize: '12px', borderColor: 'var(--color-error)', color: st.status.includes('Absent') || st.status.includes('Blocked') ? '#fff' : 'var(--color-error)', background: st.status.includes('Absent') || st.status.includes('Blocked') ? 'var(--color-error)' : 'transparent' }} onClick={() => alert(`Marking ${st.name} as Absent. ${st.status === 'Blocked' ? 'Note: Student is blocked due to unpaid fees.' : ''}`)}>Absent</Button>
                      </div>
                    </div>
                    {st.status === 'Blocked' && <div style={{ fontSize: '12px', color: 'var(--color-warning)', marginTop: '8px', fontWeight: 600 }}>Status Info: Blocked from entry.</div>}
                  </div>
                ))}
                {applyFilter(studentList).length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No students match this filter.</p>}
              </div>
            </div>

          </div>
        </Card>
      )}
    </Page>
  );
}

function HomeworkView() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const events = { '2026-08-01': '4 Assignments', '2026-08-02': '2 Assignments', '2026-08-04': '5 Assignments' };
  
  // Default to today if no date is clicked
  const displayDate = selectedDate || new Date();
  
  return (
    <Page title="Branch Homework" description="View all today's homework for all classes and subjects, or click past dates to see history.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '20px' }}>
        <Card hoverable={false}>
          <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>Homework Calendar</h2>
          <CalendarGrid onDateClick={setSelectedDate} events={events} />
        </Card>
        <Card hoverable={false}>
          <h2 style={{ fontSize: '18px' }}>Homework assigned on {displayDate.toLocaleDateString()}</h2>
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {displayDate.getDate() % 2 === 0 ? (
              <>
                <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Mathematics (Grade 8)</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Assigned by Rina Karki</div>
                  <div style={{ color: 'var(--color-text)', fontSize: '13px', marginTop: '4px' }}>Complete exercises 4.1 to 4.5.</div>
                </div>
                <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Science (Grade 10)</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Assigned by Sanjay Rai</div>
                  <div style={{ color: 'var(--color-text)', fontSize: '13px', marginTop: '4px' }}>Read chapter 3 and answer the review questions.</div>
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No homework assigned on this date.</p>
            )}
          </div>
        </Card>
      </div>
    </Page>
  );
}

function ResultsView() {
  const [activeTab, setActiveTab] = useState<'view' | 'edit'>('view');
  const action = useAction();
  
  const [results, setResults] = useState([
    { id: '1', exam: 'Mid Term', subject: 'Mathematics', class: 'Grade 10', date: '2026-06-15' },
    { id: '2', exam: 'First Term', subject: 'Science', class: 'Grade 8', date: '2026-04-10' }
  ]);
  const [editingResult, setEditingResult] = useState<any>(null);

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this result record?')) {
      setResults(prev => prev.filter(r => r.id !== id));
    }
  };

  const handleEdit = (r: any) => {
    setEditingResult(r);
    setActiveTab('edit');
  };

  const handleCreate = () => {
    setEditingResult(null);
    setActiveTab('edit');
  };

  const submitResult = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      await new Promise(r => setTimeout(r, 600));
      if (editingResult?.id) {
        setResults(prev => prev.map(r => r.id === editingResult.id ? { ...r, ...editingResult } : r));
      } else {
        setResults(prev => [...prev, { ...editingResult, id: Date.now().toString() }]);
      }
      setActiveTab('view');
    }, `Result ${editingResult?.id ? 'updated' : 'added'} successfully.`);
  };

  return (
    <Page title="Branch Results" description="Complete CRUD operations for results across all classes and subjects in the branch.">
      <Card hoverable={false}>
        {activeTab === 'view' ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px' }}>Recent Results</h2>
              <Button onClick={handleCreate}>Add New Result</Button>
            </div>
            <table style={{ width: '100%', marginTop: '16px', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Exam</th>
                  <th style={{ padding: '8px' }}>Subject</th>
                  <th style={{ padding: '8px' }}>Class</th>
                  <th style={{ padding: '8px' }}>Date</th>
                  <th style={{ padding: '8px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 8px' }}>{r.exam}</td>
                    <td style={{ padding: '12px 8px' }}>{r.subject}</td>
                    <td style={{ padding: '12px 8px' }}>{r.class}</td>
                    <td style={{ padding: '12px 8px' }}>{r.date}</td>
                    <td style={{ padding: '12px 8px', display: 'flex', gap: '8px' }}>
                      <Button variant="outline" onClick={() => handleEdit(r)} style={{ padding: '4px 8px', minHeight: 'unset', height: '28px', fontSize: '12px' }}>Edit</Button>
                      <Button variant="outline" onClick={() => handleDelete(r.id)} style={{ padding: '4px 8px', minHeight: 'unset', height: '28px', fontSize: '12px', color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>Delete</Button>
                    </td>
                  </tr>
                ))}
                {results.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>No results found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px' }}>{editingResult?.id ? 'Edit Result' : 'Add New Result'}</h2>
              <Button variant="outline" onClick={() => setActiveTab('view')}>Cancel</Button>
            </div>
            <form onSubmit={submitResult} style={form} aria-busy={action.busy}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label style={label}>Exam Name<input required style={field} value={editingResult?.exam || ''} onChange={e => setEditingResult({ ...editingResult, exam: e.target.value })} placeholder="e.g. Mid Term" /></label>
                <label style={label}>Subject<input required style={field} value={editingResult?.subject || ''} onChange={e => setEditingResult({ ...editingResult, subject: e.target.value })} placeholder="e.g. Mathematics" /></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label style={label}>Class/Group<input required style={field} value={editingResult?.class || ''} onChange={e => setEditingResult({ ...editingResult, class: e.target.value })} placeholder="e.g. Grade 10" /></label>
                <label style={label}>Date<input type="date" required style={field} value={editingResult?.date || ''} onChange={e => setEditingResult({ ...editingResult, date: e.target.value })} /></label>
              </div>
              <Feedback message={action.message} error={action.error} />
              <Button type="submit" disabled={action.busy} style={{ width: 'fit-content' }}>
                {action.busy ? 'Saving...' : 'Save Result'}
              </Button>
            </form>
          </div>
        )}
      </Card>
    </Page>
  );
}

function CertificatesView() {
  type CertificateOptions = Awaited<ReturnType<typeof api.branchAdmin.getCertificateOptions>>;
  const [studentKey, setStudentKey] = useState('');
  const [template, setTemplate] = useState('');
  const [preview, setPreview] = useState(false);
  const [templates, setTemplates] = useState<CertificateOptions['templates']>([]);
  const [students, setStudents] = useState<CertificateOptions['students']>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [issuedId, setIssuedId] = useState('');
  const action = useAction();
  const selectedStudent = students.find((item) => `${item.studentId}:${item.branchId}` === studentKey);
  const selectedTemplate = templates.find((item) => item.id === template);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { const options = await api.branchAdmin.getCertificateOptions(); setTemplates(options.templates); setStudents(options.students); }
    catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'Certificate options could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    void action.run(async () => {
      const result = await api.branchAdmin.issueCertificate({ studentId: selectedStudent.studentId, templateId: template, branchId: selectedStudent.branchId });
      setIssuedId(result.certificate.certificateId);
      setPreview(false);
    }, 'Certificate issued and saved to the student record.');
  };

  return (
    <Page title="Issue certificates" description="Review an approved institution template and issue a permanent certificate to an enrolled student.">
      <div className="certificate-workspace-grid">
        <Card hoverable={false}>
          <h2 style={{ fontSize: '18px' }}>Certificate details</h2>
          <form onSubmit={submit} style={{ ...form, marginTop: '16px' }} aria-busy={action.busy}>
            <label style={label}>
              Select Student
              <select required style={field} value={studentKey} disabled={loading} onChange={e => { setStudentKey(e.target.value); setPreview(false); setIssuedId(''); }}><option value="">Choose a student…</option>{students.map((item) => <option key={`${item.studentId}:${item.branchId}`} value={`${item.studentId}:${item.branchId}`}>{item.studentName} · {item.gradeName} · {item.branchName}</option>)}</select>
            </label>
            <label style={label}>
              Select Template
              <select required style={field} value={template} disabled={loading} onChange={e => { setTemplate(e.target.value); setPreview(false); setIssuedId(''); }}>
                <option value="" disabled>Choose a template...</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            
            {template && selectedStudent && (
              <div style={{ marginTop: '12px', padding: '16px', background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '14px', marginBottom: '12px' }}>Certificate details</h3>
                <p><strong>{selectedStudent.studentName}</strong><br /><span style={{ color: 'var(--text-muted)' }}>{selectedStudent.gradeName} · {selectedStudent.branchName}</span></p>
                <p style={{ marginTop: 10, color: 'var(--text-muted)' }}>{templates.find((item) => item.id === template)?.name}</p>
                <Button type="button" variant="outline" style={{ marginTop: '16px', width: '100%' }} onClick={() => setPreview(true)}>Review certificate</Button>
              </div>
            )}
            
            <Feedback message={action.message} error={loadError || action.error} />
            {loading ? <p aria-busy="true" style={{ color: 'var(--text-muted)' }}>Loading students and templates…</p> : !loadError && (!students.length || !templates.length) ? <p role="status" style={{ color: 'var(--text-muted)' }}>{!templates.length ? 'Create a certificate template before issuing certificates.' : 'No enrolled students are available in your branch.'}</p> : null}
            <Button type="submit" disabled={!preview || action.busy}>{action.busy ? 'Issuing…' : 'Issue certificate'}</Button>
            {issuedId ? <Button type="button" variant="outline" onClick={() => window.open(`${API_BASE_URL}/certificates/${encodeURIComponent(issuedId)}/download`, '_blank', 'noopener,noreferrer')}>Download issued PDF</Button> : null}
          </form>
        </Card>
        
        <Card hoverable={false} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', background: 'var(--color-surface)' }}>
          {preview && selectedStudent && selectedTemplate ? (
            <article aria-label="Certificate preview" className={`tenant-certificate-design-preview is-${(selectedTemplate.layoutConfig.theme ?? 'CLASSIC').toLowerCase()}`} style={{ width: '100%', minHeight: 360 }}>
              <small>{selectedStudent.branchName}</small><h4>{selectedTemplate.layoutConfig.title ?? selectedTemplate.name}</h4><p>{selectedTemplate.layoutConfig.presentationLine ?? 'This certificate is proudly presented to'}</p><strong>{selectedStudent.studentName}</strong><p>{selectedTemplate.layoutConfig.achievementLine ?? `In recognition of achievement in ${selectedStudent.gradeName}`}</p><footer><span>{selectedTemplate.layoutConfig.signatoryName ?? 'Authorized signatory'}</span><span>{new Date().toLocaleDateString('en-GB')}</span></footer>
            </article>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '48px', opacity: 0.5 }}>image</span>
              <p style={{ marginTop: '8px' }}>Select a student and template to preview</p>
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}

/* Retained temporarily in source history only; the typed feature workspace is active.
function LegacyBranchClassesView() {
  const [classes, setClasses] = useState<any[]>([]); const [branches, setBranches] = useState<any[]>([]); const [grades, setGrades] = useState<any[]>([]); const [people, setPeople] = useState<any[]>([]); const [selectedId, setSelectedId] = useState(''); const [creating, setCreating] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [extraSourceId, setExtraSourceId] = useState(''); const [eligibleStudents, setEligibleStudents] = useState<Array<{ studentId: string; studentName: string; studentEmail: string }>>([]); const [eligibleLoading, setEligibleLoading] = useState(false); const action = useAction();
  const [createForm, setCreateForm] = useState({ branchId: '', gradeId: '', name: 'A', subject: '', kind: 'REGULAR', monthlyFee: '0', teacherId: '', sourceClassId: '', studentIds: [] as string[] });
  const [editForm, setEditForm] = useState({ name: '', teacherId: '' });
  const selected = classes.find((item) => item.id === selectedId);
  const teachers = people.filter((person) => person.roles.some((role: any) => role.role === 'Teacher' && (!createForm.branchId || role.branchId === createForm.branchId)));
  const regularSourceClasses = classes.filter((item) => item.courseType === 'REGULAR' && item.branchId === createForm.branchId && (!createForm.gradeId || item.gradeId === createForm.gradeId));
  const sourceClass = regularSourceClasses.find((item) => item.id === createForm.sourceClassId);
  const sourceStudents = sourceClass?.enrollments || [];
  const selectedRegularClasses = classes.filter((item) => item.courseType === 'REGULAR' && item.branchId === selected?.branchId && (!selected?.gradeId || item.gradeId === selected.gradeId));
  const selectedSourceClass = selectedRegularClasses.find((item) => item.id === extraSourceId);
  const eligibleForSelected = (selectedSourceClass?.enrollments || []).filter((enrollment: any) => !selected?.enrollments?.some((current: any) => current.studentId === enrollment.studentId));
  const load = async () => { setLoading(true); setError(''); try { const [classList, branchList, gradeList, personList] = await Promise.all([api.academics.listClasses(), api.branches.list(), api.grades.list(), api.people.list()]); setClasses(classList); setBranches(branchList); setGrades(gradeList); setPeople(personList); setCreateForm((current) => ({ ...current, branchId: current.branchId || branchList[0]?.id || '', gradeId: current.gradeId || gradeList[0]?.id || '' })); if (selectedId && !classList.some((item: any) => item.id === selectedId)) setSelectedId(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Classes could not be loaded.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const loadEligibleStudents = async (classId: string) => { setEligibleLoading(true); try { setEligibleStudents(await api.academics.listEligibleClassStudents(classId)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Eligible students could not be loaded.'); setEligibleStudents([]); } finally { setEligibleLoading(false); } };
  const openDetails = (item: any) => { setSelectedId(item.id); setCreating(false); setEditForm({ name: item.name, teacherId: item.teacherId || '' }); const sources = classes.filter((candidate) => candidate.courseType === 'REGULAR' && candidate.branchId === item.branchId && (!item.gradeId || candidate.gradeId === item.gradeId)); setExtraSourceId(sources[0]?.id || ''); void loadEligibleStudents(item.id); };
  const toggleStudent = (studentId: string) => setCreateForm((current) => ({ ...current, studentIds: current.studentIds.includes(studentId) ? current.studentIds.filter((id) => id !== studentId) : [...current.studentIds, studentId] }));
  const createClass = (event: FormEvent) => { event.preventDefault(); const selectedGrade = grades.find((grade) => grade.id === createForm.gradeId); const className = createForm.kind === 'REGULAR' ? `${selectedGrade?.name || 'Grade'} - Section ${createForm.name}` : createForm.name.trim(); void action.run(async () => { await api.academics.setupClass({ branchId: createForm.branchId, gradeId: createForm.gradeId, courseName: createForm.subject.trim(), courseType: createForm.kind === 'REGULAR' ? 'REGULAR' : 'SHORT_TERM', className, monthlyBase: Number(createForm.monthlyFee || 0), teacherId: createForm.teacherId || null, studentIds: createForm.kind === 'EXTRA' ? createForm.studentIds : [] }); setCreating(false); setCreateForm((current) => ({ ...current, name: 'A', subject: '', monthlyFee: '0', teacherId: '', sourceClassId: '', studentIds: [] })); await load(); }, `${createForm.kind === 'REGULAR' ? 'Regular' : 'Extra'} class created.`); };
  const saveDetails = (event: FormEvent) => { event.preventDefault(); if (!selected) return; void action.run(async () => { await api.academics.updateClass(selected.id, { name: editForm.name.trim(), teacherId: editForm.teacherId || null }); await load(); }, 'Class details updated.'); };
  const addStudent = (studentId: string) => { if (!selected || !studentId) return; void action.run(async () => { await api.academics.enroll(studentId, selected.courseId, selected.id); await load(); await loadEligibleStudents(selected.id); }, 'Student enrolled in class.'); };
  const removeStudent = (enrollmentId: string) => { if (!selected) return; void action.run(async () => { await api.academics.unenroll(enrollmentId); await load(); await loadEligibleStudents(selected.id); }, 'Student removed from class. Enrollment history was preserved.'); };
  const deleteClass = () => { if (!selected) return; if (selected.hasEnrollmentHistory) { setError('This class has enrollment history and cannot be permanently deleted. Its records must be preserved.'); return; } void action.run(async () => { await api.academics.deleteClass(selected.id); setSelectedId(''); await load(); }, 'Class deleted.'); };
  const selectedTeachers = people.filter((person) => person.roles.some((role: any) => role.role === 'Teacher' && role.branchId === selected?.branchId));

  return <Page title="Branch classes" description="Create regular and extra classes, assign teachers, enroll multiple students, and manage every class through its full lifecycle.">
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><Button onClick={() => { setCreating(true); setSelectedId(''); }}>Create class</Button><a href="/branch/timetable" style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--color-primary)', fontWeight: 700, textDecoration: 'none' }}>Open timetable</a></div>
    <Feedback message={action.message} error={action.error || error} />
    {creating ? <Card hoverable={false}>
      <h2 style={{ fontSize: 18 }}>Create regular or extra class</h2>
      <form onSubmit={createClass} style={{ ...form, marginTop: 16 }} aria-busy={action.busy}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
          <label style={label}>Class type<select style={field} value={createForm.kind} onChange={(event) => setCreateForm({ ...createForm, kind: event.target.value, name: event.target.value === 'REGULAR' ? 'A' : '', sourceClassId: '', studentIds: [] })}><option value="REGULAR">Regular class</option><option value="EXTRA">Extra class</option></select></label>
          <label style={label}>Branch<select required style={field} value={createForm.branchId} onChange={(event) => setCreateForm({ ...createForm, branchId: event.target.value, teacherId: '', sourceClassId: '', studentIds: [] })}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label style={label}>Grade<select required style={field} value={createForm.gradeId} onChange={(event) => setCreateForm({ ...createForm, gradeId: event.target.value, sourceClassId: '', studentIds: [] })}><option value="">Select grade</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>
          {createForm.kind === 'REGULAR' ? <label style={label}>Section<select required style={field} value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}><option value="A">Section A</option><option value="B">Section B</option><option value="C">Section C</option><option value="D">Section D</option></select><small>The class name is generated from the selected grade and section.</small></label> : <label style={label}>Class name<input required style={field} value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} placeholder="Robotics Club" /></label>}
          <label style={label}>Subject or activity<input required style={field} value={createForm.subject} onChange={(event) => setCreateForm({ ...createForm, subject: event.target.value })} placeholder="Mathematics or Robotics" /></label>
          <label style={label}>Monthly fee (NPR)<input required inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" style={field} value={createForm.monthlyFee} onChange={(event) => setCreateForm({ ...createForm, monthlyFee: event.target.value })} /></label>
          <label style={label}>Teacher<select style={field} value={createForm.teacherId} onChange={(event) => setCreateForm({ ...createForm, teacherId: event.target.value })}><option value="">Assign later</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
        </div>
        {createForm.kind === 'EXTRA' ? <fieldset style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
          <legend style={{ padding: '0 6px', fontWeight: 700 }}>Choose students ({createForm.studentIds.length} selected)</legend>
          <label style={label}>Existing regular class<select required style={field} value={createForm.sourceClassId} onChange={(event) => setCreateForm({ ...createForm, sourceClassId: event.target.value, studentIds: [] })}><option value="">Select a regular class</option>{regularSourceClasses.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.enrollmentCount} students</option>)}</select></label>
          {!regularSourceClasses.length ? <p style={{ color: 'var(--text-muted)', marginTop: 10 }}>No regular classes are available for this branch and grade. Create a regular class and admit students into it first.</p> : !createForm.sourceClassId ? <p style={{ color: 'var(--text-muted)', marginTop: 10 }}>Choose a regular class to see its students.</p> : sourceStudents.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, marginTop: 10 }}>{sourceStudents.map((student: any) => <label key={student.studentId} style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 40 }}><input type="checkbox" checked={createForm.studentIds.includes(student.studentId)} onChange={() => toggleStudent(student.studentId)} />{student.studentName}</label>)}</div> : <p style={{ color: 'var(--text-muted)', marginTop: 10 }}>This regular class has no admitted students yet.</p>}
        </fieldset> : <div role="note" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, color: 'var(--text-muted)' }}><strong style={{ color: 'var(--color-text)' }}>Grade-linked roster</strong><br />After creating the section, assign admitted students from the selected grade in the class details.</div>}
        <div style={{ display: 'flex', gap: 8 }}><Button type="submit" disabled={action.busy}>{action.busy ? 'Creating…' : 'Create class'}</Button><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button></div>
      </form>
    </Card> : null}
    {loading ? <Card hoverable={false}><div aria-busy="true">Loading classes…</div></Card> : !creating ? <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,.8fr) minmax(0,1.5fr)', gap: 16 }}>
      <Card hoverable={false}><h2 style={{ fontSize: 17, marginBottom: 12 }}>All branch classes</h2>{classes.length ? <div style={{ display: 'grid', gap: 8 }}>{classes.map((item) => <button type="button" key={item.id} onClick={() => openDetails(item)} style={{ minHeight: 64, padding: 12, textAlign: 'left', border: `1px solid ${selectedId === item.id ? 'var(--color-primary)' : 'var(--border)'}`, borderRadius: 8, background: selectedId === item.id ? 'var(--color-primary-soft)' : 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer' }}><strong>{item.name}</strong><small style={{ display: 'block', marginTop: 4, color: 'var(--text-muted)' }}>{item.courseName} · {item.courseType === 'REGULAR' ? 'Regular' : 'Extra'} · {item.enrollmentCount} students</small></button>)}</div> : <p style={{ color: 'var(--text-muted)' }}>No classes have been created.</p>}</Card>
      {selected ? <Card hoverable={false}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><StatusBadge variant={selected.courseType === 'REGULAR' ? 'info' : 'success'}>{selected.courseType === 'REGULAR' ? 'Regular class' : 'Extra class'}</StatusBadge><h2 style={{ marginTop: 10 }}>{selected.name}</h2><p style={{ color: 'var(--text-muted)' }}>{selected.gradeName || 'No grade'} · {selected.courseName} · {selected.branchName}</p></div><Button variant="danger" onClick={deleteClass} disabled={action.busy}>Delete class</Button></div>
        <form onSubmit={saveDetails} style={{ ...form, marginTop: 18 }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><label style={label}>Class name<input required style={field} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label><label style={label}>Assigned teacher<select style={field} value={editForm.teacherId} onChange={(event) => setEditForm({ ...editForm, teacherId: event.target.value })}><option value="">Unassigned</option>{selectedTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label></div><Button type="submit" disabled={action.busy}>Save details</Button></form>
        <section style={{ marginTop: 22 }}><h3 style={{ fontSize: 16 }}>Enrolled students ({selected.enrollments?.length || 0})</h3>
          {selected.courseType === 'REGULAR' ? <div style={{ display: 'grid', gap: 10, margin: '10px 0' }}><p role="note" style={{ color: 'var(--text-muted)' }}>Only active students admitted to {selected.gradeName || 'this grade'} at {selected.branchName} are available.</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><select id="class-add-grade-student" aria-label="Student from this grade to enroll" style={{ ...field, flex: '1 1 240px' }} defaultValue="" key={`${selected.id}-${eligibleStudents.length}`} disabled={eligibleLoading}><option value="">{eligibleLoading ? 'Loading students…' : 'Select a student from this grade'}</option>{eligibleStudents.map((student) => <option key={student.studentId} value={student.studentId}>{student.studentName} · {student.studentEmail}</option>)}</select><Button type="button" disabled={eligibleLoading || !eligibleStudents.length} onClick={() => { const element = document.getElementById('class-add-grade-student') as HTMLSelectElement | null; if (element?.value) addStudent(element.value); }}>Add to class</Button></div>{!eligibleLoading && !eligibleStudents.length ? <p style={{ color: 'var(--text-muted)' }}>Every eligible student is already assigned, or this grade has no active admitted students.</p> : null}</div> : <div style={{ display: 'grid', gap: 10, margin: '10px 0' }}><label style={label}>Choose from regular class<select style={field} value={extraSourceId} onChange={(event) => setExtraSourceId(event.target.value)}><option value="">Select a regular class</option>{selectedRegularClasses.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.enrollmentCount} students</option>)}</select></label><div style={{ display: 'flex', gap: 8 }}><select id="class-add-student" aria-label="Student to enroll" style={field} defaultValue="" key={extraSourceId}><option value="">Select a student</option>{eligibleForSelected.map((student: any) => <option key={student.studentId} value={student.studentId}>{student.studentName}</option>)}</select><Button type="button" disabled={!extraSourceId || !eligibleForSelected.length} onClick={() => { const element = document.getElementById('class-add-student') as HTMLSelectElement | null; if (element?.value) addStudent(element.value); }}>Enroll</Button></div>{!selectedRegularClasses.length ? <p style={{ color: 'var(--text-muted)' }}>No matching regular class is available.</p> : extraSourceId && !eligibleForSelected.length ? <p style={{ color: 'var(--text-muted)' }}>All students from this regular class are already enrolled, or the class is empty.</p> : null}</div>}
          {selected.enrollments?.length ? <div style={{ display: 'grid', gap: 8 }}>{selected.enrollments.map((enrollment: any) => <div key={enrollment.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}><span><strong>{enrollment.studentName}</strong><small style={{ display: 'block', color: 'var(--text-muted)' }}>{enrollment.studentEmail}</small></span><Button type="button" variant="outline" onClick={() => removeStudent(enrollment.id)}>Remove</Button></div>)}</div> : <p style={{ color: 'var(--text-muted)' }}>No students assigned to this class yet.</p>}
        </section>
      </Card> : <Card hoverable={false} style={{ minHeight: 260, display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>Select a class to manage it.</Card>}
    </div> : null}
  </Page>;
}
*/

function LegacyTimetableView() {
  const [activeTab, setActiveTab] = useState<'view' | 'add'>('view');
  const action = useAction();
  
  const [schedule, setSchedule] = useState([
    { id: '1', date: '2026-08-06', day: 'Thursday', time: '08:00 AM - 09:30 AM', class: 'Grade 10', subject: 'Mathematics', teacher: 'Sanjay Rai', room: 'Room 302' },
    { id: '2', date: '2026-08-07', day: 'Friday', time: '10:00 AM - 11:30 AM', class: 'Grade 12', subject: 'Physics', teacher: 'Rina Karki', room: 'Lab 1' },
    { id: '3', date: '2026-08-08', day: 'Saturday', time: '12:00 PM - 01:30 PM', class: 'IELTS Prep', subject: 'English', teacher: 'Bikash Thapa', room: 'Room 105' }
  ]);

  const [editingId, setEditingId] = useState('');
  const [formData, setFormData] = useState({
    date: '', day: 'Monday', startTime: '', endTime: '', class: '', subject: '', teacher: '', room: ''
  });

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this session?')) {
      setSchedule(prev => prev.filter(s => s.id !== id));
    }
  };

  const handleEdit = (session: any) => {
    const [start, end] = session.time.split(' - ');
    // Very basic time string mapping back to input[type=time] format, assuming simplified format or we just use text inputs for simplicity in mock
    // For a robust implementation, parsing '08:00 AM' to '08:00' is needed. 
    // Here we'll just store the raw values if possible, or expect the user to re-enter. Let's do a simple parse:
    const parseTime = (t: string) => {
      if (!t) return '';
      const [time, modifier] = t.split(' ');
      if (!time || !modifier) return t;
      let [hours, minutes] = time.split(':');
      if (hours === '12') hours = '00';
      if (modifier === 'PM') hours = String(parseInt(hours, 10) + 12);
      return `${hours.padStart(2, '0')}:${minutes}`;
    };

    setFormData({
      date: session.date || '',
      day: session.day || 'Monday',
      startTime: parseTime(start) || '',
      endTime: parseTime(end) || '',
      class: session.class,
      subject: session.subject,
      teacher: session.teacher,
      room: session.room
    });
    setEditingId(session.id);
    setActiveTab('add');
  };

  const handleCreate = () => {
    setEditingId('');
    setFormData({ date: '', day: 'Monday', startTime: '', endTime: '', class: '', subject: '', teacher: '', room: '' });
    setActiveTab('add');
  };

  const formatTime = (time24: string) => {
    if (!time24) return '';
    const [h, m] = time24.split(':');
    const hours = parseInt(h, 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12.toString().padStart(2, '0')}:${m} ${ampm}`;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      await new Promise(r => setTimeout(r, 600));
      
      const newSession = {
        id: editingId || `new-${Date.now()}`,
        date: formData.date,
        day: formData.day,
        time: `${formatTime(formData.startTime)} - ${formatTime(formData.endTime)}`,
        class: formData.class,
        subject: formData.subject,
        teacher: formData.teacher,
        room: formData.room
      };

      if (editingId) {
        setSchedule(prev => prev.map(s => s.id === editingId ? newSession : s));
      } else {
        setSchedule(prev => [...prev, newSession]);
      }
      
      setActiveTab('view');
    }, `Timetable session ${editingId ? 'updated' : 'added'} successfully.`);
  };

  return (
    <Page title="Branch Timetable Management" description="Full CRUD operations for all classes, subjects, and teachers of the branch.">
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <Button variant={activeTab === 'view' ? 'primary' : 'outline'} onClick={() => setActiveTab('view')}>View Schedule</Button>
        <Button variant={activeTab === 'add' ? 'primary' : 'outline'} onClick={handleCreate}>{editingId ? 'Edit Session' : 'Add Session'}</Button>
      </div>

      <Card hoverable={false}>
        {activeTab === 'view' ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px' }}>Scheduled Classes</h2>
              <StatusBadge variant="info">{schedule.length} sessions</StatusBadge>
            </div>
            <div style={{ overflowX: 'auto', marginTop: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '800px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Date & Day</th>
                    <th style={{ padding: '8px' }}>Time</th>
                    <th style={{ padding: '8px' }}>Class & Subject</th>
                    <th style={{ padding: '8px' }}>Teacher</th>
                    <th style={{ padding: '8px' }}>Room</th>
                    <th style={{ padding: '8px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map(session => (
                    <tr key={session.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ fontWeight: 600 }}>{session.date}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{session.day}</div>
                      </td>
                      <td style={{ padding: '12px 8px', fontWeight: 600 }}>{session.time}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <div>{session.subject}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{session.class}</div>
                      </td>
                      <td style={{ padding: '12px 8px' }}>{session.teacher}</td>
                      <td style={{ padding: '12px 8px' }}>{session.room}</td>
                      <td style={{ padding: '12px 8px', display: 'flex', gap: '8px' }}>
                        <Button variant="outline" onClick={() => handleEdit(session)} style={{ padding: '4px 8px', minHeight: 'unset', height: '28px', fontSize: '12px' }}>Edit</Button>
                        <Button variant="outline" onClick={() => handleDelete(session.id)} style={{ padding: '4px 8px', minHeight: 'unset', height: '28px', fontSize: '12px', color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>Delete</Button>
                      </td>
                    </tr>
                  ))}
                  {schedule.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>No sessions scheduled.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px' }}>{editingId ? 'Edit Session' : 'Add New Session'}</h2>
              {editingId && <Button variant="outline" onClick={() => setActiveTab('view')}>Cancel</Button>}
            </div>
            <form onSubmit={submit} style={form} aria-busy={action.busy}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label style={label}>Date
                  <input type="date" required style={field} value={formData.date} onChange={e => {
                    const d = e.target.value;
                    let dayName = formData.day;
                    if (d) {
                      const dateObj = new Date(d);
                      if (!isNaN(dateObj.getTime())) {
                         dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                      }
                    }
                    setFormData({ ...formData, date: d, day: dayName });
                  }} />
                </label>
                <label style={label}>Day
                  <select required style={field} value={formData.day} onChange={e => setFormData({ ...formData, day: e.target.value })}>
                    <option value="Sunday">Sunday</option>
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                  </select>
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label style={label}>Class / Group<input required style={field} value={formData.class} onChange={e => setFormData({ ...formData, class: e.target.value })} placeholder="e.g. Grade 10" /></label>
                <label style={label}>Subject<input required style={field} value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} placeholder="e.g. Mathematics" /></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label style={label}>Assign Teacher
                  <select required style={field} value={formData.teacher} onChange={e => setFormData({ ...formData, teacher: e.target.value })}>
                    <option value="">Select a teacher...</option>
                    <option value="Sanjay Rai">Sanjay Rai</option>
                    <option value="Rina Karki">Rina Karki</option>
                    <option value="Bikash Thapa">Bikash Thapa</option>
                  </select>
                </label>
                <label style={label}>Room<input required style={field} value={formData.room} onChange={e => setFormData({ ...formData, room: e.target.value })} placeholder="e.g. Room 302" /></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label style={label}>Start Time<input type="time" required style={field} value={formData.startTime} onChange={e => setFormData({ ...formData, startTime: e.target.value })} /></label>
                <label style={label}>End Time<input type="time" required style={field} value={formData.endTime} onChange={e => setFormData({ ...formData, endTime: e.target.value })} /></label>
              </div>
              <Feedback message={action.message} error={action.error} />
              <Button type="submit" disabled={action.busy} style={{ width: 'fit-content' }}>
                {action.busy ? 'Saving...' : 'Save Session'}
              </Button>
            </form>
          </div>
        )}
      </Card>
    </Page>
  );
}

// ─── BRANCH STUDENTS VIEW ──────────────────────────────────────────────────────
function BranchStudentsView() {
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const action = useAction();

  const [students, setStudents] = useState([
    { id: 'S001', name: 'Aakash Bista', email: 'aakash@tms.edu', phone: '9841000001', class: 'Grade 10 Science', enrollDate: '2026-01-15', avatar: null, status: 'Active',
      billing: [
        { id: 'INV-001', cycle: 'Jan 2026', amount: 15000, discount: 0, net: 15000, status: 'Paid', dueDate: '2026-01-20' },
        { id: 'INV-002', cycle: 'Feb 2026', amount: 15000, discount: 1000, net: 14000, status: 'Paid', dueDate: '2026-02-20' },
        { id: 'INV-003', cycle: 'Mar 2026', amount: 15000, discount: 0, net: 15000, status: 'Paid', dueDate: '2026-03-20' },
        { id: 'INV-004', cycle: 'Apr 2026', amount: 15000, discount: 0, net: 15000, status: 'Paid', dueDate: '2026-04-20' },
        { id: 'INV-005', cycle: 'May 2026', amount: 15000, discount: 0, net: 15000, status: 'Paid', dueDate: '2026-05-20' },
        { id: 'INV-006', cycle: 'Jun 2026', amount: 15000, discount: 0, net: 15000, status: 'Paid', dueDate: '2026-06-20' },
        { id: 'INV-007', cycle: 'Jul 2026', amount: 15000, discount: 0, net: 15000, status: 'Overdue', dueDate: '2026-07-20' },
        { id: 'INV-008', cycle: 'Aug 2026', amount: 15000, discount: 0, net: 15000, status: 'Pending', dueDate: '2026-08-20' },
      ],
      extraClasses: [{ name: 'IELTS Prep', fee: 5000, months: [{ cycle: 'Jul 2026', status: 'Paid' }, { cycle: 'Aug 2026', status: 'Pending' }] }],
      courseFee: 15000, courseMonths: 12
    },
    { id: 'S002', name: 'Priya Gurung', email: 'priya@tms.edu', phone: '9841000002', class: 'Grade 10 Math', enrollDate: '2026-02-01', avatar: null, status: 'Active',
      billing: [
        { id: 'INV-010', cycle: 'Feb 2026', amount: 12000, discount: 0, net: 12000, status: 'Paid', dueDate: '2026-02-20' },
        { id: 'INV-011', cycle: 'Mar 2026', amount: 12000, discount: 0, net: 12000, status: 'Paid', dueDate: '2026-03-20' },
        { id: 'INV-012', cycle: 'Apr 2026', amount: 12000, discount: 0, net: 12000, status: 'Paid', dueDate: '2026-04-20' },
        { id: 'INV-013', cycle: 'May 2026', amount: 12000, discount: 2000, net: 10000, status: 'Paid', dueDate: '2026-05-20' },
        { id: 'INV-014', cycle: 'Jun 2026', amount: 12000, discount: 0, net: 12000, status: 'Paid', dueDate: '2026-06-20' },
        { id: 'INV-015', cycle: 'Jul 2026', amount: 12000, discount: 0, net: 12000, status: 'Paid', dueDate: '2026-07-20' },
        { id: 'INV-016', cycle: 'Aug 2026', amount: 12000, discount: 0, net: 12000, status: 'Pending', dueDate: '2026-08-20' },
      ],
      extraClasses: [],
      courseFee: 12000, courseMonths: 12
    },
    { id: 'S003', name: 'Rohan Sharma', email: 'rohan@tms.edu', phone: '9841000003', class: 'Grade 12 Physics', enrollDate: '2026-03-01', avatar: null, status: 'Blocked',
      billing: [
        { id: 'INV-020', cycle: 'Mar 2026', amount: 18000, discount: 0, net: 18000, status: 'Paid', dueDate: '2026-03-20' },
        { id: 'INV-021', cycle: 'Apr 2026', amount: 18000, discount: 0, net: 18000, status: 'Overdue', dueDate: '2026-04-20' },
        { id: 'INV-022', cycle: 'May 2026', amount: 18000, discount: 0, net: 18000, status: 'Overdue', dueDate: '2026-05-20' },
      ],
      extraClasses: [{ name: 'Advanced Calculus', fee: 8000, months: [{ cycle: 'Mar 2026', status: 'Paid' }, { cycle: 'Apr 2026', status: 'Overdue' }] }],
      courseFee: 18000, courseMonths: 12
    },
  ]);

  const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.class.toLowerCase().includes(search.toLowerCase()));

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const futureBilling = (s: any) => {
    const paidMonths = s.billing.filter((b: any) => b.status === 'Paid').length;
    const remaining = s.courseMonths - paidMonths;
    return { remaining: Math.max(0, remaining), projected: Math.max(0, remaining) * s.courseFee };
  };

  const [isAdding, setIsAdding] = useState(false);
  const [newStudent, setNewStudent] = useState<any>({ name: '', email: '', phone: '', class: '', status: 'Active' });
  const handleDelete = (id: string) => { if (window.confirm('Remove this student?')) { setStudents(prev => prev.filter(s => s.id !== id)); setSelectedStudent(null); } };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      await new Promise(r => setTimeout(r, 500));
      if (isAdding) {
        setStudents(prev => [{ ...newStudent, id: `S${Date.now()}`, enrollDate: new Date().toISOString().split('T')[0], avatar: null, billing: [], extraClasses: [], courseFee: 15000, courseMonths: 12 }, ...prev]);
        setIsAdding(false);
      } else {
        setStudents(prev => prev.map(s => s.id === selectedStudent.id ? selectedStudent : s));
        setEditMode(false);
      }
    }, `Student ${isAdding ? 'added' : 'updated'} successfully.`);
  };

  return (
    <Page title="Branch Students" description="View all student profiles, billing history, future billing projections, and extra classes.">
      <Card hoverable={false}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input type="search" aria-label="Search students by name or class" autoComplete="off" style={{ ...field, width: '320px' }} placeholder="Search by name or class…" value={search} onChange={e => setSearch(e.target.value)} />
            <StatusBadge variant="info">{filtered.length} students</StatusBadge>
          </div>
          <Button onClick={() => { setIsAdding(true); setSelectedStudent(null); }}>Add Student</Button>
        </div>

        {isAdding && (
          <div style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '16px', background: 'var(--color-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px' }}>Add New Student</h3>
              <Button variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
            </div>
            <form onSubmit={handleSave} style={form}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label style={label}>Name<input required style={field} value={newStudent.name} onChange={e => setNewStudent({ ...newStudent, name: e.target.value })} /></label>
                <label style={label}>Email<input required type="email" style={field} value={newStudent.email} onChange={e => setNewStudent({ ...newStudent, email: e.target.value })} /></label>
                <label style={label}>Phone<input required style={field} value={newStudent.phone} onChange={e => setNewStudent({ ...newStudent, phone: e.target.value })} /></label>
                <label style={label}>Class<input required style={field} value={newStudent.class} onChange={e => setNewStudent({ ...newStudent, class: e.target.value })} /></label>
              </div>
              <Feedback message={action.message} error={action.error} />
              <Button type="submit" disabled={action.busy} style={{ width: 'fit-content', marginTop: '12px' }}>{action.busy ? 'Saving...' : 'Save Student'}</Button>
            </form>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(s => (
            <div key={s.id} role="button" tabIndex={0} aria-pressed={selectedStudent?.id === s.id} aria-label={`Open ${s.name}'s student record`} onClick={() => { setSelectedStudent(s); setEditMode(false); setIsAdding(false); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedStudent(s); setEditMode(false); setIsAdding(false); } }} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', border: `1px solid ${selectedStudent?.id === s.id ? 'var(--color-primary)' : 'var(--border)'}`, borderRadius: '12px', cursor: 'pointer', background: selectedStudent?.id === s.id ? 'var(--color-primary-soft, #e6f0fa)' : 'var(--bg-card)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '15px', flexShrink: 0 }}>{initials(s.name)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{s.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{s.class} · {s.email}</div>
              </div>
              <StatusBadge variant={s.status === 'Active' ? 'success' : s.status === 'Blocked' ? 'error' : 'warning'}>{s.status}</StatusBadge>
            </div>
          ))}
        </div>
      </Card>

      {selectedStudent && (
        <Card hoverable={false}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '22px' }}>{initials(selectedStudent.name)}</div>
              <div>
                <h2 style={{ fontSize: '20px' }}>{selectedStudent.name}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{selectedStudent.class} · Enrolled {selectedStudent.enrollDate}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="outline" onClick={() => setEditMode(!editMode)}>{editMode ? 'Cancel Edit' : 'Edit'}</Button>
              <Button variant="outline" style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }} onClick={() => handleDelete(selectedStudent.id)}>Delete</Button>
            </div>
          </div>

          {editMode ? (
            <form onSubmit={handleSave} style={form}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label style={label}>Name<input required style={field} value={selectedStudent.name} onChange={e => setSelectedStudent({ ...selectedStudent, name: e.target.value })} /></label>
                <label style={label}>Email<input required type="email" style={field} value={selectedStudent.email} onChange={e => setSelectedStudent({ ...selectedStudent, email: e.target.value })} /></label>
                <label style={label}>Phone<input required style={field} value={selectedStudent.phone} onChange={e => setSelectedStudent({ ...selectedStudent, phone: e.target.value })} /></label>
                <label style={label}>Class<input required style={field} value={selectedStudent.class} onChange={e => setSelectedStudent({ ...selectedStudent, class: e.target.value })} /></label>
              </div>
              <Feedback message={action.message} error={action.error} />
              <Button type="submit" disabled={action.busy} style={{ width: 'fit-content', marginTop: '12px' }}>{action.busy ? 'Saving...' : 'Save Changes'}</Button>
            </form>
          ) : (
            <>
              {/* Student Details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', padding: '16px', background: 'var(--color-surface)', borderRadius: '8px', marginBottom: '20px' }}>
                <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Email</div><div style={{ fontWeight: 600, fontSize: '14px' }}>{selectedStudent.email}</div></div>
                <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Phone</div><div style={{ fontWeight: 600, fontSize: '14px' }}>{selectedStudent.phone}</div></div>
                <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status</div><StatusBadge variant={selectedStudent.status === 'Active' ? 'success' : 'error'}>{selectedStudent.status}</StatusBadge></div>
                <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Student ID</div><div style={{ fontWeight: 600, fontSize: '14px' }}>{selectedStudent.id}</div></div>
              </div>

              {/* Future Billing Projection */}
              <div style={{ padding: '16px', background: 'linear-gradient(135deg, #e6f0fa 0%, #f0e6fa 100%)', borderRadius: '12px', marginBottom: '20px', border: '1px solid rgba(102,126,234,0.2)' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>📊 1-Year Future Billing Projection</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Monthly Fee</div><div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-primary)' }}>NPR {selectedStudent.courseFee.toLocaleString()}</div></div>
                  <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Remaining Months</div><div style={{ fontSize: '20px', fontWeight: 700 }}>{futureBilling(selectedStudent).remaining}</div></div>
                  <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Projected Total Due</div><div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-error)' }}>NPR {futureBilling(selectedStudent).projected.toLocaleString()}</div></div>
                </div>
              </div>

              {/* Billing History */}
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Billing History</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '20px' }}>
                <thead><tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}><th style={{ padding: '8px' }}>Cycle</th><th style={{ padding: '8px' }}>Amount</th><th style={{ padding: '8px' }}>Discount</th><th style={{ padding: '8px' }}>Net</th><th style={{ padding: '8px' }}>Due Date</th><th style={{ padding: '8px' }}>Status</th></tr></thead>
                <tbody>
                  {selectedStudent.billing.map((b: any) => (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>{b.cycle}</td>
                      <td style={{ padding: '10px 8px' }}>NPR {b.amount.toLocaleString()}</td>
                      <td style={{ padding: '10px 8px', color: b.discount > 0 ? 'var(--color-success)' : 'var(--text-muted)' }}>{b.discount > 0 ? `−NPR ${b.discount.toLocaleString()}` : '—'}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>NPR {b.net.toLocaleString()}</td>
                      <td style={{ padding: '10px 8px' }}>{toDualDateLabel(b.dueDate)}</td>
                      <td style={{ padding: '10px 8px' }}><StatusBadge variant={b.status === 'Paid' ? 'success' : b.status === 'Overdue' ? 'error' : 'warning'}>{b.status}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Extra Classes */}
              {selectedStudent.extraClasses.length > 0 && (
                <>
                  <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Optional Extra Classes</h3>
                  {selectedStudent.extraClasses.map((ec: any, idx: number) => (
                    <div key={idx} style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div><div style={{ fontWeight: 600 }}>{ec.name}</div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>NPR {ec.fee.toLocaleString()} / month</div></div>
                        <StatusBadge variant="info">Extra Class</StatusBadge>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                        {ec.months.map((m: any, mi: number) => (
                          <div key={mi} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: m.status === 'Paid' ? 'var(--color-success-soft, #eaf8f0)' : 'var(--color-warning-soft, #fff8e6)', color: m.status === 'Paid' ? 'var(--color-success)' : 'var(--color-warning)' }}>{m.cycle}: {m.status}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </Card>
      )}
    </Page>
  );
}

// ─── BRANCH TEACHERS VIEW ───────────────────────────────────────────────────────
function BranchTeachersView() {
  const [search, setSearch] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'timetable' | 'payroll'>('profile');
  const [editMode, setEditMode] = useState(false);
  const action = useAction();

  const [teachers, setTeachers] = useState([
    { id: 'T001', name: 'Sanjay Rai', email: 'sanjay@tms.edu', phone: '9841200001', qualification: 'M.Sc. Physics', status: 'Active',
      classes: [
        { name: 'Grade 10 Science', subject: 'Physics', syllabusTotal: 24, syllabusCompleted: 18 },
        { name: 'Grade 12 Physics', subject: 'Advanced Physics', syllabusTotal: 30, syllabusCompleted: 12 },
      ],
      timetable: [
        { id: 'TT1', day: 'Monday', time: '08:00 - 09:30', class: 'Grade 10', subject: 'Physics', room: 'Room 302' },
        { id: 'TT2', day: 'Monday', time: '10:00 - 11:30', class: 'Grade 12', subject: 'Adv. Physics', room: 'Lab 1' },
        { id: 'TT3', day: 'Wednesday', time: '08:00 - 09:30', class: 'Grade 10', subject: 'Physics', room: 'Room 302' },
        { id: 'TT4', day: 'Thursday', time: '10:00 - 11:30', class: 'Grade 12', subject: 'Adv. Physics', room: 'Lab 1' },
        { id: 'TT5', day: 'Friday', time: '08:00 - 09:30', class: 'Grade 10', subject: 'Physics', room: 'Room 302' },
      ],
      salary: 45000, extraClassPay: 10000,
      payroll: [
        { month: 'May 2026', base: 45000, extra: 10000, deductions: 2000, net: 53000, status: 'Paid' },
        { month: 'Jun 2026', base: 45000, extra: 10000, deductions: 2000, net: 53000, status: 'Paid' },
        { month: 'Jul 2026', base: 45000, extra: 10000, deductions: 2000, net: 53000, status: 'Paid' },
        { month: 'Aug 2026', base: 45000, extra: 10000, deductions: 2000, net: 53000, status: 'Pending' },
      ],
      attendance30: { present: 22, absent: 4, leave: 2, total: 28 },
      extraClasses: [{ name: 'Advanced Calculus (1:1)', fee: 10000 }],
    },
    { id: 'T002', name: 'Rina Karki', email: 'rina@tms.edu', phone: '9841200002', qualification: 'M.A. English', status: 'Active',
      classes: [
        { name: 'IELTS Prep', subject: 'English', syllabusTotal: 20, syllabusCompleted: 15 },
        { name: 'Grade 10 Math', subject: 'Mathematics', syllabusTotal: 28, syllabusCompleted: 20 },
      ],
      timetable: [
        { id: 'TT6', day: 'Monday', time: '12:00 - 01:30', class: 'IELTS Prep', subject: 'English', room: 'Room 105' },
        { id: 'TT7', day: 'Tuesday', time: '08:00 - 09:30', class: 'Grade 10', subject: 'Mathematics', room: 'Room 201' },
        { id: 'TT8', day: 'Thursday', time: '08:00 - 09:30', class: 'IELTS Prep', subject: 'English', room: 'Room 105' },
      ],
      salary: 40000, extraClassPay: 0,
      payroll: [
        { month: 'Jun 2026', base: 40000, extra: 0, deductions: 1500, net: 38500, status: 'Paid' },
        { month: 'Jul 2026', base: 40000, extra: 0, deductions: 1500, net: 38500, status: 'Paid' },
        { month: 'Aug 2026', base: 40000, extra: 0, deductions: 1500, net: 38500, status: 'Pending' },
      ],
      attendance30: { present: 24, absent: 2, leave: 2, total: 28 },
      extraClasses: [],
    },
  ]);

  const filtered = teachers.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const handleDelete = (id: string) => { if (window.confirm('Remove this teacher?')) { setTeachers(prev => prev.filter(t => t.id !== id)); setSelectedTeacher(null); } };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      await new Promise(r => setTimeout(r, 500));
      setTeachers(prev => prev.map(t => t.id === selectedTeacher.id ? selectedTeacher : t));
      setEditMode(false);
    }, 'Teacher details updated.');
  };

  const deleteTimetableEntry = (ttId: string) => {
    const updated = { ...selectedTeacher, timetable: selectedTeacher.timetable.filter((t: any) => t.id !== ttId) };
    setSelectedTeacher(updated);
    setTeachers(prev => prev.map(t => t.id === updated.id ? updated : t));
  };

  return (
    <Page title="Branch Teachers" description="View all teacher profiles, payroll, classes, syllabus progress, timetable, and attendance.">
      <Card hoverable={false}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <input type="search" aria-label="Search teachers by name" autoComplete="off" style={{ ...field, maxWidth: '320px' }} placeholder="Search by name…" value={search} onChange={e => setSearch(e.target.value)} />
          <StatusBadge variant="info">{filtered.length} teachers</StatusBadge>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(t => (
            <div key={t.id} role="button" tabIndex={0} aria-pressed={selectedTeacher?.id === t.id} aria-label={`Open ${t.name}'s teacher record`} onClick={() => { setSelectedTeacher(t); setActiveTab('profile'); setEditMode(false); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedTeacher(t); setActiveTab('profile'); setEditMode(false); } }} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', border: `1px solid ${selectedTeacher?.id === t.id ? 'var(--color-primary)' : 'var(--border)'}`, borderRadius: '12px', cursor: 'pointer', background: selectedTeacher?.id === t.id ? 'var(--color-primary-soft, #e6f0fa)' : 'var(--bg-card)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '15px', flexShrink: 0 }}>{initials(t.name)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{t.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{t.qualification} · {t.classes.map((c: any) => c.subject).join(', ')}</div>
              </div>
              <StatusBadge variant="success">{t.status}</StatusBadge>
            </div>
          ))}
        </div>
      </Card>

      {selectedTeacher && (
        <Card hoverable={false}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '22px' }}>{initials(selectedTeacher.name)}</div>
              <div>
                <h2 style={{ fontSize: '20px' }}>{selectedTeacher.name}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{selectedTeacher.qualification} · ID: {selectedTeacher.id}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="outline" onClick={() => { setEditMode(!editMode); setActiveTab('profile'); }}>{editMode ? 'Cancel' : 'Edit'}</Button>
              <Button variant="outline" style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }} onClick={() => handleDelete(selectedTeacher.id)}>Delete</Button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <Button variant={activeTab === 'profile' ? 'primary' : 'outline'} onClick={() => setActiveTab('profile')}>Profile & Classes</Button>
            <Button variant={activeTab === 'timetable' ? 'primary' : 'outline'} onClick={() => setActiveTab('timetable')}>Timetable</Button>
            <Button variant={activeTab === 'payroll' ? 'primary' : 'outline'} onClick={() => setActiveTab('payroll')}>Payroll</Button>
          </div>

          {editMode ? (
            <form onSubmit={handleSave} style={form}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label style={label}>Name<input style={field} value={selectedTeacher.name} onChange={e => setSelectedTeacher({ ...selectedTeacher, name: e.target.value })} /></label>
                <label style={label}>Email<input style={field} value={selectedTeacher.email} onChange={e => setSelectedTeacher({ ...selectedTeacher, email: e.target.value })} /></label>
                <label style={label}>Phone<input style={field} value={selectedTeacher.phone} onChange={e => setSelectedTeacher({ ...selectedTeacher, phone: e.target.value })} /></label>
                <label style={label}>Qualification<input style={field} value={selectedTeacher.qualification} onChange={e => setSelectedTeacher({ ...selectedTeacher, qualification: e.target.value })} /></label>
              </div>
              <Feedback message={action.message} error={action.error} />
              <Button type="submit" disabled={action.busy}>{action.busy ? 'Saving...' : 'Save Changes'}</Button>
            </form>
          ) : activeTab === 'profile' ? (
            <>
              {/* Contact Details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', padding: '16px', background: 'var(--color-surface)', borderRadius: '8px', marginBottom: '20px' }}>
                <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Email</div><div style={{ fontWeight: 600, fontSize: '14px' }}>{selectedTeacher.email}</div></div>
                <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Phone</div><div style={{ fontWeight: 600, fontSize: '14px' }}>{selectedTeacher.phone}</div></div>
                <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status</div><StatusBadge variant="success">{selectedTeacher.status}</StatusBadge></div>
                <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Monthly Salary</div><div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-primary)' }}>NPR {selectedTeacher.salary.toLocaleString()}</div></div>
              </div>

              {/* 30-Day Attendance */}
              <div style={{ padding: '16px', background: 'linear-gradient(135deg, #eaf8f0 0%, #e6f0fa 100%)', borderRadius: '12px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>📅 Last 30 Days Attendance</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                  <div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-success)' }}>{selectedTeacher.attendance30.present}</div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Present</div></div>
                  <div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-error)' }}>{selectedTeacher.attendance30.absent}</div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Absent</div></div>
                  <div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-warning)' }}>{selectedTeacher.attendance30.leave}</div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>On Leave</div></div>
                  <div><div style={{ fontSize: '24px', fontWeight: 700 }}>{Math.round(selectedTeacher.attendance30.present / selectedTeacher.attendance30.total * 100)}%</div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Rate</div></div>
                </div>
              </div>

              {/* Assigned Classes & Syllabus */}
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Assigned Classes & Syllabus Progress</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                {selectedTeacher.classes.map((c: any, idx: number) => {
                  const pct = Math.round(c.syllabusCompleted / c.syllabusTotal * 100);
                  return (
                    <div key={idx} style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div><div style={{ fontWeight: 600 }}>{c.name}</div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Subject: {c.subject}</div></div>
                        <StatusBadge variant={pct >= 75 ? 'success' : pct >= 50 ? 'warning' : 'error'}>{pct}% complete</StatusBadge>
                      </div>
                      <div style={{ height: '8px', borderRadius: '4px', background: 'var(--color-surface)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: '4px', background: pct >= 75 ? 'var(--color-success)' : pct >= 50 ? 'var(--color-warning)' : 'var(--color-error)', transition: 'width 0.3s ease' }} />
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>{c.syllabusCompleted} of {c.syllabusTotal} chapters completed</div>
                    </div>
                  );
                })}
              </div>

              {/* Extra Classes */}
              {selectedTeacher.extraClasses.length > 0 && (
                <>
                  <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Extra Classes</h3>
                  {selectedTeacher.extraClasses.map((ec: any, idx: number) => (
                    <div key={idx} style={{ padding: '12px 16px', border: '1px solid var(--border)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600 }}>{ec.name}</div>
                      <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>NPR {ec.fee.toLocaleString()} / month</div>
                    </div>
                  ))}
                </>
              )}
            </>
          ) : activeTab === 'timetable' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px' }}>Weekly Timetable</h3>
                <Button onClick={() => {
                  const newEntry = { id: `TT${Date.now()}`, day: 'Monday', time: '08:00 - 09:30', class: '', subject: '', room: '' };
                  const updated = { ...selectedTeacher, timetable: [...selectedTeacher.timetable, newEntry] };
                  setSelectedTeacher(updated);
                  setTeachers(prev => prev.map(t => t.id === updated.id ? updated : t));
                }}>Add Session</Button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead><tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}><th style={{ padding: '8px' }}>Day</th><th style={{ padding: '8px' }}>Time</th><th style={{ padding: '8px' }}>Class</th><th style={{ padding: '8px' }}>Subject</th><th style={{ padding: '8px' }}>Room</th><th style={{ padding: '8px' }}>Actions</th></tr></thead>
                <tbody>
                  {selectedTeacher.timetable.map((tt: any) => (
                    <tr key={tt.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>{tt.day}</td>
                      <td style={{ padding: '10px 8px' }}>{tt.time}</td>
                      <td style={{ padding: '10px 8px' }}>{tt.class}</td>
                      <td style={{ padding: '10px 8px' }}>{tt.subject}</td>
                      <td style={{ padding: '10px 8px' }}>{tt.room}</td>
                      <td style={{ padding: '10px 8px' }}><Button variant="outline" style={{ padding: '2px 8px', minHeight: 'unset', height: '24px', fontSize: '11px', color: 'var(--color-error)', borderColor: 'var(--color-error)' }} onClick={() => deleteTimetableEntry(tt.id)}>Delete</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              {/* Payroll Projection */}
              <div style={{ padding: '16px', background: 'linear-gradient(135deg, #e6f0fa 0%, #f0e6fa 100%)', borderRadius: '12px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>💰 1-Month Ahead Payroll Projection</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                  <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Base Salary</div><div style={{ fontSize: '20px', fontWeight: 700 }}>NPR {selectedTeacher.salary.toLocaleString()}</div></div>
                  <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Extra Classes</div><div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-primary)' }}>NPR {selectedTeacher.extraClassPay.toLocaleString()}</div></div>
                  <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Est. Deductions</div><div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-error)' }}>NPR 2,000</div></div>
                  <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Projected Net</div><div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-success)' }}>NPR {(selectedTeacher.salary + selectedTeacher.extraClassPay - 2000).toLocaleString()}</div></div>
                </div>
              </div>

              {/* Payroll History */}
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Payroll History</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead><tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}><th style={{ padding: '8px' }}>Month</th><th style={{ padding: '8px' }}>Base</th><th style={{ padding: '8px' }}>Extra</th><th style={{ padding: '8px' }}>Deductions</th><th style={{ padding: '8px' }}>Net</th><th style={{ padding: '8px' }}>Status</th></tr></thead>
                <tbody>
                  {selectedTeacher.payroll.map((p: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>{p.month}</td>
                      <td style={{ padding: '10px 8px' }}>NPR {p.base.toLocaleString()}</td>
                      <td style={{ padding: '10px 8px' }}>{p.extra > 0 ? `NPR ${p.extra.toLocaleString()}` : '—'}</td>
                      <td style={{ padding: '10px 8px', color: 'var(--color-error)' }}>−NPR {p.deductions.toLocaleString()}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 700 }}>NPR {p.net.toLocaleString()}</td>
                      <td style={{ padding: '10px 8px' }}><StatusBadge variant={p.status === 'Paid' ? 'success' : 'warning'}>{p.status}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      )}
    </Page>
  );
}

// Kept temporarily while live branch-scoped workflow views replace their mock-backed predecessors.
void [LeaveRequestsView, AttendanceView, HomeworkView, ResultsView, BranchTeachersView, PersonalizedClassesView];

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]; const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') index += 1; row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row); return rows;
}
export function BranchResultsView() {
  const [data, setData] = useState<any>({ branches: [], classes: [], resultDefinitions: [] }); const [branchId, setBranchId] = useState('');
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(''); const [selectedId, setSelectedId] = useState('');
  const [csvRows, setCsvRows] = useState<Array<{ studentId: string; score: number }>>([]); const [csvError, setCsvError] = useState('');
  const [maximum, setMaximum] = useState('100'); const [passMarks, setPassMarks] = useState('40'); const [deleteArmed, setDeleteArmed] = useState(false); const [report, setReport] = useState<any>(null); const action = useAction();
  const selectedEvent = data.resultDefinitions.find((item: any) => item.id === selectedId);
  const savedCount = Number(selectedEvent?.scoreCount ?? 0);
  const draftCount = Number(selectedEvent?.draftCount ?? 0);
  const publishedCount = Number(selectedEvent?.publishedCount ?? 0);
  const load = async (nextBranch = branchId) => { setLoading(true); setLoadError(''); try { const result = await api.branchAdmin.getTeacherWorkflows(nextBranch || undefined); setData(result); setBranchId(nextBranch || result.selectedBranch?.id || ''); setSelectedId(''); setReport(null); } catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'Result events could not be loaded.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const createEvent = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const submittedForm = event.currentTarget; const values = new FormData(submittedForm); const classId = String(values.get('classId')); const klass = data.classes.find((item: any) => item.id === classId); void action.run(async () => { await api.branchAdmin.createResultDefinition({ branchId, classId, title: String(values.get('title')).trim(), subject: klass?.course.name || '', testDate: String(values.get('testDate')) }); submittedForm.reset(); await load(branchId); }, 'Result event created. Download its CSV template to enter marks.'); };
  const downloadTemplate = async (id: string) => { await action.run(async () => { const template = await api.branchAdmin.getResultTemplate(id); const csv = [template.columns.map(csvCell).join(','), ...template.rows.map((row: any) => template.columns.map((column: string) => csvCell(row[column])).join(','))].join('\r\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = template.filename; link.click(); URL.revokeObjectURL(link.href); }, 'CSV template downloaded. Enter scores without changing student IDs or column names.'); };
  const chooseCsv = async (file?: File) => { setCsvError(''); setCsvRows([]); if (!file) return; const rows = parseCsv(await file.text()); const expected = ['student_id', 'admission_number', 'student_name', 'score', 'remarks']; if (!rows.length || expected.some((column, index) => rows[0]?.[index]?.trim().toLowerCase() !== column)) { setCsvError(`Use the downloaded template. Required columns: ${expected.join(', ')}.`); return; } const parsed = rows.slice(1).filter((row) => row.some((cell) => cell.trim())).map((row, index) => ({ row: index + 2, studentId: row[0]?.trim(), score: Number(row[3]) })); const invalid = parsed.filter((row) => !row.studentId || !Number.isFinite(row.score)); if (invalid.length) { setCsvError(`Enter a numeric score on CSV row${invalid.length === 1 ? '' : 's'} ${invalid.map((row) => row.row).join(', ')}.`); return; } setCsvRows(parsed.map(({ studentId, score }) => ({ studentId, score }))); };
  const upload = () => { if (!selectedId || !csvRows.length) return; void action.run(async () => { await api.branchAdmin.importResults(selectedId, { maximum: Number(maximum), passMarks: Number(passMarks), rows: csvRows }); setCsvRows([]); setReport(null); const input = document.getElementById('result-csv') as HTMLInputElement | null; if (input) input.value = ''; await load(branchId); }, `${csvRows.length} student results saved and ready for review.`); };
  const toggleEvent = () => { if (!selectedEvent) return; void action.run(async () => { await api.branchAdmin.updateResultDefinition(selectedEvent.id, { isOpen: !selectedEvent.isOpen }); await load(branchId); }, selectedEvent.isOpen ? 'Result entry closed.' : 'Result entry reopened.'); };
  const deleteEvent = () => { if (!selectedEvent) return; void action.run(async () => { await api.branchAdmin.deleteResultDefinition(selectedEvent.id); setDeleteArmed(false); setSelectedId(''); await load(branchId); }, 'Unpublished result event deleted.'); };
  const reviewResults = async (id: string) => { await action.run(async () => { const nextReport = await api.branchAdmin.getResultReport(id); setReport(nextReport); }, 'Result rows loaded for review.'); };
  if (loading) return <Page title="Branch results" description="Create, import, review, and publish consistent academic records."><Card hoverable={false}><div aria-busy="true">Loading classes and result events…</div></Card></Page>;
  if (loadError) return <Page title="Branch results" description="Create, import, review, and publish consistent academic records."><Card hoverable={false}><Feedback message="" error={loadError} /><Button onClick={() => void load()}>Try again</Button></Card></Page>;
  return <Page title="Results" description="Create result events for assigned classes and review the marks, teacher, attachments, draft state, and publication state.">
    <Card hoverable={false}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}><label style={label} htmlFor="result-branch">Branch<select id="result-branch" style={field} value={branchId} onChange={(event) => void load(event.target.value)}>{data.branches.map((branch: any) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><div><strong>Workflow</strong><p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>1. Admin creates the result → 2. Assigned teacher enters every student → 3. Teacher saves a draft or publishes later</p></div></div></Card>
    <Card hoverable={false}><h2 style={{ fontSize: 18 }}>1. Create a result event</h2><p style={{ color: 'var(--text-muted)', margin: '6px 0 16px' }}>Subject and grade come from the selected assigned class, preventing mismatched records.</p>{data.classes.length ? <form style={form} onSubmit={createEvent} aria-busy={action.busy}><label style={label} htmlFor="result-class">Assigned class<select id="result-class" name="classId" required style={field}>{data.classes.map((item: any) => <option key={item.id} value={item.id}>{item.name} · {item.course.name}</option>)}</select></label><label style={label} htmlFor="result-title">Result title<input id="result-title" name="title" required maxLength={160} style={field} placeholder="First terminal examination" /></label><label style={label} htmlFor="result-date">Test date<input id="result-date" name="testDate" type="date" required style={field} /></label><Button type="submit" disabled={action.busy}>{action.busy ? 'Creating…' : 'Create result event'}</Button></form> : <div role="status">Assign a teacher to a class before creating a result event.</div>}</Card>
    <Card hoverable={false}>
      <h2 style={{ fontSize: 18 }}>2. Result event details</h2>
      <p style={{ color: 'var(--text-muted)', margin: '6px 0 16px' }}>Choose a result to see teacher-entered marks, individual sheets, and whether each row is draft or published.</p>
      {data.resultDefinitions.length ? <>
        <div className="admin-record-list">{data.resultDefinitions.map((item: any) => <button type="button" key={item.id} onClick={() => { setSelectedId(item.id); setCsvRows([]); setCsvError(''); setDeleteArmed(false); setReport(null); if (Number(item.scoreCount)) void reviewResults(item.id); }}><span><strong>{item.title}</strong><small>{item.subject} · {item.className || item.class?.name || 'Assigned class'} · {new Date(item.testDate).toLocaleDateString()}</small></span><StatusBadge variant={Number(item.publishedCount) ? 'success' : Number(item.scoreCount) ? 'info' : 'warning'}>{Number(item.publishedCount) ? `${item.publishedCount} published` : Number(item.scoreCount) ? `${item.scoreCount} saved` : 'Awaiting marks'}</StatusBadge><span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>)}</div>
        <AdminDetailDialog open={Boolean(selectedEvent)} title={selectedEvent?.title || 'Result details'} eyebrow="Result event" onClose={() => { setSelectedId(''); setReport(null); setDeleteArmed(false); }}>
        {selectedEvent ? <>
          <dl className="admin-detail-grid"><div><dt>Class</dt><dd>{selectedEvent.className || selectedEvent.class?.name || 'Assigned class'}</dd></div><div><dt>Subject</dt><dd>{selectedEvent.subject}</dd></div><div><dt>Test date</dt><dd>{new Date(selectedEvent.testDate).toLocaleDateString()}</dd></div><div><dt>Saved marks</dt><dd>{savedCount} student{savedCount === 1 ? '' : 's'}</dd></div><div><dt>Published</dt><dd>{publishedCount} student{publishedCount === 1 ? '' : 's'}</dd></div><div><dt>Drafts</dt><dd>{draftCount} student{draftCount === 1 ? '' : 's'}</dd></div></dl>
          <div className="result-workflow-steps" aria-label="Result publication progress">
            <div className="is-complete"><span>1</span><strong>Event ready</strong><small>{selectedEvent.subject}</small></div>
            <div className={savedCount ? 'is-complete' : ''}><span>2</span><strong>Marks saved</strong><small>{savedCount} student{savedCount === 1 ? '' : 's'}</small></div>
            <div className={report ? 'is-complete' : ''}><span>3</span><strong>Review</strong><small>{report ? 'Checked on screen' : 'Check before publishing'}</small></div>
            <div className={publishedCount ? 'is-complete' : ''}><span>4</span><strong>Published</strong><small>{publishedCount} visible · {draftCount} pending</small></div>
          </div>

          <div className="result-event-summary"><div><StatusBadge variant={selectedEvent.isOpen ? 'info' : 'warning'}>{selectedEvent.isOpen ? 'Mark changes allowed' : 'Mark changes paused'}</StatusBadge><p>{selectedEvent.isOpen ? 'You can upload new or corrected unpublished marks.' : 'Uploads are locked. Published student results remain visible.'}</p></div><Button variant="outline" onClick={toggleEvent}>{selectedEvent.isOpen ? 'Pause mark changes' : 'Allow mark changes'}</Button></div>

          {false && <section className="result-workflow-section" aria-labelledby="result-upload-heading">
            <div><h3 id="result-upload-heading">Add marks with the class CSV</h3><p>Download the protected roster, enter scores, then upload the completed file.</p></div>
            <Button variant="outline" onClick={() => void downloadTemplate(selectedId)}><span className="material-symbols-outlined" aria-hidden="true">download</span>Download class roster</Button>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}><label style={label} htmlFor="result-maximum">Full marks<input id="result-maximum" inputMode="decimal" style={field} value={maximum} onChange={(event) => setMaximum(event.target.value)} /></label><label style={label} htmlFor="result-pass">Pass marks<input id="result-pass" inputMode="decimal" style={field} value={passMarks} onChange={(event) => setPassMarks(event.target.value)} /></label></div>
            <label style={label} htmlFor="result-csv">Completed roster CSV<input id="result-csv" type="file" accept=".csv,text/csv" style={field} disabled={!selectedEvent.isOpen} onChange={(event) => void chooseCsv(event.target.files?.[0])} aria-invalid={Boolean(csvError) || undefined} aria-describedby={csvError ? 'result-csv-error' : 'result-csv-help'} /><small id="result-csv-help" style={{ color: 'var(--text-muted)' }}>Keep the original columns and student IDs. Maximum 500 rows.</small>{csvError ? <span id="result-csv-error" style={{ color: 'var(--color-error)' }}>{csvError}</span> : null}</label>
            {csvRows.length ? <div role="status" style={{ padding: 12, borderRadius: 10, background: 'var(--color-success-soft)' }}>{csvRows.length} valid student row{csvRows.length === 1 ? '' : 's'} ready to save.</div> : null}
            <Button onClick={upload} disabled={action.busy || !csvRows.length || !selectedEvent.isOpen}>{action.busy ? 'Saving marks…' : csvRows.length ? `Save ${csvRows.length} student result${csvRows.length === 1 ? '' : 's'}` : selectedEvent.isOpen ? 'Choose a completed CSV first' : 'Allow mark changes to upload'}</Button>
          </section>}

          <section className="result-workflow-section" aria-labelledby="result-review-heading">
            <div><h3 id="result-review-heading">Review before publishing</h3><p>Confirm every student, score, pass mark and publication state.</p></div>
            <div className="result-event-actions"><Button variant="outline" disabled={!savedCount || action.busy} onClick={() => void reviewResults(selectedId)}><span className="material-symbols-outlined" aria-hidden="true">visibility</span>{savedCount ? `View ${savedCount} student result${savedCount === 1 ? '' : 's'}` : 'Waiting for teacher entry'}</Button></div>
            {report ? <div className="result-review-table"><div className="result-review-heading"><div><strong>{report.event.title}</strong><p>{report.event.gradeName} · {report.event.className} · {report.event.subject} · {new Date(report.event.testDate).toLocaleDateString()}</p></div><StatusBadge variant="info">{report.results.length} students</StatusBadge></div><div className="accountant-table-scroll"><table className="accountant-table"><thead><tr><th>#</th><th>Admission no.</th><th>Student</th><th>Teacher</th><th>Marks</th><th>Outcome</th><th>Result sheet</th><th>Visibility</th></tr></thead><tbody>{report.results.map((item: any, index: number) => <tr key={item.id}><td>{index + 1}</td><td>{item.admissionNumber || '—'}</td><td>{item.studentName}</td><td>{item.teacherName}</td><td className="is-amount">{item.score} / {item.maximum}</td><td><StatusBadge variant={item.score >= item.passMarks ? 'success' : 'warning'}>{item.score >= item.passMarks ? 'Pass' : 'Needs improvement'}</StatusBadge></td><td>{item.resultSheetUrl ? <a href={item.resultSheetUrl} target="_blank" rel="noreferrer">Open sheet</a> : <StatusBadge variant="warning">Missing</StatusBadge>}</td><td><StatusBadge variant={item.published ? 'success' : 'info'}>{item.published ? 'Published' : 'Draft'}</StatusBadge></td></tr>)}</tbody></table></div></div> : null}
          </section>

          <Feedback message={action.message} error={action.error} />
          {!publishedCount ? <div className="result-danger-zone"><div><strong>Delete this event</strong><p>Available only before any student result is published.</p></div>{deleteArmed ? <div className="result-event-actions"><Button variant="outline" onClick={() => setDeleteArmed(false)}>Cancel</Button><Button variant="danger" onClick={deleteEvent}>Confirm delete</Button></div> : <Button variant="danger" onClick={() => setDeleteArmed(true)}>Delete event</Button>}</div> : null}
        </> : null}
        </AdminDetailDialog>
      </> : <div role="status" style={{ padding: 24, textAlign: 'center' }}><h3>No result events yet</h3><p style={{ color: 'var(--text-muted)' }}>Create the first event above to generate its class roster.</p></div>}
    </Card>
  </Page>;
}

function LiveTeacherWorkflow({ mode }: { mode: 'attendance' | 'homework' | 'results' | 'syllabus' | 'leaves' }) {
  const [data, setData] = useState<any>(null); const [branchId, setBranchId] = useState(''); const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const action = useAction();
  const [selectedHomework, setSelectedHomework] = useState<any>(null);
  const load = async (nextBranch = branchId, nextDate = date) => { setLoading(true); setError(''); try { const result = await api.branchAdmin.getTeacherWorkflows(nextBranch || undefined, nextDate); setData(result); if (!nextBranch) setBranchId(result.selectedBranch?.id || ''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Teacher workflows could not be loaded.'); } finally { setLoading(false); } };
  // Initial branch resolution is intentionally performed once; later changes call load from their controls.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load('', date); }, []);
  useEffect(() => {
    if (mode !== 'leaves' || !branchId) return;
    const interval = window.setInterval(() => { void load(branchId, date); }, 15_000);
    return () => window.clearInterval(interval);
    // The queue refreshes from the currently selected branch and date.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, branchId, date]);
  if (loading) return <Page title="Teacher workflows" description="Loading branch records…"><Card hoverable={false}><div aria-busy="true">Loading synchronized records…</div></Card></Page>;
  if (error || !data) return <Page title="Teacher workflows" description="Branch-scoped teacher operations."><Card hoverable={false}><Feedback message="" error={error} /><Button onClick={() => void load()}>Try again</Button></Card></Page>;
  const controls = <Card hoverable={false}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}><label style={label}>Branch<select style={field} value={branchId} onChange={(event) => { setBranchId(event.target.value); void load(event.target.value, date); }}>{data.branches.map((branch: any) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>{mode === 'attendance' ? <label style={label}>Academic date<input style={field} type="date" value={date} onChange={(event) => { setDate(event.target.value); void load(branchId, event.target.value); }} /></label> : null}</div></Card>;
  if (mode === 'attendance') return <Page title="Branch attendance" description="Teacher-marked student attendance by real academic date and class.">{controls}<Card hoverable={false}>{data.attendance.length ? <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th>Student</th><th>Class</th><th>Subject</th><th>Teacher</th><th>Status</th></tr></thead><tbody>{data.attendance.map((row: any) => <tr key={row.id}><td>{row.studentName}</td><td>{row.className}</td><td>{row.subject}</td><td>{row.teacherName}</td><td><StatusBadge variant={row.status === 'PRESENT' ? 'success' : row.status === 'EXCUSED' ? 'warning' : 'error'}>{row.status}</StatusBadge></td></tr>)}</tbody></table> : <p>No attendance was submitted for this date.</p>}</Card></Page>;
  if (mode === 'homework') return <Page title="Branch homework" description="All teacher-published homework for this branch.">{controls}<Card hoverable={false}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}><h2 style={{ fontSize: 18 }}>Published homework</h2><StatusBadge variant="info">{data.homework.length} assignments</StatusBadge></div>{data.homework.length ? <div className="admin-record-list">{data.homework.map((item: any) => <button type="button" key={item.id} onClick={() => setSelectedHomework(item)}><span><strong>{item.title}</strong><small>{item.class.name} · {item.subject} · Due {new Date(item.deadline).toLocaleDateString()}</small></span><StatusBadge variant={new Date(item.deadline) < new Date() ? 'warning' : 'info'}>{new Date(item.deadline) < new Date() ? 'Closed' : 'Active'}</StatusBadge><span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>)}</div> : <div role="status" className="admin-empty-state"><span className="material-symbols-outlined" aria-hidden="true">assignment</span><h3>No homework published</h3><p>Teacher-published assignments will appear here.</p></div>}</Card><AdminDetailDialog open={Boolean(selectedHomework)} title={selectedHomework?.title || 'Homework details'} eyebrow="Homework details" onClose={() => setSelectedHomework(null)}>{selectedHomework ? <><dl className="admin-detail-grid"><div><dt>Class</dt><dd>{selectedHomework.class.name}</dd></div><div><dt>Subject</dt><dd>{selectedHomework.subject}</dd></div><div><dt>Teacher</dt><dd>{selectedHomework.class.assignedTeacher ? `${selectedHomework.class.assignedTeacher.firstName} ${selectedHomework.class.assignedTeacher.lastName}` : 'Not assigned'}</dd></div><div><dt>Published</dt><dd>{new Date(selectedHomework.createdAt).toLocaleString()}</dd></div><div><dt>Due date</dt><dd>{new Date(selectedHomework.deadline).toLocaleString()}</dd></div><div><dt>Status</dt><dd>{new Date(selectedHomework.deadline) < new Date() ? 'Closed' : 'Active'}</dd></div></dl><section className="admin-detail-section"><h3>Instructions</h3><p>{selectedHomework.description?.trim() || 'No additional instructions were provided.'}</p></section><div className="admin-detail-actions">{selectedHomework.contentUrl ? <a href={selectedHomework.contentUrl} target="_blank" rel="noreferrer">Open Attached File</a> : <span>No Attached File</span>}<Button variant="outline" onClick={() => setSelectedHomework(null)}>Close</Button></div></> : null}</AdminDetailDialog></Page>;
  if (mode === 'syllabus') return <Page title="Syllabus progress" description="Live topic progress shared by branch teachers.">{controls}{data.syllabi.length ? data.syllabi.map((syllabus: any) => <Card key={syllabus.id} hoverable={false}><h2>{syllabus.subject} · {syllabus.class.name}</h2><p>{syllabus.class.assignedTeacher ? `${syllabus.class.assignedTeacher.firstName} ${syllabus.class.assignedTeacher.lastName}` : 'Teacher'}</p>{syllabus.chapters.map((chapter: any) => <section key={chapter.id} style={{ padding: 12, borderTop: '1px solid var(--border)' }}><strong>{chapter.position}. {chapter.title}</strong><StatusBadge variant={chapter.status === 'COMPLETED' ? 'success' : chapter.status === 'IN_PROGRESS' ? 'warning' : 'error'}>{chapter.status}</StatusBadge>{chapter.topics.map((topic: any) => <p key={topic.id}>{topic.position}. {topic.title} — {topic.status}{topic.logs[0]?.notes ? ` · ${topic.logs[0].notes}` : ''}</p>)}</section>)}</Card>) : <Card hoverable={false}>No syllabus has been shared.</Card>}</Page>;
  if (mode === 'leaves') { const decide = async (id: string, decision: 'APPROVE' | 'REJECT') => { await action.run(() => api.branchAdmin.decideLeave(id, decision, decision === 'REJECT' ? 'Rejected by Branch Admin.' : 'Reviewed by Branch Admin.'), `Leave ${decision === 'APPROVE' ? 'approved or forwarded' : 'rejected'}.`); await load(); }; return <Page title="Teacher leave requests" description="Review live teacher requests; long sick leave is forwarded after Level 1 approval.">{controls}<Feedback message={action.message} error={action.error} /><Card hoverable={false}>{data.leaves.filter((item: any) => item.status === 'PENDING').length ? data.leaves.filter((item: any) => item.status === 'PENDING').map((item: any) => <article key={item.id} style={{ padding: 12, borderBottom: '1px solid var(--border)' }}><strong>{item.user.firstName} {item.user.lastName} · {item.leaveType}</strong><p>{new Date(item.startDate).toLocaleDateString()} – {new Date(item.endDate).toLocaleDateString()} · {item.reason}</p><div style={{ display: 'flex', gap: 8 }}><Button disabled={action.busy} onClick={() => void decide(item.id, 'APPROVE')}>Approve</Button><Button variant="outline" disabled={action.busy} onClick={() => void decide(item.id, 'REJECT')}>Reject</Button></div></article>) : <p>No pending teacher leave requests.</p>}</Card></Page>; }
  const submitDefinition = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const values = new FormData(event.currentTarget); void action.run(async () => { await api.branchAdmin.createResultDefinition({ branchId, classId: String(values.get('classId')), title: String(values.get('title')), subject: String(values.get('subject')), testDate: String(values.get('testDate')) }); await load(); event.currentTarget.reset(); }, 'Result created and sent to the assigned teacher.'); };
  return <Page title="Branch results" description="Create result entry windows before teachers enter and publish marks.">{controls}<Card hoverable={false}><form style={form} onSubmit={submitDefinition} aria-busy={action.busy}><label style={label}>Assigned class<select name="classId" required style={field}>{data.classes.map((item: any) => <option key={item.id} value={item.id}>{item.name} · {item.course.name}</option>)}</select></label><label style={label}>Result title<input name="title" required style={field} placeholder="First terminal examination" /></label><label style={label}>Subject<input name="subject" required style={field} /></label><label style={label}>Test date<input name="testDate" type="date" required style={field} /></label><Feedback message={action.message} error={action.error} /><Button type="submit" disabled={action.busy}>{action.busy ? 'Creating…' : 'Create result'}</Button></form></Card><Card hoverable={false}><h2>Available results</h2>{data.resultDefinitions.map((item: any) => <p key={item.id}>{item.title} · {item.subject} · {new Date(item.testDate).toLocaleDateString()}</p>)}</Card></Page>;
}

type WeeklySlot = ScheduleSlot;
void LegacyTimetableView;
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES: Record<string, string> = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };

function LegacyManagedTimetableView() {
  const [classes, setClasses] = useState<any[]>([]); const [courses, setCourses] = useState<any[]>([]); const [teachers, setTeachers] = useState<any[]>([]); const [selectedId, setSelectedId] = useState(''); const [teacherId, setTeacherId] = useState(''); const [slots, setSlots] = useState<WeeklySlot[]>([]); const [editingIndex, setEditingIndex] = useState<number | null>(null); const [slotForm, setSlotForm] = useState<WeeklySlot>({ day: 'Sun', startTime: '08:00', endTime: '09:00', room: '' }); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const action = useAction();
  const selected = classes.find((item) => item.id === selectedId);
  const availableTeachers = teachers.filter((teacher) => teacher.roles.some((role: any) => role.role === 'Teacher' && role.branchId === selected?.branchId));
  const chooseClass = (id: string, source = classes) => { const item = source.find((entry) => entry.id === id); setSelectedId(id); setTeacherId(item?.teacherId || ''); setSlots(normalizeSchedule(item?.schedule)); setEditingIndex(null); };
  const load = async () => { setLoading(true); setError(''); try { const [classList, courseList, people] = await Promise.all([api.academics.listClasses(), api.academics.listCourses(), api.people.list()]); const teacherList = people.filter((person: any) => person.roles.some((role: any) => role.role === 'Teacher')); setClasses(classList); setCourses(courseList); setTeachers(teacherList); const nextId = selectedId && classList.some((item: any) => item.id === selectedId) ? selectedId : classList[0]?.id || ''; if (nextId) chooseClass(nextId, classList); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Timetables could not be loaded.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const createFirstClass = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const submittedForm = event.currentTarget; const values = new FormData(submittedForm); const courseId = String(values.get('courseId') || ''); const name = String(values.get('name') || '').trim(); if (!courseId || !name) return; void action.run(async () => { const result = await api.academics.createClass({ courseId, name, schedule: [] }); submittedForm.reset(); await load(); setSelectedId(result.class.id); }, 'Class created. You can now assign its teacher and weekly timetable.'); };
  const editSlot = (index: number) => { setEditingIndex(index); setSlotForm(slots[index]); };
  const resetSlot = () => { setEditingIndex(null); setSlotForm({ day: 'Sun', startTime: '08:00', endTime: '09:00', room: '' }); };
  const submitSlot = (event: FormEvent) => { event.preventDefault(); if (slotForm.startTime >= slotForm.endTime) { setError('End time must be later than start time.'); return; } const next = { ...slotForm, room: slotForm.room.trim() }; if (!next.room) { setError('Room number is required for every timetable session.'); return; } const overlap = slots.some((slot, index) => index !== editingIndex && slot.day === next.day && slot.startTime < next.endTime && slot.endTime > next.startTime); if (overlap) { setError('This class already has an overlapping session on that day.'); return; } setError(''); setSlots((current) => editingIndex === null ? [...current, next] : current.map((slot, index) => index === editingIndex ? next : slot)); resetSlot(); };
  const save = () => { if (!selected || !teacherId || !slots.length || slots.some((slot) => !slot.room.trim())) return; void action.run(async () => { await api.academics.updateClass(selected.id, { teacherId, schedule: slots }); await load(); }, 'Weekly timetable published to the assigned teacher and enrolled students.'); };
  const removeSlot = (index: number) => { setSlots((current) => current.filter((_, slotIndex) => slotIndex !== index)); if (editingIndex === index) resetSlot(); };
  const daySlots = (day: string) => slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => slot.day === day).sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime));

  return <Page title="Weekly timetable" description="Assign teachers and recurring weekly class times. Updates automatically appear for the assigned teacher and every student enrolled in the class.">
    <div role="note" style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--color-primary-soft)' }}><strong>Recurring schedule</strong><p style={{ margin: '4px 0 0', fontSize: 13 }}>This timetable continues every week until you update it. Record holidays and temporary closures in the <a href="/branch/academic-calendar">Academic Calendar</a>; the weekly timetable will resume afterward.</p></div>
    {loading ? <Card hoverable={false}><div aria-busy="true">Loading classes and teachers…</div></Card> : error && !classes.length ? <Card hoverable={false}><Feedback message="" error={error} /><Button onClick={() => void load()}>Try again</Button></Card> : !classes.length ? <Card hoverable={false}><div style={{ maxWidth: 620, margin: '0 auto' }}><span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 42, color: 'var(--color-primary)' }}>school</span><h2>Create a schedulable class</h2><p style={{ color: 'var(--text-muted)', margin: '6px 0 18px' }}>Your grades exist, but a timetable is attached to a real class under one of the grade's subjects. Create that class here, then assign its teacher, room, and weekly times.</p>{courses.length ? <form onSubmit={createFirstClass} style={form}><label style={label}>Grade and subject<select name="courseId" required style={field}><option value="">Select grade and subject</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.gradeName || 'Ungraded'} · {course.name} · {course.branchName}</option>)}</select></label><label style={label}>Class or section name<input name="name" required maxLength={160} style={field} placeholder="Section A" /></label><Feedback message={action.message} error={action.error} /><Button type="submit" disabled={action.busy}>{action.busy ? 'Creating…' : 'Create class and continue'}</Button></form> : <div role="status"><p style={{ color: 'var(--color-error)' }}>No subjects exist for these grades yet. Create a subject first, then return to the timetable.</p><a href="/branch/classes">Open class and subject setup</a></div>}</div></Card> : <>
      <Card hoverable={false}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}><label style={label}>Grade and class<select style={field} value={selectedId} onChange={(event) => chooseClass(event.target.value)}>{classes.map((item) => <option key={item.id} value={item.id}>{item.gradeName || 'No grade'} · {item.name} · {item.courseName}</option>)}</select></label><label style={label}>Assigned teacher<select style={field} value={teacherId} onChange={(event) => setTeacherId(event.target.value)}><option value="">Unassigned</option>{availableTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label></div><div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}><StatusBadge variant="info">{selected?.enrollmentCount || 0} enrolled students</StatusBadge><StatusBadge variant={teacherId ? 'success' : 'warning'}>{teacherId ? 'Teacher assigned' : 'Teacher required'}</StatusBadge><StatusBadge variant="info">{slots.length} weekly sessions</StatusBadge></div></Card>
      <Card hoverable={false}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}><div><h2 style={{ fontSize: 18 }}>Weekly schedule</h2><p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{selected?.gradeName || 'Ungraded'} · {selected?.name}</p></div><Button onClick={save} disabled={action.busy || !teacherId}>{action.busy ? 'Publishing…' : 'Publish timetable'}</Button></div><Feedback message={action.message} error={action.error || error} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(150px,1fr))', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>{WEEK_DAYS.map((day) => <section key={day} style={{ minWidth: 150, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}><h3 style={{ padding: 10, fontSize: 14, background: 'var(--color-surface)' }}>{DAY_NAMES[day]}</h3><div style={{ display: 'grid', gap: 8, padding: 8 }}>{daySlots(day).length ? daySlots(day).map(({ slot, index }) => <article key={`${day}-${index}`} style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}><strong style={{ fontSize: 13 }}>{slot.startTime}–{slot.endTime}</strong><small style={{ display: 'block', color: 'var(--text-muted)', margin: '3px 0 8px' }}>{slot.room || 'Room not set'}</small><div style={{ display: 'flex', gap: 6 }}><Button variant="outline" onClick={() => editSlot(index)} style={{ minHeight: 36, padding: '4px 8px' }}>Edit</Button><Button variant="danger" onClick={() => removeSlot(index)} style={{ minHeight: 36, padding: '4px 8px' }}>Delete</Button></div></article>) : <small style={{ padding: 8, color: 'var(--text-muted)' }}>No class</small>}</div></section>)}</div></Card>
      <Card hoverable={false}><h2 style={{ fontSize: 18 }}>{editingIndex === null ? 'Add weekly session' : 'Edit weekly session'}</h2><form onSubmit={submitSlot} style={{ ...form, marginTop: 14 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}><label style={label}>Day<select style={field} value={slotForm.day} onChange={(event) => setSlotForm({ ...slotForm, day: event.target.value })}>{WEEK_DAYS.map((day) => <option key={day} value={day}>{DAY_NAMES[day]}</option>)}</select></label><label style={label}>Start time<input required type="time" style={field} value={slotForm.startTime} onChange={(event) => setSlotForm({ ...slotForm, startTime: event.target.value })} /></label><label style={label}>End time<input required type="time" style={field} value={slotForm.endTime} onChange={(event) => setSlotForm({ ...slotForm, endTime: event.target.value })} /></label><label style={label}>Room<input style={field} maxLength={120} value={slotForm.room} onChange={(event) => setSlotForm({ ...slotForm, room: event.target.value })} placeholder="Room 302" /></label></div><div style={{ display: 'flex', gap: 8 }}><Button type="submit">{editingIndex === null ? 'Add to timetable' : 'Update session'}</Button>{editingIndex !== null ? <Button type="button" variant="outline" onClick={resetSlot}>Cancel edit</Button> : null}</div></form></Card>
    </>}
  </Page>;
}

void LegacyManagedTimetableView;
function TimetableView() { return <TimetableWorkspace />; }

function LiveBranchTeachersView() {
  const [data, setData] = useState<any>(null);
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (nextBranch?: string) => {
    setLoading(true); setError('');
    try {
      const result = await api.branchAdmin.getTeacherWorkflows(nextBranch || undefined);
      setData(result); setBranchId(nextBranch || result.selectedBranch?.id || '');
      setSelectedId('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Teachers could not be loaded.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  if (loading) return <Page title="Teachers" description="Everyone teaching at this branch."><Card hoverable={false}><div aria-busy="true">Loading branch teachers…</div></Card></Page>;
  if (error || !data) return <Page title="Teachers" description="Everyone teaching at this branch."><Card hoverable={false}><Feedback message="" error={error} /><Button onClick={() => void load(branchId)}>Try again</Button></Card></Page>;

  const teachers = (data.teachers || []).filter((teacher: any) => `${teacher.firstName} ${teacher.lastName} ${teacher.email} ${teacher.staffRecord?.designation || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = (data.teachers || []).find((teacher: any) => teacher.id === selectedId);
  const initials = (teacher: any) => `${teacher.firstName?.[0] || ''}${teacher.lastName?.[0] || ''}`.toUpperCase();
  const attendanceDays = (teacher: any) => new Set(teacher.teacherAttendance.filter((stamp: any) => ['IN', 'RE_IN'].includes(stamp.stampType)).map((stamp: any) => new Date(stamp.timestamp).toDateString())).size;
  const salary = (teacher: any) => teacher.staffRecord?.salaryStructure as Record<string, unknown> | undefined;

  return <Page title="Teachers" description="View every teacher working at this branch and open their complete employment, class, attendance, and payroll details.">
    <Card hoverable={false}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, alignItems: 'end', marginBottom: 20 }}>
        <label style={label}>Branch<select style={field} value={branchId} onChange={(event) => void load(event.target.value)}>{data.branches.map((branch: any) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label style={label}>Search teachers<input type="search" style={field} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, or designation" /></label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}><h2 style={{ fontSize: 18 }}>Branch teaching team</h2><StatusBadge variant="info">{teachers.length} {teachers.length === 1 ? 'teacher' : 'teachers'}</StatusBadge></div>
      {teachers.length ? <div style={{ display: 'grid', gap: 10 }}>{teachers.map((teacher: any) => <article key={teacher.id} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) auto', alignItems: 'center', gap: 14, padding: 14, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--color-surface)' }}>
        <div aria-hidden="true" style={{ width: 48, height: 48, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--color-primary-soft)', color: 'var(--color-primary)', fontWeight: 800 }}>{initials(teacher)}</div>
        <div style={{ minWidth: 0 }}><strong style={{ display: 'block' }}>{teacher.firstName} {teacher.lastName}</strong><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>{teacher.staffRecord?.designation || 'Teacher'} · {teacher.assignedClasses.length} assigned {teacher.assignedClasses.length === 1 ? 'class' : 'classes'}</span></div>
        <Button variant="outline" onClick={() => setSelectedId(teacher.id)}>View details</Button>
      </article>)}</div> : <div role="status" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}><span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 40 }}>person_search</span><h3>No teachers found</h3><p>{search ? 'Try a different name, email, or designation.' : 'No teachers are assigned to this branch yet.'}</p></div>}
    </Card>

    <AdminDetailDialog open={Boolean(selected)} title={selected ? `${selected.firstName} ${selected.lastName}` : 'Teacher details'} eyebrow="Teacher profile" onClose={() => setSelectedId('')}>
    {selected ? <>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}><div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><div aria-hidden="true" style={{ width: 60, height: 60, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--color-primary-soft)', color: 'var(--color-primary)', fontWeight: 800, fontSize: 20 }}>{initials(selected)}</div><div><h2 style={{ fontSize: 20 }}>{selected.firstName} {selected.lastName}</h2><p style={{ color: 'var(--text-muted)' }}>{selected.staffRecord?.designation || 'Teacher'} · <StatusBadge variant={selected.status === 'ACTIVE' ? 'success' : 'warning'}>{selected.status}</StatusBadge></p></div></div><Button variant="outline" onClick={() => setSelectedId('')}>Close details</Button></div>
      <section aria-labelledby="teacher-contact-heading"><h3 id="teacher-contact-heading" style={{ fontSize: 16, marginBottom: 12 }}>Contact and employment</h3><dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, margin: 0, padding: 16, background: 'var(--color-surface)', borderRadius: 10 }}><div><dt style={{ color: 'var(--text-muted)', fontSize: 12 }}>Email</dt><dd style={{ margin: 0, fontWeight: 600 }}>{selected.email}</dd></div><div><dt style={{ color: 'var(--text-muted)', fontSize: 12 }}>Phone</dt><dd style={{ margin: 0, fontWeight: 600 }}>{selected.phone}</dd></div><div><dt style={{ color: 'var(--text-muted)', fontSize: 12 }}>Contract</dt><dd style={{ margin: 0, fontWeight: 600 }}>{selected.staffRecord?.contractType?.replaceAll('_', ' ') || 'Not recorded'}</dd></div><div><dt style={{ color: 'var(--text-muted)', fontSize: 12 }}>Joined</dt><dd style={{ margin: 0, fontWeight: 600 }}>{selected.staffRecord?.joiningDate ? new Date(selected.staffRecord.joiningDate).toLocaleDateString() : 'Not recorded'}</dd></div><div><dt style={{ color: 'var(--text-muted)', fontSize: 12 }}>Attendance (30 days)</dt><dd style={{ margin: 0, fontWeight: 600 }}>{attendanceDays(selected)} days checked in</dd></div><div><dt style={{ color: 'var(--text-muted)', fontSize: 12 }}>Salary structure</dt><dd style={{ margin: 0, fontWeight: 600 }}>{salary(selected)?.baseMonthlySalary ? `NPR ${Number(salary(selected)?.baseMonthlySalary).toLocaleString()}/month` : salary(selected)?.hourlyRate ? `NPR ${Number(salary(selected)?.hourlyRate).toLocaleString()}/hour` : 'Compensation incomplete'}</dd></div></dl></section>
      <section aria-labelledby="teacher-classes-heading" style={{ marginTop: 22 }}><h3 id="teacher-classes-heading" style={{ fontSize: 16, marginBottom: 12 }}>Assigned classes</h3>{selected.assignedClasses.length ? <div style={{ display: 'grid', gap: 10 }}>{selected.assignedClasses.map((klass: any) => <div key={klass.id} style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 10 }}><strong>{klass.name}</strong><p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>{klass.course.name} · {klass._count.enrollments} enrolled students</p></div>)}</div> : <p style={{ color: 'var(--text-muted)' }}>No classes are assigned to this teacher.</p>}</section>
      <section aria-labelledby="teacher-payroll-heading" style={{ marginTop: 22 }}><h3 id="teacher-payroll-heading" style={{ fontSize: 16, marginBottom: 12 }}>Recent payroll</h3>{selected.staffRecord?.payrolls?.length ? <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}><thead><tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}><th style={{ padding: 10 }}>Period</th><th style={{ padding: 10 }}>Base</th><th style={{ padding: 10 }}>Deductions</th><th style={{ padding: 10 }}>Net payable</th><th style={{ padding: 10 }}>Status</th></tr></thead><tbody>{selected.staffRecord.payrolls.map((payroll: any) => <tr key={payroll.id} style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: 10 }}>{new Date(payroll.year, payroll.month - 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })}</td><td style={{ padding: 10 }}>NPR {payroll.baseSalary.toLocaleString()}</td><td style={{ padding: 10 }}>NPR {payroll.attendanceDeductions.toLocaleString()}</td><td style={{ padding: 10, fontWeight: 700 }}>NPR {payroll.netPayable.toLocaleString()}</td><td style={{ padding: 10 }}><StatusBadge variant={payroll.status === 'MANUALLY_PAID' ? 'success' : 'warning'}>{payroll.status.replaceAll('_', ' ')}</StatusBadge></td></tr>)}</tbody></table></div> : <p style={{ color: 'var(--text-muted)' }}>No payroll records are available for this teacher.</p>}</section>
    </> : null}
    </AdminDetailDialog>
  </Page>;
}

function ParentMessagesView() {
  const [contacts, setContacts] = useState<any[]>([]); const [selectedKey, setSelectedKey] = useState(''); const [thread, setThread] = useState<any[]>([]); const [text, setText] = useState(''); const [loading, setLoading] = useState(true); const [threadLoading, setThreadLoading] = useState(false); const [error, setError] = useState(''); const action = useAction();
  const selected = contacts.find((contact) => `${contact.studentId}:${contact.parentId}` === selectedKey);
  const loadContacts = async () => { setLoading(true); setError(''); try { const result = await api.branchAdmin.getParentContacts(); setContacts(result.contacts); if (!selectedKey && result.contacts[0]) setSelectedKey(`${result.contacts[0].studentId}:${result.contacts[0].parentId}`); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Parent contacts could not be loaded.'); } finally { setLoading(false); } };
  const loadThread = async (contact: any) => { if (!contact) { setThread([]); return; } setThreadLoading(true); setError(''); try { const result = await api.branchAdmin.getParentThread(contact.studentId, contact.parentId); setThread(result.messages); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Conversation could not be loaded.'); } finally { setThreadLoading(false); } };
  useEffect(() => { void loadContacts(); }, []);
  useEffect(() => { void loadThread(selected); }, [selectedKey]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!selected || !text.trim()) return; void action.run(async () => { await api.branchAdmin.sendParentMessage({ studentId: selected.studentId, receiverId: selected.parentId, messageText: text.trim() }); setText(''); await loadThread(selected); }, 'Message sent to parent.'); };
  return <Page title="Parent messages" description="Send private, student-specific messages to parents linked to this branch.">
    {loading ? <Card hoverable={false}><div aria-busy="true">Loading parent contacts…</div></Card> : error && !contacts.length ? <Card hoverable={false}><Feedback message="" error={error} /><Button onClick={() => void loadContacts()}>Try again</Button></Card> : !contacts.length ? <Card hoverable={false}><div role="status" style={{ padding: 28, textAlign: 'center' }}><h2>No linked parents</h2><p style={{ color: 'var(--text-muted)' }}>Parent contacts appear after a student admission links their account.</p></div></Card> : <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px,.75fr) minmax(0,1.5fr)', gap: 16 }}>
      <Card hoverable={false}><label style={label}>Student and parent<select style={field} value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}>{contacts.map((contact) => <option key={`${contact.studentId}:${contact.parentId}`} value={`${contact.studentId}:${contact.parentId}`}>{contact.studentName} — {contact.parentName}</option>)}</select></label><div style={{ marginTop: 16, padding: 14, background: 'var(--color-surface)', borderRadius: 10 }}><strong>{selected?.parentName}</strong><p style={{ margin: '4px 0', fontSize: 13 }}>{selected?.parentEmail}<br />{selected?.parentPhone}</p><small style={{ color: 'var(--text-muted)' }}>Regarding {selected?.studentName} · {selected?.gradeName} · {selected?.branchName}</small></div></Card>
      <Card hoverable={false}><h2 style={{ fontSize: 18 }}>Conversation with {selected?.parentName}</h2><p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Regarding {selected?.studentName}</p>{threadLoading ? <div aria-busy="true" style={{ padding: 24 }}>Loading conversation…</div> : <><div style={{ display: 'grid', gap: 10, margin: '18px 0', maxHeight: 360, overflowY: 'auto' }}>{thread.length ? thread.map((message) => <article key={message.id} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: message.receiverId === selected?.parentId ? 'var(--color-primary-soft)' : 'var(--color-surface)' }}><strong style={{ fontSize: 12 }}>{message.receiverId === selected?.parentId ? 'Branch Admin' : selected?.parentName}</strong><p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{message.messageText}</p><small style={{ color: 'var(--text-muted)' }}>{new Date(message.createdAt).toLocaleString()}</small></article>) : <div role="status" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No messages yet. Start the conversation below.</div>}</div><form onSubmit={submit} style={form} aria-busy={action.busy}><label style={label}>Message<textarea required maxLength={4000} style={{ ...field, minHeight: 110, resize: 'vertical' }} value={text} onChange={(event) => setText(event.target.value)} placeholder={`Write a private message about ${selected?.studentName || 'this student'}…`} /></label><small style={{ color: 'var(--text-muted)' }}>{text.length}/4000 characters</small><Feedback message={action.message} error={action.error || error} /><Button type="submit" disabled={action.busy || !text.trim()}>{action.busy ? 'Sending…' : 'Send message'}</Button></form></>}</Card>
    </div>}
  </Page>;
}

export function BranchAdminWorkspace() { const path = useLocation().pathname; if (path.includes('appointments')) return <AppointmentsView />; if (path.includes('leave-requests')) return <LiveTeacherWorkflow mode="leaves" />; if (path.includes('petty-cash')) return <PettyCashView />; if (path.includes('student-exceptions')) return <StudentExceptions />; if (path.includes('classes')) return <BranchClassesView />; if (path.includes('resource-logs')) return <ResourceTasks />; if (path.includes('academic-calendar')) return <BranchCalendarView />; if (path.includes('messages')) return <ParentMessagesView />; if (path.includes('attendance')) return <LiveTeacherWorkflow mode="attendance" />; if (path.includes('homework')) return <LiveTeacherWorkflow mode="homework" />; if (path.includes('results')) return <BranchResultsView />; if (path.includes('syllabus')) return <LiveTeacherWorkflow mode="syllabus" />; if (path.includes('fees')) return <FeeBillingView />; if (path.includes('certificates')) return <CertificatesView />; if (path.includes('timetable')) return <TimetableView />; if (path.includes('teachers')) return <LiveBranchTeachersView />; if (path.includes('students')) return <BranchStudentsView />; return <Page title="Branch operations" description="This workspace is limited to your assigned physical branch."><Card hoverable={false}>Choose a branch operation from the navigation.</Card></Page>; }
