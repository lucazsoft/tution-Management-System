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
