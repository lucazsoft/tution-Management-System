import { AcademicCalendarView } from '../components/calendar/AcademicCalendarView';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  invoiceTotal,
  resultPercentage,
  type AttendanceState,
  type FeeState,
  type StudentPortalDataset,
  type SubjectInsight,
} from '../features/student/studentPortalData';
import { loadStudentPortal, studentFileUrl } from '../features/student/studentPortalService';
import { errorMessage } from '../services/api/client';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { toDualDateLabel } from '../utils/nepaliDate';
import { InvoiceDocumentDialog } from '../components/InvoiceDocument';
import { PaymentCheckoutDialog } from '../components/PaymentCheckoutDialog';
import '../features/student/studentPortal.css';

type StudentView =
  | 'home'
  | 'timetable'
  | 'homework'
  | 'syllabus'
  | 'results'
  | 'attendance'
  | 'fees'
  | 'digital-id'
  | 'certificates'
  | 'calendar'
  | 'notifications'
  | 'security';

const VIEW_TITLES: Record<StudentView, [string, string]> = {
  home: ['Student dashboard', 'Here is what needs your attention today.'],
  timetable: ['My timetable', 'Every enrolled course, merged into one schedule.'],
  homework: ['Homework', 'Your pending assignments and due dates.'],
  syllabus: ['Syllabus progress', 'Chapter plans and daily progress shared by your teachers.'],
  results: ['Results & insights', 'Published scores, class comparisons, and subject trends.'],
  attendance: ['Attendance', 'Your teacher-marked session record.'],
  fees: ['Fees & payment', 'Billing cycles, itemized dues, and Nepal Pay.'],
  'digital-id': ['Digital student ID', 'Your branch-ready student identification.'],
  certificates: ['Certificates', 'Your permanent certificate history.'],
  calendar: ['Academic calendar', 'Holidays, exams, ceremonies, and fee deadlines.'],
  notifications: ['Notifications', 'Academic, attendance, fee, and certificate updates.'],
  security: ['Security', 'Manage your account password and security settings.'],
};

const StudentDataContext = createContext<StudentPortalDataset | null>(null);

function useStudentData() {
  const data = useContext(StudentDataContext);
  if (!data) throw new Error('Student portal data is unavailable.');
  return data;
}

function icon(name: string) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

function money(value: number) {
  return `NPR ${Math.abs(value).toLocaleString('en-NP')}`;
}

function StatusPill({ label, iconName, tone }: { label: string; iconName: string; tone: 'success' | 'warning' | 'error' | 'info' | 'gold' }) {
  return <span className={`student-status student-status--${tone}`}>{icon(iconName)}<span>{label}</span></span>;
}

function SectionHeader({ title, description, action, onAction }: { title: string; description?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="student-section-head">
      <div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>
      {action && onAction ? <button type="button" className="student-text-button" onClick={onAction}>{action}{icon('arrow_forward')}</button> : null}
    </div>
  );
}

function EmptyState({ title, message, iconName }: { title: string; message: string; iconName: string }) {
  return <div className="student-empty" role="status">{icon(iconName)}<h3>{title}</h3><p>{message}</p></div>;
}

function BlockedBanner({ onOpenFees }: { onOpenFees: () => void }) {
  const { studentProfile } = useStudentData();
  if (!studentProfile.blocked) return null;
  return (
    <section className="student-blocked" aria-label="Account blocked due to fee dues">
      <div className="student-blocked__icon">{icon('lock')}</div>
      <div><strong>Blocked — fee dues</strong><p>{money(studentProfile.outstanding)} is overdue. Your records remain available while payment is pending.</p></div>
      <button type="button" onClick={onOpenFees}>View amount owed{icon('arrow_forward')}</button>
    </section>
  );
}

function TimetableRows({ compact = false }: { compact?: boolean }) {
  const { todaySessions } = useStudentData();
  if (todaySessions.length === 0) return <EmptyState title="No classes today" message="Enjoy the free time. Your next scheduled class will appear here." iconName="event_available" />;
  return (
    <div className="student-session-list">
      {todaySessions.map((session) => (
        <article className="student-session" key={session.id}>
          <div className="student-session__time"><strong>{session.time}</strong><span>{session.endTime}</span></div>
          <div className="student-session__rail" />
          <div className="student-session__details"><h3>{session.subject}</h3><p>{session.teacher} · {session.room}</p></div>
          {!compact ? <StatusPill label={session.type} iconName="school" tone="info" /> : null}
        </article>
      ))}
    </div>
  );
}

