import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../components/ui/Toast';
import { UserProfileDrawer } from '../components/UserProfileDrawer';
import { api } from '../services/api';

interface PersonRole {
  role: string;
  branchId: string | null;
  branchName: string | null;
}

interface Person {
  id: string;
  studentId?: string | null;
  name: string;
  email: string;
  status: string;
  roles: PersonRole[];
  createdAt: string;
}

interface Capabilities {
  isTenantAdmin: boolean;
  isBranchAdmin: boolean;
  canManagePeople: boolean;
  creatableRoles: string[];
  manageableBranches: Array<{ id: string; name: string }>;
}

interface CreatedCredentials {
  name: string;
  email: string;
  role: string;
  branch: string;
  temporaryPassword: string;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  branchId: string;
  studentId: string;
  contractType: 'FIXED' | 'HOUR_RATE';
  baseMonthlySalary: string;
  hourlyRate: string;
}

const EMPTY_FORM: FormState = {
  firstName: '', lastName: '', email: '', phone: '', role: '', branchId: '', studentId: '',
  contractType: 'FIXED', baseMonthlySalary: '', hourlyRate: '',
};

// Categorize a role for the stat strip.
const STAFF_ROLES = ['Teacher', 'Accountant', 'Receptionist', 'Janitor'];
const SUPPORT_ROLES = ['Accountant', 'Receptionist', 'Janitor'];
const DIRECTORY_ROLES = ['Tenant Admin', 'Branch Admin', ...STAFF_ROLES, 'Parent'];

function initials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase())
      .join('')
      .slice(0, 2) || '??'
  );
}

function primaryRole(person: Person): string {
  const order = ['Branch Admin', 'Teacher', 'Accountant', 'Receptionist', 'Janitor', 'Student', 'Parent', 'Tenant Admin'];
  const names = person.roles.map((r) => r.role);
  return order.find((r) => names.includes(r)) ?? names[0] ?? '';
}

// Ordered role groups for the sectioned directory view.
interface RoleGroup {
  label: string;
  icon: string;
  roles: string[];
  link?: string;
}
const ROLE_GROUPS: RoleGroup[] = [
  { label: 'Administration', icon: 'shield_person', roles: ['Tenant Admin'] },
  { label: 'Branch Managers', icon: 'manage_accounts', roles: ['Branch Admin'] },
  { label: 'Teachers', icon: 'badge', roles: ['Teacher'], link: '/tenant/teachers' },
  { label: 'Support Staff', icon: 'engineering', roles: SUPPORT_ROLES },
  { label: 'Parents', icon: 'family_restroom', roles: ['Parent'] },
];

function groupPeople(list: Person[]): Array<{ group: RoleGroup; members: Person[] }> {
  return ROLE_GROUPS.map((group) => ({
    group,
    members: list.filter((person) => group.roles.includes(primaryRole(person))),
  })).filter((section) => section.members.length > 0);
}

