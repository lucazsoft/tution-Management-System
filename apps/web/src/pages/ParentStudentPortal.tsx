import { AcademicCalendarView } from '../components/calendar/AcademicCalendarView';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useLocation, useNavigate } from 'react-router-dom';
import { invoiceTotal } from '../features/parent/parentPortalData';
import {
  loadParentNepalPayQr,
  loadParentPortal,
  parentFileUrl,
  requestAppointment,
  requestStudentLeave,
  sendParentMessage,
} from '../features/parent/parentPortalService';
import type {
  AppointmentState,
  AttendanceState,
  InvoiceState,
  LeaveState,
  ParentChild,
  ParentInvoice,
  ParentPortalDataset,
  ParentTone,
  ParentView as OriginalParentView,
} from '../features/parent/parentPortalTypes';
import { errorMessage } from '../services/api/client';
import { api } from '../services/api';
import { submitConnectIpsForm } from '../utils/connectips';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { InvoiceDocumentDialog } from '../components/InvoiceDocument';
import { toDualDateLabel } from '../utils/nepaliDate';
import { PaymentCheckoutDialog } from '../components/PaymentCheckoutDialog';
import '../features/parent/parentPortal.css';

type ParentView = OriginalParentView | 'security';

const VIEW_COPY: Record<ParentView, [string, string]> = {
  home: ['Family overview', 'A private, child-specific view of today’s priorities.'],
  timetable: ['Timetable', 'Every class shown only for the selected child.'],
  attendance: ['Attendance', 'Teacher-marked sessions and approved-leave outcomes.'],
  performance: ['Performance & remarks', 'Only institution-approved, parent-visible insights.'],
  messages: ['Teacher messages', 'Conversations remain separate for each child and teacher.'],
  appointments: ['Appointments', 'Requests, alternatives, approvals, and final confirmations.'],
  leave: ['Leave management', 'Planned leave and branch-recorded emergency departures.'],
  fees: ['Fees & payment', 'Child-specific invoices, due dates, and Nepal Pay.'],
  certificates: ['Certificates', 'Permanent issued-document history for the selected child.'],
  calendar: ['Academic calendar', 'Exams, holidays, ceremonies, and fee deadlines.'],
  notifications: ['Notifications', 'Push and SMS activity scoped to the selected child.'],
  profile: ['My profile', 'Your contact information and linked student accounts.'],
  security: ['Security', 'Manage your account password and security settings.'],
};

const ParentDataContext = createContext<ParentPortalDataset | null>(null);
function useParentData() {
  const value = useContext(ParentDataContext);
  if (!value) throw new Error('Parent portal data is unavailable.');
  return value;
}
function icon(name: string) { return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>; }
function money(value: number) { return `NPR ${Math.abs(value).toLocaleString('en-NP')}`; }
function toneForAttendance(state: AttendanceState): ParentTone { return state === 'Present' ? 'success' : state === 'Absent' ? 'error' : 'warning'; }
function toneForInvoice(state: InvoiceState): ParentTone { return state === 'Paid' ? 'success' : state === 'Overdue' ? 'error' : state === 'Due soon' ? 'warning' : 'info'; }
function toneForAppointment(state: AppointmentState): ParentTone { return state === 'Approved' || state === 'Confirmed' ? 'success' : state === 'Rejected' ? 'error' : state === 'Alternative proposed' ? 'warning' : 'info'; }
function toneForLeave(state: LeaveState): ParentTone { return state === 'Approved' ? 'success' : state === 'Rejected' || state === 'Emergency departure' ? 'error' : 'warning'; }
function ParentStatus({ label, tone, iconName }: { label: string; tone: ParentTone; iconName: string }) {
  return <span className={`parent-status parent-status--${tone}`}>{icon(iconName)}<span>{label}</span></span>;
}
function SectionHeader({ title, description, action, onAction }: { title: string; description?: string; action?: string; onAction?: () => void }) {
  return <div className="parent-section-head"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{action && onAction ? <button type="button" className="parent-text-button" onClick={onAction}>{action}{icon('arrow_forward')}</button> : null}</div>;
}
function EmptyState({ title, message, iconName }: { title: string; message: string; iconName: string }) {
  return <div className="parent-empty" role="status">{icon(iconName)}<h3>{title}</h3><p>{message}</p></div>;
}

