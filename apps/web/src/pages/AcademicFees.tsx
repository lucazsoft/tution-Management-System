import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { InvoiceDocumentDialog, type InvoiceDocumentData } from '../components/InvoiceDocument';
import { KPICard } from '../components/ui/KPICard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../components/ui/Toast';
import { api, type BillingLedger } from '../services/api';
import { toBsLabel, toBsMonthLabel, toDualDateLabel } from '../utils/nepaliDate';
import { useLocation } from 'react-router-dom';
import { BranchPaymentQrDialog } from '../components/BranchPaymentQrDialog';

interface StudentFee {
  studentId: string;
  userId: string;
  name: string;
  email: string;
  branchName: string | null;
  totalBilled: number;
  totalPaid: number;
  totalDue: number;
  overdueCount: number;
  overdueAmount: number;
  invoiceCount: number;
}

interface Overview {
  collected: number;
  outstanding: number;
  overdueAmount: number;
  overdueStudents: number;
  invoiceCount: number;
  billingPeriod: string;
}

interface Invoice {
  id: string;
  invoiceType: 'ADMISSION' | 'TUITION' | 'SUBJECT' | 'ACTIVITY';
  institutionName: string;
  panNumber: string;
  vatRate: number;
  studentName: string;
  admissionNumber: string | null;
  gradeName: string | null;
  branchName: string | null;
  issuedAt: string;
  transactionId: string | null;
  lines: Array<{ label: string; amount: number }>;
  discount: number;
  fine: number;
  netPayable: number;
  status: string;
  overdue: boolean;
  dueDate: string;
  billingCycleStart: string;
  billingCycleEnd: string;
  paymentDate: string | null;
}

interface LoginDelivery {
  recipient: 'STUDENT' | 'PARENT';
  status: 'PENDING' | 'SENT' | 'FAILED';
  failureReason: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  sentAt: string | null;
}

function money(n: number): string {
  return `NPR ${n.toLocaleString()}`;
}

function adDate(input: string | Date): string {
  return new Date(input).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kathmandu' });
}

