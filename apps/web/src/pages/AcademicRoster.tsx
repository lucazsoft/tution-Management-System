import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { UserProfileDrawer } from '../components/UserProfileDrawer';
import { api } from '../services/api';

interface PersonRole {
  role: string;
  branchId: string | null;
  branchName: string | null;
}

interface Person {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  gradeId: string | null;
  gradeName: string | null;
  roles: PersonRole[];
  createdAt: string;
  parents?: Array<{ id: string; name: string; email: string; phone: string }>;
}

interface FeeSummary {
  totalDue: number;
  overdueAmount: number;
  overdueCount: number;
}

interface AcademicRosterProps {
  role: 'Student' | 'Teacher';
  title: string;
  subtitle: string;
  emptyText: string;
  showFees?: boolean;
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map((p) => p[0]?.toUpperCase()).join('').slice(0, 2) || '??';
}

function money(n: number): string {
  return `NPR ${n.toLocaleString()}`;
}

// Fee badge for a student row: overdue > due > cleared.
function FeeBadge({ fee }: { fee: FeeSummary | undefined }) {
  if (!fee) return <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>—</span>;
  if (fee.overdueAmount > 0) {
    return <StatusBadge variant="error">Overdue {money(fee.overdueAmount)}</StatusBadge>;
  }
  if (fee.totalDue > 0) {
    return <StatusBadge variant="warning">Due {money(fee.totalDue)}</StatusBadge>;
  }
  return <StatusBadge variant="success">Cleared</StatusBadge>;
}

