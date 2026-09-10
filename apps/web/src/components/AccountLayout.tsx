import { useId, type ReactNode } from 'react';
import '../pages/tenant-account.css';

export function AccountLayout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className="tenant-account"><div className="account-page-heading"><p className="account-eyebrow">PERSONAL ACCOUNT</p><h1>{title}</h1><p>{description}</p></div>{children}</main>;
}

export function AccountSection({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  const id = useId();
  return <section className="account-section" aria-labelledby={id}><div className="account-section-heading"><div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}

export function AccountStatus({ verified, children }: { verified: boolean; children: ReactNode }) {
  return <span className={`account-status${verified ? ' is-verified' : ''}`}><span className="material-symbols-outlined" aria-hidden="true">{verified ? 'check_circle' : 'info'}</span>{children}</span>;
}
