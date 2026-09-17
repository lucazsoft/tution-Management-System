import { useState } from 'react';
import { useToast } from './ui/Toast';
import { api } from '../services/api';
import { Button } from './ui/Button';

export function ChangePasswordForm({ className = '' }: { className?: string }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get('currentPassword'));
    const newPassword = String(form.get('newPassword'));
    const confirmPassword = String(form.get('confirmPassword'));

    if (newPassword !== confirmPassword) {
      return showToast('New passwords do not match.', 'error');
    }
    if (newPassword.length < 8) {
      return showToast('Password must be at least 8 characters.', 'error');
    }

    setBusy(true);
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      formElement.reset();
      showToast('Password changed. Other sessions have been signed out.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to change password.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    fontSize: '14px',
    background: 'var(--bg-background)',
    color: 'var(--text-foreground)',
    marginTop: '6px',
    boxSizing: 'border-box' as const,
  };

  return (
    <section className={className} style={{ marginTop: '24px', padding: '24px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--color-bg)' }}>
      <header style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', margin: 0 }}>Security</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Changing your password signs out your other sessions.</p>
      </header>
      <form onSubmit={(e) => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
        <div>
          <label htmlFor="currentPassword" style={{ fontSize: '13px', fontWeight: 600 }}>Current password</label>
          <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" disabled={busy} maxLength={128} required style={inputStyle} />
        </div>
        <div>
          <label htmlFor="newPassword" style={{ fontSize: '13px', fontWeight: 600 }}>New password</label>
          <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" disabled={busy} maxLength={128} required minLength={8} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="confirmPassword" style={{ fontSize: '13px', fontWeight: 600 }}>Confirm new password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" disabled={busy} maxLength={128} required minLength={8} style={inputStyle} />
        </div>
        <div style={{ marginTop: '8px' }}>
          <Button disabled={busy} type="submit" style={{ width: '100%' }}>
            {busy ? 'Updating...' : 'Change Password'}
          </Button>
        </div>
      </form>
    </section>
  );
}