function ChildSwitcher({ linkedChildren, activeChild, onSelect }: { linkedChildren: ParentChild[]; activeChild: ParentChild; onSelect: (id: string) => void }) {
  return <section className="parent-child-switcher" aria-labelledby="linked-children-title"><div><span className="parent-eyebrow">LINKED STUDENTS</span><h2 id="linked-children-title">Choose a child</h2><p>Every record below changes with this selection.</p></div><div className="parent-child-tabs" role="group" aria-label="Linked children">{linkedChildren.map((child) => <button key={child.id} type="button" aria-pressed={child.id === activeChild.id} className={child.id === activeChild.id ? 'is-active' : ''} onClick={() => onSelect(child.id)}><span>{child.initials}</span><span><strong>{child.name}</strong><small>{child.grade} · Roll {child.rollNumber}</small></span>{icon(child.blocked ? 'lock' : 'verified')}</button>)}</div></section>;
}
function ChildContext({ child }: { child: ParentChild }) {
  return <div className="parent-child-context" aria-label={`Currently viewing ${child.name}`}><span className="parent-child-context__avatar">{child.initials}</span><span><small>Currently viewing</small><strong>{child.name}</strong><small>{child.grade} · {child.branch}</small></span><ParentStatus label={child.blocked ? 'Blocked' : 'Active'} tone={child.blocked ? 'error' : 'success'} iconName={child.blocked ? 'lock' : 'verified'} /></div>;
}
function SessionList({ compact = false }: { compact?: boolean }) {
  const { sessions } = useParentData();
  if (!sessions.length) return <EmptyState title="No classes today" message="The next scheduled class will appear here." iconName="event_available" />;
  return <div className="parent-session-list">{sessions.map((session) => <article className="parent-session" key={session.id}><time><strong>{session.time}</strong><span>{session.endTime}</span></time><i aria-hidden="true" /><div><h3>{session.subject}</h3><p>{session.teacher} · {session.room}</p></div>{compact ? null : <ParentStatus label={session.type} tone="info" iconName="school" />}</article>)}</div>;
}

function DashboardView({ child, go }: { child: ParentChild; go: (view: ParentView) => void }) {
  const { appointments, leaves, remarks, sessions } = useParentData();
  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase();
  return <div className="parent-view">
    {child.blocked ? <section className="parent-alert parent-alert--error">{icon('lock')}<div><strong>{child.name} is blocked due to fee dues</strong><p>{money(child.outstanding)} remains outstanding. Records remain visible.</p></div><button type="button" onClick={() => go('fees')}>View fees{icon('arrow_forward')}</button></section> : null}
    <section className="parent-hero"><div><span className="parent-eyebrow">{today}</span><h2>{child.name}’s day at a glance</h2><p>Timetable, attendance, fees, remarks, and events stay separate from every sibling.</p></div><div className="parent-hero__summary"><span>Attendance</span><strong>{child.attendanceRate}%</strong><small>{child.blocked ? `${money(child.outstanding)} due` : 'Fees up to date'}</small></div></section>
    <div className="parent-dashboard-grid"><section className="parent-card"><SectionHeader title="Today’s timetable" description={`${sessions.length} scheduled session${sessions.length === 1 ? '' : 's'}`} action="Full timetable" onAction={() => go('timetable')} /><SessionList compact /></section><aside className="parent-card"><SectionHeader title="Parent-visible remarks" description="Internal institution notes are excluded." action="View performance" onAction={() => go('performance')} />{remarks.length ? <div className="parent-remark-list">{remarks.slice(0, 2).map((remark) => <article key={remark.id}><ParentStatus label={remark.signal} tone={remark.signal === 'Improving' ? 'success' : remark.signal === 'Needs support' ? 'warning' : 'info'} iconName="insights" /><h3>{remark.subject}</h3><p>{remark.message}</p><small>{remark.author} · {remark.date}</small></article>)}</div> : <EmptyState title="No visible remarks" message="Published remarks and performance signals will appear here." iconName="visibility" />}</aside></div>
    <section className="parent-metrics" aria-label={`${child.name} summary`}><button type="button" onClick={() => go('attendance')}>{icon('fact_check')}<span><small>Attendance</small><strong>{child.attendanceRate}%</strong></span>{icon('arrow_forward')}</button><button type="button" onClick={() => go('fees')}>{icon('payments')}<span><small>Outstanding</small><strong>{money(child.outstanding)}</strong></span>{icon('arrow_forward')}</button><button type="button" onClick={() => go('appointments')}>{icon('event')}<span><small>Appointments</small><strong>{appointments.length}</strong></span>{icon('arrow_forward')}</button><button type="button" onClick={() => go('leave')}>{icon('event_available')}<span><small>Leave records</small><strong>{leaves.length}</strong></span>{icon('arrow_forward')}</button></section>
    <AcademicCalendarView viewerRole="Parent" key={child.id} studentId={child.id} upcoming calendarPath={`/parent/calendar?child=${encodeURIComponent(child.id)}`} />
  </div>;
}

