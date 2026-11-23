import test from 'node:test';
import assert from 'node:assert/strict';
import { FailedSignInLimiter, FailureStore } from './failed-sign-in-limit';

function mem(): FailureStore & { m: Map<string, { count: number; lastFailure: number }> } {
  const m = new Map<string, { count: number; lastFailure: number }>();
  return {
    m,
    async get(k) { return m.get(k) ?? null; },
    async recordFailure(k, now, w) {
      const r = m.get(k);
      if (!r || now - r.lastFailure > w) m.set(k, { count: 1, lastFailure: now });
      else m.set(k, { count: r.count + 1, lastFailure: now });
    },
  };
}
const W = 15 * 60 * 1000;
function setup() {
  let t = 1_000_000;
  const store = mem();
  const lim = new FailedSignInLimiter(store, 5, W, () => t);
  return { lim, store, adv: (ms: number) => { t += ms; } };
}
async function attempt(lim: FailedSignInLimiter, failed: boolean) {
  const r = await lim.begin('ip|/sign-in/email');
  if (!r.ok) return false;
  await r.finish(failed);
  return true;
}

test('successes never consume the allowance', async () => {
  const { lim, store } = setup();
  for (let i = 0; i < 50; i++) assert.equal(await attempt(lim, false), true);
  assert.equal(store.m.size, 0);
});
test('5 failures block the 6th attempt, even a correct one, until the window ends', async () => {
  const { lim, adv } = setup();
  for (let i = 0; i < 5; i++) assert.equal(await attempt(lim, true), true);
  assert.equal(await attempt(lim, false), false);
  adv(W - 1000);
  assert.equal(await attempt(lim, false), false);
  adv(2000);
  assert.equal(await attempt(lim, false), true);
});
test('interleaved successes do not shift the window or hide failures', async () => {
  const { lim, store, adv } = setup();
  const FAIL = true, OK = false;
  await attempt(lim, FAIL); adv(60_000);
  await attempt(lim, OK); await attempt(lim, OK);
  const rec = store.m.get('ip|/sign-in/email')!;
  assert.equal(rec.count, 1);
  const stamp = rec.lastFailure;
  await attempt(lim, OK);
  assert.equal(store.m.get('ip|/sign-in/email')!.lastFailure, stamp);
  for (let i = 0; i < 3; i++) await attempt(lim, FAIL);
  assert.equal(store.m.get('ip|/sign-in/email')!.count, 4);
  await attempt(lim, OK);
  assert.equal(await attempt(lim, FAIL), true);
  assert.equal(await attempt(lim, OK), false);
});
test('blocked attempts do not extend the block', async () => {
  const { lim, adv } = setup();
  for (let i = 0; i < 5; i++) await attempt(lim, true);
  adv(10 * 60_000);
  for (let i = 0; i < 20; i++) assert.equal(await attempt(lim, false), false);
  adv(5 * 60_000 + 1000);
  assert.equal(await attempt(lim, false), true);
});
test('failures older than the window are forgotten', async () => {
  const { lim, adv } = setup();
  for (let i = 0; i < 4; i++) await attempt(lim, true);
  adv(W + 1);
  for (let i = 0; i < 4; i++) assert.equal(await attempt(lim, true), true);
});
test('concurrent bad passwords cannot exceed max reserved attempts', async () => {
  const { lim } = setup();
  const begun = await Promise.all(Array.from({ length: 20 }, () => lim.begin('k')));
  const ok = begun.filter((b) => b.ok);
  assert.equal(ok.length, 5);
  for (const b of ok) if (b.ok) await b.finish(true);
  assert.equal((await lim.begin('k')).ok, false);
});
test('concurrent successes release their reservation and keep failures intact', async () => {
  const { lim, store } = setup();
  const begun = await Promise.all(Array.from({ length: 5 }, () => lim.begin('k')));
  for (const b of begun) if (b.ok) await b.finish(false);
  assert.equal(store.m.size, 0);
  const again = await Promise.all(Array.from({ length: 5 }, () => lim.begin('k')));
  assert.equal(again.filter((b) => b.ok).length, 5);
});
test('failures recorded while others are in flight still count once', async () => {
  const { lim, store } = setup();
  const a = await lim.begin('k'); const b = await lim.begin('k');
  if (a.ok) await a.finish(true);
  if (b.ok) await b.finish(false);
  assert.equal(store.m.get('k')!.count, 1);
});
