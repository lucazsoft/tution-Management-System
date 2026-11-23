import type { FirebaseOptions } from 'firebase/app';
import { request } from './api/client';

declare const __TMS_FIREBASE_WEB_CONFIG__: FirebaseOptions & { vapidKey?: string };
const config = __TMS_FIREBASE_WEB_CONFIG__;
let registeredToken: string | null = null;
let registration: ServiceWorkerRegistration | null = null;
let detachForeground: (() => void) | null = null;
let epoch = 0;
let activeAccount: string | null = null;
let operations: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = operations.then(operation, operation);
  operations = next.catch(() => undefined);
  return next;
}
function preferenceKey(account: string) { return `tms_browser_push_opt_in:${account}`; }
export function browserPushOptedIn(account: string): boolean {
  try { return localStorage.getItem(preferenceKey(account)) === 'yes'; } catch { return false; }
}
export const INBOX_READ_EVENT = 'tms:notification-read';
export const PUSH_INBOX_EVENT = 'tms:notification-arrived';

export function browserPushConfigured(): boolean {
  return Boolean(config.apiKey && config.appId && config.messagingSenderId && config.projectId && config.vapidKey);
}

async function messaging() {
  if (!browserPushConfigured() || !window.isSecureContext) return null;
  const [{ getApp, getApps, initializeApp }, sdk] = await Promise.all([import('firebase/app'), import('firebase/messaging')]);
  if (!(await sdk.isSupported())) return null;
  const app = getApps().length ? getApp() : initializeApp(config);
  return { client: sdk.getMessaging(app), sdk };
}

export function enableBrowserPush(account: string, requestPermission = false): Promise<string> {
  const attempt = epoch;
  return serialized(() => bindBrowserPush(account, requestPermission, attempt));
}
async function bindBrowserPush(account: string, requestPermission: boolean, attempt: number): Promise<string> {
  if (attempt !== epoch) return 'Notification setup cancelled.';
  if (!requestPermission && !browserPushOptedIn(account)) return 'Browser notifications are off for this account.';
  if (!browserPushConfigured() || !window.isSecureContext || !('Notification' in window)) return 'Browser push is not configured or supported here.';
  // Keep the permission request before asynchronous SDK loading, within the click gesture.
  if (requestPermission && Notification.permission === 'default') await Notification.requestPermission();
  const adapter = await messaging();
  if (!adapter) return 'Browser push is not configured or supported here.';
  const { client, sdk } = adapter;
  if (Notification.permission !== 'granted') return 'Notifications are not allowed in this browser.';
  registration ??= await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const token = await sdk.getToken(client, { vapidKey: config.vapidKey, serviceWorkerRegistration: registration });
  if (attempt !== epoch) return 'Notification setup cancelled.';
  if (!token) return 'No browser notification token is available.';
  await request('/notifications/devices/register', { method: 'POST', signal: AbortSignal.timeout(10000), body: JSON.stringify({ token, platform: 'web' }) });
  registeredToken = token;
  activeAccount = account;
  if (attempt !== epoch) return 'Notification setup cancelled.';
  try { localStorage.setItem(preferenceKey(account), 'yes'); } catch { /* Current session can still receive. */ }
  detachForeground?.();
  detachForeground = sdk.onMessage(client, () => {
    // No school/private message text in a browser pop-up or event detail.
    window.dispatchEvent(new Event(PUSH_INBOX_EVENT));
  });
  return 'Browser notifications enabled. Delivery still depends on the server setup.';
}

export function disableBrowserPush(clearPreference = true, account?: string): Promise<void> {
  ++epoch;
  return serialized(async () => {
  detachForeground?.();
  detachForeground = null;
  const token = registeredToken;
  registeredToken = null;
  const preferenceAccount = account ?? activeAccount;
  if (clearPreference && preferenceAccount) {
    try { localStorage.removeItem(preferenceKey(preferenceAccount)); } catch { /* Best effort. */ }
  }
  activeAccount = null;
  try {
    if (token) await request('/notifications/devices/unregister', { method: 'POST', signal: AbortSignal.timeout(10000), body: JSON.stringify({ token }) });
  } finally {
    const adapter = await messaging();
    if (adapter) await adapter.sdk.deleteToken(adapter.client);
  }
  });
}

export function detachBrowserPush(): void {
  ++epoch;
  detachForeground?.();
  detachForeground = null;
}
