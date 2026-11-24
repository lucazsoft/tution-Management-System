import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { financeApi, type BranchFunding } from '../../services/api/finance';
import { errorMessage } from '../../services/api/client';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export function PettyCashFunding({ tenant = false, onUpdated }: { tenant?: boolean; onUpdated?: () => void }) {
  const [data, setData] = useState<BranchFunding>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [branchId, setBranchId] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    try { setData(await financeApi.funding()); setError(''); } catch (cause) { setError(errorMessage(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const mutate = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await operation(); setAmount(''); setPurpose(''); await load(); onUpdated?.(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(() => financeApi.requestFunding(branchId || data?.allowances[0]?.branchId || '', Number(amount), purpose));
  };
  return <Card hoverable={false}>
    <h3>Branch petty cash allowance</h3>
    <p>The tenant policy provides a monthly allowance for each branch. Approved additional funds increase that branch’s allowance for the month. Cash releases use this balance.</p>
    {error && <p role="alert">{error} <Button variant="outline" onClick={() => void load()}>Reload</Button></p>}
    {!data && !error && <p>Loading branch balances…</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, margin: '16px 0' }}>{data?.allowances.map(b => <div key={b.branchId}><strong>{b.branchName} · {b.period}</strong><p>Available: NPR {b.available.toLocaleString()}</p><small>Allowance: NPR {b.limit.toLocaleString()} · Used: NPR {b.used.toLocaleString()}</small></div>)}</div>
    {!tenant && data?.allowances.length ? <form onSubmit={submit} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
      <label>Branch <select value={branchId || data.allowances[0].branchId} onChange={e => setBranchId(e.target.value)}>{data.allowances.map(b => <option key={b.branchId} value={b.branchId}>{b.branchName}</option>)}</select></label>
      <label>Additional amount (NPR) <input type="number" min="0.01" max="10000000" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <label>Reason <input required maxLength={1000} value={purpose} onChange={e => setPurpose(e.target.value)} /></label>
      <Button type="submit" disabled={busy}>Request additional funds</Button>
    </form> : null}
    <h4 style={{ marginTop: 20 }}>Additional funding requests</h4>
    {data?.requests.length === 0 && <p>No additional funding requests.</p>}
    {data?.requests.map(r => <div key={r.id} style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
      <strong>{data.allowances.find(b => b.branchId === r.branchId)?.branchName} · NPR {Number(r.amount).toLocaleString()}</strong>
      <p>{r.purpose} · {r.period} · {r.status}</p>{r.remarks && <p>{r.remarks}</p>}
      {tenant && r.status === 'PENDING' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <input aria-label="Funding decision remarks" placeholder="Reason (required to reject)" value={remarks[r.id] || ''} onChange={e => setRemarks(old => ({ ...old, [r.id]: e.target.value }))} />
        <Button disabled={busy} onClick={() => void mutate(() => financeApi.decideFunding(r.id, 'APPROVE', remarks[r.id] || ''))}>Approve additional funds</Button>
        <Button variant="danger" disabled={busy || !remarks[r.id]?.trim()} onClick={() => void mutate(() => financeApi.decideFunding(r.id, 'REJECT', remarks[r.id]))}>Reject</Button>
      </div>}
    </div>)}
  </Card>;
}
