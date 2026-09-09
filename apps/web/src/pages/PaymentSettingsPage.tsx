import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BranchPaymentSettings, SourceBadge } from '../components/BranchPaymentSettings';
import { Button } from '../components/ui/Button';
import { api } from '../services/api';
import { paymentSettingsError, type PaymentAudit } from '../services/payment-settings';

export function PaymentSettingsPage() {
  const { user, isTenantAdmin } = useAuth();
  const tenant = isTenantAdmin();
  const allowed = tenant || Boolean(user?.roles?.some(role => role.roleName === 'Branch Admin' && role.branchId));
  const [params, setParams] = useSearchParams();
  const selected = params.get('branchId') ?? '';
  const [audit, setAudit] = useState<PaymentAudit | null>(null);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('name');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    if (!allowed) { setLoading(false); return; }
    setLoading(true); setError('');
    const load = async () => {
      try {
        if (tenant) {
          const data = await api.finances.getAllBranchPaymentSettings();
          if (active) { setAudit(data); setBranches(data.branches.map(row => row.branch)); }
        } else {
          const data = await api.branches.list() as { id: string; name: string }[];
          if (active) setBranches(data.filter(branch => user?.roles?.some(role => role.roleName === 'Branch Admin' && role.branchId === branch.id)));
        }
      } catch (cause) { if (active) setError(paymentSettingsError(cause)); }
      finally { if (active) setLoading(false); }
    };
    void load(); return () => { active = false; };
  }, [allowed, tenant, user, revision]);
  if (!allowed) return <p role="alert">Insufficient permissions.</p>;
  const rows = audit?.branches.filter(row => filter === 'all' || Boolean(row.settings?.staticQrEnabled) === (filter === 'custom')).sort((a, b) =>
    (sort === 'status' ? Number(Boolean(b.settings?.staticQrEnabled)) - Number(Boolean(a.settings?.staticQrEnabled)) : 0) || a.branch.name.localeCompare(b.branch.name)) ?? [];
  return <div className="payment-settings-page">
    <h1>{tenant ? 'Branch payment settings' : 'Your branch payment settings'}</h1>
    <p>{tenant ? 'Manage branch QR accounts and review which payment details each branch uses.' : 'Contact tenant admin to update QR settings.'}</p>
    {error && <div role="alert"><p>{error}</p><Button onClick={() => setRevision(value => value + 1)}>Retry</Button></div>}
    {loading ? <div className="payment-settings-skeleton" aria-busy="true" aria-label="Loading branches" /> : <>
      <label>Branch<select value={selected} onChange={event => setParams(event.target.value ? { branchId: event.target.value } : {})}><option value="">Select a branch</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      {selected && (branches.some(branch => branch.id === selected) ? <BranchPaymentSettings key={selected} branchId={selected} onSaved={() => setRevision(value => value + 1)} /> : <p role="alert">Branch not found or unavailable to this account.</p>)}
      {tenant && audit && <>
        <h2>All branch configurations</h2>
        <label>Filter<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All branches</option><option value="custom">Custom config</option><option value="defaults">Using defaults</option></select></label>
        <label>Sort by<select value={sort} onChange={event => setSort(event.target.value)}><option value="name">Branch name</option><option value="status">Status</option></select></label>
        <div className="payment-settings-table"><table><thead><tr>{['Branch name', 'Location', 'Status', 'Static QR', 'Source', 'Actions'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map(row => {
          const custom = row.settings?.staticQrEnabled === true;
          const effective = custom ? row.settings! : audit.tenantDefaults;
          return <tr key={row.branch.id}><th scope="row">{row.branch.name}</th><td>{row.branch.location || '—'}</td><td>{custom ? 'Active' : 'Using defaults'}</td><td>{effective.staticQrEnabled ? 'Enabled' : 'Disabled'}</td><td><SourceBadge source={custom ? 'branch' : 'tenant_default'} /></td><td><Button variant="outline" onClick={() => setParams({ branchId: row.branch.id })}>Edit<span className="sr-only"> {row.branch.name}</span></Button></td></tr>;
        })}</tbody></table></div>
        {!rows.length && <p>No branches match this filter.</p>}
      </>}
      {!branches.length && !error && <p>No branches available.</p>}
    </>}
  </div>;
}
