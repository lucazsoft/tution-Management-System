import { accountantNavItems } from '../components/patterns/accountantNavigation';
import { AcademicCalendarView } from '../components/calendar/AcademicCalendarView';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageShell } from '../components/patterns/PageShell';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { SharedBillingWorkspace } from '../components/finance/SharedBillingWorkspace';
import { TenantPaymentsPage } from './TenantPaymentsPage';
import { AcademicFees } from './AcademicFees';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { api, type AccountantWorkspace } from '../services/api';
import './staffFinance.css';

type Tab = 'calendar' | 'overview' | 'petty-cash' | 'billing' | 'payroll' | 'payments' | 'reports' | 'security';
type PettyCash = AccountantWorkspace['pettyCash'][number];
type Invoice = AccountantWorkspace['invoices'][number];
type CashDialog = 'new' | PettyCash | null;
type CashLine = { id: string; name: string; quantity: string; unitAmount: string };

let cashLineSequence = 0;
const createCashLine = (item?: PettyCash['items'][number]): CashLine => ({
  id: `cash-line-${++cashLineSequence}`,
  name: item?.name ?? '',
  quantity: item ? String(item.quantity) : '1',
  unitAmount: item ? String(item.unitAmount) : '',
});



const money = (value: number) => `NPR ${Number(value || 0).toLocaleString('en-NP')}`;
const dateLabel = (value: string) => new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium' }).format(new Date(value));
const lastAction = (item: PettyCash) => item.approvalChain.at(-1);
const needsRevision = (item: PettyCash) => item.status === 'PENDING' && lastAction(item)?.action === 'REVISION';
const cashStatusLabel = (item: PettyCash) => needsRevision(item) ? 'Revision requested' : ({
  PENDING: 'Awaiting Level 1',
  APPROVED_LEVEL1: 'Awaiting Level 2',
  REJECTED: 'Rejected',
  RELEASED: 'Awaiting receipt',
  RECEIPT_SUBMITTED: 'Receipt under review',
  CLOSED: 'Closed',
} as const)[item.status];
const statusTone = (label: string) => {
  if (label === 'Paid' || label === 'Closed') return 'success';
  if (label === 'Overdue' || label === 'Rejected') return 'error';
  if (label === 'Revision requested') return 'warning';
  if (label.includes('receipt')) return 'info';
  return 'neutral';
};

function Icon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

function StatusPill({ label }: { label: string }) {
  return <span className={`accountant-status is-${statusTone(label)}`}><span aria-hidden="true" />{label}</span>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="accountant-empty"><Icon name="inbox" /><strong>{title}</strong><p>{description}</p></div>;
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    modalRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab' || !modalRef.current) return;
      const elements = modalRef.current.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);
  return <div className="accountant-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div ref={modalRef} className="accountant-modal" role="dialog" aria-modal="true" aria-labelledby="accountant-modal-title" aria-describedby="accountant-modal-description" tabIndex={-1}>
      <header><div><h2 id="accountant-modal-title">{title}</h2><p id="accountant-modal-description">{description}</p></div><button type="button" className="accountant-icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button></header>
      {children}
    </div>
  </div>;
}

