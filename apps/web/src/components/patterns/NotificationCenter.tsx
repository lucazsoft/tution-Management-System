import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { request } from '../../services/api/client';
import { browserPushConfigured, browserPushOptedIn, detachBrowserPush, disableBrowserPush, enableBrowserPush, INBOX_READ_EVENT, PUSH_INBOX_EVENT } from '../../services/browser-push';
import './NotificationCenter.css';

type Notice = { id: string; title: string; body: string; destination?: string; readAt?: string | null; createdAt: string; source: 'account' | 'portal'; displayTime?: string };
type PortalNotice = { id: string; title: string; message: string; destination: string; unread: boolean; occurredAt?: string; time: string };
type PortalInbox = { notifications: PortalNotice[]; selected?: { id: string; name: string } };
type Inbox = { notifications: Notice[]; unreadCount: number; total: number };

export function NotificationCenter() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const portalKind = user?.role === 'STUDENT' && location.pathname.startsWith('/student/') ? 'student'
    : user?.role === 'PARENT' && location.pathname.startsWith('/parent/') ? 'parent' : null;
  const childId = portalKind === 'parent' ? new URLSearchParams(location.search).get('child') : null;
  const scopeKey = `${user?.id ?? ''}:${portalKind ?? ''}:${childId ?? ''}`;
  const [open, setOpen] = useState(false);
  const [inboxData, setData] = useState<Inbox | null>(null);
  const [loadedAccount, setLoadedAccount] = useState<string | null>(null);
  const data = loadedAccount === scopeKey ? inboxData : null;
  const [error, setError] = useState('');
  const [pushStatus, setPushStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const loadSequence = useRef(0);
  const identity = useRef(scopeKey);
  identity.current = scopeKey;
  const load = useCallback(async () => {
    if (!isAuthenticated || !user?.id) return;
    const account = scopeKey;
    const sequence = ++loadSequence.current;
    const portalPath = portalKind === 'student' ? '/users/me/student-portal'
      : portalKind === 'parent' ? `/parent/portal${childId ? `?studentId=${encodeURIComponent(childId)}` : ''}` : null;
    const [events, portal] = await Promise.allSettled([
      request<Inbox>('/notifications?pageSize=50'),
      portalPath ? request<PortalInbox>(portalPath) : Promise.resolve(null),
    ]);
    if (identity.current !== account || sequence !== loadSequence.current) return;
    const eventData = events.status === 'fulfilled' ? events.value : null;
    const portalData = portal.status === 'fulfilled' ? portal.value : null;
    const validPortal = portalKind !== 'parent' || !childId || portalData?.selected?.id === childId;
    const alerts: Notice[] = validPortal ? (portalData?.notifications ?? []).map((notice) => ({
      id: notice.id, title: notice.title, body: notice.message, source: 'portal',
      destination: portalKind === 'parent' && portalData?.selected
        ? `/parent/${encodeURIComponent(notice.destination)}?child=${encodeURIComponent(portalData.selected.id)}` : notice.destination,
      readAt: notice.unread ? null : 'read', createdAt: notice.occurredAt ?? '', displayTime: notice.time,
    })) : [];
    if (!eventData && !portalData) { setError('Could not load updates. Try refresh.'); return; }
    setData({ notifications: [...(eventData?.notifications ?? []).map((notice) => ({ ...notice, source: 'account' as const })), ...alerts],
      unreadCount: (eventData?.unreadCount ?? 0) + alerts.filter((notice) => !notice.readAt).length,
      total: (eventData?.total ?? 0) + alerts.length });
    setLoadedAccount(account);
    setError(events.status === 'rejected' || portal.status === 'rejected' || !validPortal
      ? 'Some notification sources could not be loaded. Try refresh.' : '');
  }, [isAuthenticated, user?.id, scopeKey, portalKind, childId]);
  useEffect(() => {
    setData(null); setLoadedAccount(null); setOpen(false); setError(''); setPushStatus('');
    if (!isAuthenticated || !user?.id) { detachBrowserPush(); return; }
    // Never request permission on mount. Re-bind only an already allowed browser.
    if (browserPushConfigured() && browserPushOptedIn(user.id) && 'Notification' in window && Notification.permission === 'granted') {
      void enableBrowserPush(user.id).catch(() => setPushStatus('Browser setup failed. Try enabling again.'));
    }
    return () => { void disableBrowserPush(false).catch(() => undefined); };
  }, [isAuthenticated, user?.id]);
  useEffect(() => {
    setData(null); setLoadedAccount(null); setError('');
    void load();
    const refresh = () => { void load(); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener(PUSH_INBOX_EVENT, refresh);
    window.addEventListener(INBOX_READ_EVENT, refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener(PUSH_INBOX_EVENT, refresh);
      window.removeEventListener(INBOX_READ_EVENT, refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') {
      setOpen(false);
      document.querySelector<HTMLButtonElement>('.tms-inbox-toggle')?.focus();
    } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  if (!isAuthenticated) return null;
  const act = async (task: () => Promise<void>) => {
    const actionScope = identity.current;
    setBusy(true); setError('');
    try { await task(); } catch { if (identity.current === actionScope) setError('The action did not finish. Please retry.'); }
    finally { setBusy(false); }
  };
  const markRead = async (notice: Notice) => {
    const actionScope = identity.current;
    if (!notice.readAt) await request(notice.source === 'portal' ? '/portal-notifications/read' : `/notifications/${encodeURIComponent(notice.id)}/read`,
      { method: 'POST', ...(notice.source === 'portal' ? { body: JSON.stringify({ ids: [notice.id] }) } : {}) });
    if (identity.current !== actionScope) return;
    window.dispatchEvent(new Event(INBOX_READ_EVENT));
    await load();
    if (identity.current !== actionScope) return;
    const path = notice.destination;
    if (path?.startsWith('/') && !path.startsWith('//') && new URL(path, window.location.origin).origin === window.location.origin) {
      setOpen(false); navigate(path);
    }
  };
  const markAll = async () => {
    const actionScope = identity.current;
    const portalIds = data?.notifications.filter((notice) => notice.source === 'portal').map((notice) => notice.id) ?? [];
    const results = await Promise.allSettled([
      request('/notifications/read-all', { method: 'POST' }),
      ...(portalIds.length ? [request('/portal-notifications/read', { method: 'POST', body: JSON.stringify({ ids: portalIds }) })] : []),
    ]);
    if (identity.current !== actionScope) return;
    window.dispatchEvent(new Event(INBOX_READ_EVENT));
    await load();
    if (results.some((result) => result.status === 'rejected')) throw new Error('Read changes did not all sync.');
  };
  return <aside className="tms-inbox" aria-label="Account updates">
    <button type="button" className="tms-inbox-toggle" aria-expanded={open} aria-controls="account-inbox-panel" onClick={() => { setOpen(!open); if (!open) void load(); }}>
      <span aria-hidden="true">◉</span> Inbox {data && data.unreadCount > 0 ? <strong>{data.unreadCount}</strong> : null}
    </button>
    {open && <section id="account-inbox-panel" className="tms-inbox-panel" aria-label="Your account inbox">
      <header><h2>Account updates</h2><button type="button" aria-label="Close inbox" onClick={() => setOpen(false)}>×</button></header>
      <p className="tms-inbox-note">Event history and current portal alerts keep separate records and read states. Parent alerts follow the selected child.</p>
      <div className="tms-inbox-actions">
        <button type="button" disabled={busy} onClick={() => void load()}>Refresh</button>
        <button type="button" disabled={busy || !data?.unreadCount} onClick={() => void act(markAll)}>Mark all read</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!data && !error ? <p role="status">Loading updates…</p> : null}
      {data?.notifications.length === 0 ? <p>No account updates yet.</p> : null}
      {(['account', 'portal'] as const).map((source) => {
        const notices = data?.notifications.filter((notice) => notice.source === source) ?? [];
        return notices.length ? <div key={source} data-notification-source={source}>
          <h3>{source === 'account' ? 'Account event history' : portalKind === 'parent' ? 'Selected child alerts' : 'Current student alerts'}</h3>
          <ul>{notices.map((notice) => <li key={`${notice.source}:${notice.id}`} className={notice.readAt ? '' : 'is-unread'}>
            <button type="button" disabled={busy} onClick={() => void act(() => markRead(notice))}>
              <strong>{notice.title}</strong><span>{notice.body}</span>
              <time dateTime={notice.createdAt || undefined}>{notice.displayTime || new Date(notice.createdAt).toLocaleString()}</time>
            </button>
          </li>)}</ul>
        </div> : null;
      })}
      {data && data.total > data.notifications.length ? <p>Showing the latest {data.notifications.length} of {data.total} updates.</p> : null}
      <footer>
        <button type="button" disabled={busy || !browserPushConfigured()} onClick={() => void act(async () => setPushStatus(await enableBrowserPush(user!.id, true)))}>Enable browser notifications</button>
        <button type="button" disabled={busy} onClick={() => void act(async () => { await disableBrowserPush(true, user!.id); setPushStatus('Browser push disabled for this device.'); })}>Disable browser notifications</button>
        <p role="status">{pushStatus || (browserPushConfigured() ? 'Browser alerts are optional. Permission is requested only when you enable them.' : 'Browser push needs deployment configuration. The inbox works without it.')}</p>
      </footer>
    </section>}
  </aside>;
}
