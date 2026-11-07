import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { requestPasswordResetOtp, resetPassword, verifyPasswordResetOtp } from '../auth/service';
import { getPasswordRuleResults } from '../auth/utils';

/**
 * Lets a parent reset a guardian-linked child's password from the portal
 * (docs/planphone.md, phase 6). The code is sent to the parent's own verified
 * phone, because the child uses "the parent's number as primary".
 */
export function ChildPasswordReset({ childName, loginId }: { childName: string; loginId: string }) {
  const { showToast } = useToast();
  const [step, setStep] = useState<'idle' | 'code' | 'password'>('idle');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const fail = (error: unknown) => showToast(error instanceof Error ? error.message : 'Something went wrong. Try again.', 'error');

  const sendCode = async () => {
    setBusy(true);
    try {
      await requestPasswordResetOtp(loginId);
      setStep('code');
      showToast(`If your phone is verified, a code for ${childName} was sent to it.`, 'success');
    } catch (error) { fail(error); } finally { setBusy(false); }
  };

  const confirmCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      setToken(await verifyPasswordResetOtp(loginId, code.trim()));
      setStep('password');
    } catch (error) { fail(error); } finally { setBusy(false); }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!getPasswordRuleResults(password).every(Boolean)) {
      showToast('Use at least 8 characters with uppercase, lowercase, a number, and a symbol.', 'error');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
      showToast(`${childName}'s password was changed. Their other devices were signed out.`, 'success');
      setStep('idle'); setCode(''); setToken(''); setPassword('');
    } catch (error) { fail(error); } finally { setBusy(false); }
  };

  if (step === 'idle') {
    return <Button type="button" variant="outline" disabled={busy} onClick={() => void sendCode()}>{busy ? 'Sending…' : 'Reset password'}</Button>;
  }
  if (step === 'code') {
    return <form onSubmit={(event) => void confirmCode(event)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
      <label style={{ fontSize: 13 }}>Code sent to your phone
        <input inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} style={{ display: 'block', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
      </label>
      <Button type="submit" disabled={busy || code.trim().length !== 6}>Verify</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => setStep('idle')}>Cancel</Button>
    </form>;
  }
  return <form onSubmit={(event) => void savePassword(event)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
    <label style={{ fontSize: 13 }}>New password for {childName}
      <input type="password" required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} style={{ display: 'block', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
    </label>
    <Button type="submit" disabled={busy}>Save password</Button>
  </form>;
}
