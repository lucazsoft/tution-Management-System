import { useState, type FormEvent } from 'react';
import { request } from '../services/api/client';
import { Button } from './ui/Button';

export function MobileChangeForm({ allowVerify = false }: { allowVerify?: boolean }) {
  const [verifyExisting, setVerifyExisting] = useState(false);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<{ challengeId: string; currentDestination: string; newDestination: string } | null>(null);
  const [currentCode, setCurrentCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const cancel = () => { setOpen(false); setPassword(''); setPhone(''); setChallenge(null); setCurrentCode(''); setNewCode(''); setError(''); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      if (!challenge) {
        const result = await request<{ challengeId: string; currentDestination: string; newDestination: string }>('/account/contact/mobile/start', { method: 'POST', body: JSON.stringify(verifyExisting ? { password, verifyExisting: true } : { password, phone }) });
        setChallenge(result); setPassword('');
      } else {
        await request('/account/contact/mobile/confirm', { method: 'POST', body: JSON.stringify({ challengeId: challenge.challengeId, currentCode, ...(verifyExisting ? {} : { newCode }) }) });
        localStorage.removeItem('tms_user'); sessionStorage.removeItem('tms_user'); setDone(true);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to verify the change.'); }
    finally { setBusy(false); }
  };
  if (done) return <div role="status"><p>Your security mobile has been {verifyExisting ? 'verified' : 'changed'}. All sessions have been signed out.</p><a href="/login">Sign in again</a></div>;
  if (!open) return <div className="account-actions">{allowVerify && <Button onClick={() => { setVerifyExisting(true); setOpen(true); }}>Verify mobile</Button>}<Button style={{ color: 'var(--text)' }} variant="outline" onClick={() => { setVerifyExisting(false); setOpen(true); }}>Change security mobile</Button></div>;
  return <form onSubmit={submit} className="account-section" aria-label={verifyExisting ? 'Verify security mobile' : 'Change security mobile'}>
    <h3>{verifyExisting ? 'Verify security mobile' : 'Change security mobile'}</h3>
    <p>{verifyExisting ? 'Confirm your password, then enter the code sent to your saved mobile. Completing verification signs out all devices.' : 'Your current number stays active until both codes are confirmed. Completing this change signs out all devices.'}</p>
    {error && <p role="alert">{error}</p>}
    <div className="account-fields">
      {!challenge ? <><label>Current password<input autoFocus type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></label>{!verifyExisting && <label>New mobile number<input type="tel" autoComplete="tel" required maxLength={30} placeholder="98XXXXXXXX" value={phone} onChange={event => setPhone(event.target.value)} disabled={busy} /></label>}</> : <>
        <label>Code sent to {challenge.currentDestination}<input autoFocus inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={currentCode} onChange={event => setCurrentCode(event.target.value.replace(/\D/g, ''))} disabled={busy} /></label>
        {!verifyExisting && <label>Code sent to {challenge.newDestination}<input inputMode="numeric" autoComplete="off" required pattern="[0-9]{6}" maxLength={6} value={newCode} onChange={event => setNewCode(event.target.value.replace(/\D/g, ''))} disabled={busy} /></label>}
      </>}
    </div>
    {challenge && <p>{verifyExisting ? 'The code expires' : 'Both codes expire'} after five minutes. To request new codes, cancel and start again.</p>}
    <div className="account-actions"><Button type="submit" disabled={busy}>{busy ? 'Please wait…' : challenge ? (verifyExisting ? 'Verify mobile' : 'Confirm mobile change') : (verifyExisting ? 'Send verification code' : 'Send verification codes')}</Button><Button type="button" style={{ color: 'var(--text)' }} variant="outline" disabled={busy} onClick={cancel}>Cancel</Button></div>
    <details><summary>Can’t access your current number?</summary><p>Contact platform support for an identity review. After support approves your replacement number, <a href="/recover-mobile">complete recovery with your private token and SMS code</a>.</p></details>
  </form>;
}