export function AcademicFees({ canRetryAdmissionLogins = true }: { canRetryAdmissionLogins?: boolean }) {
  const { showToast } = useToast();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [students, setStudents] = useState<StudentFee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'OVERDUE' | 'DUE'>('ALL');
  const [isGenerating, setIsGenerating] = useState(false);

  const [payStudent, setPayStudent] = useState<StudentFee | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billingProfile, setBillingProfile] = useState<BillingLedger['students'][number] | null>(null);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [drawerLoadError, setDrawerLoadError] = useState('');
  const [payingId, setPayingId] = useState('');
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentNotice, setPaymentNotice] = useState<{ message: string; delivered: boolean | null } | null>(null);
  const [admissionStatus, setAdmissionStatus] = useState<'PENDING_PAYMENT' | 'READY_FOR_LOGIN' | 'ACTIVE' | null>(null);
  const [loginDeliveries, setLoginDeliveries] = useState<LoginDelivery[]>([]);
  const [isRetryingDelivery, setIsRetryingDelivery] = useState(false);
  const [qrInvoice, setQrInvoice] = useState<Invoice | null>(null);
  const settingsPath = useLocation().pathname.startsWith('/branch') ? '/branch/payment-settings' : '/tenant/payment-settings';
  const [invoiceDocument, setInvoiceDocument] = useState<InvoiceDocumentData | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const drawerBodyRef = useRef<HTMLDivElement>(null);
  const paymentDialogRef = useRef<HTMLDialogElement>(null);
  const drawerTriggerRef = useRef<HTMLElement | null>(null);


  const loadData = async () => {
    setIsLoading(true);
    setErrorMsg('');
    const [overviewResult, studentsResult] = await Promise.allSettled([
      api.finances.getOverview(),
      api.finances.getStudentFees(),
    ]);
    if (studentsResult.status === 'fulfilled') {
      const list = studentsResult.value as StudentFee[];
      setStudents(list);
      setOverview(overviewResult.status === 'fulfilled' ? overviewResult.value : {
        collected: list.reduce((sum, student) => sum + student.totalPaid, 0),
        outstanding: list.reduce((sum, student) => sum + student.totalDue, 0),
        overdueAmount: list.reduce((sum, student) => sum + student.overdueAmount, 0),
        overdueStudents: list.filter((student) => student.overdueAmount > 0).length,
        invoiceCount: list.reduce((sum, student) => sum + student.invoiceCount, 0),
        billingPeriod: '',
      });
    } else {
      setStudents([]);
      setOverview(null);
      const cause = studentsResult.reason;
      setErrorMsg(cause instanceof Error ? cause.message : 'Fee records are temporarily unavailable.');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void loadData(); };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((s) => {
      const matchesSearch = !term || s.name.toLowerCase().includes(term) || s.email.toLowerCase().includes(term);
      if (!matchesSearch) return false;
      if (filter === 'OVERDUE') return s.overdueAmount > 0;
      if (filter === 'DUE') return s.totalDue > 0;
      return true;
    });
  }, [students, search, filter]);

  const openPayments = async (student: StudentFee) => {
    if (!payStudent) drawerTriggerRef.current = document.activeElement as HTMLElement | null;
    setPayStudent(student);
    setInvoicesLoading(true);
    setDrawerLoadError('');
    setInvoices([]);
    setBillingProfile(null);
    setPaymentNotice(null);
    setAdmissionStatus(null);
    setLoginDeliveries([]);
    try {
      const [invoiceData, ledger] = await Promise.all([
        api.finances.getStudentInvoices(student.studentId),
        api.finances.getBillingLedger(),
      ]);
      setInvoices(invoiceData.invoices as Invoice[]);
      setAdmissionStatus(invoiceData.admissionStatus);
      setLoginDeliveries(invoiceData.loginDeliveries);
      if (invoiceData.admissionStatus === 'READY_FOR_LOGIN') {
        const sent = invoiceData.loginDeliveries.filter((item) => item.status === 'SENT').map((item) => item.recipient.toLowerCase());
        const failed = invoiceData.loginDeliveries.filter((item) => item.status === 'FAILED');
        const detail = [
          ...(sent.length ? [`${sent.join(' and ')} SMS sent.`] : []),
          ...failed.map((item) => `${item.recipient.toLowerCase()} SMS failed${item.failureReason ? `: ${item.failureReason}` : '.'}`),
        ].join(' ');
        setPaymentNotice({ message: detail || 'Admission payment is recorded, but login SMS delivery is still pending.', delivered: false });
      }
      setBillingProfile(ledger.students.find((item) => item.studentId === student.studentId) ?? null);
    } catch (error: unknown) {
      setDrawerLoadError(error instanceof Error ? error.message : 'Failed to load invoices.');
    } finally {
      setInvoicesLoading(false);
    }
  };

  const recordPayment = async () => {
    if (!paymentInvoice) return;
    const reference = paymentMethod === 'BANK' ? paymentReference.trim() : 'CASH';
    if (paymentMethod === 'BANK' && !reference) {
      setPaymentError('Enter the bank transaction or deposit reference.');
      return;
    }
    setPayingId(paymentInvoice.id);
    setPaymentError('');
    try {
      const result = await api.finances.payInvoice(paymentInvoice.id, reference);
      const delivered = result.loginDelivery?.delivered ?? null;
      setPaymentNotice({ message: result.message, delivered });
      showToast(result.message, delivered === false ? 'error' : 'success');
      if (payStudent) {
        const invoiceData = await api.finances.getStudentInvoices(payStudent.studentId);
        setInvoices(invoiceData.invoices as Invoice[]);
        setAdmissionStatus(invoiceData.admissionStatus);
        setLoginDeliveries(invoiceData.loginDeliveries);
      }
      await loadData();
      setPaymentInvoice(null);
      setPaymentReference('');
      paymentDialogRef.current?.close();
    } catch (error: unknown) {
      setPaymentError(error instanceof Error ? error.message : 'Failed to record payment. Try again.');
    } finally {
      setPayingId('');
    }
  };

  const openPaymentConfirmation = (invoice: Invoice) => {
    setPaymentInvoice(invoice);
    setPaymentMethod('CASH');
    setPaymentReference('');
    setPaymentError('');
  };

  const closePaymentConfirmation = () => {
    if (payingId) return;
    paymentDialogRef.current?.close();
    setPaymentInvoice(null);
    setPaymentError('');
  };

  useEffect(() => {
    if (!paymentInvoice) return;
    paymentDialogRef.current?.showModal();
  }, [paymentInvoice]);

  useEffect(() => {
    if (!paymentNotice || paymentNotice.delivered === false) return;
    const timer = window.setTimeout(() => setPaymentNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [paymentNotice]);

  useEffect(() => {
    if (!payStudent || paymentInvoice || qrInvoice) return;
    const drawer = drawerRef.current;
    drawerBodyRef.current?.scrollTo({ top: 0 });
    drawer?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPayStudent(null);
      if (event.key !== 'Tab' || !drawer) return;
      const focusable = [...drawer.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [payStudent, paymentInvoice, qrInvoice]);

  useEffect(() => {
    if (payStudent) return;
    drawerTriggerRef.current?.focus();
  }, [payStudent]);

  const retryLoginDelivery = async () => {
    if (!payStudent) return;
    setIsRetryingDelivery(true);
    try {
      const result = await api.people.issueAdmissionLogins(payStudent.studentId);
      setPaymentNotice({ message: result.message, delivered: true });
      setAdmissionStatus('ACTIVE');
      setLoginDeliveries(result.delivery.recipients.map((item) => ({
        recipient: item.recipient,
        status: item.status,
        failureReason: item.error,
        attemptCount: 1,
        lastAttemptAt: item.sentAt,
        sentAt: item.sentAt,
      })));
      showToast(result.message, 'success');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Login SMS delivery failed again.';
      setPaymentNotice({ message, delivered: false });
      showToast(message, 'error');
      const invoiceData = await api.finances.getStudentInvoices(payStudent.studentId).catch(() => null);
      if (invoiceData) {
        setAdmissionStatus(invoiceData.admissionStatus);
        setLoginDeliveries(invoiceData.loginDeliveries);
      }
    } finally {
      setIsRetryingDelivery(false);
    }
  };

  const runBilling = async () => {
    setIsGenerating(true);
    try {
      const result = await api.finances.generateInvoices();
      showToast(result.message, result.created > 0 ? 'success' : 'info');
      await loadData();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Failed to generate invoices.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="people-page">
      <div className="people-header">
        <div>
          <h1 className="people-title">Fee &amp; Billing</h1>
          <p className="people-subtitle">
            Collections, dues, and payments{overview?.billingPeriod ? ` · billing cycle ${overview.billingPeriod} BS` : ''}.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={() => void loadData()} disabled={isLoading} style={{ height: '42px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>refresh</span>
            Refresh
          </Button>
          <Button onClick={() => void runBilling()} disabled={isGenerating} style={{ height: '42px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>receipt_long</span>
            {isGenerating ? 'Generating…' : overview?.billingPeriod ? `Generate ${overview.billingPeriod} Invoices` : 'Generate Invoices'}
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '18px' }}>
        <KPICard title="Collected" value={overview ? money(overview.collected) : '—'} delta="Paid invoices" icon="paid" accentColor="var(--color-success)" loading={isLoading} />
        <KPICard title="Outstanding" value={overview ? money(overview.outstanding) : '—'} delta="Unpaid + overdue" icon="account_balance_wallet" accentColor="var(--color-warning)" loading={isLoading} />
        <KPICard title="Overdue" value={overview ? money(overview.overdueAmount) : '—'} delta={overview && overview.overdueStudents > 0 ? `${overview.overdueStudents} student${overview.overdueStudents === 1 ? '' : 's'}` : 'None overdue'} icon="warning" accentColor="var(--color-error)" loading={isLoading} />
        <KPICard title="Invoices" value={overview ? overview.invoiceCount : '—'} delta="Total raised" icon="description" loading={isLoading} />
      </div>

      <div className="people-toolbar">
        <div className="people-search">
          <span className="material-symbols-outlined">search</span>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students…" />
        </div>
        <select className="people-filter" value={filter} onChange={(e) => setFilter(e.target.value as 'ALL' | 'OVERDUE' | 'DUE')}>
          <option value="ALL">All students</option>
          <option value="OVERDUE">Overdue only</option>
          <option value="DUE">Any dues</option>
        </select>
      </div>

      <div className="people-table-wrap">
        <div className="people-table-scroll">
          <table className="people-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Branch</th>
                <th>Paid</th>
                <th>Due</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="people-empty">
                      <span className="material-symbols-outlined">payments</span>
                      {isLoading ? 'Loading fees…' : errorMsg ? <><span>Fee records could not load.</span><Button variant="outline" onClick={() => void loadData()}>Try again</Button></> : students.length === 0 ? 'No students with fee records yet.' : 'No students match your filter.'}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.studentId}>
                    <td>
                      <div className="people-person-name">{s.name}</div>
                      <div className="people-person-email">{s.email}</div>
                    </td>
                    <td><span style={{ fontSize: '13.5px' }}>{s.branchName ?? '—'}</span></td>
                    <td><span style={{ fontSize: '13.5px', color: 'var(--color-success)', fontWeight: 600 }}>{money(s.totalPaid)}</span></td>
                    <td><span style={{ fontSize: '13.5px', fontWeight: 700, color: s.totalDue > 0 ? 'var(--color-text)' : 'var(--text-muted)' }}>{money(s.totalDue)}</span></td>
                    <td>
                      {s.overdueAmount > 0 ? (
                        <StatusBadge variant="error">Overdue</StatusBadge>
                      ) : s.totalDue > 0 ? (
                        <StatusBadge variant="warning">Due</StatusBadge>
                      ) : (
                        <StatusBadge variant="success">Cleared</StatusBadge>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button
                        variant="outline"
                        onClick={() => void openPayments(s)}
                        style={{ minHeight: '34px', height: '34px', padding: '6px 14px', borderColor: 'rgba(21, 96, 189, 0.16)' }}
                      >
                        {s.totalDue > 0 ? 'Collect' : 'View'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {payStudent ? (
        <>
          <button type="button" className="people-drawer-overlay" onClick={() => setPayStudent(null)} aria-label="Close student billing details" />
          <aside ref={drawerRef} tabIndex={-1} className="people-drawer fee-drawer" role="dialog" aria-modal="true" aria-labelledby="fee-drawer-title">
            <div className="people-drawer-head">
              <div>
                <h2 id="fee-drawer-title">{payStudent.name}</h2>
                <p>{payStudent.branchName ?? 'Branch not assigned'} · Student billing</p>
              </div>
              <button type="button" className="people-drawer-close" onClick={() => setPayStudent(null)} aria-label="Close">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div ref={drawerBodyRef} className="people-drawer-body">
              {paymentNotice ? (
                <div
                  role={paymentNotice.delivered === false ? 'alert' : 'status'}
                  className={`fee-sms-notice${paymentNotice.delivered === false ? ' is-action-required' : ' is-success'}`}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">{paymentNotice.delivered === false ? 'error' : 'check_circle'}</span>
                  <div><strong>{paymentNotice.delivered === false ? 'SMS delivery needs attention' : 'Payment recorded successfully'}</strong><p>{paymentNotice.message}</p>
                  {paymentNotice.delivered === false ? (
                    <p>
                      Payment is saved. Review each recipient below and retry any notification that failed.
                    </p>
                  ) : null}
                  {paymentNotice.delivered === false && loginDeliveries.length ? (
                    <div className="fee-sms-deliveries" aria-label="Login SMS notification log">
                      {loginDeliveries.map((delivery) => (
                        <div key={delivery.recipient}>
                          <span>
                            {delivery.recipient === 'STUDENT' ? 'Student login SMS' : 'Parent login SMS'}
                            {delivery.status === 'FAILED' && delivery.failureReason ? (
                              <small>{delivery.failureReason}</small>
                            ) : delivery.sentAt ? (
                              <small>Sent {new Date(delivery.sentAt).toLocaleString('en-NP')}</small>
                            ) : null}
                          </span>
                          <StatusBadge variant={delivery.status === 'SENT' ? 'success' : delivery.status === 'FAILED' ? 'error' : 'warning'}>
                            {delivery.status === 'SENT' ? 'Sent' : delivery.status === 'FAILED' ? 'Failed' : 'Pending'}
                          </StatusBadge>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {canRetryAdmissionLogins && paymentNotice.delivered === false && admissionStatus === 'READY_FOR_LOGIN' ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void retryLoginDelivery()}
                      disabled={isRetryingDelivery}
                      style={{ marginTop: '10px', minHeight: '40px' }}
                    >
                      {isRetryingDelivery ? 'Retrying SMS…' : 'Retry login SMS'}
                    </Button>
                  ) : null}
                  </div>
                  <button type="button" onClick={() => setPaymentNotice(null)} aria-label="Dismiss notification"><span className="material-symbols-outlined" aria-hidden="true">close</span></button>
                </div>
              ) : null}
              {invoicesLoading ? (
                <div className="fee-drawer-skeleton" aria-busy="true" aria-label="Loading student billing details">
                  <div /><div /><div />
                </div>
              ) : drawerLoadError ? (
                <div className="fee-drawer-error" role="alert">
                  <span className="material-symbols-outlined" aria-hidden="true">error</span>
                  <strong>Billing details could not be loaded</strong>
                  <p>{drawerLoadError}</p>
                  <Button variant="outline" onClick={() => void openPayments(payStudent)}>Try again</Button>
                </div>
              ) : (
                <>
                  <section className="fee-student-summary" aria-labelledby="fee-balance-title">
                    <div className="fee-section-heading">
                      <div>
                        <span>Current balance</span>
                        <h3 id="fee-balance-title">{money(payStudent.totalDue)}</h3>
                      </div>
                      <StatusBadge variant={payStudent.overdueAmount > 0 ? 'error' : payStudent.totalDue > 0 ? 'warning' : 'success'}>
                        {payStudent.overdueAmount > 0 ? 'Overdue' : payStudent.totalDue > 0 ? 'Payment due' : 'Cleared'}
                      </StatusBadge>
                    </div>
                    <dl className="fee-summary-grid">
                      <div><dt>Outstanding</dt><dd>{money(payStudent.totalDue)}</dd></div>
                      <div><dt>Overdue</dt><dd className={payStudent.overdueAmount > 0 ? 'is-overdue' : ''}>{money(payStudent.overdueAmount)}</dd></div>
                      <div><dt>Paid to date</dt><dd className="is-paid">{money(payStudent.totalPaid)}</dd></div>
                    </dl>
                  </section>

                  <section className="fee-drawer-section" aria-labelledby="posted-invoices-title">
                    <div className="fee-section-title">
                      <div><h3 id="posted-invoices-title">Posted invoices</h3><p>Recorded charges and payment status</p></div>
                      <span>{invoices.length}</span>
                    </div>
                    {invoices.length === 0 ? (
                      <div className="people-empty" role="status"><span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>No invoices have been posted for this student yet.</div>
                    ) : <div className="fee-invoice-list">{invoices.map((inv) => (
                      <article key={inv.id} className="fee-invoice-row">
                        <header>
                          <div><span>{inv.invoiceType.toLowerCase().replaceAll('_', ' ')} · {inv.branchName}</span><strong>{inv.invoiceType === 'ADMISSION' ? inv.status === 'PAID' && inv.paymentDate ? `Paid ${toBsLabel(inv.paymentDate)}` : 'Awaiting admission payment' : toBsMonthLabel(inv.billingCycleStart)}</strong></div>
                          {inv.status === 'PAID' ? <StatusBadge variant="success">Paid</StatusBadge> : inv.overdue ? <StatusBadge variant="error">Overdue</StatusBadge> : <StatusBadge variant="warning">Unpaid</StatusBadge>}
                        </header>
                        <div className="fee-invoice-copy">
                          <strong>{money(inv.netPayable)}</strong>
                          {inv.invoiceType === 'ADMISSION' && inv.status === 'PAID' ? <span><b>Valid until {toBsLabel(inv.billingCycleEnd)}</b><small>{adDate(inv.paymentDate || inv.billingCycleStart)} AD paid · {adDate(inv.billingCycleEnd)} AD expiry</small></span> :
                          <span><b>Due {toBsLabel(inv.dueDate)}</b><small>{adDate(inv.dueDate)} AD{inv.paymentDate ? ` · paid ${adDate(inv.paymentDate)} AD` : ''}</small></span>
                          }
                        </div>
                        <footer className="fee-invoice-actions">
                          <Button variant="outline" onClick={() => setInvoiceDocument(inv)}>
                            <span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>
                            {inv.status === 'PAID' ? 'View receipt' : 'View bill'}
                          </Button>
                          {inv.status !== 'PAID' ? <>
                            <Button variant="outline" onClick={() => setQrInvoice(inv)}>
                              <span className="material-symbols-outlined" aria-hidden="true">qr_code_scanner</span>
                              Payment QR
                            </Button>
                            <Button onClick={() => openPaymentConfirmation(inv)} disabled={Boolean(payingId)}>
                              Record payment
                            </Button>
                          </> : null}
                        </footer>
                      </article>
                    ))}</div>}
                  </section>

                  {billingProfile ? (
                    <section className="fee-drawer-section fee-billing-plan" aria-labelledby="billing-plan-title">
                      <div className="fee-section-title">
                        <div><h3 id="billing-plan-title">Billing plan</h3><p>{billingProfile.grade} · active through {toBsLabel(billingProfile.courseEnd)} <small>({adDate(billingProfile.courseEnd)} AD)</small></p></div>
                        <strong>{money(billingProfile.monthlyAmount)}<small>/month</small></strong>
                      </div>
                      {billingProfile.projections.length ? (
                        <details className="fee-projections">
                          <summary><span>Future schedule</span><strong>{billingProfile.projections.length} cycle{billingProfile.projections.length === 1 ? '' : 's'}</strong></summary>
                          <div>{billingProfile.projections.map((projection) => (
                            <div key={projection.cycleStart}>
                              <span><b>{projection.billingPeriod} BS</b><small>Due {toBsLabel(projection.dueDate)} · {adDate(projection.dueDate)} AD</small></span>
                              <strong>{money(projection.amount)}</strong>
                            </div>
                          ))}</div>
                        </details>
                      ) : <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>No future billing cycles remain in the current course window.</p>}
                    </section>
                  ) : null}
                </>
              )}
            </div>
          </aside>
        </>
      ) : null}

      {paymentInvoice && payStudent ? (
        <dialog
          ref={paymentDialogRef}
          className="fee-payment-dialog"
          aria-labelledby="fee-payment-title"
          onCancel={(event) => { event.preventDefault(); closePaymentConfirmation(); }}
          onClose={() => { if (!payingId) setPaymentInvoice(null); }}
        >
          <form onSubmit={(event) => { event.preventDefault(); void recordPayment(); }}>
            <div className="fee-payment-dialog-head">
              <div><span>Confirm collection</span><h2 id="fee-payment-title">Record payment</h2></div>
              <button type="button" onClick={closePaymentConfirmation} disabled={Boolean(payingId)} aria-label="Close payment confirmation"><span className="material-symbols-outlined" aria-hidden="true">close</span></button>
            </div>
            <p>Verify the student, amount, and payment method before updating the ledger.</p>
            <dl className="fee-payment-facts">
              <div><dt>Student</dt><dd>{payStudent.name}</dd></div>
              <div><dt>Invoice</dt><dd>{paymentInvoice.invoiceType.toLowerCase().replaceAll('_', ' ')}</dd></div>
              <div><dt>Invoice branch</dt><dd>{paymentInvoice.branchName}</dd></div>
              <div><dt>Amount received</dt><dd>{money(paymentInvoice.netPayable)}</dd></div>
              <div><dt>Due date</dt><dd>{toBsLabel(paymentInvoice.dueDate)} · {adDate(paymentInvoice.dueDate)} AD</dd></div>
            </dl>
            <fieldset className="fee-payment-methods">
              <legend>Payment method</legend>
              <label><input type="radio" name="payment-method" value="CASH" checked={paymentMethod === 'CASH'} onChange={() => setPaymentMethod('CASH')} />Cash</label>
              <label><input type="radio" name="payment-method" value="BANK" checked={paymentMethod === 'BANK'} onChange={() => setPaymentMethod('BANK')} />Bank transfer</label>
            </fieldset>
            {paymentMethod === 'BANK' ? <label className="fee-payment-reference" htmlFor="fee-payment-reference">Transaction reference<input id="fee-payment-reference" type="text" autoComplete="off" maxLength={128} required value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Bank transaction or deposit ID" /></label> : null}
            {paymentError ? <div className="fee-payment-error" role="alert"><span className="material-symbols-outlined" aria-hidden="true">error</span>{paymentError}</div> : null}
            <div className="fee-payment-actions">
              <Button type="button" variant="outline" onClick={closePaymentConfirmation} disabled={Boolean(payingId)}>Cancel</Button>
              <Button type="submit" disabled={Boolean(payingId) || (paymentMethod === 'BANK' && !paymentReference.trim())} aria-busy={Boolean(payingId)}>
                {payingId ? 'Recording payment…' : `Record ${money(paymentInvoice.netPayable)}`}
              </Button>
            </div>
          </form>
        </dialog>
      ) : null}

      {qrInvoice && payStudent ? (
        <BranchPaymentQrDialog
          invoiceId={qrInvoice.id}
          branchName={qrInvoice.branchName}
          studentName={qrInvoice.studentName}
          description={`${qrInvoice.invoiceType.charAt(0)}${qrInvoice.invoiceType.slice(1).toLowerCase()} · due ${toDualDateLabel(qrInvoice.dueDate)}`}
          amount={qrInvoice.netPayable}
          settingsPath={settingsPath}
          onClose={() => setQrInvoice(null)}
        />
      ) : null}
      {invoiceDocument ? <InvoiceDocumentDialog data={invoiceDocument} onClose={() => setInvoiceDocument(null)} /> : null}
    </div>
  );
}