function SecurityView() {
  return <div className="parent-view"><ChangePasswordForm className="parent-card" /></div>;
}
function TimetableView({ child }: { child: ParentChild }) { return <div className="parent-view"><section className="parent-card"><SectionHeader title={`${child.name}’s merged schedule`} description="Every active course type, scoped to this child." /><SessionList /></section><div className="parent-info-note">{icon('info')}<span>Switching children changes this schedule; sessions are never merged across siblings.</span></div></div>; }
function AttendanceView({ child }: { child: ParentChild }) {
  const { attendance } = useParentData();
  return <div className="parent-view"><section className="parent-attendance-summary"><div className="parent-ring" style={{ '--progress': `${child.attendanceRate}%` } as React.CSSProperties}><span>{child.attendanceRate}%</span></div><div><span className="parent-eyebrow">CURRENT RECORD</span><h2>{child.name}’s attendance</h2><p>Approved leave appears as Absent (Excused).</p></div></section><section className="parent-card"><SectionHeader title="Session record" description="Read-only teacher-marked attendance." />{attendance.length ? <div className="parent-table-wrap"><table className="parent-table"><thead><tr><th>Date</th><th>Subject</th><th>Session</th><th>Status</th></tr></thead><tbody>{attendance.map((record) => <tr key={record.id}><td>{record.date}</td><td><strong>{record.subject}</strong></td><td>{record.session}</td><td><ParentStatus label={record.state} tone={toneForAttendance(record.state)} iconName={record.state === 'Present' ? 'check_circle' : record.state === 'Absent' ? 'cancel' : 'event_available'} /></td></tr>)}</tbody></table></div> : <EmptyState title="No attendance yet" message="Teacher-marked sessions will appear here." iconName="fact_check" />}</section></div>;
}
function PerformanceView({ child }: { child: ParentChild }) {
  const { remarks } = useParentData();
  return <div className="parent-view"><div className="parent-privacy-note">{icon('visibility')}<span><strong>Visibility rules are enforced.</strong> Only remarks explicitly published for parents are returned by the API.</span></div><section className="parent-card"><SectionHeader title="Performance signals & remarks" description={`Published observations for ${child.name}.`} />{remarks.length ? <div className="parent-performance-list">{remarks.map((remark) => <article key={remark.id}><span className="parent-icon-box">{icon(remark.signal === 'Improving' ? 'trending_up' : remark.signal === 'Needs support' ? 'track_changes' : 'remove')}</span><div><span className="parent-eyebrow">{remark.subject}</span><h3>{remark.signal}</h3><p>{remark.message}</p><small>{remark.author} · {remark.date}</small></div></article>)}</div> : <EmptyState title="No parent-visible insights" message="The institution has not published remarks or score signals for this child." iconName="insights" />}</section></div>;
}

function MessagesView({ child, refresh }: { child: ParentChild; refresh: () => void }) {
  const { messages, teachers } = useParentData();
  const [teacherId, setTeacherId] = useState(teachers[0]?.id ?? '');
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => setTeacherId(teachers[0]?.id ?? ''), [child.id, teachers]);
  const selected = teachers.find((teacher) => teacher.id === teacherId);
  const thread = messages.filter((message) => message.teacherId === teacherId);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!teacherId || !text.trim()) return;
    setSubmitting(true); setStatus('');
    try { await sendParentMessage({ studentId: child.id, receiverId: teacherId, messageText: text }); setText(''); setStatus('Message sent.'); refresh(); }
    catch (error) { setStatus(errorMessage(error)); } finally { setSubmitting(false); }
  };
  return <div className="parent-view"><div className="parent-privacy-note">{icon('shield')}<span><strong>Privacy scoped to {child.name}.</strong> Only assigned teachers are available; sibling threads stay separate.</span></div><div className="parent-message-layout"><aside className="parent-card parent-teacher-list"><SectionHeader title="Assigned teachers" description={`${teachers.length} eligible contact${teachers.length === 1 ? '' : 's'}`} />{teachers.length ? teachers.map((teacher) => <button key={teacher.id} type="button" className={teacher.id === teacherId ? 'is-active' : ''} aria-pressed={teacher.id === teacherId} onClick={() => setTeacherId(teacher.id)}><span>{teacher.initials}</span><span><strong>{teacher.name}</strong><small>{teacher.subject}</small></span>{icon('chevron_right')}</button>) : <EmptyState title="No assigned teachers" message="Teacher contacts appear after class assignment." iconName="person_off" />}</aside><section className="parent-card parent-thread"><SectionHeader title={selected?.name ?? 'Conversation'} description={selected ? `${selected.subject} · regarding ${child.name}` : undefined} />{thread.length ? <div className="parent-message-list">{thread.map((message) => <article key={message.id} className={message.sender === 'Parent' ? 'is-parent' : ''}><strong>{message.sender === 'Parent' ? 'You' : selected?.name}</strong><p>{message.text}</p><small>{message.time}</small></article>)}</div> : <EmptyState title="No messages yet" message="Messages remain in this child-and-teacher thread." iconName="forum" />}<form className="parent-composer" onSubmit={(event) => void submit(event)}><label htmlFor="parent-message">Message about {child.name}</label><textarea id="parent-message" value={text} maxLength={4000} disabled={!teacherId || submitting} onChange={(event) => setText(event.target.value)} placeholder={teacherId ? 'Write a private message…' : 'No eligible teacher selected'} />{status ? <p className={status === 'Message sent.' ? 'parent-form__notice' : 'parent-form__error'} role="status">{status}</p> : null}<button type="submit" disabled={!teacherId || !text.trim() || submitting} aria-busy={submitting}>{icon('send')}{submitting ? 'Sending…' : 'Send message'}</button></form></section></div></div>;
}