function DashboardView({ go }: { go: (view: StudentView) => void }) {
  const { certificates, events, homework, results, studentProfile, todaySessions } = useStudentData();
  const nextEvent = events[0];
  const latestResult = results[0];
  const pendingHomework = homework.filter((item) => !item.completed);
  const todayLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date()).toUpperCase();
  return (
    <div className="student-view">
      <BlockedBanner onOpenFees={() => go('fees')} />
      <section className="student-hero">
        <div>
          <span className="student-eyebrow">{todayLabel}</span>
          <h2>Your learning day at a glance</h2>
          <p>{todaySessions.length} session{todaySessions.length === 1 ? '' : 's'} across all your active enrolled courses.</p>
        </div>
        <div className="student-hero__stat"><span>Next class</span><strong>{todaySessions[0]?.subject ?? 'No class scheduled'}</strong><small>{todaySessions[0] ? `${todaySessions[0].time} · ${todaySessions[0].room}` : studentProfile.branch}</small></div>
      </section>

      <div className="student-dashboard-grid">
        <section className="student-card student-card--wide">
          <SectionHeader title="Today's timetable" description="All enrolled course types in time order." action="Full timetable" onAction={() => go('timetable')} />
          <TimetableRows compact />
        </section>
        <aside className="student-card">
          <SectionHeader title="Homework due soon" action="View all" onAction={() => go('homework')} />
          <div className="student-homework-compact">
            {pendingHomework.slice(0, 2).map((item) => (
              <button type="button" key={item.id} onClick={() => go('homework')}>
                <span className={`student-icon-box student-icon-box--${item.urgency === 'overdue' ? 'error' : 'info'}`}>{icon('assignment')}</span>
                <span><strong>{item.title}</strong><small>{item.subject} · {item.dueLabel}</small></span>
                {icon('chevron_right')}
              </button>
            ))}
            {!pendingHomework.length ? <EmptyState title="All caught up" message="No pending homework is assigned." iconName="task_alt" /> : null}
          </div>
        </aside>
      </div>

      <section className="student-metrics" aria-label="Student record summary">
        <button type="button" onClick={() => go('attendance')}>{icon('fact_check')}<span><small>Attendance</small><strong>{studentProfile.attendanceRate ?? 0}%</strong></span>{icon('arrow_forward')}</button>
        <button type="button" onClick={() => go('results')}>{icon('trending_up')}<span><small>Latest score</small><strong>{latestResult ? `${resultPercentage(latestResult)}%` : 'No score'}</strong></span>{icon('arrow_forward')}</button>
        <button type="button" onClick={() => go('certificates')}>{icon('workspace_premium')}<span><small>Certificates</small><strong>{certificates.length}</strong></span>{icon('arrow_forward')}</button>
        <button type="button" onClick={() => go('calendar')}>{icon('event')}<span><small>Next event</small><strong>{nextEvent ? `${nextEvent.day} ${nextEvent.month}` : 'None'}</strong></span>{icon('arrow_forward')}</button>
      </section>

      <AcademicCalendarView viewerRole="Student" upcoming calendarPath="/student/calendar" />
    </div>
  );
}

function TimetableView({ go }: { go: (view: StudentView) => void }) {
  const { weeklySessions = [], events } = useStudentData();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return <div className="student-view"><BlockedBanner onOpenFees={() => go('fees')} /><section className="student-card"><SectionHeader title="Weekly class timetable" description="Every active enrolled class, teacher, time, and room in one recurring schedule." />{weeklySessions.length ? <div className="student-weekly-timetable">{days.map((day) => { const sessions = weeklySessions.filter((session) => session.day === day).sort((a, b) => a.time.localeCompare(b.time)); return <section key={day}><h3>{day}</h3>{sessions.length ? sessions.map((session) => <article key={session.id}><time>{session.time}–{session.endTime}</time><strong>{session.subject}</strong><span>{session.className} · {session.teacher}</span><small>{session.room}</small></article>) : <small>No classes</small>}</section>; })}</div> : <EmptyState title="No weekly timetable assigned" message="Your schedule will appear after the Branch Admin publishes your enrolled class timetable." iconName="calendar_month" />}</section><div className="student-info-note">{icon('event')}<span>Weekly classes repeat until your Branch Admin updates them. Holidays and closures are published separately in the Academic Calendar ({events.filter((event) => event.kind === 'Holiday').length} upcoming).</span></div></div>;
}

