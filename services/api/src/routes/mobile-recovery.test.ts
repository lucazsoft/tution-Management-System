import assert from 'node:assert/strict';
let allowed = true;
let calls = 0;
require('../utils/persistent-rate-limit').consumePersistentRateLimit = async () => ({ allowed });
const service = require('../services/mobile-recovery');
service.sendRecoveryCode = async () => { calls++; return { destination: '******0000', expiresIn: 300 }; };
service.confirmMobileRecovery = async () => { calls++; return { success: true, signInRequired: true }; };
const router = require('./mobile-recovery').default;
async function invoke(path: string, body: unknown) {
  const route = router.stack.find((entry: any) => entry.route?.path === path).route;
  let status = 200; let cache = '';
  const res: any = { status(value: number) { status = value; return this; }, set(_name: string, value: string) { cache = value; return this; }, json() { return this; } };
  await route.stack[0].handle({ body, ip: '127.0.0.1' }, res);
  assert.equal(cache, 'no-store');
  return status;
}
async function main() {
  const token = 'a'.repeat(43);
  assert.deepEqual(router.stack.filter((entry: any) => entry.route).map((entry: any) => entry.route.path).sort(), ['/confirm', '/send'], 'No application approval endpoint may exist');
  for (const body of [null, {}, { token: 1 }, { token: 'short' }, { token, phone: '9811111111' }, { token, userId: 'another-user' }, { token, approved: true }]) {
    assert.equal(await invoke('/send', body), 400);
  }
  assert.equal(await invoke('/confirm', { token, code: 123456 }), 400);
  assert.equal(await invoke('/confirm', { token, code: '123456', phone: '9811111111' }), 400);
  assert.equal(calls, 0);
  allowed = false;
  assert.equal(await invoke('/send', { token }), 429);
  assert.equal(await invoke('/confirm', { token, code: '123456' }), 429);
  assert.equal(calls, 0);
  allowed = true;
  assert.equal(await invoke('/send', { token }), 200);
  assert.equal(await invoke('/confirm', { token, code: '123456' }), 200);
  assert.equal(calls, 2);
  console.log('PASS recovery route validation, no public approval, destination injection rejection, no-store responses and persistent rate-limit enforcement');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