export function AcademicRoster({ role, title, subtitle, emptyText, showFees = false }: AcademicRosterProps) {
  const [people, setPeople] = useState<Person[]>([]);
  const [feeMap, setFeeMap] = useState<Map<string, FeeSummary>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');
  const [feeFilter, setFeeFilter] = useState<'ALL' | 'OVERDUE' | 'DUE'>('ALL');
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [selectedUserId, setSelectedUserId] = useState('');

  const loadPeople = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const [list, fees] = await Promise.all([
        api.people.list() as Promise<Person[]>,
        showFees ? api.finances.getStudentFees() : Promise.resolve([]),
      ]);
      setPeople(list.filter((p) => p.roles.some((r) => r.role === role)).map((p) => ({ ...p, parents: p.parents ?? [] })));
      const map = new Map<string, FeeSummary>();
      for (const f of fees) {
        map.set(f.userId, { totalDue: f.totalDue, overdueAmount: f.overdueAmount, overdueCount: f.overdueCount });
      }
      setFeeMap(map);
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Failed to load the roster.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return people.filter((p) => {
      const matchesSearch = !term || p.name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term);
      if (!matchesSearch) return false;
      if (showFees && gradeFilter !== 'ALL') {
        if (gradeFilter === 'NONE' ? p.gradeId !== null : p.gradeId !== gradeFilter) return false;
      }
      if (!showFees || feeFilter === 'ALL') return true;
      const fee = feeMap.get(p.id);
      if (feeFilter === 'OVERDUE') return (fee?.overdueAmount ?? 0) > 0;
      if (feeFilter === 'DUE') return (fee?.totalDue ?? 0) > 0;
      return true;
    });
  }, [people, search, showFees, feeFilter, gradeFilter, feeMap]);

  // Distinct grades present among these students, for the filter dropdown.
  const gradeOptions = useMemo(() => {
    const map = new Map<string, string>();
    people.forEach((p) => { if (p.gradeId && p.gradeName) map.set(p.gradeId, p.gradeName); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [people]);

  const branchesRepresented = useMemo(() => {
    const names = new Set<string>();
    people.forEach((p) => p.roles.forEach((r) => r.branchName && names.add(r.branchName)));
    return names.size;
  }, [people]);

  const overdueStudents = useMemo(
    () => (showFees ? people.filter((p) => (feeMap.get(p.id)?.overdueAmount ?? 0) > 0).length : 0),
    [people, feeMap, showFees]
  );

  const colCount = showFees ? 6 : 4;

  return (
    <div className="people-page">
      <div className="people-header">
        <div>
          <h1 className="people-title">{title}</h1>
          <p className="people-subtitle">{subtitle}</p>
        </div>
        <Button variant="outline" onClick={() => void loadPeople()} disabled={isLoading} style={{ height: '42px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>refresh</span>
          Refresh
        </Button>
      </div>

      {errorMsg ? <StatusBadge variant="error">{errorMsg}</StatusBadge> : null}

      <div className="people-stats">
        <div className="people-stat" style={{ ['--stat-accent' as string]: 'var(--color-primary)' }}>
          <span className="people-stat-value">{people.length}</span>
          <span className="people-stat-label">Total {role === 'Student' ? 'Students' : 'Teachers'}</span>
        </div>
        <div className="people-stat" style={{ ['--stat-accent' as string]: 'var(--color-info)' }}>
          <span className="people-stat-value">{branchesRepresented}</span>
          <span className="people-stat-label">Branches</span>
        </div>
        {showFees ? (
          <div className="people-stat" style={{ ['--stat-accent' as string]: overdueStudents > 0 ? 'var(--color-error)' : 'var(--color-success)' }}>
            <span className="people-stat-value">{overdueStudents}</span>
            <span className="people-stat-label">Fee Overdue</span>
          </div>
        ) : (
          <div className="people-stat" style={{ ['--stat-accent' as string]: 'var(--color-success)' }}>
            <span className="people-stat-value">{people.filter((p) => p.status === 'ACTIVE').length}</span>
            <span className="people-stat-label">Active</span>
          </div>
        )}
      </div>

      <div className="people-toolbar">
        <div className="people-search">
          <span className="material-symbols-outlined">search</span>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…" />
        </div>
        {showFees ? (
          <select className="people-filter" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
            <option value="ALL">All grades</option>
            {gradeOptions.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
            <option value="NONE">No grade set</option>
          </select>
        ) : null}
        {showFees ? (
          <select className="people-filter" value={feeFilter} onChange={(e) => setFeeFilter(e.target.value as 'ALL' | 'OVERDUE' | 'DUE')}>
            <option value="ALL">All fee status</option>
            <option value="OVERDUE">Overdue only</option>
            <option value="DUE">Any dues</option>
          </select>
        ) : null}
      </div>

      <div className="people-table-wrap">
        <div className="people-table-scroll">
          <table className="people-table">
            <thead>
              <tr>
                <th>{role}</th>
                {showFees ? <th>Grade</th> : null}
                <th>Branch</th>
                {showFees ? <th>Fees</th> : null}
                <th>Status</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount}>
                    <div className="people-empty">
                      <span className="material-symbols-outlined">{role === 'Student' ? 'school' : 'badge'}</span>
                      {isLoading ? 'Loading…' : people.length === 0 ? emptyText : 'No matches for your filters.'}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((person) => {
                  const branchNames = Array.from(new Set(person.roles.map((r) => r.branchName).filter(Boolean) as string[]));
                  return (
                    <tr key={person.id} role="button" tabIndex={0} aria-label={`Open ${person.name}'s profile`} onClick={() => setSelectedUserId(person.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedUserId(person.id); } }} style={{ cursor: 'pointer' }}>
                      <td>
                        <div className="people-person">
                          <div className="people-avatar">{initials(person.name)}</div>
                          <div>
                            <div className="people-person-name">{person.name}</div>
                            <div className="people-person-email">{person.email}</div>
                            {role === 'Student' ? <div className="people-person-email">{person.phone || 'No phone'} · Parent: {person.parents?.[0] ? `${person.parents[0].name} · ${person.parents[0].phone || 'no phone'} · ${person.parents[0].email}` : 'Not linked'}</div> : null}
                          </div>
                        </div>
                      </td>
                      {showFees ? (
                        <td>
                          {person.gradeName ? <span className="people-role-tag">{person.gradeName}</span> : <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>—</span>}
                        </td>
                      ) : null}
                      <td>
                        <span style={{ fontSize: '13.5px', color: branchNames.length ? 'var(--text)' : 'var(--text-muted)' }}>
                          {branchNames.length ? branchNames.join(', ') : '—'}
                        </span>
                      </td>
                      {showFees ? <td><FeeBadge fee={feeMap.get(person.id)} /></td> : null}
                      <td>
                        <StatusBadge variant={person.status === 'ACTIVE' ? 'success' : 'warning'}>{person.status}</StatusBadge>
                      </td>
                      <td>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{new Date(person.createdAt).toLocaleDateString()}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedUserId ? <UserProfileDrawer userId={selectedUserId} onClose={() => setSelectedUserId('')} onChanged={() => void loadPeople()} /> : null}
    </div>
  );
}

export function AcademicStudents() {
  return (
    <AcademicRoster
      role="Student"
      title="Students"
      subtitle="Every enrolled student across your branches — with fee status at a glance."
      emptyText="No students yet. Add them from Staff & Students or a branch manager can enrol them."
      showFees
    />
  );
}

export function AcademicTeachers() {
  return (
    <AcademicRoster
      role="Teacher"
      title="Teachers"
      subtitle="Teaching staff across your branches."
      emptyText="No teachers yet. Add them from Staff & Students."
    />
  );
}
