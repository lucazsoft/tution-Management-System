import { useCallback, useEffect, useMemo, useState } from 'react';
import { RemoteState } from '../../components/patterns/RemoteState';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StatusBadge, type StatusBadgeVariant } from '../../components/ui/StatusBadge';
import { useToast } from '../../components/ui/Toast';
import { api, type LeaveRecord } from '../../services/api';
import { errorMessage } from '../../services/api/client';
import './leaveApproval.css';

type Role = 'tenant' | 'branch';
type Tab = 'awaiting' | 'all';

const TYPE_LABEL: Record<string, string> = { CASUAL: 'Casual', SICK: 'Sick', LONG_SICK: 'Long sick', EARLY_OUT: 'Early-out' };
const STATUS_OPTIONS = [
  ['', 'Any status'], ['PENDING', 'Awaiting branch'], ['APPROVED_LEVEL1', 'Awaiting tenant'],
  ['APPROVED_LEVEL2', 'Approved'], ['REJECTED', 'Rejected'], ['CANCELLED', 'Cancelled'],
] as const;
const REFRESH_MS = 30_000;

const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dateRange = (leave: LeaveRecord) => leave.startDate.slice(0, 10) === leave.endDate.slice(0, 10)
  ? dateLabel(leave.startDate)
  : `${dateLabel(leave.startDate)} – ${dateLabel(leave.endDate)}`;
const dayCount = (days: number) => `${days} working day${days === 1 ? '' : 's'}`;

function leaveStage(leave: LeaveRecord): { label: string; variant: StatusBadgeVariant } {
  if (leave.status === 'PENDING') return leave.escalated
    ? { label: 'Escalated · no branch reply in 48h', variant: 'error' }
    : { label: 'Awaiting branch (L1)', variant: 'warning' };
  if (leave.status === 'APPROVED_LEVEL1') return { label: 'Awaiting tenant (L2)', variant: 'warning' };
  if (leave.status === 'APPROVED_LEVEL2') return { label: 'Approved', variant: 'success' };
  if (leave.status === 'CANCELLED') return { label: 'Cancelled', variant: 'info' };
  return { label: 'Rejected', variant: 'error' };
}

const approvalPath = (leave: LeaveRecord) => leave.subjectType === 'STUDENT'
  ? 'Branch Admin decides'
  : leave.requiredLevel === 2 ? 'Branch Admin → Tenant Admin' : 'Branch Admin decides';

function approveLabel(role: Role, leave: LeaveRecord) {
  if (role === 'branch' && leave.requiredLevel === 2) return 'Approve & forward to Tenant Admin';
  return role === 'tenant' ? 'Give final approval' : 'Approve leave';
}

const COPY: Record<Role, { title: string; description: string; awaitingEmpty: string }> = {
  tenant: {
    title: 'Leave Management',
    description: 'Final approval for staff leave longer than 3 working days or Long Sick leave, plus any staff request a branch left unanswered for 48 hours. Student leave stays with the Branch Admin.',
    awaitingEmpty: 'Nothing needs your decision. Requests appear here after Branch Admin approval or a 48-hour escalation.',
  },
  branch: {
    title: 'Leave Requests',
    description: 'Decide staff and student leave for your branch. Staff leave longer than 3 working days, and Long Sick leave, also goes to the Tenant Admin after your approval.',
    awaitingEmpty: 'No leave requests are waiting for your decision.',
  },
};