function AppointmentsView({ child, refresh }: { child: ParentChild; refresh: () => void }) {
  const { appointments, bookingWindowHours } = useParentData();
  const [scheduledAt, setScheduledAt] = useState('');
  const [remarks, setRemarks] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setStatus('');
    if (!child.branchId) return setStatus('A branch must be assigned before requesting an appointment.');
    if (!scheduledAt) return setStatus('Choose a date and time.');
    if (new Date(scheduledAt).getTime() < Date.now() + bookingWindowHours * 3600000) return setStatus(`Appointments must be requested at least ${bookingWindowHours} hours in advance.`);
    setSubmitting(true);
    try { await requestAppointment({ studentId: child.id, branchId: child.branchId, target: 'BRANCH_ADMIN', scheduledTime: new Date(scheduledAt).toISOString(), remarks }); setStatus('Appointment requested.'); setScheduledAt(''); setRemarks(''); refresh(); }
    catch (error) { setStatus(errorMessage(error)); } finally { setSubmitting(false); }
  };
  const minimumDateTime = new Date(Date.now() + bookingWindowHours * 3600000).toISOString().slice(0, 16);
  return <div className="parent-view"><section className="parent-card"><SectionHeader title="Appointment history" description={`Branch Admin meeting requests for ${child.name}.`} />{appointments.length ? <div className="parent-appointment-list">{appointments.map((appointment) => <article key={appointment.id}><div><ParentStatus label={appointment.state} tone={toneForAppointment(appointment.state)} iconName="event" /><h3>{appointment.teacher}</h3><p>{appointment.subject}</p>{appointment.responseMessage ? <small>{appointment.responseMessage}</small> : null}</div><dl><div><dt>{appointment.state === 'Confirmed' ? 'Confirmed for' : 'Preferred time'}</dt><dd>{appointment.requestedTime}</dd></div></dl></article>)}</div> : <EmptyState title="No appointment requests" message="Request a meeting with the Branch Admin when you need branch-level support." iconName="event" />}</section><section className="parent-card"><SectionHeader title="Request a Branch Admin appointment" description={`${child.branch} · requests must be at least ${bookingWindowHours} hours in advance.`} /><form className="parent-form" onSubmit={(event) => void submit(event)}><label htmlFor="parent-appointment-time">Preferred date and time</label><input id="parent-appointment-time" type="datetime-local" min={minimumDateTime} value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} aria-invalid={status && status !== 'Appointment requested.' ? 'true' : undefined} aria-describedby={status ? 'parent-appointment-status' : undefined} required /><label htmlFor="parent-appointment-reason">Reason for meeting</label><textarea id="parent-appointment-reason" value={remarks} maxLength={2000} onChange={(event) => setRemarks(event.target.value)} required placeholder={`For example: discuss ${child.name}’s enrollment or branch support`} /><small>The Branch Admin may confirm this time or send a different date and time.</small>{status ? <p id="parent-appointment-status" className={status === 'Appointment requested.' ? 'parent-form__notice' : 'parent-form__error'} role={status === 'Appointment requested.' ? 'status' : 'alert'}>{status}</p> : null}<button className="parent-primary-button" type="submit" disabled={!child.branchId || submitting} aria-busy={submitting}>{icon('event_upcoming')}{submitting ? 'Requesting…' : 'Send request to Branch Admin'}</button></form></section></div>;
}

function LeaveView({ child, refresh }: { child: ParentChild; refresh: () => void }) {
  const { leaves } = useParentData();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!child.branchId) return setStatus('This child has no active branch assignment.');
    if (new Date(endDate) < new Date(startDate)) return setStatus('End date cannot be before start date.');
    setSubmitting(true); setStatus('');
    try { await requestStudentLeave({ studentId: child.id, branchId: child.branchId, leaveType: reason === 'Medical' ? 'SICK' : 'CASUAL', startDate, endDate, reason: `${reason}: ${details}` }); setStatus('Leave request submitted.'); setStartDate(''); setEndDate(''); setReason(''); setDetails(''); refresh(); }
    catch (error) { setStatus(errorMessage(error)); } finally { setSubmitting(false); }
  };
  return <div className="parent-view"><section className="parent-card"><SectionHeader title="Leave history" description={`Planned leave and emergency departures for ${child.name}.`} />{leaves.length ? <div className="parent-leave-list">{leaves.map((leave) => <article key={leave.id} className={leave.state === 'Emergency departure' ? 'is-urgent' : ''}><ParentStatus label={leave.state} tone={toneForLeave(leave.state)} iconName={leave.state === 'Emergency departure' ? 'emergency' : 'event_available'} /><div><h3>{leave.reason}</h3><p>{leave.dates}</p><small>{leave.detail}</small></div></article>)}</div> : <EmptyState title="No leave records" message="Submitted and branch-recorded leave will appear here." iconName="event_available" />}</section><section className="parent-card"><SectionHeader title="Apply for planned leave" description="Branch Admin and assigned teachers are notified." /><form className="parent-form" onSubmit={(event) => void submit(event)}><div className="parent-form-grid"><div><label htmlFor="parent-leave-start">Start date</label><input id="parent-leave-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></div><div><label htmlFor="parent-leave-end">End date</label><input id="parent-leave-end" type="date" min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-invalid={status.includes('End date') ? 'true' : undefined} aria-describedby={status ? 'parent-leave-status' : undefined} required /></div></div><label htmlFor="parent-leave-reason">Reason</label><select id="parent-leave-reason" value={reason} onChange={(event) => setReason(event.target.value)} required><option value="">Choose a reason</option><option>Medical</option><option>Family event</option><option>Travel</option><option>Other</option></select><label htmlFor="parent-leave-details">Details</label><textarea id="parent-leave-details" value={details} onChange={(event) => setDetails(event.target.value)} required placeholder={`For example: ${child.name} has a medical appointment`} />{status ? <p id="parent-leave-status" className={status === 'Leave request submitted.' ? 'parent-form__notice' : 'parent-form__error'} role={status === 'Leave request submitted.' ? 'status' : 'alert'}>{status}</p> : null}<button className="parent-primary-button" type="submit" disabled={submitting} aria-busy={submitting}>{icon('send')}{submitting ? 'Submitting…' : 'Submit leave request'}</button></form></section><div className="parent-info-note">{icon('fact_check')}<span>Once approved, covered attendance is automatically recorded as Absent (Excused).</span></div></div>;
}

