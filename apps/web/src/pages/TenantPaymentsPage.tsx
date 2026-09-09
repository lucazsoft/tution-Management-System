import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { StatusBadge, type StatusBadgeVariant } from '../components/ui/StatusBadge';
import { api } from '../services/api';
import { ApiError, errorMessage } from '../services/api/client';

type PaymentAttempt = Awaited<ReturnType<typeof api.finances.getPaymentAttempts>>['attempts'][number];
type Filter = 'ALL' | 'REVIEW' | 'SUCCESS' | 'PENDING' | 'FAILED';
const filters: Array<{ value: Filter; label: string }> = [
  { value: 'ALL', label: 'All payments' }, { value: 'REVIEW', label: 'Needs review' },
  { value: 'SUCCESS', label: 'Successful' }, { value: 'PENDING', label: 'Pending' }, { value: 'FAILED', label: 'Failed' },
];

function displayStatus(item: PaymentAttempt) {
  if (item.provider === 'BANK' && item.status === 'PENDING') return 'Needs review';
  if (item.status === 'SUCCESS') return 'Successful';
  if (item.status === 'FAILED') return 'Failed';
  if (item.status === 'INCOMPLETE') return 'Interrupted';
  return 'Pending';
}
function statusVariant(item: PaymentAttempt): StatusBadgeVariant {
  if (item.status === 'SUCCESS') return 'success';
  if (item.status === 'FAILED') return 'error';
  return item.provider === 'BANK' ? 'warning' : 'info';
}