function HomeworkView() {
  const { homework } = useStudentData();
  const [filter, setFilter] = useState<'pending' | 'soon' | 'overdue' | 'completed'>('pending');
  const filteredHomework = homework.filter((item) => {
    if (filter === 'completed') return item.completed;
    if (item.completed) return false;
    if (filter === 'soon') return item.urgency === 'soon';
    if (filter === 'overdue') return item.urgency === 'overdue';
    return true;
  });
  const filters = [
    { id: 'pending' as const, label: 'Pending', count: homework.filter((item) => !item.completed).length },
    { id: 'soon' as const, label: 'Due soon', count: homework.filter((item) => !item.completed && item.urgency === 'soon').length },
    { id: 'overdue' as const, label: 'Overdue', count: homework.filter((item) => !item.completed && item.urgency === 'overdue').length },
    { id: 'completed' as const, label: 'Completed', count: homework.filter((item) => item.completed).length },
  ];
  return (
    <div className="student-view">
      <div className="student-filter-pills" aria-label="Homework filters">{filters.map((item) => <button key={item.id} type="button" className={filter === item.id ? 'is-active' : ''} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{item.count}</span></button>)}</div>
      <section className="student-card">
        <SectionHeader title={`${filters.find((item) => item.id === filter)?.label} homework`} description="Assignments are read-only in the student portal." />
        {filteredHomework.length ? <div className="student-assignment-list">
          {filteredHomework.map((item) => (
            <article key={item.id}>
              <span className={`student-icon-box student-icon-box--${item.completed ? 'success' : item.urgency === 'overdue' ? 'error' : item.urgency === 'soon' ? 'warning' : 'info'}`}>{icon(item.completed ? 'task_alt' : item.urgency === 'overdue' ? 'priority_high' : 'assignment')}</span>
              <div><span className="student-eyebrow">{item.subject}</span><h3>{item.title}</h3><p>Assigned by {item.teacher}</p></div>
              <div className="student-assignment__due"><small>{item.completed ? 'Status' : 'Due'}</small><strong>{item.dueLabel}</strong>{item.completed ? <StatusPill label="Completed" iconName="check_circle" tone="success" /> : item.urgency === 'overdue' ? <StatusPill label="Overdue" iconName="error" tone="error" /> : null}</div>
            </article>
          ))}
        </div> : <EmptyState title={`No ${filter} homework`} message="There are no assignments in this view right now." iconName="task_alt" />}
      </section>
    </div>
  );
}

function TrendSparkline({ insight }: { insight: SubjectInsight }) {
  const width = 132;
  const height = 42;
  const min = Math.min(...insight.history) - 4;
  const max = Math.max(...insight.history) + 4;
  const range = Math.max(max - min, 1);
  const points = insight.history.map((value, index) => `${(index / (insight.history.length - 1)) * width},${height - ((value - min) / range) * height}`).join(' ');
  const improving = insight.average >= insight.previousAverage;
  return (
    <svg className={`student-sparkline ${improving ? 'is-positive' : 'is-negative'}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${insight.subject} score trend: ${improving ? 'improving' : 'declining'} to ${insight.average} percent`}>
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx={width} cy={Number(points.split(' ').at(-1)?.split(',')[1])} r="3" />
    </svg>
  );
}