function LegacyPaymentDialog({ invoice, child, onClose }: { invoice: ParentInvoice; child: ParentChild; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [method, setMethod] = useState<'CONNECTIPS' | 'QR'>('CONNECTIPS');
  const [paying, setPaying] = useState(false);
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof api.finances.getInvoicePaymentSettings>> | null>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    void Promise.all([
      loadParentNepalPayQr(invoice.id).then((payload) => QRCode.toDataURL(payload.qrString, { width: 360, margin: 2, color: { dark: '#002D72', light: '#FFFFFF' } })),
      api.finances.getInvoicePaymentSettings(invoice.id),
    ]).then(([qr, config]) => { setImage(qr); setSettings(config); setMethod(config.connectIpsEnabled ? 'CONNECTIPS' : 'QR'); }).catch((reason) => setError(errorMessage(reason)));
    return () => { document.body.style.overflow = previousOverflow; };
  }, [invoice.id]);
  const keyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') onClose();
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
    if (!focusable?.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const payOnline = async () => { setPaying(true); setError(''); try { const result = await api.finances.initiateConnectIps(invoice.id); submitConnectIpsForm(result.gatewayUrl, result.fields); } catch (cause) { setError(errorMessage(cause)); setPaying(false); } };
  const qrSource = settings?.staticQrEnabled && settings.staticQrImageUrl ? settings.staticQrImageUrl : image;
  return <div className="parent-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} tabIndex={-1} onKeyDown={keyDown} role="dialog" aria-modal="true" aria-labelledby="parent-qr-title" className="parent-modal parent-payment-dialog"><button type="button" className="parent-modal__close" aria-label="Close payment" onClick={onClose}>{icon('close')}</button><span className="parent-eyebrow">SECURE PAYMENT · {child.name}</span><h2 id="parent-qr-title">Complete your payment</h2><p>{invoice.cycle} · {money(invoiceTotal(invoice))}</p>{settings ? <div className="parent-payment-methods" role="radiogroup" aria-label="Payment method">{settings.connectIpsEnabled ? <button type="button" role="radio" aria-checked={method === 'CONNECTIPS'} className={method === 'CONNECTIPS' ? 'is-active' : ''} onClick={() => setMethod('CONNECTIPS')}>{icon('bolt')}<span><strong>Pay online instantly</strong><small>Secure connectIPS login</small></span></button> : null}<button type="button" role="radio" aria-checked={method === 'QR'} className={method === 'QR' ? 'is-active' : ''} onClick={() => setMethod('QR')}>{icon('qr_code_2')}<span><strong>Pay via QR</strong><small>Scan with your payment app</small></span></button></div> : null}{error ? <div className="parent-form__error" role="alert">{error}</div> : method === 'CONNECTIPS' ? <div className="parent-payment-online">{icon('lock')}<p>You’ll be redirected to connectIPS to log in and confirm. The invoice updates only after server verification.</p></div> : qrSource ? <><div className="parent-qr"><img src={qrSource} width="360" height="360" alt={`Payment QR for ${child.name}, invoice ${invoice.id}`} /></div>{settings?.staticQrEnabled ? <dl className="parent-payment-bank"><div><dt>Account name</dt><dd>{settings.accountName || '—'}</dd></div><div><dt>Account number</dt><dd>{settings.accountNumber || '—'}</dd></div><div><dt>Bank</dt><dd>{settings.bankName || '—'}</dd></div></dl> : null}</> : <div className="parent-qr" aria-busy="true" aria-label="Generating payment QR" />}<small>Verify the child, merchant, invoice, and exact amount before confirming.</small>{method === 'CONNECTIPS' ? <button type="button" className="parent-primary-button" disabled={paying} onClick={() => void payOnline()}>{paying ? 'Redirecting…' : 'Pay with connectIPS'}</button> : <button type="button" className="parent-primary-button" onClick={onClose}>Done</button>}</section></div>;
}
function PaymentDialog({ invoice, child, onClose }: { invoice: ParentInvoice; child: ParentChild; onClose: () => void }) {
  return <PaymentCheckoutDialog invoiceId={invoice.id} payerName={child.name} description={`${invoice.cycle} · ${invoice.reference}`} amount={invoiceTotal(invoice)} onClose={onClose} />;
}
void LegacyPaymentDialog;
function ParentBillingPlan() {
  const { billing, enrollmentAccess, invoices } = useParentData();
  const admission = invoices.find((invoice) => invoice.invoiceType === 'ADMISSION');
  return <div className="parent-view"><section className="parent-card parent-admission-summary"><SectionHeader title="Admission and enrolment" description="Your one-time admission payment is separate from monthly tuition." /><div className="parent-admission-summary__payment"><span><small>One-time admission fee</small><strong>{admission ? money(admission.netPayable) : 'Not invoiced'}</strong></span><ParentStatus label={admission?.state ?? 'Upcoming'} tone={admission?.state === 'Paid' ? 'success' : 'warning'} iconName={admission?.state === 'Paid' ? 'check_circle' : 'schedule'} /></div><dl><div><dt>Paid on</dt><dd>{admission?.paymentDate ? toDualDateLabel(admission.paymentDate) : 'Awaiting payment'}</dd></div><div><dt>Academic enrolment</dt><dd>{enrollmentAccess.status === 'ACTIVE' ? 'Valid for one year' : enrollmentAccess.status === 'EXPIRED' ? 'Expired' : 'Starts after payment'}</dd></div><div><dt>Valid from</dt><dd>{enrollmentAccess.validFrom ? toDualDateLabel(enrollmentAccess.validFrom) : '—'}</dd></div><div><dt>Valid until</dt><dd>{enrollmentAccess.validUntil ? toDualDateLabel(enrollmentAccess.validUntil) : '—'}</dd></div></dl></section><section className={`parent-card parent-billing-plan${billing.setupStatus === 'INCOMPLETE' ? ' is-incomplete' : ''}`}><SectionHeader title="Monthly billing plan" description={billing.billingMode === 'SUBJECT' ? 'Selected subjects and optional activities.' : 'Grade package and optional activities.'} /><div className="parent-billing-plan__total"><span>{billing.setupStatus === 'READY' ? 'Recurring total' : 'Setup incomplete'}</span><strong>{billing.setupStatus === 'READY' ? `${money(billing.recurringTotal)}/month` : 'Contact the institution'}</strong></div>{billing.blockers.map((blocker) => <p key={blocker} role="status">{blocker}</p>)}<div className="parent-invoice-lines">{billing.lines.map((line) => <div key={`${line.type}-${line.sourceId}`}><span>{line.label}<small>{line.type === 'GRADE' ? 'Regular subjects included' : line.className}</small></span><strong>{money(line.amount)}</strong></div>)}</div></section></div>;
}
function FeesView({ child }: { child: ParentChild }) {
  const { invoices } = useParentData();
  const current = invoices.find((invoice) => invoice.state !== 'Paid') ?? invoices[0];
  const [selected, setSelected] = useState<ParentInvoice | null>(null);
  const [bill, setBill] = useState<ParentInvoice | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (!current) return <div className="parent-view"><section className="parent-card"><EmptyState title="No invoices" message="Billing cycles will appear when issued." iconName="payments" /></section></div>;
  return <div className="parent-view"><section className="parent-fee-hero"><div><ParentStatus label={child.blocked ? 'Blocked' : current.state} tone={child.blocked ? 'gold' : toneForInvoice(current.state)} iconName={child.blocked ? 'lock' : 'payments'} /><span>{current.state === 'Paid' ? 'Latest payment for' : 'Current payable for'} {child.name}</span><strong>{money(invoiceTotal(current))}</strong><p>{current.invoiceType === 'ADMISSION' ? 'One-time admission fee' : current.cycle}{current.state === 'Paid' && current.paymentDate ? ` · Paid ${toDualDateLabel(current.paymentDate)}` : ` · Due ${toDualDateLabel(current.dueDate)}`}</p></div><button ref={triggerRef} type="button" onClick={() => current.qrAvailable ? setSelected(current) : setBill(current)}>{icon(current.qrAvailable ? 'qr_code_2' : 'receipt_long')}{current.qrAvailable ? 'Show Nepal Pay QR' : 'View paid bill'}</button></section><section className="parent-card"><SectionHeader title="Payment history" description={`Admission and monthly invoices for ${child.name}.`} /><div className="parent-payment-calendar">{invoices.map((invoice) => <article key={invoice.id} className={`is-${toneForInvoice(invoice.state)}`}><div><strong>{invoice.invoiceType === 'ADMISSION' ? 'Admission fee' : invoice.cycle}</strong><span>{invoice.state === 'Paid' && invoice.paymentDate ? `Paid ${toDualDateLabel(invoice.paymentDate)}` : `Due ${toDualDateLabel(invoice.dueDate)}`}</span></div><ParentStatus label={invoice.state} tone={toneForInvoice(invoice.state)} iconName={invoice.state === 'Paid' ? 'check_circle' : invoice.state === 'Overdue' ? 'error' : 'schedule'} /><b>{money(invoiceTotal(invoice))}</b><div className="parent-invoice-actions"><button type="button" className="parent-invoice-action parent-invoice-action--secondary" onClick={() => setBill(invoice)}>{icon('receipt_long')}<span>View bill</span></button>{invoice.qrAvailable ? <button type="button" className="parent-invoice-action parent-invoice-action--primary" onClick={() => setSelected(invoice)}>{icon('qr_code_2')}<span>Open QR</span></button> : null}</div></article>)}</div></section><div className="parent-fees-layout"><section className="parent-card"><SectionHeader title={current.invoiceType === 'ADMISSION' ? 'Admission invoice' : `${current.cycle} invoice`} description={current.invoiceType === 'ADMISSION' ? 'One-time admission payment. This is not monthly tuition.' : 'Itemized monthly billing-cycle breakdown.'} /><div className="parent-invoice-lines">{current.lines.map((line) => <div key={line.label}><span>{line.label}</span><strong className={line.amount < 0 ? 'is-discount' : ''}>{line.amount < 0 ? '−' : ''}{money(line.amount)}</strong></div>)}<div className="parent-invoice-total"><span>Net payable</span><strong>{money(invoiceTotal(current))}</strong></div></div></section><aside className="parent-card parent-payment-help">{icon('verified_user')}<h3>Payment details</h3><p>{current.state === 'Paid' ? 'This invoice is fully paid.' : 'Confirm the selected child and exact invoice details.'}</p><dl><div><dt>Child</dt><dd>{child.name}</dd></div><div><dt>Due date</dt><dd>{toDualDateLabel(current.dueDate)}</dd></div><div><dt>Reference</dt><dd>{current.reference}</dd></div></dl></aside></div>{selected ? <PaymentDialog invoice={selected} child={child} onClose={() => { setSelected(null); window.setTimeout(() => triggerRef.current?.focus(), 0); }} /> : null}{bill ? <InvoiceDocumentDialog data={bill.document} onClose={() => setBill(null)} /> : null}</div>;
}