export function TenantPaymentsPage() {
  const [attempts, setAttempts] = useState<PaymentAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [reviewing, setReviewing] = useState('');
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [proof, setProof] = useState<PaymentAttempt | null>(null);

  const load = async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true); setError('');
    try {
      try {
        const result = await api.finances.getPaymentAttempts();
        setAttempts(result.attempts);
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
        const fallback = await api.finances.getManualPayments();
        setAttempts(fallback.attempts.map((item) => ({
          ...item,
          provider: 'BANK' as const,
          gatewayStatus: item.status === 'PENDING' ? 'AWAITING_REVIEW' : null,
          gatewayMessage: null,
          confirmedAt: item.status === 'SUCCESS' ? item.reviewedAt : null,
          failedAt: item.status === 'FAILED' ? item.reviewedAt : null,
          invoiceStatus: item.status === 'SUCCESS' ? 'PAID' : 'UNPAID',
          branchId: '',
          branchName: 'Unknown branch',
        })));
      }
    }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(true); };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  useEffect(() => {
    if (!proof) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setProof(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [proof]);

  const decide = async (id: string, decision: 'APPROVE' | 'REJECT') => {
    setReviewing(id); setError(''); setNotice('');
    try { const result = await api.finances.decideManualPayment(id, decision, remarks[id] || ''); setNotice(result.message); await load(true); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setReviewing(''); }
  };

  const counts = useMemo(() => ({
    received: attempts.filter((item) => item.status === 'SUCCESS').reduce((sum, item) => sum + item.amount, 0),
    review: attempts.filter((item) => item.provider === 'BANK' && item.status === 'PENDING').length,
    pending: attempts.filter((item) => item.provider === 'CONNECTIPS' && ['PENDING', 'INCOMPLETE'].includes(item.status)).length,
    failed: attempts.filter((item) => item.status === 'FAILED').length,
  }), [attempts]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return attempts.filter((item) => {
      const matchesFilter = filter === 'ALL' || (filter === 'REVIEW' && item.provider === 'BANK' && item.status === 'PENDING')
        || (filter === 'PENDING' && ['PENDING', 'INCOMPLETE'].includes(item.status)) || item.status === filter;
      const matchesSearch = !needle || [item.studentName, item.referenceId, item.txnId, item.invoiceId].some((value) => value.toLowerCase().includes(needle));
      return matchesFilter && matchesSearch;
    });
  }, [attempts, filter, query]);

  if (loading) return <main className="payments-page"><div className="payments-skeleton" aria-label="Loading payments" aria-busy="true" /></main>;
  if (error && !attempts.length) return <main className="payments-page"><div className="payments-error" role="alert"><strong>Payments could not load</strong><p>{error}</p><Button onClick={() => void load()}>Try again</Button></div></main>;

  return <main className="payments-page">
    <header className="payments-header"><div><span className="payments-eyebrow">FINANCE</span><h1>Payments</h1><p>Track connectIPS payments and verify receipts submitted through the manual QR flow.</p></div><Button variant="secondary" disabled={refreshing} onClick={() => void load(true)}><span className="material-symbols-outlined" aria-hidden="true">refresh</span>{refreshing ? 'Refreshing…' : 'Refresh'}</Button></header>
    {error ? <p className="payments-alert is-error" role="alert">{error}</p> : null}{notice ? <p className="payments-alert" role="status">{notice}</p> : null}
    <section className="payments-stats" aria-label="Payment summary">
      <article><span>Total received</span><strong>NPR {counts.received.toLocaleString('en-NP')}</strong><small>Confirmed payments</small></article>
      <article><span>Needs review</span><strong>{counts.review}</strong><small>Manual QR receipts</small></article>
      <article><span>Online pending</span><strong>{counts.pending}</strong><small>connectIPS attempts</small></article>
      <article><span>Failed</span><strong>{counts.failed}</strong><small>Requires payer retry</small></article>
    </section>
    <section className="payments-card payments-activity">
      <div className="payments-activity-head"><div><h2>Payment activity</h2><p>One view for online confirmations and manually verified QR payments.</p></div><span>{attempts.length} records</span></div>
      <div className="payments-toolbar"><label className="payments-search"><span className="material-symbols-outlined" aria-hidden="true">search</span><input type="search" aria-label="Search payments" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student, reference, or invoice" /></label><div className="payments-filters" aria-label="Filter payments">{filters.map((item) => <button key={item.value} type="button" className={filter === item.value ? 'is-active' : ''} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div></div>
      {visible.length ? <div className="payments-table-scroll"><table className="payments-table"><thead><tr><th>Payer / invoice</th><th>Branch</th><th>Method</th><th>Reference</th><th>Amount</th><th>Submitted</th><th>Status</th><th>Review</th></tr></thead><tbody>{visible.map((item) => {
        const needsReview = item.provider === 'BANK' && item.status === 'PENDING';
        return <tr key={item.id}><td><strong>{item.studentName}</strong><small>Invoice {item.invoiceId.slice(0, 8).toUpperCase()}</small></td><td><strong>{item.branchName}</strong><small>{item.branchId ? item.branchId.slice(0, 8).toUpperCase() : 'Legacy record'}</small></td><td><span className="payments-method"><span className="material-symbols-outlined" aria-hidden="true">{item.provider === 'CONNECTIPS' ? 'bolt' : 'qr_code_2'}</span>{item.provider === 'CONNECTIPS' ? 'connectIPS' : 'Manual QR'}</span></td><td><code>{item.referenceId}</code>{item.gatewayMessage ? <small>{item.gatewayMessage}</small> : null}</td><td className="payments-amount">NPR {item.amount.toLocaleString('en-NP')}</td><td>{new Date(item.createdAt).toLocaleString('en-NP')}</td><td><StatusBadge variant={statusVariant(item)}>{displayStatus(item)}</StatusBadge></td><td>{item.provider === 'BANK' ? <div className="payments-row-review">{item.receiptProof ? <button type="button" className="payments-proof-button" onClick={() => setProof(item)}>View payment proof</button> : null}{needsReview ? <><input aria-label={`Review note for ${item.studentName}`} value={remarks[item.id] || ''} maxLength={500} placeholder="Review note" onChange={(event) => setRemarks((current) => ({ ...current, [item.id]: event.target.value }))} /><div><Button type="button" disabled={reviewing === item.id} onClick={() => void decide(item.id, 'APPROVE')}>Approve</Button><Button type="button" variant="danger" disabled={reviewing === item.id || !(remarks[item.id] || '').trim()} onClick={() => void decide(item.id, 'REJECT')}>Reject</Button></div></> : item.reviewRemarks ? <small>{item.reviewRemarks}</small> : null}</div> : <small>Automatic verification</small>}</td></tr>;
      })}</tbody></table></div> : <div className="payments-review-empty" role="status"><span className="material-symbols-outlined" aria-hidden="true">payments</span><strong>No matching payments</strong><p>{attempts.length ? 'Try another search or filter.' : 'Payment attempts will appear here as families start paying.'}</p></div>}
    </section>
    {proof?.receiptProof ? <div className="payments-proof-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProof(null); }}><section className="payments-proof-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-proof-title" onKeyDown={(event) => { if (event.key === 'Escape') setProof(null); }}><header><div><span className="payments-eyebrow">PAYMENT PROOF</span><h2 id="payment-proof-title">{proof.studentName}</h2><p>{proof.branchName} · Reference {proof.referenceId}</p></div><button type="button" aria-label="Close payment proof" onClick={() => setProof(null)}><span className="material-symbols-outlined" aria-hidden="true">close</span></button></header><div className="payments-proof-image"><img src={proof.receiptProof} alt={`Payment proof submitted by ${proof.studentName}`} /></div><footer><span>NPR {proof.amount.toLocaleString('en-NP')}</span><small>Submitted {new Date(proof.createdAt).toLocaleString('en-NP')}</small></footer></section></div> : null}
  </main>;
}
