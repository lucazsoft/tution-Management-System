// Execute the real worker source with only Firebase and browser primitives mocked.
// These are routing/display-unit checks, not a real service-worker/provider test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/firebase-messaging-sw.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function worker(nativeRoutes) {
  const handlers = {};
  const displayed = [];
  const visited = [];
  let background;
  const client = { url: 'https://fixture.invalid/parent/home', navigate: async (url) => { visited.push(url); }, focus: async () => {} };
  const self = { location: { origin: 'https://fixture.invalid' },
    addEventListener: (type, handler) => { handlers[type] = handler; },
    registration: { showNotification: async (title, options) => { displayed.push({ title, options }); } },
    clients: { matchAll: async () => [client], openWindow: async (url) => { visited.push(url); } } };
  vm.runInNewContext(code, { self, URL, exports: {},
    __TMS_PUSH_USE_NATIVE_ROUTES__: nativeRoutes,
    __TMS_FIREBASE_WEB_CONFIG__: { apiKey: 'fixture', appId: 'fixture', projectId: 'fixture', messagingSenderId: 'fixture' },
    require: (name) => {
      if (name === 'firebase/app') return { initializeApp: (config) => config };
      if (name === 'firebase/messaging/sw') return { getMessaging: () => ({}), onBackgroundMessage: (_, handler) => { background = handler; } };
      throw new Error('Unexpected worker dependency: ' + name);
    } });
  return { displayed, visited, background: (payload) => background(payload),
    async click(data, fcmEnvelope = false) {
      let pending;
      handlers.notificationclick({ notification: { data: fcmEnvelope ? { FCM_MSG: { data } } : data, close() {} },
        stopImmediatePropagation() {}, waitUntil: (promise) => { pending = promise; } });
      await pending;
    } };
}
(async () => {
  for (const native of [false, true]) {
    const app = worker(native);
    const data = { deepLink: '/tenant/home', webDeepLink: '/tenant/payroll' };
    await app.click(data, true);
    assert.equal(app.visited.at(-1), `https://fixture.invalid${native ? '/tenant/home' : '/tenant/payroll'}`);
    await app.background({ notification: { title: 'Already displayed' }, data });
    assert.equal(app.displayed.length, 0, 'FCM notification payload must not be shown twice');
    await app.background({ data, messageId: 'fixture-message' });
    assert.equal(app.displayed.length, 1);
    assert.equal(app.displayed[0].options.body, 'Open TMS to see your update.');
    await app.click(app.displayed[0].options.data);
    assert.equal(app.visited.at(-1), `https://fixture.invalid${native ? '/tenant/home' : '/tenant/payroll'}`);
    await app.click({ deepLink: '//outside.invalid/path', webDeepLink: 'https://outside.invalid/path' });
    assert.equal(app.visited.at(-1), 'https://fixture.invalid/');
    await app.click({ deepLink: '/\\outside.invalid/path', webDeepLink: '/\\outside.invalid/path' });
    assert.equal(app.visited.at(-1), 'https://fixture.invalid/');
  }
  console.log('PASS worker mocks: React vs Flutter-web destinations, data-only routing, no duplicate display, generic body and same-origin guard.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
