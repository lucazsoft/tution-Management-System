import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { useToast } from './ui/Toast';
import { paymentSettingsApi as api, paymentSettingsError, validateQRConfig, type PaymentSettings, type QRConfig } from '../services/payment-settings';
import './branch-payment-settings.css';

const fields = [
  ['accountName', 'Account name', 1, 100, 'Name shown in the payment app'],
  ['accountNumber', 'Account number', 5, 20, 'Keep leading zeroes'],
  ['bankName', 'Bank name', 1, 100, 'Bank or wallet provider'],
] as const;

const clean = (config: QRConfig): QRConfig => ({
  staticQrEnabled: config.staticQrEnabled,
  staticQrImageUrl: config.staticQrImageUrl?.trim() || null,
  accountName: config.accountName?.trim() || null,
  accountNumber: config.accountNumber?.trim() || null,
  bankName: config.bankName?.trim() || null,
  instructions: config.instructions?.trim() || null,
});

export function SourceBadge({ source }: { source?: PaymentSettings['source'] }) {
  return <span className={`payment-source ${source === 'branch' ? 'is-custom' : ''}`}>
    <span className="material-symbols-outlined" aria-hidden="true">{source === 'branch' ? 'verified' : 'account_tree'}</span>
    {source === 'branch' ? 'Custom for this branch' : 'Tenant defaults'}
  </span>;
}

