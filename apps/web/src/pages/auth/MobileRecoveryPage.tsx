import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { request } from '../../services/api/client';
import { Button } from '../../components/ui/Button';

export function MobileRecoveryPage() {
  const [token, setToken] = useState('');
  const [code, setCode] = useState('');
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (!destination) {
        const response = await request<{ destination: string }>('/account/recovery/send', { method: 'POST', body: JSON.stringify({ token: token.trim() }) });
        setDestination(response.destination);
      } else {
        await request('/account/recovery/confirm', { method: 'POST', body: JSON.stringify({ token: token.trim(), code }) });
        localStorage.removeItem('tms_user'); sessionStorage.removeItem('tms_user');
        setToken(''); setCode(''); setDone(true);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Recovery is unavailable. Please try again.'); }
    finally { setBusy(false); }
  };
  if (done) return <div className="auth-page"><section className="auth-centered-card" role="status"><h1>Security mobile recovered</h1><p>Your replacement number is verified. All existing sessions have been signed out. Your password is unchanged.</p><a href="/login">Sign in again</a></section></div>;
  return <div className="auth-page"><section className="auth-centered-card">
    <h1>Recover your security mobile</h1>
    <p>If you cannot access your old number, contact platform support for an identity review. Support will approve a specific replacement number and give you a private recovery token.</p>
    <p>Never send support your password or SMS verification code.</p>
    <form onSubmit={submit} aria-label="Recover security mobile">
      {error && <p role="alert">{error}</p>}
      <div className="account-fields">
        {!destination ? <label>Recovery token<input type="password" autoComplete="off" required maxLength={43} minLength={43} value={token} onChange={event => setToken(event.target.value.trim())} disabled={busy} /></label>
          : <label>Code sent to {destination}<input autoFocus inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} disabled={busy} /></label>}
      </div>
      {destination && <p>The code expires in five minutes. Resends require a one-minute wait and do not reset the five-attempt limit.</p>}
      <div className="account-actions"><Button type="submit" disabled={busy}>{busy ? 'Please wait…' : destination ? 'Verify replacement number' : 'Send SMS code'}</Button>
        {destination && <Button type="button" variant="outline" disabled={busy} onClick={() => { setDestination(''); setCode(''); setError(''); }}>Request another code</Button>}
      </div>
    </form>
    <Link to="/login">Back to sign in</Link>
  </section></div>;
}