function ResultsView() {
  const { insights, results } = useStudentData();
  const sorted = [...insights].sort((a, b) => b.average - a.average);
  if (!results.length || !sorted.length) {
    return <div className="student-view"><div className="student-live-note" role="status">{icon('bolt')}<span>New teacher-published numeric grades will appear here automatically.</span></div><section className="student-card"><EmptyState title="No published numeric results" message="Your graded assignments and subject insights will appear here when available." iconName="insights" /></section></div>;
  }
  return (
    <div className="student-view">
      <div className="student-live-note" role="status">{icon('bolt')}<span><strong>Results update automatically.</strong> A teacher-published score appears here with refreshed trend and class comparison.</span></div>
      <section className="student-insight-pair">
        <article><span className="student-icon-box student-icon-box--success">{icon('workspace_premium')}</span><div><small>Strongest subject</small><h3>{sorted[0].subject}</h3><strong>{sorted[0].average}% average</strong></div></article>
        <article><span className="student-icon-box student-icon-box--warning">{icon('track_changes')}</span><div><small>Needs focus</small><h3>{sorted.at(-1)?.subject}</h3><strong>{sorted.at(-1)?.average}% average</strong></div></article>
      </section>
      <div className="student-results-layout">
        <section className="student-card">
          <SectionHeader title="Published results" description="Only your own results are shown." />
          <div className="student-result-list">
            {results.map((result) => {
              const percentage = resultPercentage(result);
              const classPercentage = Math.round((result.classAverage / result.maximum) * 100);
              const above = percentage >= classPercentage;
              return <article key={result.id}><div className="student-result__head"><div><span className="student-eyebrow">{result.subject}</span><h3>{result.assessment}</h3><small>{result.publishedLabel}</small></div><strong>{result.score}/{result.maximum}</strong></div><div className="student-progress"><span style={{ width: `${percentage}%` }} /></div><div className="student-result__foot"><StatusPill label={`${above ? 'Above' : 'Below'} class average`} iconName={above ? 'trending_up' : 'trending_down'} tone={above ? 'success' : 'warning'} /><span>Class avg. {result.classAverage}/{result.maximum}</span></div><div className="student-result-file"><div>{icon('description')}<span><strong>Teacher-shared exam sheet</strong><small>{result.resultSheetUrl ? 'The question or result sheet is available for this assessment.' : 'No exam sheet was attached by the teacher.'}</small></span></div>{result.resultSheetUrl ? <a href={studentFileUrl(result.resultSheetUrl)} target="_blank" rel="noreferrer">{icon('open_in_new')}View exam sheet</a> : <span className="is-unavailable">Not shared</span>}</div></article>;
            })}
          </div>
        </section>
        <aside className="student-card">
          <SectionHeader title="Subject trends" description="Average across published tests." />
          <div className="student-trends">
            {insights.map((item) => {
              const change = item.average - item.previousAverage;
              const trend = change > 2 ? 'Improving' : change < -2 ? 'Declining' : 'Stable';
              return <article key={item.subject}><div><strong>{item.subject}</strong><span>{item.average}%</span></div><TrendSparkline insight={item} /><small className={change < 0 ? 'is-negative' : 'is-positive'}>{icon(change < 0 ? 'trending_down' : 'trending_up')}{trend} · {change > 0 ? '+' : ''}{change}%</small></article>;
            })}
          </div>
          <p className="student-readonly-note">{icon('visibility')} These insights are read-only and derived from multiple tests.</p>
        </aside>
      </div>
    </div>
  );
}

function SyllabusView() {
  const { syllabi } = useStudentData();
  const tone = (status: string) => status === 'COMPLETED' ? 'success' : status === 'IN_PROGRESS' ? 'warning' : 'error';
  return <div className="student-view">{syllabi.length ? syllabi.map((syllabus) => <section className="student-card" key={syllabus.id}><SectionHeader title={syllabus.subject} description={`${syllabus.className}${syllabus.teacherName ? ` · ${syllabus.teacherName}` : ''} · ${syllabus.chapters.length} chapters`} /><div className="student-syllabus-list">{syllabus.chapters.map((chapter) => { const latest = syllabus.dailyLogs.find((log) => log.chapterId === chapter.id); return <article key={chapter.id} className={`is-${tone(chapter.status)}`}><span>{chapter.position}</span><div><h3>{chapter.title}</h3><p>{latest?.notes || (chapter.status === 'COMPLETED' ? 'All topics completed' : chapter.status === 'IN_PROGRESS' ? 'Chapter in progress' : 'Not started')}</p>{chapter.topics?.length ? <ul className="student-topic-list">{chapter.topics.map((topic) => <li key={topic.id} className={`is-${tone(topic.status)}`}><span aria-hidden="true" /><div><strong>{topic.title}</strong>{topic.logs[0]?.notes ? <small>{topic.logs[0].notes} · {topic.logs[0].logDate}</small> : null}</div><StatusPill label={topic.status === 'COMPLETED' ? 'Completed' : topic.status === 'IN_PROGRESS' ? 'In progress' : 'Left to start'} iconName={topic.status === 'COMPLETED' ? 'check_circle' : topic.status === 'IN_PROGRESS' ? 'pending' : 'radio_button_unchecked'} tone={tone(topic.status)} /></li>)}</ul> : null}{latest ? <small>Updated by {syllabus.teacherName || 'your teacher'} · {latest.logDate}</small> : <small>Shared by {syllabus.teacherName || 'your teacher'}</small>}</div><StatusPill label={chapter.status === 'COMPLETED' ? 'Completed' : chapter.status === 'IN_PROGRESS' ? 'In progress' : 'Untouched'} iconName={chapter.status === 'COMPLETED' ? 'check_circle' : chapter.status === 'IN_PROGRESS' ? 'pending' : 'radio_button_unchecked'} tone={tone(chapter.status)} /></article>; })}</div></section>) : <section className="student-card"><EmptyState title="No syllabus shared" message="Teacher-created chapter and topic plans will appear here." iconName="menu_book" /></section>}</div>;
}

