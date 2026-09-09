import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../services/api/client';
import './certificateVerification.css';

type Verification = { isValid: boolean; status: string; certificateId: string; studentName: string; issuedDate: string; templateName: string; type: string; institutionName: string | null; branchName: string | null; revokedAt: string | null; revocationReason: string | null };

export function CertificateVerificationPage() {
  const { certificateId = '' } = useParams();
  const [record, setRecord] = useState<Verification | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const load = useCallback(async () => {
    setState('loading');
    try {
      const response = await fetch(`${API_BASE_URL}/certificates/verify/${encodeURIComponent(certificateId)}`);
      if (response.status === 404) return setState('missing');
      if (!response.ok) throw new Error();
      setRecord(await response.json() as Verification); setState('ready');
    } catch { setState('error'); }
  }, [certificateId]);
  useEffect(() => { void load(); }, [load]);
  return <main className="certificate-verification"><Link to="/login" className="certificate-verification__brand"><span className="material-symbols-outlined" aria-hidden="true">school</span><span>TMS credential verification</span></Link><section>{state === 'loading' ? <div className="certificate-verification__state" aria-busy="true"><span className="material-symbols-outlined" aria-hidden="true">progress_activity</span><h1>Checking certificate</h1><p>Reading the institution’s credential record.</p></div> : state === 'missing' ? <div className="certificate-verification__state is-error"><span className="material-symbols-outlined" aria-hidden="true">search_off</span><h1>Certificate not found</h1><p>Check the credential ID or ask the issuing institution.</p></div> : state === 'error' ? <div className="certificate-verification__state is-error"><span className="material-symbols-outlined" aria-hidden="true">cloud_off</span><h1>Verification unavailable</h1><p>The service could not be reached. Try again.</p><button type="button" onClick={() => void load()}>Try again</button></div> : record ? <><header className={record.isValid ? 'is-valid' : 'is-revoked'}><span className="material-symbols-outlined" aria-hidden="true">{record.isValid ? 'verified' : 'gpp_bad'}</span><div><small>Certificate status</small><h1>{record.isValid ? 'Valid certificate' : 'Certificate revoked'}</h1></div></header><div className="certificate-verification__body"><span>Presented to</span><h2>{record.studentName}</h2><p>{record.templateName}</p><dl><div><dt>Institution</dt><dd>{record.institutionName ?? 'Issuing institution'}</dd></div><div><dt>Branch</dt><dd>{record.branchName ?? 'Not recorded'}</dd></div><div><dt>Issued</dt><dd>{new Date(record.issuedDate).toLocaleDateString('en-GB')}</dd></div><div><dt>Credential ID</dt><dd>{record.certificateId}</dd></div></dl>{!record.isValid ? <div className="certificate-verification__notice"><strong>Reason</strong><p>{record.revocationReason ?? 'The issuing institution revoked this certificate.'}</p></div> : null}</div></> : null}</section><p className="certificate-verification__privacy">This page confirms credential metadata only. It does not expose private student contact information or documents.</p></main>;
}
