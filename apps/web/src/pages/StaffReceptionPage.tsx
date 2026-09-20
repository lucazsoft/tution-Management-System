import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useToast } from '../components/ui/Toast';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { errorMessage } from '../services/api/client';
import {
  checkInStudent,
  loadReceptionToday,
  type ReceptionAppointment,
  type ReceptionToday,
} from '../features/reception/receptionService';
import { StudentAvatar } from '../components/common/StudentAvatar';
import '../features/reception/reception.css';

type View = 'roster' | 'academic-attendance' | 'appointments' | 'announcements';

const TIME_FORMAT = new Intl.DateTimeFormat('en-NP', { hour: 'numeric', minute: '2-digit' });
const DATE_FORMAT = new Intl.DateTimeFormat('en-NP', { weekday: 'long', month: 'long', day: 'numeric' });

function appointmentLabel(status: ReceptionAppointment['status']) {
  return status.toLowerCase().replaceAll('_', ' ');
}

export function StaffReceptionPage() {
  const { showToast } = useToast();
  const location = useLocation();
  const isSecurity = location.hash === '#security';
  const [data, setData] = useState<ReceptionToday | null>(null);
  const [view, setView] = useState<View>('roster');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setData(await loadReceptionToday());
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const visibleRoster = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data?.roster ?? [];
    return (data?.roster ?? []).filter((student) =>
      `${student.name} ${student.className}`.toLowerCase().includes(normalized),
    );
  }, [data?.roster, query]);

  const checkedInCount = data?.roster.filter((student) => student.checkedInAt).length ?? 0;
  const confirmedAppointments = data?.appointments.filter((item) => item.status === 'CONFIRMED').length ?? 0;

  const handleCheckIn = async (studentId: string) => {
    setCheckingIn(studentId);
    try {
      const result = await checkInStudent(studentId);
      setData((current) => current ? {
        ...current,
        roster: current.roster.map((student) => student.id === studentId
          ? { ...student, checkedInAt: result.checkedInAt }
          : student),
      } : current);
      showToast(result.message, 'success');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setCheckingIn(null);
    }
  };

  if (loading) {
    return <ReceptionSkeleton />;
  }

  if (loadError || !data) {
    return (
      <section className="reception-state" role="alert">
        <span className="material-symbols-outlined">cloud_off</span>
        <h2>Front desk data is unavailable</h2>
        <p>{loadError || 'The workspace could not be loaded.'}</p>
        <button type="button" className="reception-primary-button" onClick={() => void refresh()}>
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span> Try again
        </button>
      </section>
    );
  }

  return (
    <div className="reception-page">
      <header className="reception-heading">
        <div>
          <p className="reception-eyebrow"><span className="reception-live-dot" /> Front desk open</p>
          <h2>Good day, Reception</h2>
          <p>{DATE_FORMAT.format(new Date())} · {data.branchName}</p>
        </div>
        <div className="reception-scope" title="Your access is limited to front-desk operations">
          <span className="material-symbols-outlined" aria-hidden="true">shield_lock</span>
          Branch-limited view
        </div>
      </header>

      <section className="reception-metrics" aria-label="Today's front desk summary">
        <article><span className="metric-icon metric-icon--blue material-symbols-outlined">how_to_reg</span><div><strong>{checkedInCount}</strong><span>Students checked in</span></div></article>
        <article><span className="metric-icon metric-icon--gold material-symbols-outlined">event_available</span><div><strong>{confirmedAppointments}</strong><span>Confirmed visits</span></div></article>
        <article><span className="metric-icon metric-icon--green material-symbols-outlined">campaign</span><div><strong>{data.announcements.length}</strong><span>Active announcements</span></div></article>
      </section>

      {isSecurity ? (
        <section className="reception-workspace" role="tabpanel">
          <div className="reception-toolbar">
            <div><h3>Security Settings</h3><p>Manage your account password and security settings.</p></div>
          </div>
          <div style={{ padding: '24px' }}>
            <ChangePasswordForm className="reception-workspace" />
          </div>
        </section>
      ) : (
        <>
          <div className="reception-tabs" role="tablist" aria-label="Front desk views">
            <Tab id="roster" icon="groups" label="Student check-in" active={view === 'roster'} onSelect={setView} />
            <Tab id="academic-attendance" icon="fact_check" label="Class attendance" count={data.academicAttendance.length} active={view === 'academic-attendance'} onSelect={setView} />
            <Tab id="appointments" icon="calendar_today" label="Appointments" count={data.appointments.length} active={view === 'appointments'} onSelect={setView} />
            <Tab id="announcements" icon="campaign" label="Announcements" count={data.announcements.length} active={view === 'announcements'} onSelect={setView} />
          </div>

      {view === 'roster' ? (
        <section className="reception-workspace" role="tabpanel">
          <div className="reception-toolbar">
            <div><h3>Today’s student roster</h3><p>Front-desk arrivals only. Classroom attendance is marked separately by teachers.</p></div>
            <label className="reception-search">
              <span className="material-symbols-outlined" aria-hidden="true">search</span>
              <span className="sr-only">Search students</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student or class" />
            </label>
          </div>
          {visibleRoster.length ? (
            <div className="reception-table-wrap">
              <table className="reception-table">
                <thead><tr><th>Student</th><th>Class / destination</th><th>Arrival</th><th><span className="sr-only">Check-in action</span></th></tr></thead>
                <tbody>{visibleRoster.map((student) => (
                  <tr key={student.id}>
                    <td><StudentAvatar name={student.name} photoUrl={student.photoUrl} size="sm" style={{ width: 34, height: 34 }} /><strong>{student.name}</strong></td>
                    <td>{student.className}</td>
                    <td>{student.checkedInAt ? <span className="arrival-status"><span className="material-symbols-outlined">check_circle</span>{TIME_FORMAT.format(new Date(student.checkedInAt))}</span> : <span className="muted-status">Not arrived</span>}</td>
                    <td><button type="button" className="check-in-button" disabled={Boolean(student.checkedInAt) || checkingIn === student.id} onClick={() => void handleCheckIn(student.id)}>{checkingIn === student.id ? 'Checking in…' : student.checkedInAt ? 'Checked in' : 'Check in'}</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty icon="person_search" title="No students found" detail={query ? 'Try a different name or class.' : 'There are no active students on today’s branch roster.'} />}
        </section>
      ) : null}

      {view === 'appointments' ? (
        <section className="reception-workspace" role="tabpanel">
          <div className="reception-toolbar"><div><h3>Accepted appointments</h3><p>Approved and confirmed parent visits for the next 30 days. Verify the visitor and direct them on arrival.</p></div><span className="read-only-chip"><span className="material-symbols-outlined">visibility</span> Read only</span></div>
          {data.appointments.length ? <div className="appointment-list">{data.appointments.map((item) => (
            <article key={item.id} className="appointment-row">
              <time dateTime={item.scheduledTime}><span style={{ display: 'block', fontSize: 12 }}>{new Intl.DateTimeFormat('en-NP', { month: 'short', day: 'numeric' }).format(new Date(item.scheduledTime))}</span>{TIME_FORMAT.format(new Date(item.scheduledTime))}</time>
              <div><strong>{item.parentName}</strong><span>Meeting with {item.destination}</span></div>
              <span className={`appointment-status appointment-status--${item.status.toLowerCase()}`}>{appointmentLabel(item.status)}</span>
            </article>
          ))}</div> : <Empty icon="event_busy" title="No accepted appointments" detail="Appointments appear here after a Branch Admin or Tenant Admin accepts them." />}
        </section>
      ) : null}

      {view === 'academic-attendance' ? <section className="reception-workspace" role="tabpanel"><div className="reception-toolbar"><div><h3>Today’s academic attendance</h3><p>Read-only attendance submitted by teachers for every branch class.</p></div><span className="read-only-chip"><span className="material-symbols-outlined">visibility</span> Read only</span></div>{data.academicAttendance.length ? <div className="reception-table-wrap"><table className="reception-table"><thead><tr><th>Student</th><th>Class</th><th>Subject</th><th>Teacher</th><th>Status</th></tr></thead><tbody>{data.academicAttendance.map((row) => <tr key={row.id}><td><strong>{row.studentName}</strong></td><td>{row.className}</td><td>{row.subject}</td><td>{row.teacherName}</td><td><span className={`appointment-status appointment-status--${row.status === 'PRESENT' ? 'confirmed' : row.status === 'EXCUSED' ? 'alternative_proposed' : 'rejected'}`}>{row.status}</span></td></tr>)}</tbody></table></div> : <Empty icon="fact_check" title="No class attendance yet" detail="Teacher submissions for today will appear here." />}</section> : null}

      {view === 'announcements' ? (
        <section className="reception-workspace" role="tabpanel">
          <div className="reception-toolbar"><div><h3>Announcements to relay</h3><p>Use these approved notices when answering walk-in and phone queries.</p></div></div>
          {data.announcements.length ? <div className="announcement-list">{data.announcements.map((item) => <article key={item.id}><span className="material-symbols-outlined">campaign</span><div><h4>{item.title}</h4><p>{item.description || 'No additional details were provided.'}</p></div></article>)}</div> : <Empty icon="campaign" title="No active announcements" detail="There are no institutional notices to relay today." />}
        </section>
      ) : null}
        </>
      )}
    </div>
  );
}

function Tab({ id, icon, label, count, active, onSelect }: { id: View; icon: string; label: string; count?: number; active: boolean; onSelect: (view: View) => void }) {
  return <button type="button" role="tab" aria-selected={active} className={active ? 'is-active' : ''} onClick={() => onSelect(id)}><span className="material-symbols-outlined" aria-hidden="true">{icon}</span>{label}{count !== undefined ? <span className="tab-count">{count}</span> : null}</button>;
}

function Empty({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return <div className="reception-empty"><span className="material-symbols-outlined">{icon}</span><h4>{title}</h4><p>{detail}</p></div>;
}

function ReceptionSkeleton() {
  return <div className="reception-skeleton" aria-busy="true" aria-label="Loading front desk"><div /><div className="skeleton-metrics"><span /><span /><span /></div><div className="skeleton-panel" /></div>;
}