export function StaffFinancePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [workspace, setWorkspace] = useState<AccountantWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cashDialog, setCashDialog] = useState<CashDialog>(null);
  const [receiptDialog, setReceiptDialog] = useState<PettyCash | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<Invoice | null>(null);
  const [selectedCash, setSelectedCash] = useState<PettyCash | null>(null);
  const [branchId, setBranchId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [cashItems, setCashItems] = useState<CashLine[]>([createCashLine()]);
  const [cashError, setCashError] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [reference, setReference] = useState('');
  const loadWorkspace = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setLoadError('');
    try {
      const data = await api.finances.getAccountantWorkspace();
      setWorkspace(data);
      setBranchId((current) => current || data.branches[0]?.id || '');
    } catch (error) {
      setWorkspace(null);
      setLoadError(error instanceof Error ? error.message : 'Unable to load branch finance records.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void loadWorkspace(true); };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadWorkspace]);
  useEffect(() => {
    const section = location.hash.slice(1);
    if (['overview', 'petty-cash', 'billing', 'payroll', 'payments', 'reports', 'security', 'calendar'].includes(section)) setTab(section as Tab);
  }, [location.hash]);

  const cap = workspace?.pettyCashCap ?? 0;
  const totalCap = workspace?.pettyCashUsage.reduce((sum, item) => sum + item.limit, 0) ?? 0;
  const committed = workspace?.pettyCashUsage.reduce((sum, item) => sum + item.committed, 0) ?? 0;
  const remaining = Math.max(0, totalCap - committed);
  const requestBudget = Math.max(0, workspace?.pettyCashUsage.find(item => item.branchId === branchId)?.available ?? 0);
  const requestTotal = Math.round(cashItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitAmount || 0), 0) * 100) / 100;
  const cashItemsValid = cashItems.length > 0 && cashItems.every((item) => item.name.trim() && Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0 && Number(item.unitAmount) > 0);
  const branchLabel = !workspace?.branches.length ? 'No assigned finance branch' : workspace.branches.length === 1 ? workspace.branches[0].name : `${workspace.branches.length} assigned branches`;

  const openCashDialog = (item: 'new' | PettyCash) => {
    setCashDialog(item);
    setBranchId(item === 'new' ? workspace?.branches[0]?.id ?? '' : item.branchId);
    setPurpose(item === 'new' ? '' : item.purpose);
    setCashItems(item === 'new' ? [createCashLine()] : item.items.map((line) => createCashLine(line)));
    setCashError('');
  };

  const updateCashLine = (id: string, field: 'name' | 'quantity' | 'unitAmount', value: string) => {
    setCashItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
    setCashError('');
  };

  const submitCash = async (event: FormEvent) => {
    event.preventDefault();
    if (!branchId || !purpose.trim() || !cashItemsValid || requestTotal <= 0) {
      setCashError('Complete every required item field before submitting.');
      return;
    }
    const items = cashItems.map((item) => ({ name: item.name.trim(), quantity: Number(item.quantity), unitAmount: Number(item.unitAmount) }));
    setSubmitting(true);
    try {
      const result = cashDialog === 'new'
        ? await api.finances.requestPettyCash({ branchId, purpose: purpose.trim(), amount: requestTotal, items })
        : await api.finances.resubmitPettyCash(cashDialog!.id, { purpose: purpose.trim(), amount: requestTotal, items });
      showToast(result.message, 'success');
      setCashDialog(null);
      await loadWorkspace();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Petty cash request failed.', 'error');
    } finally { setSubmitting(false); }
  };

  const submitReceipt = async (event: FormEvent) => {
    event.preventDefault();
    if (!receiptDialog || !/^https?:\/\/\S+$/i.test(receiptUrl.trim())) return;
    setSubmitting(true);
    try {
      const result = await api.finances.submitPettyCashReceipt(receiptDialog.id, receiptUrl.trim());
      showToast(result.message, 'success');
      setReceiptDialog(null);
      setReceiptUrl('');
      await loadWorkspace();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Receipt submission failed.', 'error');
    } finally { setSubmitting(false); }
  };

  const confirmPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!paymentDialog || !reference.trim()) return;
    setSubmitting(true);
    try {
      const result = await api.finances.payInvoice(paymentDialog.id, reference.trim());
      showToast(result.message, 'success');
      setPaymentDialog(null);
      setReference('');
      await loadWorkspace();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Payment confirmation failed.', 'error');
    } finally { setSubmitting(false); }
  };

  const renderCashTable = (items: PettyCash[]) => items.length === 0
    ? <EmptyState title="No petty-cash records" description="New requests will appear here after they are stored." />
    : <div className="accountant-table-scroll"><table className="accountant-table"><thead><tr><th>Request</th><th>Branch</th><th>Purpose</th><th>Amount</th><th>Submitted</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {items.map((item) => <tr key={item.id}><td className="is-reference"><button type="button" className="accountant-record-link" onClick={() => setSelectedCash(item)}>{item.id.slice(0, 8)}</button></td><td>{item.branchName}</td><td><button type="button" className="accountant-record-purpose" onClick={() => setSelectedCash(item)}>{item.purpose}</button>{needsRevision(item) && lastAction(item)?.comment && <small>{lastAction(item)?.comment}</small>}</td><td className="is-amount">{money(item.amount)}</td><td>{dateLabel(item.createdAt)}</td><td><StatusPill label={cashStatusLabel(item)} /></td><td className="is-actions">
        {needsRevision(item) && <button type="button" className="accountant-text-button" onClick={() => openCashDialog(item)}><Icon name="edit" />Revise</button>}
        {item.status === 'RELEASED' && <button type="button" className="accountant-text-button" onClick={() => { setReceiptDialog(item); setReceiptUrl(''); }}><Icon name="link" />Add receipt link</button>}
        <button type="button" className="accountant-icon-button" aria-label={`View all details for request ${item.id.slice(0, 8)}`} title="View all details" onClick={() => setSelectedCash(item)}><Icon name="chevron_right" /></button>
      </td></tr>)}
    </tbody></table></div>;

  const body = tab === 'calendar' ? <section aria-label="Academic calendar"><h1>Academic calendar</h1><p>Institution and assigned-branch events shared with everyone or staff.</p><AcademicCalendarView viewerRole="Accountant" /></section> : loading ? <section className="accountant-panel"><EmptyState title="Loading finance workspace" description="Fetching current branch records and permissions." /></section>
    : loadError ? <section className="accountant-panel"><div className="accountant-empty"><Icon name="error" /><strong>Finance workspace unavailable</strong><p>{loadError}</p><button type="button" className="accountant-secondary-button" onClick={() => void loadWorkspace()}>Try again</button></div></section>
    : !workspace ? null : <>
      {tab === 'overview' && <section className="accountant-hero"><div><span className="accountant-eyebrow"><Icon name="account_balance_wallet" />{branchLabel}</span><h1>Finance control centre</h1><p>Reconcile branch collections and move petty cash through the recorded approval workflow.</p></div><button type="button" className="accountant-primary-button" disabled={!workspace.branches.length} onClick={() => openCashDialog('new')}><Icon name="add" />New petty cash request</button></section>}

      {tab === 'overview' && <><AcademicCalendarView viewerRole="Accountant" upcoming calendarPath="/staff/finance#calendar" /><section className="accountant-kpis" aria-label="Finance summary">
        <article><span className="is-success"><Icon name="payments" /></span><div><p>Collected</p><strong>{money(workspace.summary.collected)}</strong><small>Across permitted invoices</small></div></article>
        <article><span className="is-warning"><Icon name="pending_actions" /></span><div><p>Outstanding</p><strong>{money(workspace.summary.outstanding)}</strong><small>{money(workspace.summary.overdueAmount)} overdue</small></div></article>
        <article><span className="is-info"><Icon name="account_balance_wallet" /></span><div><p>Petty cash available</p><strong>{money(remaining)}</strong><small>{money(cap)} base allowance per branch this month</small></div></article>
        <article><span className="is-error"><Icon name="fact_check" /></span><div><p>Payment requests</p><strong>{workspace.summary.pendingPaymentReviews}</strong><small>{workspace.summary.pendingPaymentReviews === 1 ? 'receipt awaiting review' : 'receipts awaiting review'}</small></div></article>
      </section><section className="accountant-panel"><header><div><h2>Recent petty cash activity</h2><p>Latest persisted records in your assigned scope.</p></div><button type="button" className="accountant-text-button" onClick={() => navigate('/staff/finance#petty-cash')}>View all<Icon name="arrow_forward" /></button></header>{renderCashTable(workspace.pettyCash.slice(0, 5))}</section></>}

      {tab === 'petty-cash' && <><section className="accountant-section-head"><div><span className="accountant-eyebrow">Controlled disbursements</span><h2>Petty cash requests</h2><p>Requests remain open until an administrator verifies the receipt and closes the record.</p></div><button type="button" className="accountant-primary-button" disabled={!workspace.branches.length} onClick={() => openCashDialog('new')}><Icon name="add" />New request</button></section><section className="accountant-cap-strip"><div><Icon name="policy" /><span>Base monthly allowance</span><strong>{money(cap)}</strong></div><div><span>Committed in scope</span><strong>{money(committed)}</strong></div><div><span>Available in scope</span><strong>{money(remaining)}</strong></div><small>Only released cash consumes the allowance. Approved additional funding increases the branch balance.</small></section><section className="accountant-panel">{renderCashTable(workspace.pettyCash)}</section></>}

      {tab === 'billing' && <AcademicFees canRetryAdmissionLogins={false} />}
      {tab === 'payroll' && <SharedBillingWorkspace heading="Payroll" />}
      {tab === 'payments' && <TenantPaymentsPage />}
      {tab === 'reports' && <><section className="accountant-section-head"><div><span className="accountant-eyebrow">Scoped reconciliation</span><h2>Finance report summary</h2><p>Figures include only records permitted by your signed branch assignments.</p></div></section><section className="accountant-grid"><article className="accountant-panel accountant-report-card"><span className="is-info"><Icon name="menu_book" /></span><div><h2>Ledger activity</h2><p>Persisted paid invoices, expenses, and settled payroll entries.</p><small>{workspace.reports.ledgerEntryCount} entries in scope</small></div></article><article className="accountant-panel accountant-report-card"><span className="is-warning"><Icon name="receipt_long" /></span><div><h2>Expense records</h2><p>Branch expense records included in the current report scope.</p><small>{workspace.reports.expenseCount} records</small></div></article></section><section className="accountant-panel accountant-readonly"><header><div><h2>Scoped P&amp;L</h2><p>Read-only summary calculated from live permitted records.</p></div><span className="accountant-locked"><Icon name="visibility" />Read only</span></header><dl><div><dt>Revenue</dt><dd>{money(workspace.reports.revenue)}</dd></div><div><dt>Operating costs</dt><dd>{money(workspace.reports.operatingCosts)}</dd></div><div><dt>Net margin</dt><dd className={workspace.reports.netMargin >= 0 ? 'is-positive' : ''}>{money(workspace.reports.netMargin)}</dd></div></dl></section></>}
      {tab === 'security' && <><section className="accountant-section-head"><div><span className="accountant-eyebrow">Account</span><h2>Security Settings</h2><p>Manage your account password and security settings.</p></div></section><ChangePasswordForm className="accountant-panel" /></>}
    </>;

  return <PageShell accountPath="/staff/account" securityPath="/staff/security" title="Accountant Workspace" subtitle="Branch finance, billing and controlled petty cash." userRole={user?.role ?? 'ACCOUNTANT'} userName={user?.name ?? 'Signed-in user'} onLogout={logout} navItems={accountantNavItems} defaultSidebarCollapsed><div className="accountant-page">{body}</div>
    {cashDialog && <Modal title={cashDialog === 'new' ? 'New petty cash request' : `Revise ${cashDialog.id.slice(0, 8)}`} description="List each required item. The calculated total is sent through the two-level approval record." onClose={() => setCashDialog(null)}>
      <form className="accountant-form" onSubmit={submitCash} noValidate>
        <label htmlFor="cash-branch">Branch <span aria-hidden="true">*</span>
          <select id="cash-branch" value={branchId} disabled={cashDialog !== 'new'} onChange={(event) => { setBranchId(event.target.value); setCashError(''); }} required>{workspace?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
          <small>{money(requestBudget)} is available in this branch. Requests above this balance require tenant approval or additional branch funding.</small>
        </label>
        <fieldset className="accountant-line-items">
          <legend>Required items <span aria-hidden="true">*</span></legend>
          <p>Enter the item name, quantity, and amount for one unit. Row totals and the request total are calculated automatically.</p>
          <div className="accountant-line-heading" aria-hidden="true"><span>Item name</span><span>Quantity</span><span>Amount</span><span>Total</span><span /></div>
          {cashItems.map((item, index) => {
            const lineTotal = Number(item.quantity || 0) * Number(item.unitAmount || 0);
            return <div className="accountant-line-item" key={item.id}>
              <label htmlFor={`${item.id}-name`}><span className="accountant-mobile-label">Item name</span><input id={`${item.id}-name`} type="text" maxLength={160} placeholder="e.g. Whiteboard markers" value={item.name} onChange={(event) => updateCashLine(item.id, 'name', event.target.value)} aria-label={`Item ${index + 1} name`} required /></label>
              <label htmlFor={`${item.id}-quantity`}><span className="accountant-mobile-label">Quantity</span><input id={`${item.id}-quantity`} type="text" inputMode="numeric" pattern="[0-9]+" value={item.quantity} onChange={(event) => updateCashLine(item.id, 'quantity', event.target.value)} aria-label={`Item ${index + 1} quantity`} required /></label>
              <label htmlFor={`${item.id}-amount`}><span className="accountant-mobile-label">Amount (NPR)</span><input id={`${item.id}-amount`} type="text" inputMode="decimal" placeholder="0.00" value={item.unitAmount} onChange={(event) => updateCashLine(item.id, 'unitAmount', event.target.value)} aria-label={`Item ${index + 1} amount in NPR`} required /></label>
              <output aria-label={`Item ${index + 1} total`}><span className="accountant-mobile-label">Total</span>{money(lineTotal)}</output>
              <button type="button" className="accountant-icon-button" disabled={cashItems.length === 1} onClick={() => setCashItems((current) => current.filter((line) => line.id !== item.id))} aria-label={`Remove item ${index + 1}`}><Icon name="delete" /></button>
            </div>;
          })}
          <button type="button" className="accountant-add-line" onClick={() => setCashItems((current) => [...current, createCashLine()])}><Icon name="add" />Add another item</button>
        </fieldset>
        <div className="accountant-request-total" aria-live="polite"><span>Total amount</span><strong>{money(requestTotal)}</strong><small>{money(Math.max(0, requestBudget - requestTotal))} will remain available in this branch.</small></div>
        <label htmlFor="cash-purpose">Description / purpose <span aria-hidden="true">*</span><textarea id="cash-purpose" maxLength={1000} rows={4} placeholder="Explain why these items are required…" value={purpose} onChange={(event) => { setPurpose(event.target.value); setCashError(''); }} required /></label>
        {cashError && <p className="accountant-field-error" role="alert">{cashError}</p>}
        <footer><button type="button" className="accountant-secondary-button" onClick={() => setCashDialog(null)}>Cancel</button><button type="submit" className="accountant-primary-button" disabled={submitting || !branchId || !purpose.trim() || !cashItemsValid || requestTotal <= 0}>{submitting ? 'Saving…' : cashDialog === 'new' ? 'Submit itemized request' : 'Resubmit revision'}</button></footer>
      </form>
    </Modal>}
    {receiptDialog && <Modal title={`Submit receipt · ${receiptDialog.id.slice(0, 8)}`} description="Use a durable HTTPS link from approved document storage. The record stays open until administrator verification." onClose={() => setReceiptDialog(null)}><form className="accountant-form" onSubmit={submitReceipt}><div className="accountant-receipt-summary"><span><small>Purpose</small><strong>{receiptDialog.purpose}</strong></span><span><small>Released amount</small><strong>{money(receiptDialog.amount)}</strong></span></div><label htmlFor="receipt-url">Receipt URL <span aria-hidden="true">*</span><input id="receipt-url" type="url" maxLength={2000} placeholder="https://…" value={receiptUrl} onChange={(event) => setReceiptUrl(event.target.value)} required /><small>Direct uploads will be enabled with the production object-storage contract.</small></label><footer><button type="button" className="accountant-secondary-button" onClick={() => setReceiptDialog(null)}>Cancel</button><button type="submit" className="accountant-primary-button" disabled={submitting || !/^https?:\/\/\S+$/i.test(receiptUrl.trim())}>{submitting ? 'Submitting…' : 'Submit receipt link'}</button></footer></form></Modal>}
    {paymentDialog && <Modal title="Record payment received" description={`Manual payment confirmation for ${paymentDialog.id.slice(0, 8)}.`} onClose={() => setPaymentDialog(null)}><form className="accountant-form" onSubmit={confirmPayment}><div className="accountant-receipt-summary"><span><small>Student</small><strong>{paymentDialog.studentName}</strong></span><span><small>Amount</small><strong>{money(paymentDialog.netPayable)}</strong></span></div><label htmlFor="payment-reference">Reference or receipt number <span aria-hidden="true">*</span><input id="payment-reference" type="text" maxLength={128} pattern="[A-Za-z0-9._/\-]+" autoComplete="off" value={reference} onChange={(event) => setReference(event.target.value)} required /><small>The API stores this unique reference in the invoice audit record.</small></label><div className="accountant-warning-note"><Icon name="warning" /><span>Confirm only after matching the amount and payer in the bank or cash record.</span></div><footer><button type="button" className="accountant-secondary-button" onClick={() => setPaymentDialog(null)}>Cancel</button><button type="submit" className="accountant-primary-button" disabled={submitting || !reference.trim()}>{submitting ? 'Confirming…' : 'Confirm received'}</button></footer></form></Modal>}
    {selectedCash && <Modal title={`Petty cash request · ${selectedCash.id.slice(0, 8)}`} description="Complete persisted request, approval, and receipt details." onClose={() => setSelectedCash(null)}><div className="accountant-cash-details">
      <section className="accountant-cash-summary"><div><small>Status</small><StatusPill label={cashStatusLabel(selectedCash)} /></div><div><small>Submitted</small><strong>{dateLabel(selectedCash.createdAt)}</strong></div><div><small>Total requested</small><strong>{money(selectedCash.amount)}</strong></div></section>
      <section className="accountant-detail-section"><h3>Required items</h3><div className="accountant-table-scroll"><table className="accountant-table accountant-cash-items-table"><thead><tr><th>Item</th><th>Quantity</th><th>Amount</th><th>Total</th></tr></thead><tbody>{selectedCash.items.map((item, index) => <tr key={`${item.name}-${index}`}><td>{item.name}</td><td>{item.quantity}</td><td>{money(item.unitAmount)}</td><td className="is-amount">{money(item.totalAmount)}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>Total requested</th><td>{money(selectedCash.amount)}</td></tr></tfoot></table></div></section>
      <section className="accountant-detail-section"><h3>Description / purpose</h3><p>{selectedCash.purpose}</p></section>
      <div className="accountant-detail-grid"><section><h3>Request details</h3><dl className="accountant-detail-list"><div><dt>Request ID</dt><dd>{selectedCash.id}</dd></div><div><dt>Branch</dt><dd>{selectedCash.branchName}</dd></div><div><dt>Last updated</dt><dd>{dateLabel(selectedCash.updatedAt)}</dd></div></dl></section><section><h3>Approval history</h3>{selectedCash.approvalChain.length ? <ol className="accountant-approval-steps">{selectedCash.approvalChain.map((entry, index) => <li className="is-complete" key={`${entry.timestamp}-${index}`}><Icon name="check_circle" /><span><strong>{entry.action ?? 'Recorded action'}</strong><small>{entry.role ?? 'System'}{entry.timestamp ? ` · ${dateLabel(entry.timestamp)}` : ''}{entry.comment ? ` · ${entry.comment}` : ''}</small></span></li>)}</ol> : <p>No approval actions recorded.</p>}</section></div>
      {selectedCash.receiptProofUrl && <section className="accountant-detail-section"><h3>Receipt</h3><a href={selectedCash.receiptProofUrl} target="_blank" rel="noreferrer">Open submitted proof</a></section>}
      <footer>{needsRevision(selectedCash) && <button type="button" className="accountant-primary-button" onClick={() => { setSelectedCash(null); openCashDialog(selectedCash); }}>Revise request</button>}{selectedCash.status === 'RELEASED' && <button type="button" className="accountant-primary-button" onClick={() => { setSelectedCash(null); setReceiptDialog(selectedCash); setReceiptUrl(''); }}>Add receipt link</button>}<button type="button" className="accountant-secondary-button" onClick={() => setSelectedCash(null)}>Close</button></footer>
    </div></Modal>}
  </PageShell>;
}