function ProfileView() {
  const { profile, children } = useParentData();
  return <div className="parent-view"><section className="parent-card parent-profile-card"><div className="parent-profile-identity"><span className="parent-profile-avatar" aria-hidden="true">{profile.initials || icon('person')}</span><div><span className="parent-eyebrow">PARENT ACCOUNT</span><h2>{profile.name}</h2><p>Your institution manages these details. Contact the branch office if anything needs correcting.</p></div><ParentStatus label={profile.status === 'ACTIVE' ? 'Active' : profile.status.toLowerCase()} tone={profile.status === 'ACTIVE' ? 'success' : 'warning'} iconName={profile.status === 'ACTIVE' ? 'verified' : 'schedule'} /></div><dl className="parent-profile-details"><div><dt>{icon('call')}Phone number</dt><dd>{profile.phone || 'Not provided'}</dd></div><div><dt>{icon('mail')}Email address</dt><dd>{profile.email || 'Not provided'}</dd><small>{profile.emailVerified ? 'Verified email' : 'Email verification pending'}</small></div><div><dt>{icon('badge')}Account role</dt><dd>Parent</dd></div><div><dt>{icon('calendar_month')}Member since</dt><dd>{profile.memberSince}</dd></div></dl></section><section className="parent-card"><SectionHeader title="Linked students" description={`${children.length} student account${children.length === 1 ? '' : 's'} connected to your profile.`} /><div className="parent-profile-children">{children.map((child) => <article key={child.id}><span aria-hidden="true">{child.initials}</span><div><h3>{child.name}</h3><p>{child.grade} · {child.branch}</p><small>Roll {child.rollNumber}</small></div><ParentStatus label={child.blocked ? 'Blocked' : 'Active'} tone={child.blocked ? 'error' : 'success'} iconName={child.blocked ? 'lock' : 'verified'} /></article>)}</div></section></div>;
}
function CertificatesView({ child }: { child: ParentChild }) {
  const { certificates } = useParentData();
  return <div className="parent-view"><div className="parent-privacy-note">{icon('verified')}<span><strong>Certificates remain available.</strong> Issued documents do not expire from {child.name}’s history.</span></div><section className="parent-card"><SectionHeader title="Certificate history" description={`${certificates.length} issued document${certificates.length === 1 ? '' : 's'} for ${child.name}`} />{certificates.length ? <div className="parent-certificate-list">{certificates.map((certificate) => <article key={certificate.id}><span className="parent-icon-box">{icon('workspace_premium')}</span><div><h3>{certificate.title}</h3><p>{certificate.course} · Issued {certificate.issuedDate}</p><small>{certificate.id}</small></div><span className="parent-certificate-actions">{certificate.htmlUrl ? <a className="parent-text-button" href={parentFileUrl(certificate.htmlUrl)} target="_blank" rel="noreferrer">{icon('code')}View HTML</a> : null}{certificate.pdfUrl ? <a className="parent-text-button" href={parentFileUrl(certificate.pdfUrl)}>{icon('download')}Download PDF</a> : <button type="button" disabled>PDF unavailable</button>}</span></article>)}</div> : <EmptyState title="No certificates issued" message="New documents remain here after issuance." iconName="workspace_premium" />}</section></div>;
}
function CalendarView({ child }: { child: ParentChild }) { return <div className="parent-view"><AcademicCalendarView viewerRole="Parent" studentId={child.id} /></div>; }
function NotificationsView({ child, go, readIds, storeRead }: { child: ParentChild; go: (view: ParentView) => void; readIds: Set<string>; storeRead: (ids: Set<string>) => void }) {
  const { notifications } = useParentData();
  return <div className="parent-view"><div className="parent-notification-actions"><p>SMS is reserved for fee, appointment, attendance-summary, and urgent events.</p><button type="button" disabled={!notifications.length} onClick={() => storeRead(new Set(notifications.map((notice) => notice.id)))}>Mark all as read</button></div>{notifications.length ? <section className="parent-card parent-notification-list">{notifications.map((notice) => <button type="button" key={notice.id} className={`${readIds.has(notice.id) ? '' : 'is-unread'} ${notice.urgent ? 'is-urgent' : ''}`} onClick={() => { storeRead(new Set(readIds).add(notice.id)); go(notice.destination); }}><i aria-hidden="true" /><span className="parent-icon-box">{icon(notice.icon)}</span><span><strong>{notice.title}</strong><small>{notice.message}</small><time dateTime={notice.occurredAt}>{notice.time}</time><span className="parent-channel-row">{notice.channels.map((channel) => <b key={channel}>{channel}</b>)}</span></span>{icon('chevron_right')}</button>)}</section> : <EmptyState title="All caught up" message={`No notifications for ${child.name}.`} iconName="notifications" />}</div>;
}

