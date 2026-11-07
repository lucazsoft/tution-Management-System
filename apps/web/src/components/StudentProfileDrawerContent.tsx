import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api } from '../services/api';
import { toBsLabel } from '../utils/nepaliDate';
import { Button } from './ui/Button';
import { StatusBadge } from './ui/StatusBadge';
import type { InvoiceDocumentData } from './InvoiceDocument';
import type { Profile } from './UserProfileDrawer';
import './studentProfileDrawer.css';

type Student = NonNullable<Profile['detail']['student']>;
type TabId = 'summary' | 'billing' | 'invoices' | 'subjects' | 'activities' | 'parents' | 'admission';

interface StudentProfileDrawerContentProps {
  profile: Profile;
  student: Student;
  busy: boolean;
  editing: boolean;
  grades: Array<{ id: string; name: string }>;
  form: { firstName: string; lastName: string; phone: string; usesParentPhone: boolean; gradeName: string; contractType: 'FIXED' | 'HOUR_RATE'; compensationAmount: string };
  setForm: React.Dispatch<React.SetStateAction<{ firstName: string; lastName: string; phone: string; usesParentPhone: boolean; gradeName: string; contractType: 'FIXED' | 'HOUR_RATE'; compensationAmount: string }>>;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => Promise<void>;
  onAnalytics: () => void;
  onResetPassword: () => Promise<void>;
  onToggleActive: () => Promise<void>;
  onViewInvoice: (invoice: InvoiceDocumentData) => void;
  onRefresh: () => void;
  onChanged?: () => void;
  showToast: (message: string, variant?: 'success' | 'error' | 'info' | 'warning') => void;
}

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'summary', label: 'Summary', icon: 'dashboard' },
  { id: 'billing', label: 'Billing', icon: 'account_balance_wallet' },
  { id: 'invoices', label: 'Invoices', icon: 'receipt_long' },
  { id: 'subjects', label: 'Subjects', icon: 'menu_book' },
  { id: 'activities', label: 'Activities', icon: 'sports_soccer' },
  { id: 'parents', label: 'Parents', icon: 'family_restroom' },
  { id: 'admission', label: 'Admission', icon: 'badge' },
];

function money(value: number) { return `NPR ${value.toLocaleString()}`; }
function invoiceLabel(type: Student['fees']['invoices'][number]['invoiceType']) {
  if (type === 'ADMISSION') return 'One-time admission fee';
  if (type === 'SUBJECT') return 'Monthly subject tuition';
  if (type === 'ACTIVITY') return 'Monthly activity fee';
  return 'Monthly grade tuition';
}

function StateCard({ icon, title, message, action }: { icon: string; title: string; message: string; action?: React.ReactNode }) {
  return <div className="student-drawer-state"><span className="material-symbols-outlined" aria-hidden="true">{icon}</span><strong>{title}</strong><p>{message}</p>{action}</div>;
}