function attendanceTone(state: AttendanceState) {
  return state === 'Present' ? 'success' : state === 'Absent' ? 'error' : 'warning';
}

function AttendanceView() {
  const { attendance, studentProfile } = useStudentData();
  const rate = studentProfile.attendanceRate ?? 0;
  const counts = studentProfile.attendanceCounts ?? { present: 0, absent: 0, excused: 0 };
  return (
    <div className="student-view">
      <section className="student-attendance-summary"><div className="student-ring" style={{ '--progress': `${rate}%` } as React.CSSProperties}><span>{rate}%</span></div><div><span className="student-eyebrow">LIVE RECORD</span><h2>{attendance.length ? 'Your attendance record' : 'No attendance marked yet'}</h2><p>{counts.present} present · {counts.absent} absent · {counts.excused} excused absence</p></div><div className="student-attendance-legend"><span><i className="success" />Present</span><span><i className="error" />Absent</span><span><i className="warning" />Excused</span></div></section>
      <section className="student-card">
        <SectionHeader title="Session record" description="Marked by your teacher for each class session." />
        {attendance.length ? <div className="student-table-wrap"><table className="student-table"><thead><tr><th>Date</th><th>Subject</th><th>Session</th><th>Status</th></tr></thead><tbody>{attendance.map((record) => <tr key={record.id}><td>{record.date}</td><td><strong>{record.subject}</strong></td><td>{record.session}</td><td><StatusPill label={record.state} iconName={record.state === 'Present' ? 'check_circle' : record.state === 'Absent' ? 'cancel' : 'event_available'} tone={attendanceTone(record.state)} /></td></tr>)}</tbody></table></div> : <EmptyState title="No attendance records" message="Teacher-marked sessions will appear here." iconName="fact_check" />}
        <p className="student-readonly-note">{icon('info')} Approved leave is shown as “Absent (Excused)” and does not appear as an unexplained absence.</p>
      </section>
    </div>
  );
}

function feeTone(state: FeeState) {
  return state === 'Paid' ? 'success' : state === 'Overdue' ? 'error' : state === 'Due soon' ? 'warning' : 'info';
}

