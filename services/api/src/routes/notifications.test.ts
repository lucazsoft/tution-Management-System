import assert from 'node:assert/strict';
import prisma from '../utils/db';

let actor: any;
const authPath = require.resolve('../utils/auth');
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: {
    auth: { api: { getSession: async () => actor ? { user: actor } : null } },
  },
} as NodeModule;

const notificationsRouter = require('./notifications').default;
const db = prisma as any;
let upserts: any[] = [];
let deletes: any[] = [];
db.devicePushToken.upsert = async (args: any) => {
  upserts.push(args);
  return { id: 'push-token-1', ...args.create };
};
db.devicePushToken.deleteMany = async (args: any) => {
  deletes.push(args);
  return { count: 1 };
};

function login(userId = 'user-a', tenantId = 'tenant-a') {
  actor = {
    id: userId,
    tenantId,
    email: 'user@example.test',
    firstName: 'Test',
    lastName: 'User',
    roles: [],
  };
}

async function invoke(path: string, body: any, method = 'post') {
  const route = notificationsRouter.stack.find(
    (layer: any) => layer.route?.path === path && layer.route.methods[method],
  )?.route;
  assert(route, `${method.toUpperCase()} ${path} route must exist`);
  const req: any = { headers: {}, body, query: {}, params: {} };
  let status = 200;
  let payload: any;
  const res: any = {
    status(code: number) { status = code; return this; },
    json(value: any) { payload = value; return this; },
  };
  for (const layer of route.stack) {
    let next = false;
    await layer.handle(req, res, () => { next = true; });
    if (!next) break;
  }
  return { status, payload };
}

const cases: Array<[string, () => Promise<void>]> = [];
const test = (name: string, run: () => Promise<void>) => cases.push([name, run]);
const validToken = 'fcm-device-token_abcdefghijklmnopqrstuvwxyz1234567890';

test('register derives ownership from the authenticated session', async () => {
  login();
  upserts = [];
  const result = await invoke('/devices/register', {
    token: validToken,
    platform: 'android',
    tenantId: 'forged-tenant',
    userId: 'forged-user',
  });
  assert.equal(result.status, 201);
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0], {
    where: { token: validToken },
    create: {
      token: validToken,
      platform: 'ANDROID',
      tenantId: 'tenant-a',
      userId: 'user-a',
    },
    update: {
      platform: 'ANDROID',
      tenantId: 'tenant-a',
      userId: 'user-a',
    },
  });
});

test('register rejects invalid tokens and unsupported platforms', async () => {
  login();
  for (const body of [
    { token: '', platform: 'android' },
    { token: 'short', platform: 'android' },
    { token: validToken, platform: 'windows' },
    { token: validToken, platform: 42 },
  ]) {
    upserts = [];
    assert.equal((await invoke('/devices/register', body)).status, 400);
    assert.equal(upserts.length, 0);
  }
});

test('unregister deletes only the current session owners token', async () => {
  login();
  deletes = [];
  const result = await invoke('/devices/unregister', {
    token: validToken,
    tenantId: 'forged-tenant',
    userId: 'forged-user',
  });
  assert.equal(result.status, 200);
  assert.deepEqual(deletes, [{
    where: {
      token: validToken,
      tenantId: 'tenant-a',
      userId: 'user-a',
    },
  }]);
});

test('device token endpoints require an authenticated cookie session', async () => {
  actor = null;
  assert.equal((await invoke('/devices/register', {
    token: validToken,
    platform: 'ios',
  })).status, 401);
  assert.equal((await invoke('/devices/unregister', { token: validToken })).status, 401);
});

test('salary reminders target real tenant admins instead of a fixed identifier', async () => {
  login('admin-a', 'tenant-a');
  actor.roles = [{ roleName: 'Tenant Admin', branchId: null, permissions: [] }];
  const originalFindMany = db.user.findMany;
  let query: any;
  db.user.findMany = async (args: any) => {
    query = args;
    return [{ id: 'admin-a' }, { id: 'admin-b' }];
  };
  const pushModule = require('../services/push-notification');
  const originalSendPush = pushModule.PushNotificationService.sendPush;
  const recipients: string[] = [];
  pushModule.PushNotificationService.sendPush = async (
    tenantId: string,
    userId: string,
  ) => {
    assert.equal(tenantId, 'tenant-a');
    recipients.push(userId);
    return { success: true, sent: 1, failed: 0 };
  };

  try {
    const cronRouter = require('./cron').default;
    const route = cronRouter.stack.find(
      (layer: any) => layer.route?.path === '/trigger' && layer.route.methods.post,
    ).route;
    const req: any = { headers: {}, body: { taskName: 'salary-reminder' }, query: {}, params: {} };
    let status = 200;
    const res: any = {
      status(code: number) { status = code; return this; },
      json() { return this; },
    };
    for (const layer of route.stack) {
      let next = false;
      await layer.handle(req, res, () => { next = true; });
      if (!next) break;
    }

    assert.equal(status, 200);
    assert.deepEqual(query, {
      where: {
        tenantId: 'tenant-a',
        status: 'ACTIVE',
        userRoles: { some: { role: { name: 'Tenant Admin' } } },
      },
      select: { id: true },
    });
    assert.deepEqual(recipients, ['admin-a', 'admin-b']);
  } finally {
    db.user.findMany = originalFindMany;
    pushModule.PushNotificationService.sendPush = originalSendPush;
  }
});

async function main() {
  let failed = 0;
  for (const [name, run] of cases) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}`, error); }
  }
  assert.equal(failed, 0, `${failed} notification route scenarios failed`);
  console.log(`Notification routes: ${cases.length} scenarios passed (mocked persistence).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