export function StudentProfileDrawerContent(props: StudentProfileDrawerContentProps) {
  const { profile, student } = props;
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [confirmAction, setConfirmAction] = useState<'status' | 'password' | ''>('');
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [activities, setActivities] = useState<Array<{ id: string; name: string; classes: Array<{ id: string; name: string }> }>>([]);
  const [activitiesState, setActivitiesState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [activitiesError, setActivitiesError] = useState('');
  const [enrollCourse, setEnrollCourse] = useState('');
  const [enrollClass, setEnrollClass] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [removeCandidate, setRemoveCandidate] = useState('');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const academic = student.enrollments.filter((item) => item.category === 'ACADEMIC');
  const allActivities = student.enrollments.filter((item) => item.category === 'ACTIVITY');
  const admissionInvoice = student.fees.invoices.find((item) => item.invoiceType === 'ADMISSION');
  const latestPaidInvoice = student.fees.invoices.find((item) => item.status === 'PAID' && item.paymentDate);

  const chooseTab = (tab: TabId) => { setActiveTab(tab); setActivityError(''); };
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    chooseTab(TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  const loadActivities = async () => {
    setActivitiesState('loading');
    setActivitiesError('');
    try {
      const [courses, classes] = await Promise.all([api.academics.listCourses(), api.academics.listClasses()]);
      const extras = (courses as Array<{ id: string; name: string; gradeId: string | null }>).filter((course) => !course.gradeId);
      setActivities(extras.map((course) => ({
        id: course.id,
        name: course.name,
        classes: (classes as Array<{ id: string; name: string; courseId: string }>).filter((item) => item.courseId === course.id).map((item) => ({ id: item.id, name: item.name })),
      })));
      setActivitiesState('ready');
    } catch (error) {
      setActivitiesError(error instanceof Error ? error.message : 'Activities could not be loaded.');
      setActivitiesState('error');
    }
  };

  const openEnrollment = () => {
    setEnrollOpen(true);
    setActivityError('');
    if (activitiesState === 'idle' || activitiesState === 'error') void loadActivities();
  };

  const submitEnrollment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enrollCourse || !enrollClass) { setActivityError('Choose an activity and class time.'); return; }
    setEnrolling(true);
    setActivityError('');
    try {
      const result = await api.academics.enroll(student.studentId, enrollCourse, enrollClass);
      props.showToast(`Activity enrolled — +${money(result.monthlyDelta)}/month.`, 'success');
      setEnrollOpen(false); setEnrollCourse(''); setEnrollClass('');
      props.onRefresh(); props.onChanged?.();
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : 'The activity could not be added.');
    } finally { setEnrolling(false); }
  };

  const unenroll = async (enrollmentId: string) => {
    setEnrolling(true);
    setActivityError('');
    try {
      await api.academics.unenroll(enrollmentId);
      props.showToast('Activity enrollment removed.', 'success');
      setRemoveCandidate('');
      props.onRefresh(); props.onChanged?.();
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : 'The activity could not be removed.');
    } finally { setEnrolling(false); }
  };

  const viewInvoice = (invoice: Student['fees']['invoices'][number]) => props.onViewInvoice({
    id: invoice.id, invoiceType: invoice.invoiceType, status: invoice.status,
    institutionName: profile.institutionName, panNumber: invoice.panNumberSnapshot, vatRate: invoice.vatRateSnapshot,
    studentName: profile.name, admissionNumber: student.admissionNumber, gradeName: student.grade,
    branchName: invoice.branchName,
    issuedAt: invoice.createdAt, dueDate: invoice.dueDate, paymentDate: invoice.paymentDate,
    billingCycleStart: invoice.billingCycleStart, billingCycleEnd: invoice.billingCycleEnd,
    transactionId: invoice.transactionId, lines: invoice.lineItems, discount: invoice.discount,
    fine: invoice.fine, netPayable: invoice.netPayable,
  });

  return <div className="student-profile-v2">
    <section className="student-profile-overview" aria-labelledby="student-overview-heading">
      <h3 id="student-overview-heading" className="sr-only">Student overview</h3>
      <div className="student-profile-tags">{profile.roles.map((role, index) => <span key={`${role.role}-${index}`} className="people-role-tag">{role.role}{role.branchName ? ` · ${role.branchName}` : ''}</span>)}{student.grade ? <span className="people-role-tag">{student.grade}</span> : null}<StatusBadge variant={profile.status === 'ACTIVE' ? 'success' : 'warning'}>{profile.status}</StatusBadge></div>
      {props.editing ? <form className="student-profile-edit" onSubmit={(event) => { event.preventDefault(); void props.onSaveEdit(); }} aria-busy={props.busy}>
        <div><label htmlFor="student-first-name">First name</label><input id="student-first-name" autoComplete="given-name" required value={props.form.firstName} onChange={(event) => props.setForm((form) => ({ ...form, firstName: event.target.value }))} /></div>
        <div><label htmlFor="student-last-name">Last name</label><input id="student-last-name" autoComplete="family-name" required value={props.form.lastName} onChange={(event) => props.setForm((form) => ({ ...form, lastName: event.target.value }))} /></div>
        <div className="is-wide"><label htmlFor="student-phone">Phone</label><input id="student-phone" type="tel" autoComplete="tel" disabled={props.form.usesParentPhone} placeholder={props.form.usesParentPhone ? "Uses the parent's number" : undefined} value={props.form.usesParentPhone ? '' : props.form.phone} onChange={(event) => props.setForm((form) => ({ ...form, phone: event.target.value }))} /><label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 13 }}><input type="checkbox" checked={props.form.usesParentPhone} onChange={(event) => { const checked = event.target.checked; props.setForm((form) => ({ ...form, usesParentPhone: checked, phone: checked ? '' : form.phone })); }} />Use parent's number as primary</label></div>
        <div className="is-wide"><label htmlFor="student-grade">Grade</label><select id="student-grade" value={props.form.gradeName} onChange={(event) => props.setForm((form) => ({ ...form, gradeName: event.target.value }))}><option value="">No grade</option>{props.grades.map((grade) => <option key={grade.id} value={grade.name}>{grade.name}</option>)}</select></div>
        <div className="student-profile-edit-actions"><Button type="submit" disabled={props.busy}>{props.busy ? 'Saving…' : 'Save changes'}</Button><Button type="button" variant="outline" disabled={props.busy} onClick={props.onCancelEdit}>Cancel</Button></div>
      </form> : <>
        <dl className="student-profile-meta"><div><dt>Phone</dt><dd>{profile.phone || 'Not recorded'}</dd></div><div><dt>Member since</dt><dd>{new Date(profile.createdAt).toLocaleDateString('en-NP')}</dd></div></dl>
        <div className="student-profile-actions"><Button onClick={props.onAnalytics}><span className="material-symbols-outlined" aria-hidden="true">insights</span>Analytics</Button><Button variant="outline" onClick={props.onStartEdit} disabled={props.busy}><span className="material-symbols-outlined" aria-hidden="true">edit</span>Edit</Button><Button variant="outline" onClick={() => setConfirmAction('password')} disabled={props.busy}><span className="material-symbols-outlined" aria-hidden="true">lock_reset</span>Reset password</Button><Button variant="outline" onClick={() => setConfirmAction('status')} disabled={props.busy}>{profile.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}</Button></div>
      </>}
      {confirmAction ? <div className="student-confirm-action" role="alert"><strong>{confirmAction === 'password' ? 'Reset this student’s password?' : profile.status === 'ACTIVE' ? 'Deactivate this student?' : 'Reactivate this student?'}</strong><p>{confirmAction === 'password' ? 'A new temporary password will replace the current one.' : profile.status === 'ACTIVE' ? 'Portal access will stop and active enrollments will be dropped.' : 'Portal access will be restored.'}</p><div><Button variant={confirmAction === 'status' && profile.status === 'ACTIVE' ? 'danger' : 'primary'} disabled={props.busy} onClick={() => void (confirmAction === 'password' ? props.onResetPassword() : props.onToggleActive()).then(() => setConfirmAction(''))}>{props.busy ? 'Working…' : 'Confirm'}</Button><Button variant="outline" disabled={props.busy} onClick={() => setConfirmAction('')}>Cancel</Button></div></div> : null}
    </section>

    <div className="student-profile-tabs" role="tablist" aria-label="Student profile sections">{TABS.map((tab, index) => <button key={tab.id} ref={(node) => { tabRefs.current[index] = node; }} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`student-panel-${tab.id}`} id={`student-tab-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => chooseTab(tab.id)} onKeyDown={(event) => onTabKeyDown(event, index)}><span className="material-symbols-outlined" aria-hidden="true">{tab.icon}</span>{tab.label}</button>)}</div>

    <div className="student-profile-panel" role="tabpanel" id={`student-panel-${activeTab}`} aria-labelledby={`student-tab-${activeTab}`}>
      {activeTab === 'summary' ? <>
        <div className="student-section-heading"><div><h3>At a glance</h3><p>Placement, monthly plan, and current balance.</p></div></div>
        <section className={`student-plan-hero${student.billing.setupStatus === 'INCOMPLETE' ? ' is-incomplete' : ''}`}><div><span>Academic placement</span><strong>{student.grade || 'Grade not assigned'}</strong><small>{student.billing.billingMode === 'SUBJECT' ? 'Selected-subject billing' : student.billing.billingMode === 'GRADE' ? 'Grade package billing' : 'Billing mode not configured'}</small></div><div><StatusBadge variant={student.billing.setupStatus === 'READY' ? 'success' : 'warning'}>{student.billing.setupStatus}</StatusBadge><strong>{student.billing.setupStatus === 'READY' ? `${money(student.billing.recurringTotal)}/mo` : 'Setup needed'}</strong></div></section>
        <div className="student-money-grid"><div><span>Invoiced</span><strong>{money(student.fees.totalBilled)}</strong></div><div className="is-paid"><span>Paid</span><strong>{money(student.fees.totalPaid)}</strong><small>{latestPaidInvoice?.paymentDate ? `Last paid ${toBsLabel(latestPaidInvoice.paymentDate)}` : 'No payment recorded'}</small></div><div className={student.fees.totalDue > 0 ? 'is-due' : 'is-paid'}><span>Outstanding</span><strong>{money(student.fees.totalDue)}</strong></div></div>
        {student.billing.setupStatus === 'INCOMPLETE' ? <div className="student-state-banner is-warning" role="status"><span className="material-symbols-outlined" aria-hidden="true">warning</span><div><strong>Monthly billing is incomplete</strong><p>{student.billing.blockers[0] || 'Complete the academic billing setup before generating tuition invoices.'}</p></div><Button variant="outline" onClick={() => chooseTab('billing')}>Review billing</Button></div> : <div className="student-state-banner is-success" role="status"><span className="material-symbols-outlined" aria-hidden="true">verified</span><div><strong>Billing plan is ready</strong><p>{student.billing.lines.length} recurring charge{student.billing.lines.length === 1 ? '' : 's'} totaling {money(student.billing.recurringTotal)} each month.</p></div></div>}
      </> : null}

      {activeTab === 'billing' ? <>
        <div className="student-section-heading"><div><h3>Monthly billing</h3><p>{student.billing.billingMode === 'SUBJECT' ? 'Class 11–12 subjects and optional activities recur each month.' : 'UKG–Class 10 uses one grade package plus monthly optional activities.'}</p></div><StatusBadge variant={student.billing.setupStatus === 'READY' ? 'success' : 'warning'}>{student.billing.setupStatus}</StatusBadge></div>
        {student.billing.blockers.length ? <div className="student-blocker-list" role="alert"><strong>Complete these items</strong><ul>{student.billing.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : null}
        <section className="student-billing-breakdown"><header><span>Recurring monthly total</span><strong>{student.billing.setupStatus === 'READY' ? money(student.billing.recurringTotal) : 'Not ready'}</strong></header>{student.billing.lines.length ? <div>{student.billing.lines.map((line) => <article key={`${line.type}-${line.sourceId}`}><span><strong>{line.label}</strong><small>{line.type === 'GRADE' ? 'Grade package · regular subjects included' : line.type === 'SUBJECT' ? line.className || 'Selected subject' : line.className || 'Optional activity'}</small></span><span><StatusBadge variant={line.status === 'ACTIVE' || line.status === 'READY' ? 'success' : 'info'}>{line.type}</StatusBadge><strong>{money(line.amount)}</strong></span></article>)}</div> : <StateCard icon="receipt_long" title="No recurring charges" message="Assign the grade package or selected subjects to create the monthly plan." />}</section>
        {student.billing.setupStatus === 'READY' ? <div className="student-projection"><span><small>12-month projection</small><strong>{money(student.futureBilling?.projectedAnnualFee ?? student.billing.recurringTotal * 12)}</strong></span><span><small>Next invoice</small><strong>{student.futureBilling?.nextInvoiceDate || 'Generated by billing cycle'}</strong></span></div> : null}
      </> : null}

      {activeTab === 'invoices' ? <>
        <div className="student-section-heading"><div><h3>Invoices and receipts</h3><p>Admission, tuition, subject, and activity bills.</p></div><StatusBadge variant={student.fees.overdueCount > 0 ? 'error' : 'success'}>{student.fees.overdueCount > 0 ? `${student.fees.overdueCount} overdue` : 'Up to date'}</StatusBadge></div>
        {student.fees.invoices.length ? <div className="student-invoice-list">{student.fees.invoices.map((invoice) => <article key={invoice.id}><div className="student-invoice-icon"><span className="material-symbols-outlined" aria-hidden="true">receipt_long</span></div><div><strong>{invoiceLabel(invoice.invoiceType)}</strong><span>{money(invoice.netPayable)} · {invoice.status === 'PAID' && invoice.paymentDate ? `Paid ${toBsLabel(invoice.paymentDate)}` : `Due ${toBsLabel(invoice.dueDate)}`}</span><small>{invoice.lineItems.length} line item{invoice.lineItems.length === 1 ? '' : 's'} · #{invoice.id.slice(-8).toUpperCase()}</small></div><div><StatusBadge variant={invoice.status === 'PAID' ? 'success' : invoice.status === 'OVERDUE' ? 'error' : 'warning'}>{invoice.status}</StatusBadge><button type="button" onClick={() => viewInvoice(invoice)}><span className="material-symbols-outlined" aria-hidden="true">open_in_new</span>View bill</button></div></article>)}</div> : <StateCard icon="receipt_long" title="No invoices yet" message="Admission and monthly bills will appear here after they are generated." />}
      </> : null}

      {activeTab === 'subjects' ? <>
        <div className="student-section-heading"><div><h3>Academic subjects</h3><p>{student.billing.billingMode === 'SUBJECT' ? 'Each active subject contributes to monthly tuition.' : 'Subjects are included in the grade package.'}</p></div><StatusBadge variant="info">{academic.length} subject{academic.length === 1 ? '' : 's'}</StatusBadge></div>
        {academic.length ? <div className="student-subject-list">{academic.map((item) => <article key={item.id}><span><strong>{item.courseName}</strong><small>{item.className}{item.validUntil ? ` · Valid until ${toBsLabel(item.validUntil)} BS` : ''}</small></span><span><StatusBadge variant={item.accessStatus === 'ACTIVE' ? 'success' : 'warning'}>{item.accessStatus}</StatusBadge><strong>{student.billing.billingMode === 'SUBJECT' ? `${money(item.fee)}/mo` : 'Included'}</strong></span></article>)}</div> : <StateCard icon="menu_book" title="No subjects assigned" message="Place the student in an academic class to complete their timetable and billing setup." />}
      </> : null}

      {activeTab === 'activities' ? <>
        <div className="student-section-heading"><div><h3>Optional activities</h3><p>Extra classes are separate from regular grade or subject tuition.</p></div>{!enrollOpen ? <Button variant="outline" onClick={openEnrollment}><span className="material-symbols-outlined" aria-hidden="true">add</span>Enroll</Button> : null}</div>
        {enrollOpen ? <form className="student-activity-form" onSubmit={submitEnrollment} aria-busy={enrolling}><fieldset disabled={enrolling || activitiesState === 'loading'}><legend>Add an optional activity</legend>{activitiesState === 'loading' ? <div className="student-inline-skeleton" aria-label="Loading activities" aria-busy="true"><i /><i /></div> : activitiesState === 'error' ? <div className="student-form-error" role="alert"><p>{activitiesError}</p><Button type="button" variant="outline" onClick={() => void loadActivities()}>Try again</Button></div> : <><label htmlFor="student-activity-course">Activity<select id="student-activity-course" required value={enrollCourse} onChange={(event) => { setEnrollCourse(event.target.value); setEnrollClass(''); }}><option value="">Select activity…</option>{activities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label htmlFor="student-activity-class">Class time<select id="student-activity-class" required disabled={!enrollCourse} value={enrollClass} onChange={(event) => setEnrollClass(event.target.value)}><option value="">{enrollCourse ? 'Select class…' : 'Choose activity first'}</option>{activities.find((item) => item.id === enrollCourse)?.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{activitiesState === 'ready' && !activities.length ? <p className="student-form-help">No optional activities exist yet. Create an ungraded course first.</p> : null}{enrollCourse && !activities.find((item) => item.id === enrollCourse)?.classes.length ? <p className="student-form-help">This activity needs a timetable class before students can enroll.</p> : null}</>}</fieldset>{activityError ? <p className="student-form-error" role="alert">{activityError}</p> : null}<div><Button type="submit" disabled={enrolling || activitiesState !== 'ready' || !enrollClass}>{enrolling ? 'Enrolling…' : 'Confirm enrollment'}</Button><Button type="button" variant="outline" disabled={enrolling} onClick={() => { setEnrollOpen(false); setActivityError(''); }}>Cancel</Button></div></form> : null}
        {activityError && !enrollOpen ? <div className="student-form-error" role="alert">{activityError}</div> : null}
        {allActivities.length ? <div className="student-activity-list">{allActivities.map((item) => <article key={item.id}><span><strong>{item.courseName}</strong><small>{item.className}</small>{item.billingHistory ? <small>{money(item.billingHistory.paid)} paid{item.billingHistory.due > 0 ? ` · ${money(item.billingHistory.due)} due` : ''}</small> : null}</span><span><StatusBadge variant={item.status === 'ACTIVE' ? 'success' : item.status === 'BLOCKED' ? 'error' : 'info'}>{item.status}</StatusBadge><strong>{money(item.fee)}/mo</strong>{removeCandidate === item.id ? <span className="student-activity-remove-confirm"><button type="button" disabled={enrolling} onClick={() => void unenroll(item.id)}>Confirm</button><button type="button" disabled={enrolling} onClick={() => setRemoveCandidate('')}>Cancel</button></span> : <button type="button" disabled={enrolling} onClick={() => setRemoveCandidate(item.id)} aria-label={`Remove ${item.courseName}`}><span className="material-symbols-outlined" aria-hidden="true">person_remove</span></button>}</span></article>)}</div> : <StateCard icon="sports_soccer" title="No optional activities" message="This student currently has only their regular academic placement." action={!enrollOpen ? <Button variant="outline" onClick={openEnrollment}>Add an activity</Button> : undefined} />}
      </> : null}

      {activeTab === 'parents' ? <>
        <div className="student-section-heading"><div><h3>Parents and guardians</h3><p>Accounts linked to this student.</p></div><StatusBadge variant="info">{student.guardians.length} linked</StatusBadge></div>
        {student.guardians.length ? <div className="student-parent-list">{student.guardians.map((guardian) => <article key={guardian.userId}><span className="material-symbols-outlined" aria-hidden="true">person</span><span><strong>{guardian.name}</strong><small>{guardian.email}</small><small>{guardian.phone || 'No phone recorded'}</small></span><StatusBadge variant={guardian.status === 'ACTIVE' ? 'success' : 'warning'}>{guardian.status}</StatusBadge></article>)}</div> : <StateCard icon="family_restroom" title="No parent account linked" message="Link a parent or guardian so they can receive bills and student updates." />}
      </> : null}

      {activeTab === 'admission' ? <>
        <div className="student-section-heading"><div><h3>Admission record</h3><p>One-time payment and original student details.</p></div><StatusBadge variant={student.enrollmentAccess.status === 'ACTIVE' ? 'success' : 'warning'}>{student.enrollmentAccess.status}</StatusBadge></div>
        <section className="student-admission-summary"><header><span className="material-symbols-outlined" aria-hidden="true">verified_user</span><span><strong>Admission payment</strong><small>Separate from monthly tuition</small></span><span><strong>{admissionInvoice ? money(admissionInvoice.netPayable) : 'Not invoiced'}</strong><StatusBadge variant={admissionInvoice?.status === 'PAID' ? 'success' : 'warning'}>{admissionInvoice?.status ?? 'PENDING'}</StatusBadge></span></header><dl><div><dt>Paid on</dt><dd>{admissionInvoice?.paymentDate ? `${toBsLabel(admissionInvoice.paymentDate)} BS` : 'Awaiting payment'}</dd></div><div><dt>Academic enrollment</dt><dd>{student.enrollmentAccess.status === 'ACTIVE' ? 'Valid for one year' : student.enrollmentAccess.status === 'EXPIRED' ? 'Expired' : 'Starts after payment'}</dd></div><div><dt>Valid from</dt><dd>{student.enrollmentAccess.validFrom ? `${toBsLabel(student.enrollmentAccess.validFrom)} BS` : '—'}</dd></div><div><dt>Valid until</dt><dd>{student.enrollmentAccess.validUntil ? `${toBsLabel(student.enrollmentAccess.validUntil)} BS` : '—'}</dd></div></dl></section>
        {student.admissionRecord ? <dl className="student-admission-record">{([
          ['Admission number', student.admissionNumber], ['Admission date and time', new Date(student.admissionDate).toLocaleString('en-NP')],
          ['Date of birth', student.admissionRecord.dateOfBirth], ['Gender', student.admissionRecord.gender], ['Blood group', student.admissionRecord.bloodGroup],
          ['Nationality', student.admissionRecord.nationality], ['School', student.admissionRecord.school], ['Permanent address', student.admissionRecord.permanentAddress],
          ['Temporary address', student.admissionRecord.temporaryAddress], ['Medical/accessibility notes', student.admissionRecord.medicalNotes],
          ['Father', student.admissionRecord.fatherName], ["Father's phone", student.admissionRecord.fatherPhone], ["Father's email", student.admissionRecord.fatherEmail], ["Father's occupation", student.admissionRecord.fatherOccupation],
          ['Mother', student.admissionRecord.motherName], ["Mother's phone", student.admissionRecord.motherPhone], ["Mother's email", student.admissionRecord.motherEmail], ["Mother's occupation", student.admissionRecord.motherOccupation],
          ['Optional guardian', student.admissionRecord.optionalParentName], ['Relationship', student.admissionRecord.optionalParentRelationship], ['Guardian phone', student.admissionRecord.optionalParentPhone],
          ['Primary parent account', student.admissionRecord.primaryParent], ['Emergency contact', student.admissionRecord.emergencyContactName], ['Emergency phone', student.admissionRecord.emergencyContactPhone],
          ['Emergency relationship', student.admissionRecord.emergencyContactRelationship], ['Admitted by', student.admissionRecord.admittedBy?.name],
        ] as Array<[string, unknown]>).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>)}</dl> : <StateCard icon="badge" title="Detailed admission record unavailable" message="This student may have been created before the full admission form was introduced." />}
      </> : null}
    </div>
  </div>;
}