function FeesView() {
  const { invoices, studentProfile } = useStudentData();
  const [showQr, setShowQr] = useState(false);
  const [bill, setBill] = useState<(typeof invoices)[number] | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = invoices.find((invoice) => invoice.state !== 'Paid') ?? invoices[0];
  const total = current ? invoiceTotal(current) : 0;

  if (!current) return <div className="student-view"><section className="student-card"><EmptyState title="No invoices issued" message="Your billing cycles will appear here when the institution issues them." iconName="payments" /></section></div>;
  return (
    <div className="student-view">
      <section className="student-fee-hero"><div><StatusPill label={studentProfile.blocked ? 'Blocked' : current.state} iconName={studentProfile.blocked ? 'lock' : 'payments'} tone={studentProfile.blocked ? 'gold' : feeTone(current.state)} /><span>{current.state === 'Paid' ? 'Latest payment' : 'Current outstanding'}</span><strong>{money(total)}</strong><p>{current.invoiceType === 'ADMISSION' ? 'One-time admission fee' : current.cycle}{current.state === 'Paid' && current.paymentDate ? ` · Paid ${toDualDateLabel(current.paymentDate)}` : ` · Due ${toDualDateLabel(current.dueDate)}`}</p></div><button ref={triggerRef} type="button" onClick={() => current.state === 'Paid' ? setBill(current) : setShowQr(true)}>{icon(current.state === 'Paid' ? 'receipt_long' : 'payments')}{current.state === 'Paid' ? 'View paid bill' : 'Pay now'}</button></section>
      <section className="student-card">
        <SectionHeader title="Payment calendar" description="Status uses text and icons as well as colour." />
        <div className="student-payment-calendar">{invoices.map((invoice) => <article key={invoice.id} className={`is-${feeTone(invoice.state)}`}><div><strong>{invoice.invoiceType === 'ADMISSION' ? 'Admission fee' : invoice.cycle}</strong><span>{invoice.state === 'Paid' && invoice.paymentDate ? `Paid ${toDualDateLabel(invoice.paymentDate)}` : `Due ${toDualDateLabel(invoice.dueDate)}`}</span></div><StatusPill label={invoice.state} iconName={invoice.state === 'Paid' ? 'check_circle' : invoice.state === 'Overdue' ? 'error' : 'schedule'} tone={feeTone(invoice.state)} /><b>{money(invoiceTotal(invoice))}</b><button type="button" className="student-text-button" onClick={() => setBill(invoice)}>{icon('receipt_long')}View bill</button></article>)}</div>
      </section>
      <div className="student-fees-layout">
        <section className="student-card"><SectionHeader title={`${current.cycle} invoice`} description="Current billing-cycle breakdown." /><div className="student-invoice-lines">{current.lines.map((line) => <div key={line.label}><span>{line.label}</span><strong className={line.amount < 0 ? 'is-discount' : ''}>{line.amount < 0 ? '−' : ''}{money(line.amount)}</strong></div>)}<div className="student-invoice-total"><span>Net payable</span><strong>{money(total)}</strong></div></div></section>
        <aside className="student-card student-payment-help">{icon('verified_user')}<h3>Before you pay</h3><p>Confirm the merchant name, invoice reference, and exact amount in your payment app.</p><dl><div><dt>Invoice reference</dt><dd>{current.paymentReference ?? current.id}</dd></div><div><dt>Due date</dt><dd>{toDualDateLabel(current.dueDate)}</dd></div><div><dt>Amount</dt><dd>{money(total)}</dd></div></dl></aside>
      </div>
      {showQr ? <PaymentCheckoutDialog invoiceId={current.id} payerName={studentProfile.name} description={`${current.cycle} · ${current.paymentReference ?? current.id}`} amount={total} onClose={() => setShowQr(false)} /> : null}
      {bill ? <InvoiceDocumentDialog data={bill.document} onClose={() => setBill(null)} onPay={bill.state === 'Paid' ? undefined : () => { setBill(null); setShowQr(true); }} /> : null}
    </div>
  );
}

function DigitalIdView() {
  const { studentProfile } = useStudentData();
  const statusLabel = studentProfile.blocked ? 'Access restricted' : 'Active enrollment';
  return (
    <div className="student-view student-id-layout">
      <section className="student-digital-id" aria-label="Digital student identification card">
        <header className="student-id-header">
          <span className="student-id-mark" aria-hidden="true">{icon('school')}</span>
          <div><strong>{studentProfile.institution}</strong><span>Official student identification</span></div>
          <StatusPill label={statusLabel} iconName={studentProfile.blocked ? 'lock' : 'verified'} tone={studentProfile.blocked ? 'error' : 'success'} />
        </header>
        <div className="student-id-body">
          <div className={`student-id-avatar${studentProfile.photoUrl ? ' has-photo' : ''}`}>{studentProfile.photoUrl ? <img src={studentProfile.photoUrl} alt={`${studentProfile.name} profile`} /> : <><strong>{studentProfile.initials}</strong><small>Photo pending</small></>}</div>
          <div className="student-id-identity">
            <span className="student-eyebrow">STUDENT</span>
            <h2>{studentProfile.name}</h2>
            <p className="student-id-branch">{icon('location_on')}<span>{studentProfile.branch}{studentProfile.branchAddress ? ` · ${studentProfile.branchAddress}` : ''}</span></p>
            <dl>
              <div><dt>Grade</dt><dd>{studentProfile.grade}</dd></div>
              <div><dt>Roll number</dt><dd>{studentProfile.rollNumber}</dd></div>
              <div><dt>Academic year</dt><dd>{studentProfile.academicYear}</dd></div>
              <div><dt>Valid until</dt><dd>{studentProfile.validUntil}</dd></div>
            </dl>
          </div>
        </div>
        <footer><div><span>Enrollment ID</span><strong>{studentProfile.enrollmentId}</strong></div><p>{icon('verified_user')}Verified from the institution’s live enrollment record</p></footer>
      </section>
      <aside className="student-card student-id-help">
        <span className="student-icon-box student-icon-box--info" aria-hidden="true">{icon('badge')}</span>
        <h2>Using your Digital ID</h2>
        <p>Show this card when your branch asks for student identification. Its details update from your current enrollment.</p>
        <ul><li>{icon('visibility')}View only—students cannot edit this card.</li><li>{icon('sync')}Reopen this section to load current details.</li><li>{icon('shield_lock')}Your photo is stored privately.</li></ul>
        {!studentProfile.photoUrl ? <div className="student-id-photo-note">{icon('person')}Your branch can add an official student photo.</div> : null}
        {studentProfile.blocked ? <div className="student-warning-note">{icon('lock')}Account access is restricted. The ID remains visible for identification.</div> : null}
      </aside>
    </div>
  );
}

