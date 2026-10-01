import assert from 'node:assert/strict';
import {
  createConfiguredFirebaseProvider,
  createPushNotificationService,
} from './push-notification';

const cases: Array<[string, () => Promise<void>]> = [];
const test = (name: string, run: () => Promise<void>) => cases.push([name, run]);

test('push delivery loads only tenant-scoped tokens for the requested user', async () => {
  let query: any;
  let delivery: any;
  const service = createPushNotificationService({
    tokenStore: {
      findMany: async (args: any) => {
        query = args;
        return [{ token: 'token-a' }, { token: 'token-b' }];
      },
    },
    provider: {
      send: async (tokens, message) => {
        delivery = { tokens, message };
        return { successCount: 2, failureCount: 0 };
      },
    },
    logger: { warn: () => undefined },
  });

  const result = await service.sendPush(
    'tenant-a',
    'user-a',
    'Schedule changed',
    'Your class moved.',
    { deepLink: '/teacher/timetable' },
  );

  assert.deepEqual(query, {
    where: { tenantId: 'tenant-a', userId: 'user-a' },
    select: { token: true },
  });
  assert.deepEqual(delivery, {
    tokens: ['token-a', 'token-b'],
    message: {
      title: 'Schedule changed',
      body: 'Your class moved.',
      data: { deepLink: '/teacher/timetable' },
    },
  });
  assert.deepEqual(result, { success: true, sent: 2, failed: 0 });
});

test('push delivery safely skips when Firebase is not configured', async () => {
  const warnings: Array<Record<string, unknown>> = [];
  const service = createPushNotificationService({
    tokenStore: { findMany: async () => [{ token: 'secret-device-token' }] },
    provider: null,
    logger: { warn: (entry) => warnings.push(entry) },
  });

  const result = await service.sendPush('tenant-a', 'user-a', 'Title', 'Body');
  assert.deepEqual(result, { success: true, sent: 0, failed: 0, skipped: true });
  assert.equal(JSON.stringify(warnings).includes('secret-device-token'), false);
  assert.equal(warnings[0]?.event, 'PUSH_PROVIDER_UNCONFIGURED');
});

test('provider errors fail open without leaking device tokens', async () => {
  const warnings: Array<Record<string, unknown>> = [];
  const service = createPushNotificationService({
    tokenStore: { findMany: async () => [{ token: 'secret-device-token' }] },
    provider: { send: async () => { throw new Error('provider unavailable'); } },
    logger: { warn: (entry) => warnings.push(entry) },
  });

  const result = await service.sendPush('tenant-a', 'user-a', 'Title', 'Body');
  assert.deepEqual(result, { success: false, sent: 0, failed: 1 });
  assert.equal(JSON.stringify(warnings).includes('secret-device-token'), false);
  assert.equal(warnings[0]?.event, 'PUSH_DELIVERY_FAILED');
});

test('Firebase provider is created only with complete credentials', async () => {
  assert.equal(createConfiguredFirebaseProvider({}), null);
  assert.equal(createConfiguredFirebaseProvider({ FIREBASE_PROJECT_ID: 'project-only' }), null);
  assert.equal(createConfiguredFirebaseProvider({
    FIREBASE_PROJECT_ID: 'project',
    FIREBASE_CLIENT_EMAIL: 'firebase@example.test',
    FIREBASE_PRIVATE_KEY: 'not-a-real-private-key',
  }), null);
});

async function main() {
  let failed = 0;
  for (const [name, run] of cases) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}`, error); }
  }
  assert.equal(failed, 0, `${failed} push notification scenarios failed`);
  console.log(`Push notification service: ${cases.length} scenarios passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
