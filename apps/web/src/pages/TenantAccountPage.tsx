import { MobileChangeForm } from '../components/MobileChangeForm';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { request, errorMessage } from '../services/api/client';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { AccountLayout, AccountSection, AccountStatus } from '../components/AccountLayout';

interface Account { firstName: string; lastName: string; email: string; emailVerified: boolean; phone: string; mobileVerified?: boolean; mobileVerifiedAt?: string | null; tenant: { name: string }; twoFactorEnabled: boolean }
export function TenantAccountPage() {
  const { updateDisplayName } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [draft, setDraft] = useState({ firstName: '', lastName: '' });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const editButton = useRef<HTMLButtonElement>(null);
  const dirty = editing && Boolean(account && (draft.firstName !== account.firstName || draft.lastName !== account.lastName));
  useEffect(() => {
    let active = true;
    setError('');
    request<Account>('/users/me/account').then(data => { if (active) { setAccount(data); setDraft({ firstName: data.firstName, lastName: data.lastName }); } }).catch(cause => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  const close = () => { setEditing(false); setError(''); requestAnimationFrame(() => editButton.current?.focus()); };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!account || busy) return;
    if (!draft.firstName.trim() || !draft.lastName.trim()) { setError('Enter your first and last name.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await request<{ firstName: string; lastName: string; name: string }>('/users/me/account', { method: 'PATCH', body: JSON.stringify(draft) });
      setAccount({ ...account, ...saved }); setDraft({ firstName: saved.firstName, lastName: saved.lastName }); updateDisplayName(saved.name);
      close(); setMessage('Your profile has been saved.');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  return <AccountLayout title="My account" description="Manage your personal details and account security.">
    {error && <div role="alert" className="account-feedback">{error}{!account && <Button onClick={() => setRevision(value => value + 1)}>Retry</Button>}</div>}
    {message && <p role="status">{message}</p>}
    {!account && !error && <div className="account-skeleton" aria-busy="true" aria-label="Loading your account" />}
    {account && <>
      <AccountSection title="Personal details" description="Your name appears on your account and administrative records." action={!editing && <button ref={editButton} className="account-edit" onClick={() => { setDraft({ firstName: account.firstName, lastName: account.lastName }); setEditing(true); setMessage(''); }}>Edit name</button>}>
        {editing ? <form onSubmit={save}>
          <div className="account-fields"><label>First name<input autoFocus autoComplete="given-name" required maxLength={100} disabled={busy} value={draft.firstName} onChange={event => setDraft({ ...draft, firstName: event.target.value })} /></label><label>Last name<input autoComplete="family-name" required maxLength={100} disabled={busy} value={draft.lastName} onChange={event => setDraft({ ...draft, lastName: event.target.value })} /></label></div>
          <div className="account-actions"><Button type="submit" disabled={busy || !dirty} aria-busy={busy}>{busy ? 'Saving…' : 'Save changes'}</Button><Button type="button" style={{ color: 'var(--text)' }} variant="outline" disabled={busy} onClick={close}>Cancel</Button></div>
        </form> : <dl><div><dt>Name</dt><dd>{account.firstName} {account.lastName}</dd></div><div><dt>Institution</dt><dd>{account.tenant.name}</dd></div><div><dt>Role</dt><dd>Tenant Admin · All branches</dd></div></dl>}
      </AccountSection>
      <AccountSection title="Sign-in & security" description="Your mobile verification and sign-in protection are managed separately.">
        <dl>
          <div><dt>Login email</dt><dd><div className="account-value">{account.email}<AccountStatus verified={account.emailVerified}>{account.emailVerified ? 'Verified' : 'Verification not recorded'}</AccountStatus></div></dd></div>
          <div><dt>Security mobile</dt><dd><div className="account-value">{account.phone || 'No mobile number saved'}<AccountStatus verified={account.mobileVerified === true}>{account.mobileVerified === true ? 'Verified' : account.mobileVerified === false ? 'Verification required' : 'Status unavailable'}</AccountStatus></div><small>{account.mobileVerified ? 'Verified for SMS security checks. Payment changes still require a new confirmation code.' : 'Confirm ownership with an SMS code. Existing branch QR settings do not record mobile verification.'}</small></dd></div>
          <div><dt>Two-step sign-in</dt><dd><AccountStatus verified={account.twoFactorEnabled}>{account.twoFactorEnabled ? 'Enabled' : 'Not enabled'}</AccountStatus><small>An additional code when signing in. Verifying your mobile or a payment change does not enable this.</small></dd></div>
        </dl>
        {!editing && <div className="account-security-actions"><MobileChangeForm allowVerify={account.mobileVerified === false && Boolean(account.phone)} /><Link to="/tenant/security">Change password</Link></div>}
      </AccountSection>
      {!editing && <aside className="account-institution"><h2>Managing the institution?</h2><p>Institution policies and branch payment accounts have their own settings.</p><div className="account-actions"><Link to="/tenant/settings">Institution settings</Link><Link to="/tenant/payment-settings">Branch payment settings</Link></div></aside>}
    </>}
  </AccountLayout>;
}