function SecurityView() {
  return <div className="student-view"><ChangePasswordForm className="student-card" /></div>;
}

function CertificatesView() {
  const { certificates } = useStudentData();
  const [message, setMessage] = useState('');
  return (
    <div className="student-view">
      {message ? <div className="student-success-note" role="status">{icon('download_done')}<span>{message}</span><button type="button" aria-label="Dismiss download message" onClick={() => setMessage('')}>{icon('close')}</button></div> : null}
      <div className="student-live-note">{icon('verified')}<span><strong>Certificates remain available.</strong> Issued documents do not expire from your history.</span></div>
      <section className="student-card"><SectionHeader title="Certificate history" description={`${certificates.length} issued documents`} />{certificates.length ? <div className="student-certificate-list">{certificates.map((certificate) => <article key={certificate.id}><span className="student-icon-box student-icon-box--info">{icon('workspace_premium')}</span><div><h3>{certificate.title}</h3><p>{certificate.course} · Issued {certificate.issuedDate}</p><small>{certificate.id}</small></div><span className="student-certificate-actions">{certificate.htmlUrl ? <a className="student-download-link" href={studentFileUrl(certificate.htmlUrl)} target="_blank" rel="noreferrer">{icon('code')}View HTML</a> : null}{certificate.pdfUrl ? <a className="student-download-link" href={studentFileUrl(certificate.pdfUrl)} onClick={() => setMessage(`${certificate.fileName} download started.`)}>{icon('download')}Download PDF</a> : <button type="button" disabled>{icon('download')}PDF unavailable</button>}</span></article>)}</div> : <EmptyState title="No certificates issued" message="Certificates will remain here after they are issued." iconName="workspace_premium" />}</section>
    </div>
  );
}

function CalendarView() { return <AcademicCalendarView viewerRole="Student" />; }
function NotificationsView({ go, readIds, markAllRead, markRead }: { go: (view: StudentView) => void; readIds: Set<string>; markAllRead: () => void; markRead: (id: string) => void }) {
  const { notifications } = useStudentData();
  return (
    <div className="student-view">
      <div className="student-notification-actions"><p>Appointment notifications are excluded because appointments are a parent–teacher flow.</p><button type="button" disabled={!notifications.length} onClick={markAllRead}>Mark all as read</button></div>
      {notifications.length ? <section className="student-card student-notification-list">{notifications.map((notice) => <button type="button" key={notice.id} className={readIds.has(notice.id) ? '' : 'is-unread'} onClick={() => { markRead(notice.id); go(notice.destination.split('/').at(-1) as StudentView); }}><i aria-hidden="true" /><span className="student-icon-box student-icon-box--info">{icon(notice.icon)}</span><span><strong>{notice.title}</strong><small>{notice.message}</small><time dateTime={notice.occurredAt}>{notice.time}</time></span>{icon('chevron_right')}</button>)}</section> : <EmptyState title="All caught up" message="New fee, homework, result, attendance, leave, and certificate updates will appear here." iconName="notifications" />}
    </div>
  );
}

