import { useEffect, useState } from 'react';
import { StatusBadge } from './ui/StatusBadge';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import { StudentAnalytics } from './StudentAnalytics';
import { api } from '../services/api';
import { toBsLabel } from '../utils/nepaliDate';
import { InvoiceDocumentDialog, type InvoiceDocumentData } from './InvoiceDocument';
import { StudentProfileDrawerContent } from './StudentProfileDrawerContent';

interface UserProfileDrawerProps {
  userId: string;
  onClose: () => void;
  onChanged?: () => void;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  createdAt: string;
  institutionName: string;
  photoUrl: string | null;
  roles: Array<{ role: string; branchName: string | null }>;
  detail: {
    student?: {
      admissionNumber: string | null;
      admissionDate: string;
      admissionRecord: Record<string, any> | null;
      emergencyContact: string;
      studentId: string;
      grade: string | null;
      gradeTuition: number;
      monthlyFee: number;
      guardians: Array<{ userId: string; name: string; email: string; phone: string; status: string }>;
      enrollments: Array<{ id: string; courseName: string; className: string; status: string; accessStatus: string; validFrom: string | null; validUntil: string | null; category: 'ACADEMIC' | 'ACTIVITY'; fee: number; billingHistory?: { paid: number; due: number } }>;
      billing: { billingMode: 'GRADE' | 'SUBJECT' | null; setupStatus: 'READY' | 'INCOMPLETE'; blockers: string[]; recurringTotal: number; lines: Array<{ type: 'GRADE' | 'SUBJECT' | 'ACTIVITY'; sourceId: string; enrollmentId?: string; label: string; className?: string; amount: number; status: string }> };
      enrollmentAccess: { status: 'PENDING' | 'ACTIVE' | 'EXPIRED'; validFrom: string | null; validUntil: string | null };
      fees: { totalBilled: number; totalPaid: number; totalDue: number; overdueCount: number; invoices: Array<{ id: string; invoiceType: 'ADMISSION' | 'TUITION' | 'SUBJECT' | 'ACTIVITY'; amount: number; discount: number; fine: number; panNumberSnapshot: string; vatRateSnapshot: number; lineItems: Array<{ label: string; amount: number }>; transactionId: string | null; createdAt: string; netPayable: number; status: string; dueDate: string; paymentDate: string | null; billingCycleStart: string; billingCycleEnd: string; branchName: string }> };
      futureBilling?: { projectedAnnualFee: number; nextInvoiceDate: string };
      attendance: Record<string, number>;
    };
    parent?: {
      children: Array<{ studentId: string; name: string; activeEnrollments: number; totalPaid: number; totalDue: number; overdueCount: number }>;
    };
    teacher?: {
      assignedClasses: Array<{ className: string; courseName: string; branchName: string; gradeName: string | null; enrollmentCount: number; syllabusProgress?: number }>;
      gradesTaught: string[];
      totalSessions: number;
      pendingUpdates: number;
      payroll?: { totalPaid: number; lastMonthPaid: number; nextMonthProjected: number; extraClassesPayroll?: number; history: Array<{ month: string; amount: number; status: string }> };
      timetable?: Array<{ id: string; day: string; time: string; subject: string; room: string }>;
    };
    staff?: { designation: string; contractType: 'FIXED' | 'HOUR_RATE'; joiningDate: string; salaryStructure: { baseMonthlySalary?: number; hourlyRate?: number }; performanceScore?: number; hrAlerts?: Array<{ type: string; message: string; severity: 'warning' | 'error' | 'info' }> };
  };
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map((p) => p[0]?.toUpperCase()).join('').slice(0, 2) || '??';
}

function hasStudentDetail(profile: Profile): boolean {
  return Boolean(profile.detail.student);
}

function money(n: number): string {
  return `NPR ${n.toLocaleString()}`;
}

const sectionTitle: React.CSSProperties = { fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' };
const rowCard: React.CSSProperties = { padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--color-bg)' };
const editInput: React.CSSProperties = { flex: 1, width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--bg-background)', color: 'var(--text-foreground)', fontFamily: 'inherit', fontSize: '13.5px', outline: 'none' };

function FeeStat({ label, value, tone }: { label: string; value: string; tone?: 'due' | 'paid' }) {
  const color = tone === 'due' ? 'var(--color-error)' : tone === 'paid' ? 'var(--color-success)' : 'var(--text)';
  return (
    <div style={{ flex: 1, minWidth: '96px', ...rowCard }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '16px', fontWeight: 700, color, marginTop: '5px' }}>{value}</div>
    </div>
  );
}

