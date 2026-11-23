// Pure mocked lifecycle tests for browser-push.ts. No browser/provider/network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/services/browser-push.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  const calls = [], values = new Map();
  let permissionRequests = 0, deletes = 0, listenerCount = 0;
  const token = 'fcm_test_abcdefghijklmnopqrstuvwxyz1234567890';
  let tokenReply = async () => token;
  let registerReply = async () => {};
  const notification = { permission: 'default', requestPermission: async () => { permissionRequests++; notification.permission = 'granted'; return 'granted'; } };
  const sdk = {
    isSupported: async () => true, getMessaging: () => ({}),
    getToken: () => tokenReply(), deleteToken: async () => { deletes++; return true; },
    onMessage: () => { listenerCount++; return () => { listenerCount--; }; },
  };
  const context = {
    exports: {}, console, AbortSignal, Event,
    __TMS_FIREBASE_WEB_CONFIG__: { apiKey: 'public-fixture', appId: 'fixture-app', projectId: 'fixture-project', messagingSenderId: '123', vapidKey: 'public-fixture-vapid' },
    window: { isSecureContext: true, Notification: notification, dispatchEvent: () => {} },
    navigator: { serviceWorker: { register: async () => ({}) } },
    Notification: notification,
    localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) },
    require: (name) => {
      if (name === './api/client') return { request: async (route, options) => { calls.push({ route, body: JSON.parse(options.body) }); if (route.endsWith('/register')) await registerReply(); return {}; } };
      if (name === 'firebase/app') return { getApps: () => [], initializeApp: () => ({}) };
      if (name === 'firebase/messaging') return sdk;
      throw new Error(`Unexpected dependency in isolated test: ${name}`);
    },
  };
  vm.runInNewContext(compiled, context, { filename: 'browser-push.mock.js' });
  return { api: context.exports, calls, values,
    permissions: () => permissionRequests, deletes: () => deletes, listeners: () => listenerCount,
    tokenReply: (reply) => { tokenReply = reply; }, registerReply: (reply) => { registerReply = reply; },
  };
}
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
(async () => {
  const f = fixture();
  assert.match(await f.api.enableBrowserPush('account-a'), /off/);
  assert.equal(f.permissions(), 0);
  assert.equal(f.calls.length, 0);
  await f.api.enableBrowserPush('account-a', true);
  assert.equal(f.permissions(), 1);
  assert.equal(f.api.browserPushOptedIn('account-a'), true);
  assert.equal(f.api.browserPushOptedIn('account-b'), false);
  assert.equal(f.calls[0].route, '/notifications/devices/register');
  assert.equal(f.listeners(), 1);
  assert([...f.values.values()].every((value) => value === 'yes'), 'No device token in local preference storage');
  await f.api.disableBrowserPush(true, 'account-a');
  assert.equal(f.calls[1].route, '/notifications/devices/unregister');
  assert.equal(f.deletes(), 1);
  assert.equal(f.listeners(), 0);
  assert.equal(f.api.browserPushOptedIn('account-a'), false);
  await f.api.enableBrowserPush('account-a');
  assert.equal(f.calls.length, 2, 'Disable must survive a later automatic setup');

  const beforeToken = fixture(), tokenGate = deferred(), tokenStarted = deferred();
  beforeToken.tokenReply(() => { tokenStarted.resolve(); return tokenGate.promise; });
  const pendingToken = beforeToken.api.enableBrowserPush('account-a', true);
  await tokenStarted.promise;
  beforeToken.api.detachBrowserPush();
  tokenGate.resolve('fcm_test_abcdefghijklmnopqrstuvwxyz1234567890');
  assert.match(await pendingToken, /cancelled/);
  assert.equal(beforeToken.calls.length, 0, 'A cancelled account session must not register');

  const duringRegister = fixture(), registerGate = deferred(), registerStarted = deferred();
  duringRegister.registerReply(() => { registerStarted.resolve(); return registerGate.promise; });
  const pendingRegister = duringRegister.api.enableBrowserPush('account-a', true);
  await registerStarted.promise;
  const logout = duringRegister.api.disableBrowserPush(false, 'account-a');
  registerGate.resolve();
  assert.match(await pendingRegister, /cancelled/);
  await logout;
  assert.equal(duringRegister.calls[1].route, '/notifications/devices/unregister');
  assert.equal(duringRegister.deletes(), 1, 'Logout must revoke an in-flight registration token');
  assert.equal(duringRegister.listeners(), 0);
  console.log('PASS browser push mocks: explicit/account-specific opt-in, no stored token, disable persistence, stale-session cancellation, serialized logout revocation.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
