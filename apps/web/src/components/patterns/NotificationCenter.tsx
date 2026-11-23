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
type PushState = 'unavailable' | 'blocked' | 'on' | 'off';

/** How often the inbox re-checks for new updates while the tab is visible. */
const LIVE_REFRESH_MS = 30_000;

function browserPushState(account: string): PushState {
  if (!browserPushConfigured() || !window.isSecureContext || !('Notification' in window)) return 'unavailable';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && browserPushOptedIn(account) ? 'on' : 'off';
}

/** Unread first, each group keeping its newest-first order. */
function unreadFirst(notices: Notice[]): Notice[] {
  return [...notices.filter((notice) => !notice.readAt), ...notices.filter((notice) => notice.readAt)];
}

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
    if (!eventData && !portalData) { setError('Could not load updates.'); return; }
    setData({ notifications: [...(eventData?.notifications ?? []).map((notice) => ({ ...notice, source: 'account' as const })), ...alerts],
      unreadCount: (eventData?.unreadCount ?? 0) + alerts.filter((notice) => !notice.readAt).length,
      total: (eventData?.total ?? 0) + alerts.length });
    setLoadedAccount(account);
    setError(events.status === 'rejected' || portal.status === 'rejected' || !validPortal
      ? 'Some notification sources could not be loaded.' : '');
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
    // Keeps the badge current without browser push; skipped while hidden.
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) refresh(); }, LIVE_REFRESH_MS);
    window.addEventListener(PUSH_INBOX_EVENT, refresh);
    window.addEventListener(INBOX_READ_EVENT, refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
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
  if (!isAuthenticated || !user) return null;
  const pushState = browserPushState(user.id);
  const unreadCount = data?.unreadCount ?? 0;
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
      <span aria-hidden="true">◉</span> Inbox {unreadCount > 0 ? <strong aria-label={`${unreadCount} unread`}>{unreadCount}</strong> : null}
    </button>
    {open && <section id="account-inbox-panel" className="tms-inbox-panel" aria-label="Your notifications">
      <header>
        <h2>Notifications</h2>
        <div className="tms-inbox-header-actions">
          {unreadCount > 0 && <button type="button" className="tms-inbox-markall" disabled={busy} onClick={() => void act(markAll)}>Mark all read</button>}
          <button type="button" className="tms-inbox-close" aria-label="Close inbox" onClick={() => setOpen(false)}>×</button>
        </div>
      </header>
      {error && <p role="alert">{error} <button type="button" className="tms-inbox-link" disabled={busy} onClick={() => void load()}>Retry</button></p>}
      {!data && !error ? <p role="status" className="tms-inbox-empty">Loading notifications…</p> : null}
      {data?.notifications.length === 0 ? <p className="tms-inbox-empty">You’re all caught up. New updates will appear here.</p> : null}
      {(['account', 'portal'] as const).map((source) => {
        const notices = unreadFirst(data?.notifications.filter((notice) => notice.source === source) ?? []);
        return notices.length ? <div key={source} data-notification-source={source}>
          <h3>{source === 'account' ? 'Updates' : portalKind === 'parent' ? 'About your child' : 'Student alerts'}</h3>
          <ul>{notices.map((notice) => <li key={`${notice.source}:${notice.id}`} className={notice.readAt ? '' : 'is-unread'}>
            <button type="button" disabled={busy} onClick={() => void act(() => markRead(notice))}>
              <strong>{notice.title}</strong><span>{notice.body}</span>
              <time dateTime={notice.createdAt || undefined}>{notice.displayTime || new Date(notice.createdAt).toLocaleString()}</time>
            </button>
          </li>)}</ul>
        </div> : null;
      })}
      {data && data.total > data.notifications.length ? <p>Showing the latest {data.notifications.length} of {data.total} updates.</p> : null}
      {/* Only shown while there is something to do: once alerts are allowed it goes away. */}
      {pushState === 'off' && <footer>
        <button type="button" disabled={busy} onClick={() => void act(async () => {
          const status = await enableBrowserPush(user.id, true);
          setPushStatus(browserPushState(user.id) === 'on' ? '' : status);
        })}>Turn on desktop alerts</button>
        <p role="status">{pushStatus || 'Get alerted the moment something new arrives, even when this tab is in the background.'}</p>
      </footer>}
      {pushState === 'blocked' && <footer><p role="status">Desktop alerts are blocked for this site. Allow notifications in your browser’s site settings to receive them.</p></footer>}
    </section>}
  </aside>;
}