function QRPreview({ url, label = 'Current payment QR' }: { url: string; label?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return failed
    ? <div className="payment-qr-empty" role="status"><span className="material-symbols-outlined" aria-hidden="true">broken_image</span><p>Preview unavailable. Replace the QR image before saving.</p></div>
    : <div className="payment-qr-frame"><img className="payment-qr-preview" src={url} onError={() => setFailed(true)} alt={label} width={220} height={220} /></div>;
}

export function BranchPaymentSettings({ branchId, onSaved }: { branchId: string; onSaved?: () => void }) {
  const { user, isTenantAdmin } = useAuth();
  const editable = isTenantAdmin();
  const allowed = editable || Boolean(user?.roles?.some(role => role.roleName === 'Branch Admin' && role.branchId === branchId));
  const { showToast } = useToast();
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [form, setForm] = useState<QRConfig | null>(null);
  const [editing, setEditing] = useState(false);
  const [replacingQr, setReplacingQr] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof QRConfig, string>>>({});
  const [challenge, setChallenge] = useState<{ challengeId: string; destination: string; action: 'save' | 'reset'; config: QRConfig | null } | null>(null);
  const [code, setCode] = useState('');
  const [revision, setRevision] = useState(0);

  const initialForm = (config: PaymentSettings): QRConfig => ({
    staticQrEnabled: config.source === 'branch' && config.staticQrEnabled,
    staticQrImageUrl: config.source === 'branch' ? config.staticQrImageUrl : null,
    accountName: config.source === 'branch' ? config.accountName : null,
    accountNumber: config.source === 'branch' ? config.accountNumber : null,
    bankName: config.source === 'branch' ? config.bankName : null,
    instructions: config.source === 'branch' ? config.instructions : null,
  });

  useEffect(() => {
    let active = true;
    setSettings(null); setForm(null); setError(''); setFieldErrors({}); setChallenge(null); setCode(''); setEditing(false); setReplacingQr(false);
    if (allowed) api.getPaymentSettings(branchId).then(config => {
      if (!active) return;
      setSettings(config); setForm(initialForm(config));
    }).catch(cause => { if (active) setError(paymentSettingsError(cause)); });
    return () => { active = false; };
  }, [branchId, allowed, revision]);

  const dirty = useMemo(() => settings && form
    ? JSON.stringify(clean(form)) !== JSON.stringify(clean(initialForm(settings)))
    : false, [settings, form]);

  if (!allowed) return <div className="payment-settings-error" role="alert">You do not have access to this branch’s payment settings.</div>;

  const beginEdit = () => {
    if (!settings) return;
    setForm(initialForm(settings)); setFieldErrors({}); setError(''); setReplacingQr(false); setEditing(true);
  };
  const cancelEdit = () => {
    if (!settings || busy) return;
    setForm(initialForm(settings)); setFieldErrors({}); setError(''); setReplacingQr(false); setEditing(false);
  };
  const requestSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editable || !form || busy || challenge || !dirty) return;
    const errors = validateQRConfig(form);
    setFieldErrors(errors);
    const first = Object.keys(errors)[0];
    if (first) { (event.currentTarget.elements.namedItem(first) as HTMLInputElement | null)?.focus(); return; }
    setBusy(true); setError('');
    try {
      const config = clean(form);
      const action = !config.staticQrEnabled && settings?.source === 'branch' ? 'reset' : 'save';
      const result = await api.requestVerification(branchId, action, action === 'reset' ? null : config);
      setChallenge({ ...result, action, config: action === 'reset' ? null : config }); setCode('');
    } catch (cause) { setError(paymentSettingsError(cause)); }
    finally { setBusy(false); }
  };
  const requestReset = async () => {
    if (!editable || busy || challenge) return;
    setBusy(true); setError('');
    try {
      const result = await api.requestVerification(branchId, 'reset', null);
      setChallenge({ ...result, action: 'reset', config: null }); setCode(''); setEditing(false);
    } catch (cause) { setError(paymentSettingsError(cause)); }
    finally { setBusy(false); }
  };
  const confirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!challenge || busy || !/^\d{6}$/.test(code)) return;
    setBusy(true); setError('');
    try {
      const verification = { challengeId: challenge.challengeId, code };
      if (challenge.action === 'save') await api.updateBranchPaymentSettings(branchId, challenge.config!, verification);
      else await api.deleteBranchPaymentSettings(branchId, verification);
      if (challenge.action === 'save' && settings) {
        setSettings({ ...settings, ...challenge.config!, source: 'branch' });
        setForm(challenge.config!);
      } else if (challenge.action === 'reset') {
        const refreshed = await api.getPaymentSettings(branchId);
        setSettings(refreshed);
        setForm(initialForm(refreshed));
      }
      setChallenge(null); setCode(''); setEditing(false);
      showToast(challenge.action === 'reset' ? 'Tenant defaults restored' : 'Payment settings saved', 'success');
      setRevision(value => value + 1); onSaved?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Verification failed.'); }
    finally { setBusy(false); }
  };
  const upload = (file?: File) => {
    if (!file || !form) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_000_000) {
      setFieldErrors(current => ({ ...current, staticQrImageUrl: 'Choose a PNG, JPEG, or WebP image under 1 MB.' })); return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm(current => current ? { ...current, staticQrImageUrl: String(reader.result) } : current);
      setFieldErrors(current => ({ ...current, staticQrImageUrl: undefined })); setReplacingQr(false);
    };
    reader.onerror = () => setError('Could not read this image. Try another file.');
    reader.readAsDataURL(file);
  };

  return <Card hoverable={false} className="payment-settings-card"><section className="branch-payment-settings">
    <header className="payment-settings-heading"><div><span className="payment-settings-eyebrow">BRANCH PAYMENT METHOD</span><h2>QR payment details</h2><p>Students and parents see these details when paying an invoice.</p></div>{settings && <SourceBadge source={settings.source} />}</header>
    {error && <div className="payment-settings-error" role="alert"><span className="material-symbols-outlined" aria-hidden="true">error</span><div><strong>We couldn’t complete that action.</strong><p>{error}</p></div>{!settings && <Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)}>Retry</Button>}</div>}
    {!settings && !error && <div className="payment-settings-skeleton" aria-busy="true" aria-label="Loading payment settings"><span /><span /><span /></div>}

    {settings && form && challenge ? <form className="payment-verification-panel" onSubmit={confirm} aria-label="Confirm payment setting changes">
      <span className="payment-verification-icon material-symbols-outlined" aria-hidden="true">sms</span>
      <div><span className="payment-settings-eyebrow">FINAL SECURITY CHECK</span><h3>{challenge.action === 'reset' ? 'Restore tenant defaults?' : 'Confirm these changes'}</h3><p>Enter the six-digit code sent to <strong>{challenge.destination}</strong>. The code expires in five minutes.</p></div>
      <label htmlFor={`${branchId}-payment-code`}>SMS verification code<input id={`${branchId}-payment-code`} name="verificationCode" autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} disabled={busy} aria-describedby={`${branchId}-code-help`} /></label>
      <small id={`${branchId}-code-help`}>Only this code confirms the pending {challenge.action === 'reset' ? 'reset' : 'update'}. We won’t send another code unless you restart verification.</small>
      <div className="payment-settings-actions"><Button type="submit" disabled={busy || code.length !== 6} aria-busy={busy}>{busy ? 'Confirming…' : challenge.action === 'reset' ? 'Confirm reset' : 'Confirm and save'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setChallenge(null); setCode(''); setEditing(challenge.action === 'save'); }}>Back to settings</Button></div>
    </form> : settings && form && editing ? <form className="payment-settings-editor" onSubmit={requestSave} noValidate>
      <fieldset disabled={busy}>
        <legend>Edit branch QR</legend>
        <label className="payment-toggle"><span><strong>Use a custom QR for this branch</strong><small>Turn this off to use the tenant’s default QR details.</small></span><input type="checkbox" checked={form.staticQrEnabled} onChange={event => setForm(current => current ? { ...current, staticQrEnabled: event.target.checked, ...(event.target.checked && !current.staticQrImageUrl ? { staticQrImageUrl: null } : {}) } : current)} /></label>
        {form.staticQrEnabled && <div className="payment-editor-grid"><section className="payment-qr-editor" aria-labelledby={`${branchId}-qr-heading`}><div><h3 id={`${branchId}-qr-heading`}>QR image</h3><p>PNG, JPEG, or WebP · maximum 1 MB</p></div>{form.staticQrImageUrl ? <QRPreview url={form.staticQrImageUrl} label="QR image ready to save" /> : <div className="payment-qr-empty"><span className="material-symbols-outlined" aria-hidden="true">qr_code_2</span><p>No QR image selected.</p></div>}
          {!form.staticQrImageUrl || replacingQr ? <label className="payment-file-field" htmlFor={`${branchId}-qr-file`}><span>{form.staticQrImageUrl ? 'Choose replacement image' : 'Choose QR image'}</span><input id={`${branchId}-qr-file`} name="staticQrImageUrl" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => upload(event.target.files?.[0])} aria-invalid={Boolean(fieldErrors.staticQrImageUrl)} aria-describedby={fieldErrors.staticQrImageUrl ? `${branchId}-qr-error` : undefined} /></label> : <Button type="button" variant="outline" onClick={() => setReplacingQr(true)}>Replace QR image</Button>}
          {fieldErrors.staticQrImageUrl && <span id={`${branchId}-qr-error`} className="payment-field-error" role="alert">{fieldErrors.staticQrImageUrl}</span>}</section>
          <div className="payment-account-fields">{fields.map(([key, label, min, max, hint]) => <label key={key} htmlFor={`${branchId}-${key}`}>{label} <span aria-hidden="true">*</span><input id={`${branchId}-${key}`} name={key} aria-invalid={Boolean(fieldErrors[key])} aria-describedby={`${branchId}-${key}-${fieldErrors[key] ? 'error' : 'hint'}`} type="text" autoComplete="off" spellCheck={false} required minLength={min} maxLength={max} value={form[key] ?? ''} onChange={event => setForm(current => current ? { ...current, [key]: event.target.value } : current)} /><small id={`${branchId}-${key}-hint`}>{hint}</small>{fieldErrors[key] && <span id={`${branchId}-${key}-error`} className="payment-field-error" role="alert">{fieldErrors[key]}</span>}</label>)}</div></div>}
        {form.staticQrEnabled && <label htmlFor={`${branchId}-instructions`}>Payment instructions <span className="payment-optional">Optional</span><textarea id={`${branchId}-instructions`} name="instructions" maxLength={500} rows={3} aria-invalid={Boolean(fieldErrors.instructions)} value={form.instructions ?? ''} onChange={event => setForm(current => current ? { ...current, instructions: event.target.value } : current)} /><small>Shown below the QR. Include the payment reference students should use.</small>{fieldErrors.instructions && <span className="payment-field-error" role="alert">{fieldErrors.instructions}</span>}</label>}
      </fieldset>
      {!form.staticQrEnabled && <div className="payment-inline-note"><span className="material-symbols-outlined" aria-hidden="true">info</span><p>Saving will make this branch use tenant default payment details.</p></div>}
      <footer className="payment-editor-footer"><div><strong>{dirty ? 'Unsaved changes' : 'No changes yet'}</strong><small>{dirty ? 'SMS verification is requested only when you continue.' : 'Your saved setup remains active.'}</small></div><div className="payment-settings-actions"><Button type="button" variant="outline" disabled={busy} onClick={cancelEdit}>Cancel</Button><Button type="submit" disabled={busy || !dirty} aria-busy={busy}>{busy ? 'Preparing…' : 'Continue to SMS verification'}</Button></div></footer>
    </form> : settings && <div className="payment-settings-summary">
      <div className="payment-current-qr">{settings.staticQrEnabled && settings.staticQrImageUrl ? <QRPreview url={settings.staticQrImageUrl} /> : <div className="payment-qr-empty"><span className="material-symbols-outlined" aria-hidden="true">qr_code_2</span><p>No QR payment image is enabled.</p></div>}</div>
      <div className="payment-current-details"><h3>{settings.staticQrEnabled ? settings.accountName || 'QR payment account' : 'QR payments are not enabled'}</h3>{settings.staticQrEnabled ? <dl><div><dt>Account number</dt><dd>{settings.accountNumber || '—'}</dd></div><div><dt>Bank</dt><dd>{settings.bankName || '—'}</dd></div>{settings.instructions && <div><dt>Instructions</dt><dd>{settings.instructions}</dd></div>}</dl> : <p>Students will use another available payment method or contact the institution.</p>}<div className="payment-summary-actions">{editable ? <><Button type="button" onClick={beginEdit}>Edit settings</Button>{settings.source === 'branch' && <Button type="button" variant="outline" onClick={() => void requestReset()} disabled={busy}>{busy ? 'Preparing…' : 'Restore tenant defaults'}</Button>}</> : <p className="payment-readonly-note"><span className="material-symbols-outlined" aria-hidden="true">visibility</span>Read only · Contact your tenant admin to make changes.</p>}</div></div>
    </div>}
  </section></Card>;
}