export function LeaveApprovalWorkspace({ role }: { role: Role }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('awaiting');
  const [awaiting, setAwaiting] = useState<LeaveRecord[]>([]);
  const [all, setAll] = useState<LeaveRecord[]>([]);
  const [filters, setFilters] = useState({ branchId: '', status: '', leaveType: '', subjectType: '' });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [remarkErrors, setRemarkErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<LeaveRecord | null>(null);
  const copy = COPY[role];

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setLoadError('');
    try {
      const [mine, everything] = await Promise.all([
        api.branchAdmin.getLeaves({ scope: 'awaiting-me' }),
        api.branchAdmin.getLeaves({ scope: 'all', ...filters }),
      ]);
      setAwaiting(mine.leaves.filter((leave) => leave.canAct));
      setAll(everything.leaves);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(true); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const branches = useMemo(() => {
    const map = new Map<string, string>();
    [...awaiting, ...all].forEach((leave) => map.set(leave.branchId, leave.branchName));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [awaiting, all]);

  const outToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return all.filter((leave) => leave.status === 'APPROVED_LEVEL2' && leave.startDate.slice(0, 10) <= today && leave.endDate.slice(0, 10) >= today).length;
  }, [all]);

  const decide = async (leave: LeaveRecord, action: 'APPROVE' | 'REJECT') => {
    const note = remarks[leave.id]?.trim() ?? '';
    if (action === 'REJECT' && !note) {
      setRemarkErrors((current) => ({ ...current, [leave.id]: 'Add a reason so the requester understands the decision.' }));
      document.getElementById(`leave-remarks-${leave.id}`)?.focus();
      return;
    }
    setBusy(leave.id);
    setRemarkErrors((current) => ({ ...current, [leave.id]: '' }));
    try {
      await api.branchAdmin.decideLeave(leave.id, action, note || undefined);
      setRemarks((current) => ({ ...current, [leave.id]: '' }));
      const forwarded = action === 'APPROVE' && role === 'branch' && leave.requiredLevel === 2;
      showToast(
        action === 'REJECT' ? 'Leave rejected. The requester can see your reason.'
          : forwarded ? 'Approved and forwarded to the Tenant Admin for final approval.'
            : 'Leave approved. The requester has been notified.',
        'success',
      );
      await load(true);
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setBusy('');
    }
  };

  const escalatedCount = awaiting.filter((leave) => leave.escalated).length;

  return (
    <div className="leave-workspace">
      <header className="leave-workspace__header">
        <h2>{copy.title}</h2>
        <p>{copy.description}</p>
      </header>

      <div className="leave-workspace__stats" aria-live="polite">
        <div><strong>{loading ? '—' : awaiting.length}</strong><span>Awaiting your decision</span></div>
        {role === 'tenant' ? <div><strong>{loading ? '—' : escalatedCount}</strong><span>Escalated after 48h</span></div> : null}
        <div><strong>{loading ? '—' : outToday}</strong><span>On approved leave today</span></div>
      </div>

      <div className="leave-workspace__tabs" role="tablist" aria-label="Leave views">
        <button type="button" role="tab" aria-selected={tab === 'awaiting'} onClick={() => setTab('awaiting')}>
          Awaiting my decision{awaiting.length ? <span className="leave-workspace__count">{awaiting.length}</span> : null}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>All requests</button>
      </div>

      {loading ? <RemoteState kind="loading" message="Loading leave requests…" />
        : loadError ? <RemoteState kind="error" message={loadError} onRetry={() => void load()} />
          : tab === 'awaiting' ? (
            awaiting.length ? (
              <div className="leave-workspace__queue">
                {awaiting.map((leave) => {
                  const stage = leaveStage(leave);
                  const branchDecision = leave.decisions.find((decision) => decision.level === 1 && decision.action === 'APPROVE');
                  return (
                    <Card key={leave.id} hoverable={false}>
                      <article className="leave-card">
                        <div className="leave-card__top">
                          <div>
                            <strong className="leave-card__name">{leave.staffName}</strong>
                            <span className="leave-card__meta">{leave.subjectType === 'STUDENT' ? 'Student' : 'Staff'} · {leave.branchName}</span>
                          </div>
                          <StatusBadge variant={stage.variant}>{stage.label}</StatusBadge>
                        </div>
                        <dl className="leave-card__facts">
                          <div><dt>Type</dt><dd>{TYPE_LABEL[leave.leaveType] ?? leave.leaveType}</dd></div>
                          <div><dt>Dates</dt><dd>{dateRange(leave)}</dd></div>
                          <div><dt>Counted</dt><dd>{dayCount(leave.days)}</dd></div>
                          <div><dt>Approval path</dt><dd>{approvalPath(leave)}</dd></div>
                        </dl>
                        <p className="leave-card__reason">“{leave.reason}”</p>
                        {branchDecision ? (
                          <p className="leave-card__note">Approved at branch level by {branchDecision.actorName}{branchDecision.remarks ? `: “${branchDecision.remarks}”` : '.'}</p>
                        ) : null}
                        {leave.escalated ? (
                          <p className="leave-card__note is-warning">The branch has not answered for 48 hours. Your decision will be final.</p>
                        ) : null}
                        <label className="leave-card__remarks" htmlFor={`leave-remarks-${leave.id}`}>
                          Remarks <span>Required when rejecting, optional when approving.</span>
                          <textarea
                            id={`leave-remarks-${leave.id}`}
                            rows={2}
                            maxLength={2000}
                            value={remarks[leave.id] ?? ''}
                            aria-invalid={Boolean(remarkErrors[leave.id]) || undefined}
                            aria-describedby={remarkErrors[leave.id] ? `leave-remarks-error-${leave.id}` : undefined}
                            onChange={(event) => {
                              setRemarks((current) => ({ ...current, [leave.id]: event.target.value }));
                              if (remarkErrors[leave.id]) setRemarkErrors((current) => ({ ...current, [leave.id]: '' }));
                            }}
                            placeholder="Explain the decision to the requester"
                          />
                          {remarkErrors[leave.id] ? <span id={`leave-remarks-error-${leave.id}`} role="alert" className="leave-card__error">{remarkErrors[leave.id]}</span> : null}
                        </label>
                        <div className="leave-card__actions">
                          <Button disabled={busy === leave.id} onClick={() => void decide(leave, 'APPROVE')}>{busy === leave.id ? 'Saving…' : approveLabel(role, leave)}</Button>
                          <Button disabled={busy === leave.id} variant="danger" onClick={() => void decide(leave, 'REJECT')}>Reject</Button>
                          <Button variant="ghost" onClick={() => setSelected(leave)}>History</Button>
                        </div>
                      </article>
                    </Card>
                  );
                })}
              </div>
            ) : <RemoteState kind="empty" message={copy.awaitingEmpty} />
          ) : (
            <Card hoverable={false}>
              <div className="leave-workspace__filters">
                {branches.length > 1 || filters.branchId ? (
                  <label>Branch<select value={filters.branchId} onChange={(event) => setFilters((current) => ({ ...current, branchId: event.target.value }))}>
                    <option value="">All branches</option>
                    {branches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select></label>
                ) : null}
                <label>Who<select value={filters.subjectType} onChange={(event) => setFilters((current) => ({ ...current, subjectType: event.target.value }))}>
                  <option value="">Staff and students</option><option value="STAFF">Staff</option><option value="STUDENT">Students</option>
                </select></label>
                <label>Status<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                  {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select></label>
                <label>Type<select value={filters.leaveType} onChange={(event) => setFilters((current) => ({ ...current, leaveType: event.target.value }))}>
                  <option value="">Any type</option>
                  {Object.entries(TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select></label>
              </div>
              {all.length ? (
                <div className="leave-table-wrap">
                  <table className="leave-table">
                    <thead><tr><th>Person</th><th>Branch</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th></tr></thead>
                    <tbody>
                      {all.map((leave) => {
                        const stage = leaveStage(leave);
                        return (
                          <tr key={leave.id} tabIndex={0} onClick={() => setSelected(leave)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(leave); } }} aria-label={`Open leave details for ${leave.staffName}`}>
                            <td><strong>{leave.staffName}</strong><small>{leave.subjectType === 'STUDENT' ? 'Student' : 'Staff'}</small></td>
                            <td>{leave.branchName}</td>
                            <td>{TYPE_LABEL[leave.leaveType] ?? leave.leaveType}</td>
                            <td>{dateRange(leave)}</td>
                            <td>{leave.days}</td>
                            <td><StatusBadge variant={stage.variant}>{stage.label}</StatusBadge></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <RemoteState kind="empty" message="No leave requests match these filters." />}
            </Card>
          )}

      {selected ? <LeaveDetailDialog leave={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function LeaveDetailDialog({ leave, onClose }: { leave: LeaveRecord; onClose: () => void }) {
  const stage = leaveStage(leave);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const actionLabel = (action: string, level: number) => action === 'CANCEL' ? 'Cancelled by requester'
    : action === 'REJECT' ? `Rejected at ${level === 2 ? 'tenant' : 'branch'} level`
      : `Approved at ${level === 2 ? 'tenant' : 'branch'} level`;
  return (
    <div className="leave-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-dialog-title" onClick={onClose}>
      <div className="leave-dialog__panel" onClick={(event) => event.stopPropagation()}>
        <Card hoverable={false}>
          <div className="leave-card__top">
            <div>
              <StatusBadge variant={stage.variant}>{stage.label}</StatusBadge>
              <h3 id="leave-dialog-title">{leave.staffName}</h3>
              <span className="leave-card__meta">{leave.subjectType === 'STUDENT' ? 'Student' : 'Staff'} · {leave.branchName}</span>
            </div>
            <Button variant="outline" onClick={onClose} autoFocus>Close</Button>
          </div>
          <dl className="leave-card__facts">
            <div><dt>Type</dt><dd>{TYPE_LABEL[leave.leaveType] ?? leave.leaveType}</dd></div>
            <div><dt>Dates</dt><dd>{dateRange(leave)}</dd></div>
            <div><dt>Counted</dt><dd>{dayCount(leave.days)}</dd></div>
            <div><dt>Approval path</dt><dd>{approvalPath(leave)}</dd></div>
          </dl>
          <p className="leave-card__reason">“{leave.reason}”</p>
          <h4 className="leave-dialog__subhead">Timeline</h4>
          <ol className="leave-timeline">
            <li><strong>Submitted</strong><span>{dateLabel(leave.createdAt)}</span></li>
            {leave.decisions.map((decision, index) => (
              <li key={index} className={decision.action === 'REJECT' ? 'is-rejected' : decision.action === 'CANCEL' ? 'is-cancelled' : 'is-approved'}>
                <strong>{actionLabel(decision.action, decision.level)}{decision.escalated ? ' (after 48h escalation)' : ''}</strong>
                <span>{decision.actorName} · {dateLabel(decision.createdAt)}</span>
                {decision.remarks ? <p>“{decision.remarks}”</p> : null}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
