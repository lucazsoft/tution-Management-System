import assert from 'node:assert/strict';
import test from 'node:test';
import { getPushSender } from './push';

test('production never falls back to simulated push delivery', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousProvider = process.env.PUSH_PROVIDER;
  process.env.NODE_ENV = 'production';
  delete process.env.PUSH_PROVIDER;
  const result = await getPushSender().sendPush('user-1', 'Title', 'Body');
  assert.equal(result.success, false);
  process.env.NODE_ENV = previousNodeEnv;
  if (previousProvider === undefined) delete process.env.PUSH_PROVIDER; else process.env.PUSH_PROVIDER = previousProvider;
});

test('development simulation is explicit and unavailable in production', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousProvider = process.env.PUSH_PROVIDER;
  process.env.NODE_ENV = 'development';
  process.env.PUSH_PROVIDER = 'DEVELOPMENT';
  const result = await getPushSender().sendPush('user-1', 'Title', 'Body');
  assert.equal(result.success, true);
  process.env.NODE_ENV = previousNodeEnv;
  if (previousProvider === undefined) delete process.env.PUSH_PROVIDER; else process.env.PUSH_PROVIDER = previousProvider;
});

test('Firebase routing requires explicit tenant scope', async () => {
  const previous = process.env.PUSH_PROVIDER;
  process.env.PUSH_PROVIDER = 'FIREBASE';
  try { assert.equal((await getPushSender().sendPush('user-1', 'Title', 'Body')).success, false); }
  finally { if (previous === undefined) delete process.env.PUSH_PROVIDER; else process.env.PUSH_PROVIDER = previous; }
});

test('Firebase routing preserves caller tenant and recipient', async () => {
  const module = await import('../services/push-notification');
  const original = module.PushNotificationService.sendPush;
  const previous = process.env.PUSH_PROVIDER;
  process.env.PUSH_PROVIDER = 'FIREBASE';
  let called: unknown[] = [];
  module.PushNotificationService.sendPush = async (...args) => {
    called = args; return { success: true, sent: 1, failed: 0 };
  };
  try {
    const result = await getPushSender('tenant-a').sendPush('user-a', 'Title', 'Body');
    assert.equal(result.success, true);
    assert.deepEqual(called, ['tenant-a', 'user-a', 'Title', 'Body']);
  } finally {
    module.PushNotificationService.sendPush = original;
    if (previous === undefined) delete process.env.PUSH_PROVIDER; else process.env.PUSH_PROVIDER = previous;
  }
});
