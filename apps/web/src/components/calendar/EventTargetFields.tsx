import { useEffect, useState } from 'react';
import { academicEventsApi, type EventAudience } from '../../services/api/academicEvents';
import './academicCalendarView.css';

export const AUDIENCE_LABELS: Record<EventAudience, string> = { ALL: 'Everyone', STAFF: 'Staff only', STUDENTS: 'Students and their parents', PARENTS: 'Parents only' };
export function EventAudienceSelect({ value, onChange, disabled = false }: { value: EventAudience; onChange: (value: EventAudience) => void; disabled?: boolean }) {
  return <label className="event-target-field">Audience<select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as EventAudience)}>{Object.entries(AUDIENCE_LABELS).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}

type TargetBranch = { id: string; name: string };
type TargetClass = { id: string; name: string; branchId: string; branch: { name: string } };

/**
 * Audience and targeting for a calendar event.
 *
 * - Branch admins pass a fixed `branchId`: they choose a class within it.
 * - Tenant admins pass `onTargetBranchChange`: they first choose all branches
 *   or one branch, then (for one branch) the whole branch or one of its classes.
 */
export function EventTargetFields({ audience, classId, branchId, targetBranchId = '', onAudienceChange, onClassChange, onTargetBranchChange, onReadyChange }: {
  audience: EventAudience;
  classId: string;
  branchId?: string;
  targetBranchId?: string;
  onReadyChange?: (ready: boolean) => void;
  onAudienceChange: (value: EventAudience) => void;
  onClassChange: (id: string) => void;
  onTargetBranchChange?: (id: string) => void;
}) {
  const [branches, setBranches] = useState<TargetBranch[]>([]);
  const [classes, setClasses] = useState<TargetClass[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); onReadyChange?.(false);
    academicEventsApi.options(branchId).then((data) => {
      if (!active) return;
      setBranches(data.branches ?? []); setClasses(data.classes); setLoading(false); onReadyChange?.(true);
    }).catch(() => {
      if (!active) return;
      setBranches([]); setClasses([]); setLoading(false); setError('Could not load classes. Publishing is blocked until targeting is available.');
    });
    return () => { active = false; };
  }, [branchId, revision, onReadyChange]);

  const choosesBranch = !branchId && !!onTargetBranchChange;
  const scopeBranchId = branchId || (choosesBranch ? targetBranchId : '');
  const scopeBranch = branches.find((item) => item.id === scopeBranchId);
  const visibleClasses = classes.filter((item) => !scopeBranchId || item.branchId === scopeBranchId);
  const classDisabled = loading || !!error || (choosesBranch && !targetBranchId);
  const wholeScopeLabel = loading
    ? 'Loading classes…'
    : scopeBranchId
      ? `Entire branch${scopeBranch ? ` · ${scopeBranch.name}` : ''}`
      : 'Entire institution';

  return <div style={{ display: 'grid', gap: 12 }}>
    <EventAudienceSelect value={audience} onChange={onAudienceChange} />
    {choosesBranch && <label className="event-target-field">Branch
      <select value={targetBranchId} disabled={loading || !!error} onChange={(event) => { onTargetBranchChange!(event.target.value); onClassChange(''); }}>
        <option value="">{loading ? 'Loading branches…' : 'All branches (entire institution)'}</option>
        {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>}
    <label className="event-target-field">{choosesBranch ? 'Class' : 'Applies to'}
      <select value={classId} disabled={classDisabled} onChange={(event) => onClassChange(event.target.value)}>
        <option value="">{wholeScopeLabel}</option>
        {visibleClasses.map((item) => <option key={item.id} value={item.id}>{scopeBranchId ? item.name : `${item.branch.name} · ${item.name}`}</option>)}
      </select>
      {choosesBranch && !targetBranchId && !loading && !error && <small style={{ color: 'var(--text-muted)' }}>Choose a branch to target a single class.</small>}
      {scopeBranchId && !loading && !error && !visibleClasses.length && <small style={{ color: 'var(--text-muted)' }}>This branch has no active classes; the event applies to the whole branch.</small>}
    </label>
    {error && <p role="alert">{error} <button type="button" onClick={() => { onReadyChange?.(false); setRevision((value) => value + 1); }}>Retry</button></p>}
  </div>;
}
