/// <reference lib="webworker" />
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

declare const __TMS_FIREBASE_WEB_CONFIG__: FirebaseOptions & { vapidKey?: string };
declare const __TMS_PUSH_USE_NATIVE_ROUTES__: boolean;
const scope = self as unknown as ServiceWorkerGlobalScope;
// Only same-origin app paths are eligible; never follow a provider-supplied URL.
scope.addEventListener('notificationclick', (event) => {
  const data = event.notification.data?.FCM_MSG?.data ?? event.notification.data ?? {};
  const route = __TMS_PUSH_USE_NATIVE_ROUTES__ ? data.deepLink : data.webDeepLink ?? data.deepLink;
  const path = typeof route === 'string' ? route : '/';
  let target = new URL('/', scope.location.origin);
  if (path.startsWith('/') && !path.startsWith('//')) {
    const candidate = new URL(path, scope.location.origin);
    if (candidate.origin === scope.location.origin) target = candidate;
  }
  event.notification.close();
  event.stopImmediatePropagation();
  event.waitUntil((async () => {
    const windows = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === target.origin) as WindowClient | undefined;
    if (existing) { await existing.navigate(target.href); await existing.focus(); }
    else await scope.clients.openWindow(target.href);
  })());
});
const config = __TMS_FIREBASE_WEB_CONFIG__;
if (config.apiKey && config.projectId && config.messagingSenderId && config.appId) {
  const messaging = getMessaging(initializeApp(config));
  onBackgroundMessage(messaging, async (payload) => {
    // Notification payloads are displayed by FCM. Do not create a duplicate.
    if (payload.notification) return;
    await scope.registration.showNotification('TMS update', {
      body: 'Open TMS to see your update.',
      data: { deepLink: payload.data?.deepLink ?? '/', webDeepLink: payload.data?.webDeepLink ?? payload.data?.deepLink ?? '/' },
      tag: payload.messageId,
    });
  });
}