export function PeopleDirectory() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [branchFilter, setBranchFilter] = useState('ALL');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [credentials, setCredentials] = useState<CreatedCredentials[]>([]);
  const [copied, setCopied] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const PREVIEW_LIMIT = 5;

  const loadData = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const [capabilities, list] = await Promise.all([
        api.people.capabilities(),
        api.people.list(),
      ]);
      setCaps(capabilities);
      setPeople(list as Person[]);
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Failed to load the directory.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const location = useLocation();
  const isBranchStaff = location.pathname.includes('/branch/staff');

  const directoryPeople = useMemo(() => people.filter((person) => person.roles.some((role) =>
    isBranchStaff ? STAFF_ROLES.includes(role.role) : DIRECTORY_ROLES.includes(role.role)
  )), [people, isBranchStaff]);

  const stats = useMemo(() => {
    const roles = directoryPeople.flatMap((p) => p.roles.map((r) => r.role));
    return {
      total: directoryPeople.length,
      managers: roles.filter((r) => r === 'Branch Admin').length,
      teachers: roles.filter((r) => r === 'Teacher').length,
      parents: roles.filter((r) => r === 'Parent').length,
      staff: roles.filter((r) => SUPPORT_ROLES.includes(r)).length,
    };
  }, [directoryPeople]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return directoryPeople.filter((person) => {
      const matchesSearch =
        !term || person.name.toLowerCase().includes(term) || person.email.toLowerCase().includes(term);
      const matchesRole = roleFilter === 'ALL' || person.roles.some((r) => r.role === roleFilter);
      const matchesBranch =
        branchFilter === 'ALL' || person.roles.some((r) => r.branchId === branchFilter);
      return matchesSearch && matchesRole && matchesBranch;
    });
  }, [directoryPeople, search, roleFilter, branchFilter]);

  const roleOptions = useMemo(() => {
    const set = new Set(directoryPeople.flatMap((p) => p.roles.map((r) => r.role)).filter((role) =>
      isBranchStaff ? STAFF_ROLES.includes(role) : DIRECTORY_ROLES.includes(role)
    ));
    return Array.from(set);
  }, [directoryPeople, isBranchStaff]);

  const grouped = useMemo(() => groupPeople(filtered), [filtered]);
  const linkableStudents = useMemo(() => people.filter((person) =>
    person.studentId &&
    person.roles.some((role) => role.role === 'Student' && (!form.branchId || role.branchId === form.branchId))
  ), [people, form.branchId]);

  const openDrawer = () => {
    const branches = caps?.manageableBranches ?? [];
    setForm({
      ...EMPTY_FORM,
      role: caps?.creatableRoles.find((role) => DIRECTORY_ROLES.includes(role)) ?? '',
      branchId: branches.length === 1 ? branches[0].id : '',
    });
    setDrawerOpen(true);
  };

  const setField = <K extends keyof FormState>(field: K, value: FormState[K]) => setForm((c) => ({ ...c, [field]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      showToast('First name, last name, and email are required.', 'error');
      return;
    }
    if (!form.role) {
      showToast('Select a role.', 'error');
      return;
    }
    if (!form.branchId) {
      showToast('Select a branch.', 'error');
      return;
    }
    if (form.role === 'Parent' && !form.studentId) {
      showToast('Select the student linked to this parent.', 'error');
      return;
    }
    const isStaff = STAFF_ROLES.includes(form.role);
    const compensationAmount = Number(form.contractType === 'FIXED' ? form.baseMonthlySalary : form.hourlyRate);
    if (isStaff && (!Number.isFinite(compensationAmount) || compensationAmount <= 0)) {
      showToast(form.contractType === 'FIXED' ? 'Enter a base monthly salary greater than zero.' : 'Enter an hourly rate greater than zero.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        branchId: form.branchId,
      };
      
      const branchName = caps?.manageableBranches.find((b) => b.id === form.branchId)?.name ?? '';
      const creds: CreatedCredentials[] = [];

      const result = form.role === 'Branch Admin'
        ? await api.people.createBranchAdmin(payload)
        : await api.people.create({
          ...payload,
          role: form.role,
          studentId: form.role === 'Parent' ? form.studentId : undefined,
          ...(isStaff ? {
            contractType: form.contractType,
            baseMonthlySalary: form.contractType === 'FIXED' ? compensationAmount : undefined,
            hourlyRate: form.contractType === 'HOUR_RATE' ? compensationAmount : undefined,
          } : {}),
        });

      creds.push({
        name: `${payload.firstName} ${payload.lastName}`,
        email: result.user.email,
        role: form.role,
        branch: branchName,
        temporaryPassword: result.temporaryPassword,
      });

      setCredentials(creds);
      setCopied(false);
      setDrawerOpen(false);
      showToast(`${form.role} created successfully.`, 'success');
      await loadData();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Failed to create the user.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    if (credentials.length === 0) return;
    try {
      const text = credentials.map(c => `TMS login for ${c.name} (${c.role})\nEmail: ${c.email}\nTemporary password: ${c.temporaryPassword}`).join('\n\n');
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Failed to copy credentials to clipboard.', 'error');
    }
  };

  const singleBranch = (caps?.manageableBranches.length ?? 0) <= 1;

  return (
    <div className="people-page">
      <div className="people-header">
        <div>
          <h1 className="people-title">{isBranchStaff ? 'Staff' : 'Staff & Parents'}</h1>
          <p className="people-subtitle">
            {caps?.isTenantAdmin
              ? 'Manage staff and parent accounts across every center.'
              : 'Add and manage staff in your branch.'}
          </p>
        </div>
        {caps?.canManagePeople ? (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Button onClick={openDrawer} style={{ height: '42px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>person_add</span>
              Add Person
            </Button>
          </div>
        ) : null}
      </div>

      {errorMsg ? <StatusBadge variant="error">{errorMsg}</StatusBadge> : null}

      <div className="people-stats">
        <div className="people-stat" style={{ ['--stat-accent' as string]: 'var(--color-primary)' }}>
          <span className="people-stat-value">{stats.total}</span>
          <span className="people-stat-label">Total People</span>
        </div>
        {caps?.isTenantAdmin ? (
          <div className="people-stat" style={{ ['--stat-accent' as string]: 'var(--color-accent)' }}>
            <span className="people-stat-value">{stats.managers}</span>
            <span className="people-stat-label">Branch Managers</span>
          </div>
        ) : null}
        <div className="people-stat" style={{ ['--stat-accent' as string]: 'var(--color-info)' }}>
          <span className="people-stat-value">{stats.teachers}</span>
          <span className="people-stat-label">Teachers</span>
        </div>
        <div className="people-stat" style={{ ['--stat-accent' as string]: 'var(--color-success)' }}>
          <span className="people-stat-value">{stats.parents}</span>
          <span className="people-stat-label">Parents</span>
        </div>
        <div className="people-stat" style={{ ['--stat-accent' as string]: 'var(--color-warning)' }}>
          <span className="people-stat-value">{stats.staff}</span>
          <span className="people-stat-label">Support Staff</span>
        </div>
      </div>

      <div className="people-toolbar">
        <div className="people-search">
          <span className="material-symbols-outlined">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
          />
        </div>
        <select className="people-filter" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="ALL">All roles</option>
          {roleOptions.map((role) => (
            <option key={role} value={role}>{role}</option>
          ))}
        </select>
        {caps && !singleBranch ? (
          <select className="people-filter" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="ALL">All branches</option>
            {caps.manageableBranches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        ) : null}
        <Button variant="outline" onClick={() => void loadData()} disabled={isLoading} style={{ height: '42px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>refresh</span>
          Refresh
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="pd-empty">
          <span className="material-symbols-outlined">group_off</span>
          <p>{isLoading ? 'Loading directory…' : directoryPeople.length === 0 ? 'No staff or parents yet. Add your first person.' : 'No matches for your filters.'}</p>
        </div>
      ) : (
        <div className="pd-dashboard">
          {grouped.map(({ group, members }) => {
            const preview = members.slice(0, PREVIEW_LIMIT);
            const overflow = members.length - PREVIEW_LIMIT;
            const isClickable = !!group.link;
            return (
              <div
                key={group.label}
                className={`pd-card ${isClickable ? 'pd-card--clickable' : ''}`}
                onClick={() => { if (isClickable) navigate(group.link!); }}
                role={isClickable ? "button" : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={(e) => { if (isClickable && e.key === 'Enter') navigate(group.link!); }}
              >
                <div className="pd-card-head">
                  <span className="material-symbols-outlined">{group.icon}</span>
                  <span className="pd-card-title">{group.label}</span>
                  <span className="pd-card-count">{members.length}</span>
                </div>
                <div className="pd-card-body">
                  {preview.map((person) => (
                    <button type="button" key={person.id} className="pd-person pd-person--preview" aria-label={`Open ${person.name}'s profile`} onClick={(e) => { e.stopPropagation(); setSelectedUserId(person.id); }}>
                      <div className="people-avatar pd-av">{initials(person.name)}</div>
                      <div className="pd-info">
                        <span className="pd-name">{person.name}</span>
                        <span className="pd-meta">{person.email}</span>
                      </div>
                      <StatusBadge variant={person.status === 'ACTIVE' ? 'success' : 'warning'}>{person.status}</StatusBadge>
                    </button>
                  ))}
                </div>
                {isClickable && (
                  <div className="pd-card-footer">
                    <span>{overflow > 0 ? `View all ${members.length} ${group.label.toLowerCase()}` : `Open ${group.label.toLowerCase()}`}</span>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedUserId ? <UserProfileDrawer userId={selectedUserId} onClose={() => setSelectedUserId('')} onChanged={() => void loadData()} /> : null}

      {drawerOpen ? (
        <>
          <div className="people-drawer-overlay" onClick={() => setDrawerOpen(false)} />
          <aside className="people-drawer" role="dialog" aria-modal="true">
            <div className="people-drawer-head">
              <div>
                <h2>Add Person</h2>
                <p>They receive a one-time temporary password to sign in and set their own.</p>
              </div>
              <button type="button" className="people-drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
              <div className="people-drawer-body">
                <div className="people-field">
                  <label id="people-role-label">Role</label>
                  <div className="people-role-picker">
                    {(caps?.creatableRoles ?? []).filter((role) => DIRECTORY_ROLES.includes(role)).map((role) => (
                      <button
                        key={role}
                        type="button"
                        className={`people-role-chip${form.role === role ? ' people-role-chip--active' : ''}`}
                        onClick={() => setForm((current) => ({ ...current, role, studentId: '', contractType: 'FIXED', baseMonthlySalary: '', hourlyRate: '' }))}
                        aria-pressed={form.role === role}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="people-field-row">
                  <div className="people-field">
                    <label htmlFor="people-first-name">First name</label>
                    <input id="people-first-name" autoComplete="given-name" value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} placeholder="Bishnu" required />
                  </div>
                  <div className="people-field">
                    <label htmlFor="people-last-name">Last name</label>
                    <input id="people-last-name" autoComplete="family-name" value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} placeholder="Thapa" required />
                  </div>
                </div>

                <div className="people-field">
                  <label htmlFor="people-email">Email</label>
                  <input id="people-email" type="email" autoComplete="email" spellCheck={false} value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="name@sanskardip.edu.np" required />
                </div>

                <div className="people-field">
                  <label htmlFor="people-phone">Phone <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>(optional)</span></label>
                  <input id="people-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="98XXXXXXXX" inputMode="tel" />
                </div>

                <div className="people-field">
                  <label htmlFor="people-branch">Branch</label>
                  {singleBranch && caps?.manageableBranches[0] ? (
                    <input id="people-branch" value={caps.manageableBranches[0].name} readOnly />
                  ) : (
                    <select id="people-branch" value={form.branchId} onChange={(e) => setField('branchId', e.target.value)} required>
                      <option value="">Select a branch…</option>
                      {(caps?.manageableBranches ?? []).map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {STAFF_ROLES.includes(form.role) ? (
                  <fieldset className="people-field" style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend style={{ fontWeight: 700, marginBottom: 8 }}>Compensation</legend>
                    <small style={{ display: 'block', marginBottom: 12 }}>Payroll uses this contract and never substitutes a default salary.</small>
                    <div className="people-field-row">
                      <div className="people-field">
                        <label htmlFor="people-contract-type">Contract type</label>
                        <select id="people-contract-type" value={form.contractType} onChange={(e) => setField('contractType', e.target.value as FormState['contractType'])} required>
                          <option value="FIXED">Fixed monthly salary</option>
                          <option value="HOUR_RATE">Hourly, from recorded session minutes</option>
                        </select>
                      </div>
                      <div className="people-field">
                        {form.contractType === 'FIXED' ? (
                          <>
                            <label htmlFor="people-base-salary">Base monthly salary (NPR)</label>
                            <input id="people-base-salary" type="text" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" value={form.baseMonthlySalary} onChange={(e) => setField('baseMonthlySalary', e.target.value)} placeholder="32000" aria-describedby="people-compensation-help" required />
                          </>
                        ) : (
                          <>
                            <label htmlFor="people-hourly-rate">Hourly rate (NPR)</label>
                            <input id="people-hourly-rate" type="text" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" value={form.hourlyRate} onChange={(e) => setField('hourlyRate', e.target.value)} placeholder="500" aria-describedby="people-compensation-help" required />
                          </>
                        )}
                        <small id="people-compensation-help">Required. Enter the agreed gross rate before adjustments.</small>
                      </div>
                    </div>
                  </fieldset>
                ) : null}

                {form.role === 'Parent' ? (
                  <div className="people-field">
                    <label htmlFor="people-linked-student">Linked student</label>
                    <select id="people-linked-student" value={form.studentId} onChange={(e) => setField('studentId', e.target.value)} required>
                      <option value="">Select the parent’s child…</option>
                      {linkableStudents.map((student) => (
                        <option key={student.studentId!} value={student.studentId!}>{student.name} · {student.email}</option>
                      ))}
                    </select>
                    {linkableStudents.length === 0 ? <small>No students are available in the selected branch.</small> : null}
                  </div>
                ) : null}
              </div>

              <div className="people-drawer-foot">
                <Button type="submit" disabled={isSaving} style={{ flex: 1 }}>
                  {isSaving ? 'Creating…' : 'Create Person'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setDrawerOpen(false)}>Cancel</Button>
              </div>
            </form>
          </aside>
        </>
      ) : null}

      {credentials.length > 0 ? (
        <div className="people-cred-overlay">
          <div className="people-cred-card" role="dialog" aria-modal="true" style={{ maxWidth: '500px', width: '100%' }}>
            <div className="people-cred-icon">
              <span className="material-symbols-outlined">check</span>
            </div>
            <h2>Accounts created successfully</h2>
            
            <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '4px', margin: '16px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {credentials.map((cred, idx) => (
                <div key={idx} style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <h3 style={{ fontSize: '15px', marginBottom: '8px', color: 'var(--color-primary)' }}>{cred.role} · {cred.name}</h3>
                  <div className="people-cred-box" style={{ margin: 0 }}>
                    <div className="people-cred-row">
                      <span className="people-cred-key">Login email</span>
                      <span className="people-cred-val">{cred.email}</span>
                    </div>
                    <div className="people-cred-row">
                      <span className="people-cred-key">Temporary password</span>
                      <span className="people-cred-val people-cred-val--mono">{cred.temporaryPassword}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="people-cred-note">
              Share these credentials securely. The passwords are stored only as a hash and cannot be shown again.
            </p>

            <div style={{ display: 'flex', gap: '12px', marginTop: '18px' }}>
              <Button onClick={() => void handleCopy()} style={{ flex: 1 }}>
                {copied ? 'Copied ✓' : 'Copy Credentials'}
              </Button>
              <Button variant="outline" onClick={() => setCredentials([])} style={{ flex: 1 }}>Done</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