export function ParentStudentPortal() {
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<ParentPortalDataset | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const view = useMemo<ParentView>(() => {
    const segment = location.pathname.split('/').filter(Boolean).at(-1);
    return segment && segment in VIEW_COPY ? segment as ParentView : 'home';
  }, [location.pathname]);
  const requestedChildId = useMemo(() => new URLSearchParams(location.search).get('child') ?? undefined, [location.search]);
  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    void loadParentPortal(requestedChildId).then((result) => { if (!cancelled) setData(result); }).catch((error) => { if (!cancelled) setLoadError(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [location.pathname, requestedChildId, reloadKey]);
  const activeChildId = data?.selected?.id;
  useEffect(() => {
    if (!activeChildId) return;
    try { setReadIds(new Set(JSON.parse(localStorage.getItem(`tms_parent_read_notifications:${activeChildId}`) || '[]'))); }
    catch { setReadIds(new Set()); }
  }, [activeChildId]);
  if (loadError) return <div className="parent-portal"><div className="parent-unavailable" role="alert">{icon('cloud_off')}<div><strong>Couldn’t load the parent portal</strong><p>{loadError}</p><button type="button" onClick={() => setReloadKey((value) => value + 1)}>Try again</button></div></div></div>;
  if (!data || (requestedChildId && data.selected?.id !== requestedChildId)) return <div className="parent-portal parent-loading" aria-busy="true" aria-label="Loading parent portal"><div /><div /><div /></div>;
  if (!data.selected) return <div className="parent-portal"><EmptyState title="No linked students" message="Ask the institution to link your child to this parent account." iconName="family_restroom" /></div>;
  const child = data.selected;
  const [title, subtitle] = VIEW_COPY[view];
  const go = (next: ParentView) => navigate(`/parent/${next}?child=${child.id}`);
  const refresh = () => setReloadKey((value) => value + 1);
  const storeRead = (ids: Set<string>) => { setReadIds(ids); localStorage.setItem(`tms_parent_read_notifications:${child.id}`, JSON.stringify([...ids])); };
  const unread = data.notifications.filter((notice) => notice.unread && !readIds.has(notice.id)).length;
  const content = view === 'home' ? <DashboardView child={child} go={go} />
    : view === 'timetable' ? <TimetableView child={child} />
      : view === 'attendance' ? <AttendanceView child={child} />
        : view === 'performance' ? <PerformanceView child={child} />
          : view === 'messages' ? <MessagesView child={child} refresh={refresh} />
            : view === 'appointments' ? <AppointmentsView child={child} refresh={refresh} />
              : view === 'leave' ? <LeaveView child={child} refresh={refresh} />
                : view === 'fees' ? <><ParentBillingPlan /><FeesView child={child} /></>
                  : view === 'certificates' ? <CertificatesView child={child} />
                    : view === 'calendar' ? <CalendarView child={child} />
                      : view === 'profile' ? <ProfileView />
                        : view === 'security' ? <SecurityView />
                        : <NotificationsView child={child} go={go} readIds={readIds} storeRead={storeRead} />;
  return <ParentDataContext.Provider value={data}><div className="parent-portal"><ChildSwitcher linkedChildren={data.children} activeChild={child} onSelect={(id) => navigate(`${location.pathname}?child=${id}`, { replace: true })} /><header className="parent-page-header"><div><span className="parent-eyebrow">PARENT PORTAL · {child.name.toUpperCase()}</span><h1>{title}</h1><p>{subtitle}</p><span className="parent-sync" role="status">{icon('cloud_done')}Loaded · {new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><button type="button" className="parent-notification-button" aria-label={`${unread} unread notifications for ${child.name}`} onClick={() => go('notifications')}>{icon('notifications')}<span>{unread}</span></button></header><ChildContext child={child} />{content}</div></ParentDataContext.Provider>;
}
