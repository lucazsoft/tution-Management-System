import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { errorMessage } from '../services/api/client';
import type { PaymentSettings } from '../services/payment-settings';
import { Button } from './ui/Button';
import './branchPaymentQr.css';

const money = (value: number) => `NPR ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Shows the static payment QR configured for the invoice's branch (Payment settings),
 * falling back to the institution default. The branch is resolved server-side from the
 * invoice, so staff always see the QR of the branch that issued the bill.
 */
export function BranchPaymentQrDialog({ invoiceId, branchName, studentName, description, amount, settingsPath, onClose }: {
  invoiceId: string;
  branchName: string | null;
  studentName: string;
  description: string;
  amount: number;
  /** Where staff can configure the branch QR; omitted when the viewer cannot edit settings. */
  settingsPath?: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [error, setError] = useState('');
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    let active = true;
    api.finances.getInvoicePaymentSettings(invoiceId)
      .then((config) => { if (active) setSettings(config); })
      .catch((cause) => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; document.body.style.overflow = previousOverflow; };
  }, [invoiceId]);

  const keyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const items = dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
    if (!items?.length) return;
    const first = items[0]; const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const qr = settings?.staticQrEnabled && settings.staticQrImageUrl && !imageFailed ? settings.staticQrImageUrl : '';
  const source = settings?.source === 'branch' ? `${branchName ?? 'Branch'} payment QR` : 'Institution payment QR';
  const download = () => {
    const link = document.createElement('a');
    link.href = qr;
    link.download = `payment-qr-${(branchName ?? 'branch').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    link.click();
  };

  return (
    <div className="branch-qr-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} onKeyDown={keyDown} role="dialog" aria-modal="true" aria-labelledby="branch-qr-title" className="branch-qr">
        <header className="branch-qr__head">
          <div>
            <span className="branch-qr__eyebrow">{settings ? source : 'Payment QR'}</span>
            <h2 id="branch-qr-title">{studentName}</h2>
            <p>{description}</p>
          </div>
          <button type="button" className="branch-qr__close" aria-label="Close payment QR" onClick={onClose}>
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </header>

        <strong className="branch-qr__amount">{money(amount)}</strong>

        {error ? <p className="branch-qr__error" role="alert">{error}</p>
          : !settings ? <div className="branch-qr__frame is-loading" aria-busy="true">Loading {branchName ?? 'branch'} QR…</div>
            : qr ? (
              <>
                <div className="branch-qr__frame">
                  <img src={qr} alt={`${source} for ${studentName}`} width={240} height={240} onError={() => setImageFailed(true)} />
                </div>
                {settings.accountName || settings.accountNumber || settings.bankName ? (
                  <dl className="branch-qr__account">
                    {settings.accountName ? <div><dt>Account name</dt><dd>{settings.accountName}</dd></div> : null}
                    {settings.accountNumber ? <div><dt>Account number</dt><dd>{settings.accountNumber}</dd></div> : null}
                    {settings.bankName ? <div><dt>Bank</dt><dd>{settings.bankName}</dd></div> : null}
                  </dl>
                ) : null}
                <p className="branch-qr__hint">
                  {settings.instructions || `Ask the payer to scan this QR and pay exactly ${money(amount)}, then record the payment with their transaction reference.`}
                </p>
                <Button onClick={download} style={{ width: '100%' }}>
                  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, marginRight: 6 }}>download</span>
                  Download QR
                </Button>
              </>
            ) : (
              <div className="branch-qr__empty" role="status">
                <span className="material-symbols-outlined" aria-hidden="true">qr_code_2</span>
                <strong>{imageFailed ? 'The saved QR image could not be displayed.' : `No payment QR is set for ${branchName ?? 'this branch'}.`}</strong>
                <p>Upload the branch's static bank or wallet QR in Payment settings, then try again.</p>
                {settingsPath ? <Link to={settingsPath} onClick={onClose}>Open Payment settings</Link> : null}
              </div>
            )}
      </section>
    </div>
  );
}