export function UserProfileDrawer({ userId, onClose, onChanged }: UserProfileDrawerProps) {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [grades, setGrades] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', gradeName: '', contractType: 'FIXED' as 'FIXED' | 'HOUR_RATE', compensationAmount: '' });
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [activities, setActivities] = useState<Array<{ id: string; name: string; classes: Array<{ id: string; name: string }> }>>([]);
  const [enrollCourse, setEnrollCourse] = useState('');
  const [enrollClass, setEnrollClass] = useState('');
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDocumentData | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const openEnroll = async () => {
    setEnrollOpen(true);
    if (activities.length === 0) {
      try {
        const [courses, classes] = await Promise.all([api.academics.listCourses(), api.academics.listClasses()]);
        // Extra activities = courses without a grade (opt-in, e.g. Drum Class).
        const extra = (courses as Array<{ id: string; name: string; gradeId: string | null }>).filter((c) => !c.gradeId);
        setActivities(extra.map((c) => ({
          id: c.id, name: c.name,
          classes: (classes as Array<{ id: string; name: string; courseId: string }>).filter((k) => k.courseId === c.id).map((k) => ({ id: k.id, name: k.name })),
        })));
      } catch { /* ignore */ }
    }
  };

  const doEnroll = async () => {
    if (!profile?.detail.student || !enrollCourse || !enrollClass) return;
    setBusy(true);
    try {
      const r = await api.academics.enroll(profile.detail.student.studentId, enrollCourse, enrollClass);
      showToast(`Enrolled — +${money(r.monthlyDelta)}/mo.`, 'success');
      setEnrollOpen(false); setEnrollCourse(''); setEnrollClass('');
      reload(); onChanged?.();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Failed to enroll.', 'error');
    } finally { setBusy(false); }
  };

  const isStudent = Boolean(profile?.detail.student);

  const reload = () => {
    setIsLoading(true);
    setErrorMsg('');
    api.people.getProfile(userId)
      .then((data) => setProfile(data as Profile))
      .catch((error: unknown) => setErrorMsg(error instanceof Error ? error.message : 'Failed to load profile.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMsg('');
    setProfile(null);
    api.people.getProfile(userId)
      .then((data) => { if (active) setProfile(data as Profile); })
      .catch((error: unknown) => { if (active) setErrorMsg(error instanceof Error ? error.message : 'Failed to load profile.'); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose]);

  const startEdit = () => {
    if (!profile) return;
    const [firstName, ...rest] = profile.name.split(' ');
    const staff = profile.detail.staff;
    setForm({
      firstName,
      lastName: rest.join(' '),
      phone: profile.phone,
      gradeName: profile.detail.student?.grade ?? '',
      contractType: staff?.contractType ?? 'FIXED',
      compensationAmount: String(staff?.contractType === 'HOUR_RATE' ? staff.salaryStructure.hourlyRate ?? '' : staff?.salaryStructure.baseMonthlySalary ?? ''),
    });
    if (isStudent && grades.length === 0) api.grades.list().then((g) => setGrades(g as Array<{ id: string; name: string }>)).catch(() => {});
    setEditing(true);
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      const changes: { firstName: string; lastName: string; phone: string; gradeId?: string | null; contractType?: 'FIXED' | 'HOUR_RATE'; baseMonthlySalary?: number; hourlyRate?: number } = {
        firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim(),
      };
      if (isStudent) {
        const g = grades.find((x) => x.name === form.gradeName);
        changes.gradeId = form.gradeName ? (g?.id ?? null) : null;
      }
      if (profile?.detail.staff) {
        const amount = Number(form.compensationAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
          showToast(form.contractType === 'FIXED' ? 'Enter a base monthly salary greater than zero.' : 'Enter an hourly rate greater than zero.', 'error');
          setBusy(false);
          return;
        }
        changes.contractType = form.contractType;
        if (form.contractType === 'FIXED') changes.baseMonthlySalary = amount;
        else changes.hourlyRate = amount;
      }
      const result = await api.people.update(userId, changes);
      if (result.droppedEnrollments && result.droppedEnrollments > 0) {
        showToast(`Grade updated — ${result.droppedEnrollments} old-grade enrolment(s) completed. Enrol in new-grade courses to set the new monthly fee.`, 'info');
      } else {
        showToast('Profile updated.', 'success');
      }
      setEditing(false);
      reload();
      onChanged?.();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Failed to update.', 'error');
    } finally { setBusy(false); }
  };

  const updateStudentPhoto = async (file: File) => {
    const studentId = profile?.detail.student?.studentId;
    if (!studentId) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5_000_000) {
      showToast('Choose a PNG, JPEG, or WebP photo under 5 MB.', 'error');
      return;
    }
    setPhotoBusy(true);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the photo.'));
        reader.onerror = () => reject(new Error('Could not read the photo.'));
        reader.readAsDataURL(file);
      });
      const result = await api.people.updateStudentPhoto(studentId, image);
      setProfile((current) => current ? { ...current, photoUrl: result.photoUrl } : current);
      showToast('Student photo updated.', 'success');
      onChanged?.();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Failed to update the student photo.', 'error');
    } finally {
      setPhotoBusy(false);
    }
  };

  const removeStudentPhoto = async () => {
    const studentId = profile?.detail.student?.studentId;
    if (!studentId || !window.confirm('Remove this student photo from the profile and Digital ID?')) return;
    setPhotoBusy(true);
    try {
      await api.people.removeStudentPhoto(studentId);
      setProfile((current) => current ? { ...current, photoUrl: null } : current);
      showToast('Student photo removed.', 'success');
      onChanged?.();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Failed to remove the student photo.', 'error');
    } finally {
      setPhotoBusy(false);
    }
  };

  const toggleActive = async (confirmationHandled = false) => {
    if (!profile) return;
    const reactivate = profile.status !== 'ACTIVE';
    if (!reactivate && !confirmationHandled && !window.confirm(`Deactivate ${profile.name}? They lose access and active enrolments are dropped.`)) return;
    setBusy(true);
    try {
      if (reactivate) await api.people.update(userId, { status: 'ACTIVE' });
      else await api.people.deactivate(userId);
      showToast(reactivate ? 'User reactivated.' : 'User deactivated.', 'success');
      reload();
      onChanged?.();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Failed to change status.', 'error');
    } finally { setBusy(false); }
  };

  const handleResetPassword = async (confirmationHandled = false) => {
    if (!profile) return;
    if (!confirmationHandled && !window.confirm(`Are you sure you want to reset the password for ${profile.name}?`)) return;
    setBusy(true);
    try {
      const response = await api.people.resetPassword(userId);
      setTempPassword(response.temporaryPassword);
      setResetModalOpen(true);
      showToast('Password reset successfully.', 'success');
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Failed to reset password.', 'error');
    } finally { setBusy(false); }
  };

  const unenroll = async (enrollmentId: string) => {
    setBusy(true);
    try {
      await api.academics.unenroll(enrollmentId);
      showToast('Student unenrolled.', 'success');
      reload();
      onChanged?.();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Failed to unenroll.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" className="people-drawer-overlay" onClick={onClose} aria-label="Close student profile" />
      <aside className="people-drawer" role="dialog" aria-modal="true" aria-labelledby="profile-drawer-title" style={{ width: '520px' }}>
        <div className="people-drawer-head">
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <div className={`people-avatar${profile?.photoUrl ? ' people-avatar--photo' : ''}`} style={{ width: '46px', height: '46px', fontSize: '15px' }}>
              {profile?.photoUrl ? <img src={profile.photoUrl} alt="" /> : profile ? initials(profile.name) : '…'}
            </div>
            <div>
              <h2 id="profile-drawer-title" style={{ fontSize: '18px' }}>{profile?.name ?? 'Loading…'}</h2>
              <p style={{ marginTop: '2px' }}>{profile?.email}</p>
            </div>
          </div>
          <button type="button" className="people-drawer-close" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="people-drawer-body">
          {isLoading ? (
            <div className="student-profile-skeleton" aria-label="Loading student profile" aria-busy="true"><i /><i /><i /><i /></div>
          ) : errorMsg ? (
            <div className="student-profile-load-error" role="alert"><span className="material-symbols-outlined" aria-hidden="true">cloud_off</span><strong>Couldn’t load this profile</strong><p>{errorMsg}</p><Button variant="outline" onClick={reload}>Try again</Button></div>
          ) : profile ? (
            <>
            {profile.detail.student ? (
              <div className="student-photo-editor" aria-busy={photoBusy}>
                <div><strong>Student photo</strong><span>Used on the student profile and Digital ID.</span></div>
                <div className="student-photo-editor__actions">
                  <label className="student-photo-upload">
                    {photoBusy ? 'Uploading…' : profile.photoUrl ? 'Replace photo' : 'Add photo'}
                    <input type="file" accept="image/png,image/jpeg,image/webp" disabled={photoBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void updateStudentPhoto(file); event.currentTarget.value = ''; }} />
                  </label>
                  {profile.photoUrl ? <Button variant="outline" disabled={photoBusy} onClick={() => void removeStudentPhoto()}>Remove</Button> : null}
                </div>
              </div>
            ) : null}
            {hasStudentDetail(profile) ? (
              <StudentProfileDrawerContent
                profile={profile}
                student={profile.detail.student!}
                busy={busy}
                editing={editing}
                grades={grades}
                form={form}
                setForm={setForm}
                onStartEdit={startEdit}
                onCancelEdit={() => setEditing(false)}
                onSaveEdit={saveEdit}
                onAnalytics={() => setShowAnalytics(true)}
                onResetPassword={() => handleResetPassword(true)}
                onToggleActive={() => toggleActive(true)}
                onViewInvoice={setSelectedInvoice}
                onRefresh={reload}
                onChanged={onChanged}
                showToast={showToast}
              />
            ) : (
            <>
              {/* Identity */}
              <div>
                <div style={sectionTitle}>Overview</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  {profile.roles.map((r, i) => (
                    <span key={i} className="people-role-tag">{r.role}{r.branchName ? ` · ${r.branchName}` : ''}</span>
                  ))}
                  {profile.detail.student?.grade ? <span className="people-role-tag">{profile.detail.student.grade}</span> : null}
                  <StatusBadge variant={profile.status === 'ACTIVE' ? 'success' : 'warning'}>{profile.status}</StatusBadge>
                </div>
                {editing ? (
                  <div style={{ ...rowCard, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} placeholder="First name" style={editInput} />
                      <input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} placeholder="Last name" style={editInput} />
                    </div>
                    <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" style={editInput} />
                    {profile.detail.staff ? (
                      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                        <legend style={{ fontSize: 12, fontWeight: 700 }}>Compensation</legend>
                        <label htmlFor="profile-contract-type" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Contract type</label>
                        <select id="profile-contract-type" value={form.contractType} onChange={(e) => setForm((f) => ({ ...f, contractType: e.target.value as 'FIXED' | 'HOUR_RATE', compensationAmount: '' }))} style={editInput}>
                          <option value="FIXED">Fixed monthly salary</option>
                          <option value="HOUR_RATE">Hourly, from confirmed session minutes</option>
                        </select>
                        <label htmlFor="profile-compensation-amount" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{form.contractType === 'FIXED' ? 'Base monthly salary (NPR)' : 'Hourly rate (NPR)'}</label>
                        <input id="profile-compensation-amount" type="text" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" value={form.compensationAmount} onChange={(e) => setForm((f) => ({ ...f, compensationAmount: e.target.value }))} placeholder={form.contractType === 'FIXED' ? '32000' : '500'} style={editInput} required />
                      </fieldset>
                    ) : null}
                    {isStudent ? (
                      <select value={form.gradeName} onChange={(e) => setForm((f) => ({ ...f, gradeName: e.target.value }))} style={editInput}>
                        <option value="">No grade</option>
                        {grades.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
                      </select>
                    ) : null}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button onClick={() => void saveEdit()} disabled={busy} style={{ flex: 1, minHeight: '36px', height: '36px' }}>Save</Button>
                      <Button variant="outline" onClick={() => setEditing(false)} style={{ minHeight: '36px', height: '36px' }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ ...rowCard, display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Phone</span><span>{profile.phone || '—'}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Member since</span><span>{new Date(profile.createdAt).toLocaleDateString()}</span></div>
                    {profile.detail.staff ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Designation</span><span>{profile.detail.staff.designation}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Contract</span><span>{profile.detail.staff.contractType}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>{profile.detail.staff.contractType === 'FIXED' ? 'Base monthly salary' : 'Hourly rate'}</span><span>{profile.detail.staff.contractType === 'FIXED' && profile.detail.staff.salaryStructure.baseMonthlySalary ? money(profile.detail.staff.salaryStructure.baseMonthlySalary) : profile.detail.staff.contractType === 'HOUR_RATE' && profile.detail.staff.salaryStructure.hourlyRate ? `${money(profile.detail.staff.salaryStructure.hourlyRate)}/hour` : 'Setup incomplete'}</span></div>
                        {profile.detail.staff.performanceScore !== undefined && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Performance Score</span>
                            <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>{profile.detail.staff.performanceScore}/100</span>
                          </div>
                        )}
                        {profile.detail.staff.hrAlerts && profile.detail.staff.hrAlerts.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                            {profile.detail.staff.hrAlerts.map((alert, idx) => (
                              <div key={idx} style={{ padding: '8px', borderRadius: '6px', fontSize: '12px', background: alert.severity === 'error' ? 'var(--color-error-soft)' : alert.severity === 'warning' ? 'var(--color-warning-soft)' : 'var(--color-info-soft)', color: alert.severity === 'error' ? 'var(--color-error)' : alert.severity === 'warning' ? 'var(--color-warning)' : 'var(--color-info)' }}>
                                <strong>{alert.type}:</strong> {alert.message}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
                {!editing ? (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                    {isStudent ? (
                      <Button onClick={() => setShowAnalytics(true)} style={{ minHeight: '36px', height: '36px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>insights</span> Analytics
                      </Button>
                    ) : null}
                    <Button variant="outline" onClick={startEdit} disabled={busy} style={{ minHeight: '36px', height: '36px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span> Edit
                    </Button>
                    <Button variant="outline" onClick={() => void handleResetPassword()} disabled={busy} style={{ minHeight: '36px', height: '36px', color: 'var(--color-primary)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>lock_reset</span> Reset Password
                    </Button>
                    <Button variant="outline" onClick={() => void toggleActive()} disabled={busy} style={{ minHeight: '36px', height: '36px', color: profile.status === 'ACTIVE' ? 'var(--color-error)' : 'var(--color-success)', borderColor: profile.status === 'ACTIVE' ? 'rgba(230,57,70,0.4)' : 'rgba(0,171,102,0.4)' }}>
                      {profile.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                ) : null}
              </div>

              {/* Parent → children + dues */}
              {profile.detail.parent ? (
                <div>
                  <div style={sectionTitle}>Children ({profile.detail.parent.children.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {profile.detail.parent.children.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No linked children.</p>
                    ) : (
                      profile.detail.parent.children.map((child) => (
                        <div key={child.studentId} style={rowCard}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '14px', fontWeight: 700 }}>{child.name}</span>
                            <StatusBadge variant={child.totalDue > 0 ? 'warning' : 'success'}>{child.totalDue > 0 ? 'Dues pending' : 'Cleared'}</StatusBadge>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                            <FeeStat label="Paid" value={money(child.totalPaid)} tone="paid" />
                            <FeeStat label="Due" value={money(child.totalDue)} tone="due" />
                            <FeeStat label="Classes" value={String(child.activeEnrollments)} />
                          </div>
                          {child.overdueCount > 0 ? (
                            <p style={{ fontSize: '12px', color: 'var(--color-error)', marginTop: '8px', fontWeight: 600 }}>{child.overdueCount} overdue invoice{child.overdueCount === 1 ? '' : 's'}</p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {/* Student → fees + enrollments + attendance */}
              {profile.detail.student ? (
                <>
                  <details className="student-profile-disclosure">
                    <summary><span><strong>Admission record</strong><small>{profile.detail.student.admissionNumber ?? 'No admission number'} · {new Date(profile.detail.student.admissionDate).toLocaleDateString('en-NP')}</small></span><span className="material-symbols-outlined" aria-hidden="true">expand_more</span></summary>
                    {profile.detail.student.admissionRecord ? (() => {
                      const record = profile.detail.student!.admissionRecord!;
                      const values: Array<[string, unknown]> = [
                        ['Admission number', profile.detail.student!.admissionNumber],
                        ['Admission date and time', new Date(profile.detail.student!.admissionDate).toLocaleString('en-NP')],
                        ['Date of birth', record.dateOfBirth], ['Gender', record.gender], ['Blood group', record.bloodGroup],
                        ['Nationality', record.nationality], ['School', record.school], ['Permanent address', record.permanentAddress],
                        ['Temporary address', record.temporaryAddress], ['Medical/accessibility notes', record.medicalNotes],
                        ['Father', record.fatherName], ["Father's phone", record.fatherPhone], ["Father's email", record.fatherEmail], ["Father's occupation", record.fatherOccupation],
                        ['Mother', record.motherName], ["Mother's phone", record.motherPhone], ["Mother's email", record.motherEmail], ["Mother's occupation", record.motherOccupation],
                        ['Optional parent / guardian', record.optionalParentName], ['Relationship', record.optionalParentRelationship], ['Optional parent phone', record.optionalParentPhone], ['Optional parent email', record.optionalParentEmail], ['Optional parent occupation', record.optionalParentOccupation],
                        ['Primary parent account', record.primaryParent], ['Emergency contact', record.emergencyContactName], ['Emergency phone', record.emergencyContactPhone], ['Emergency relationship', record.emergencyContactRelationship],
                        ['Admitted by', record.admittedBy?.name],
                      ];
                      return <dl style={{ ...rowCard, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px 16px', margin: 0 }}>{values.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</dt><dd style={{ margin: '4px 0 0', fontSize: 13.5, overflowWrap: 'anywhere' }}>{String(value)}</dd></div>)}</dl>;
                    })() : <div style={rowCard}><p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No detailed admission record was saved for this student.</p></div>}
                  </details>
                  <div>
                    <div style={sectionTitle}>Parents and guardians</div>
                    <div className="student-guardian-list">
                      {profile.detail.student.guardians.map((guardian) => (
                        <div key={guardian.userId}>
                          <span><strong>{guardian.name}</strong><small>{guardian.email}</small><small>{guardian.phone || 'No phone recorded'}</small></span>
                          <StatusBadge variant={guardian.status === 'ACTIVE' ? 'success' : 'warning'}>{guardian.status}</StatusBadge>
                        </div>
                      ))}
                      {!profile.detail.student.guardians.length ? <p>No parent or guardian account is linked.</p> : null}
                    </div>
                  </div>
                  <div>
                    <div style={sectionTitle}>Academic placement</div>
                    <div className="student-academic-list">
                      {profile.detail.student.enrollments.filter((enrollment) => enrollment.category === 'ACADEMIC').map((enrollment) => (
                        <div key={enrollment.id}><span><strong>{enrollment.courseName}</strong><small>{enrollment.className}{enrollment.validUntil ? ` · Valid until ${toBsLabel(enrollment.validUntil)} BS` : ''}</small></span><span><StatusBadge variant={enrollment.accessStatus === 'ACTIVE' ? 'success' : 'warning'}>{enrollment.accessStatus}</StatusBadge>{profile.detail.student!.billing.billingMode === 'SUBJECT' ? <b>{money(enrollment.fee)}/mo</b> : <b>Included</b>}</span></div>
                      ))}
                      {!profile.detail.student.enrollments.some((enrollment) => enrollment.category === 'ACADEMIC') ? <p>No academic class placement has been configured.</p> : null}
                    </div>
                  </div>
                  <div>
                    <div style={sectionTitle}>Fees</div>
                    {(() => {
                      const admissionInvoice = profile.detail.student!.fees.invoices.find((invoice) => invoice.invoiceType === 'ADMISSION');
                      const access = profile.detail.student!.enrollmentAccess;
                      return <div className="student-admission-payment">
                        <div><span className="material-symbols-outlined" aria-hidden="true">verified_user</span><span><strong>Admission payment</strong><small>One-time fee · separate from monthly tuition</small></span></div>
                        <div className="student-admission-payment__amount"><strong>{admissionInvoice ? money(admissionInvoice.netPayable) : 'Not invoiced'}</strong><StatusBadge variant={admissionInvoice?.status === 'PAID' ? 'success' : 'warning'}>{admissionInvoice?.status ?? 'PENDING'}</StatusBadge></div>
                        <dl>
                          <div><dt>Paid on</dt><dd>{admissionInvoice?.paymentDate ? `${toBsLabel(admissionInvoice.paymentDate)} BS` : 'Awaiting payment'}</dd></div>
                          <div><dt>Academic enrolment</dt><dd>{access.status === 'ACTIVE' ? 'Valid for one year' : access.status === 'EXPIRED' ? 'Expired' : 'Starts after payment'}</dd></div>
                          <div><dt>Valid from</dt><dd>{access.validFrom ? `${toBsLabel(access.validFrom)} BS` : '—'}</dd></div>
                          <div><dt>Valid until</dt><dd>{access.validUntil ? `${toBsLabel(access.validUntil)} BS` : '—'}</dd></div>
                        </dl>
                      </div>;
                    })()}
                    <div className={`student-billing-card${profile.detail.student.billing.setupStatus === 'INCOMPLETE' ? ' is-incomplete' : ''}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span><strong>Monthly billing plan</strong><small>{profile.detail.student.billing.billingMode === 'SUBJECT' ? 'Selected-subject billing' : 'Grade package billing'}</small></span>
                        <span><strong>{profile.detail.student.billing.setupStatus === 'READY' ? `${money(profile.detail.student.monthlyFee)}/mo` : 'Setup incomplete'}</strong><StatusBadge variant={profile.detail.student.billing.setupStatus === 'READY' ? 'success' : 'warning'}>{profile.detail.student.billing.setupStatus}</StatusBadge></span>
                      </div>
                      {profile.detail.student.billing.blockers.map((blocker) => <p key={blocker} role="alert">{blocker}</p>)}
                      <div className="student-billing-lines">{profile.detail.student.billing.lines.map((line) => <div key={`${line.type}-${line.sourceId}`}><span><b>{line.label}</b><small>{line.type === 'GRADE' ? 'Includes regular subjects' : line.className}</small></span><strong>{money(line.amount)}</strong></div>)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <FeeStat label="All invoiced" value={money(profile.detail.student.fees.totalBilled)} />
                      <FeeStat label="All paid" value={money(profile.detail.student.fees.totalPaid)} tone="paid" />
                      <FeeStat label="Outstanding" value={money(profile.detail.student.fees.totalDue)} tone="due" />
                    </div>

                    {profile.detail.student.billing.setupStatus === 'READY' && profile.detail.student.futureBilling ? (
                      <div style={{ ...rowCard, marginTop: '10px', background: 'rgba(21, 96, 189, 0.04)' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>1-Year Future Billing Projection</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)' }}>{money(profile.detail.student.futureBilling.projectedAnnualFee)}</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Next Invoice: {profile.detail.student.futureBilling.nextInvoiceDate}</span>
                        </div>
                      </div>
                    ) : profile.detail.student.billing.setupStatus === 'READY' ? (
                      <div style={{ ...rowCard, marginTop: '10px', background: 'rgba(21, 96, 189, 0.04)' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>1-Year Future Billing Projection</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)' }}>{money(profile.detail.student.monthlyFee * 12)}</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Calculated automatically</span>
                        </div>
                      </div>
                    ) : null}
                    {profile.detail.student.fees.invoices.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                        {profile.detail.student.fees.invoices.map((inv) => (
                          <div key={inv.id} style={{ ...rowCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{inv.invoiceType === 'ADMISSION' ? 'One-time admission fee' : inv.invoiceType === 'SUBJECT' ? 'Monthly subject tuition' : inv.invoiceType === 'ACTIVITY' ? 'Optional activity fee' : 'Monthly grade tuition'}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{money(inv.netPayable)} · {inv.status === 'PAID' && inv.paymentDate ? `Paid ${toBsLabel(inv.paymentDate)} BS` : `Due ${toBsLabel(inv.dueDate)} BS`}</div>
                            </div>
                            <div className="student-invoice-actions"><StatusBadge variant={inv.status === 'PAID' ? 'success' : inv.status === 'OVERDUE' ? 'error' : 'warning'}>{inv.status}</StatusBadge><button type="button" onClick={() => setSelectedInvoice({ id: inv.id, invoiceType: inv.invoiceType, status: inv.status, institutionName: profile.institutionName, panNumber: inv.panNumberSnapshot, vatRate: inv.vatRateSnapshot, studentName: profile.name, admissionNumber: profile.detail.student!.admissionNumber, gradeName: profile.detail.student!.grade, branchName: inv.branchName, issuedAt: inv.createdAt, dueDate: inv.dueDate, paymentDate: inv.paymentDate, billingCycleStart: inv.billingCycleStart, billingCycleEnd: inv.billingCycleEnd, transactionId: inv.transactionId, lines: inv.lineItems, discount: inv.discount, fine: inv.fine, netPayable: inv.netPayable })}><span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>View bill</button></div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={sectionTitle as React.CSSProperties}>Optional activities ({profile.detail.student.enrollments.filter((e) => e.category === 'ACTIVITY' && e.status === 'ACTIVE').length})</span>
                      {!enrollOpen ? (
                        <Button variant="outline" onClick={() => void openEnroll()} style={{ minHeight: '30px', height: '30px', padding: '4px 12px', fontSize: '12.5px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add</span> Enroll
                        </Button>
                      ) : null}
                    </div>
                    {enrollOpen ? (
                      <div style={{ ...rowCard, display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                        <select value={enrollCourse} onChange={(e) => { setEnrollCourse(e.target.value); setEnrollClass(''); }} style={editInput}>
                          <option value="">Select an activity…</option>
                          {activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        {enrollCourse ? (
                          <select value={enrollClass} onChange={(e) => setEnrollClass(e.target.value)} style={editInput}>
                            <option value="">Select a class/time…</option>
                            {activities.find((a) => a.id === enrollCourse)?.classes.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                          </select>
                        ) : null}
                        {enrollCourse && activities.find((a) => a.id === enrollCourse)?.classes.length === 0 ? (
                          <p style={{ fontSize: '12px', color: 'var(--color-warning)' }}>This activity has no class/time yet — add one under Timetables.</p>
                        ) : null}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Button onClick={() => void doEnroll()} disabled={busy || !enrollClass} style={{ flex: 1, minHeight: '34px', height: '34px' }}>Enroll</Button>
                          <Button variant="outline" onClick={() => setEnrollOpen(false)} style={{ minHeight: '34px', height: '34px' }}>Cancel</Button>
                        </div>
                        {activities.length === 0 ? <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No extra activities yet. Create an ungraded course (e.g. Drum Class) under Courses.</p> : null}
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {profile.detail.student.enrollments.filter((e) => e.category === 'ACTIVITY').length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No extra activities. Grade tuition covers all subjects.</p>
                      ) : (
                        profile.detail.student.enrollments.filter((e) => e.category === 'ACTIVITY').map((e) => (
                          <div key={e.id} style={{ ...rowCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <div>
                              <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{e.courseName}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{e.className}</div>
                              {e.billingHistory ? (
                                <div style={{ fontSize: '11px', color: 'var(--color-success)', marginTop: '2px' }}>
                                  Paid: {money(e.billingHistory.paid)} {e.billingHistory.due > 0 ? <span style={{ color: 'var(--color-error)' }}>· Due: {money(e.billingHistory.due)}</span> : ''}
                                </div>
                              ) : null}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <StatusBadge variant={e.status === 'ACTIVE' ? 'success' : e.status === 'BLOCKED' ? 'error' : 'info'}>{e.status}</StatusBadge>
                              <button type="button" onClick={() => void unenroll(e.id)} disabled={busy} aria-label="Unenroll" title="Unenroll" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', display: 'grid', placeItems: 'center', padding: '4px' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>person_remove</span>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : null}

              {/* Teacher → assigned classes + session stats */}
              {profile.detail.teacher ? (
                <div>
                  <div style={sectionTitle}>Teaching</div>
                  {profile.detail.teacher.gradesTaught.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                      {profile.detail.teacher.gradesTaught.map((g) => (
                        <span key={g} className="people-role-tag">{g}</span>
                      ))}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <FeeStat label="Classes" value={String(profile.detail.teacher.assignedClasses.length)} />
                    <FeeStat label="Sessions" value={String(profile.detail.teacher.totalSessions)} />
                    <FeeStat label="Pending logs" value={String(profile.detail.teacher.pendingUpdates)} tone={profile.detail.teacher.pendingUpdates > 0 ? 'due' : 'paid'} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {profile.detail.teacher.assignedClasses.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No classes assigned yet.</p>
                    ) : (
                      profile.detail.teacher.assignedClasses.map((c, i) => (
                        <div key={i} style={{ ...rowCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{c.className}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{c.courseName} · {c.branchName}</div>
                            {c.syllabusProgress !== undefined ? (
                              <div style={{ fontSize: '11px', color: 'var(--color-primary)', marginTop: '2px', fontWeight: 600 }}>
                                Syllabus Progress: {c.syllabusProgress}%
                              </div>
                            ) : null}
                          </div>
                          <StatusBadge variant="info">{c.enrollmentCount} enrolled</StatusBadge>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Teacher Payroll & Billing */}
                  <div style={{ marginTop: '16px' }}>
                    <div style={sectionTitle}>Payroll & Billing</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <FeeStat label="Total Paid" value={money(profile.detail.teacher.payroll?.totalPaid ?? 0)} tone="paid" />
                      <FeeStat label="Last Month" value={money(profile.detail.teacher.payroll?.lastMonthPaid ?? 0)} />
                    </div>
                    
                    <div style={{ ...rowCard, marginTop: '10px', background: 'rgba(21, 96, 189, 0.04)' }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>Next Month Projected Payroll</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)' }}>{money(profile.detail.teacher.payroll?.nextMonthProjected ?? 0)}</span>
                        {profile.detail.teacher.payroll?.extraClassesPayroll ? (
                          <span style={{ fontSize: '12px', color: 'var(--color-success)' }}>Includes {money(profile.detail.teacher.payroll.extraClassesPayroll)} for extra classes</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Teacher Timetable */}
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={sectionTitle as React.CSSProperties}>Timetable</div>
                      <Button variant="outline" onClick={() => { window.location.assign(window.location.pathname.startsWith('/branch') ? '/branch/timetable' : '/tenant/timetables'); }} style={{ minHeight: '40px', padding: '4px 12px', fontSize: '12.5px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>calendar_month</span> Manage Timetable
                      </Button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {profile.detail.teacher.timetable && profile.detail.teacher.timetable.length > 0 ? (
                        profile.detail.teacher.timetable.map((session) => (
                          <div key={session.id} style={{ ...rowCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{session.subject}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{session.day} · {session.time} · Room {session.room}</div>
                            </div>
                            <StatusBadge variant="info">Scheduled</StatusBadge>
                          </div>
                        ))
                      ) : (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No timetable sessions assigned.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
            )}
            </>
          ) : null}
        </div>
      </aside>

      {showAnalytics ? (
        <StudentAnalytics userId={userId} fetcher={api.people.getAnalytics} onClose={() => setShowAnalytics(false)} />
      ) : null}

      {selectedInvoice ? <InvoiceDocumentDialog data={selectedInvoice} onClose={() => setSelectedInvoice(null)} /> : null}

      {resetModalOpen && tempPassword ? (
        <div className="auth-dialog-overlay" role="dialog" aria-modal="true" style={{ zIndex: 100000 }}>
          <div className="auth-dialog">
            <span className="material-symbols-outlined" style={{ fontSize: '42px', color: 'var(--color-success)' }}>
              check_circle
            </span>
            <h3 className="auth-dialog-title">Password Reset Successful</h3>
            <p className="auth-dialog-body" style={{ marginBottom: '16px' }}>
              The password for <strong>{profile?.name}</strong> has been reset. Please copy and share this temporary password securely. The user will be required to change it on their next login.
            </p>
            <div style={{ padding: '16px', background: 'var(--bg-background)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '2px', color: 'var(--text-foreground)' }}>
                {tempPassword}
              </div>
            </div>
            <div className="auth-dialog-actions" style={{ flexDirection: 'row', gap: '12px' }}>
              <Button onClick={() => { navigator.clipboard.writeText(tempPassword); showToast('Password copied to clipboard', 'success'); }} style={{ flex: 1 }}>
                Copy Password
              </Button>
              <Button variant="outline" onClick={() => { setResetModalOpen(false); setTempPassword(''); }} style={{ flex: 1 }}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