export function StudentPortal() {
  const [data, setData] = useState<StudentPortalDataset | null>(null);
  const [loadError, setLoadError] = useState('');
  const [refreshWarning, setRefreshWarning] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const enrollmentId = data?.studentProfile.enrollmentId;
  const view = useMemo<StudentView>(() => {
    const segment = location.pathname.split('/').filter(Boolean).at(-1);
    return segment && segment in VIEW_TITLES ? segment as StudentView : 'home';
  }, [location.pathname]);
  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    const refresh = async () => {
      setIsRefreshing(true);
      try {
        const result = await loadStudentPortal();
        if (!cancelled) {
          setData(result);
          setLoadError('');
          setRefreshWarning('');
        }
      } catch (error) {
        if (!cancelled) {
          const message = errorMessage(error);
          setLoadError(message);
        }
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, reloadKey]);

  useEffect(() => {
    if (view !== 'syllabus' && view !== 'results') return;
    const interval = window.setInterval(() => setReloadKey((value) => value + 1), 10_000);
    const refreshOnFocus = () => { if (document.visibilityState === 'visible') setReloadKey((value) => value + 1); };
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', refreshOnFocus); };
  }, [view]);

  useEffect(() => {
    if (!enrollmentId) return;
    const key = `tms_student_read_notifications:${enrollmentId}`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      setReadIds(new Set(Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []));
    } catch {
      setReadIds(new Set());
    }
  }, [enrollmentId]);

  if (loadError) {
    return <div className="student-portal"><div className="student-load-error" role="alert">{icon('cloud_off')}<div><h2>Couldn’t load your student record</h2><p>{loadError}</p><button type="button" onClick={() => setReloadKey((value) => value + 1)}>Try again</button></div></div></div>;
  }
  if (!data) {
    return <div className="student-portal student-loading" aria-busy="true" aria-label="Loading student portal">{Array.from({ length: 4 }, (_, index) => <div key={index} />)}</div>;
  }

  const [defaultTitle, subtitle] = VIEW_TITLES[view];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const title = view === 'home' ? `${greeting}, ${data.studentProfile.name.split(' ')[0]}` : defaultTitle;
  const unread = data.notifications.filter((item) => item.unread && !readIds.has(item.id)).length;
  const go = (next: StudentView) => navigate(`/student/${next}`);
  const storeReadIds = (next: Set<string>) => {
    setReadIds(next);
    localStorage.setItem(`tms_student_read_notifications:${data.studentProfile.enrollmentId}`, JSON.stringify([...next]));
  };
  const markRead = (id: string) => storeReadIds(new Set(readIds).add(id));
  const markAllRead = () => storeReadIds(new Set(data.notifications.map((item) => item.id)));

  const content = view === 'home' ? <DashboardView go={go} />
    : view === 'timetable' ? <TimetableView go={go} />
      : view === 'homework' ? <HomeworkView />
        : view === 'syllabus' ? <SyllabusView />
          : view === 'results' ? <ResultsView />
            : view === 'attendance' ? <AttendanceView />
              : view === 'fees' ? <FeesView />
                : view === 'digital-id' ? <DigitalIdView />
                  : view === 'certificates' ? <CertificatesView />
                    : view === 'calendar' ? <CalendarView />
                      : view === 'security' ? <SecurityView />
                        : <NotificationsView go={go} readIds={readIds} markRead={markRead} markAllRead={markAllRead} />;

  return (
    <StudentDataContext.Provider value={data}><div className="student-portal">
      <header className="student-page-header">
        <div><span className="student-eyebrow">STUDENT PORTAL · READ ONLY</span><h1>{title}</h1><p>{subtitle}</p><span className={`student-sync ${refreshWarning ? 'is-warning' : ''}`} role="status">{icon(refreshWarning ? 'cloud_off' : isRefreshing ? 'sync' : 'cloud_done')}{refreshWarning || `${isRefreshing ? 'Loading this section' : 'Loaded'} · ${new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</span></div>
        <button type="button" className="student-notification-button" aria-label={`${unread} unread notifications`} onClick={() => go('notifications')}>{icon('notifications')}<span>{unread}</span></button>
      </header>
      {content}
    </div></StudentDataContext.Provider>
  );
}
