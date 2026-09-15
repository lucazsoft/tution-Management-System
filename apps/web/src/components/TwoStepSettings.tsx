import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authClient } from '../features/auth/auth-client';
import { errorMessage, request } from '../services/api/client';
import { AccountSection, AccountStatus } from './AccountLayout';
import { Button } from './ui/Button';

type SecurityStatus = {
  twoFactorEnabled: boolean;
  mobileVerified: boolean;
  phone: string;
};

type Stage = 'idle' | 'password' | 'code' | 'backup';

export function TwoStepSettings({ accountPath }: { accountPath?: string }) {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [stage, setStage] = useState<Stage>('idle');
  const [busy, setBusy] = useState(false);
  const [savedCodes, setSavedCodes] = useState(false);

  useEffect(() => {
    let active = true;
    request<SecurityStatus>('/users/me/account')
      .then(value => {
        if (active) setStatus(value);
      })
      .catch(cause => {
        if (active) setError(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [revision]);

  const sendCode = async () => {
    const result = await authClient.twoFactor.sendOtp();
    if (result.error) throw new Error(result.error.message || 'Unable to send a code.');
  };

  const resetForm = () => {
    setStage('idle');
    setPassword('');
    setCode('');
    setBackupCodes([]);
    setSavedCodes(false);
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !status) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (stage === 'code') {
        const result = await authClient.twoFactor.verifyOtp({ code });
        if (result.error) throw new Error(result.error.message || 'Unable to verify the code.');
        setCode('');
        setStatus({ ...status, twoFactorEnabled: true });
        setStage('backup');
      } else if (status.twoFactorEnabled) {
        const result = await authClient.twoFactor.disable({ password });
        if (result.error) throw new Error(result.error.message || 'Unable to disable two-step sign-in.');
        setStatus({ ...status, twoFactorEnabled: false });
        resetForm();
        setMessage('Two-step sign-in has been turned off.');
      } else {
        const result = await authClient.twoFactor.enable({ password });
        if (result.error) throw new Error(result.error.message || 'Unable to start setup.');
        setPassword('');
        setBackupCodes(result.data?.backupCodes ?? []);
        setStage('code');
        await sendCode();
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountSection title="Two-step sign-in" description="Use an SMS code after your password when signing in.">
      {error && (
        <p role="alert">
          {error}
          {!status && <Button onClick={() => { setError(''); setRevision(value => value + 1); }}>Retry</Button>}
        </p>
      )}
      {!status && !error && <p role="status">Loading security settings…</p>}
      {message && <p role="status">{message}</p>}
      {status && (
        <>
          <AccountStatus verified={status.twoFactorEnabled}>
            {status.twoFactorEnabled ? 'Enabled' : 'Not enabled'}
          </AccountStatus>
          {!status.mobileVerified && !status.twoFactorEnabled && (
            <p>
              Verify your security mobile before enabling two-step sign-in.{' '}
              {accountPath && <Link to={accountPath}>Open My account</Link>}
            </p>
          )}
          {stage === 'idle' && (
            <div className="account-actions">
              <Button
                disabled={!status.twoFactorEnabled && !status.mobileVerified}
                onClick={() => { setStage('password'); setError(''); setMessage(''); }}
              >
                {status.twoFactorEnabled ? 'Turn off two-step sign-in' : 'Set up two-step sign-in'}
              </Button>
            </div>
          )}
          {(stage === 'password' || stage === 'code') && (
            <form onSubmit={submit}>
              {status.twoFactorEnabled && <p>Turning this off removes the additional code required when you sign in.</p>}
              <div className="account-fields">
                {stage === 'password' ? (
                  <label>
                    Current password
                    <input
                      type="password"
                      autoComplete="current-password"
                      required
                      maxLength={128}
                      disabled={busy}
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                    />
                  </label>
                ) : (
                  <label>
                    SMS code sent to ******{status.phone.slice(-4)}
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      required
                      maxLength={6}
                      disabled={busy}
                      value={code}
                      onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
                    />
                  </label>
                )}
              </div>
              {stage === 'code' && <p>Codes expire after five minutes. Setup is complete only after your code is confirmed.</p>}
              <div className="account-actions">
                <Button type="submit" disabled={busy}>
                  {busy ? 'Please wait…' : stage === 'code' ? 'Confirm code' : status.twoFactorEnabled ? 'Turn off' : 'Send setup code'}
                </Button>
                {stage === 'code' && (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError('');
                      try {
                        await sendCode();
                        setMessage('A new code has been sent.');
                      } catch (cause) {
                        setError(errorMessage(cause));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Resend code
                  </Button>
                )}
                <Button type="button" disabled={busy} onClick={resetForm}>Cancel</Button>
              </div>
            </form>
          )}
          {stage === 'backup' && (
            <div role="status">
              <h3>Save your recovery codes</h3>
              <p>Store these privately before leaving this page. Each code can be used once if you cannot receive an SMS.</p>
              <ul>{backupCodes.map(item => <li key={item}><code>{item}</code></li>)}</ul>
              <label>
                <input
                  type="checkbox"
                  checked={savedCodes}
                  onChange={event => setSavedCodes(event.target.checked)}
                />{' '}
                I have saved my recovery codes
              </label>
              <div className="account-actions">
                <Button
                  disabled={!savedCodes}
                  onClick={() => {
                    resetForm();
                    setMessage('Two-step sign-in is enabled.');
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </AccountSection>
  );
}
