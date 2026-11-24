/**
 * Real better-auth + real Postgres check of the failed-only sign-in limit.
 * Needs DATABASE_URL pointing at a migrated, disposable database.
 * Runs the production rate-limit configuration (NODE_ENV=production) so the
 * library's own sign-in rule being off is part of what is proved.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'production';
process.env.BETTER_AUTH_SECRET = 'integration-test-secret-integration-test-secret';
process.env.BETTER_AUTH_URL = 'https://api.example.test';
process.env.WEB_ORIGIN = 'https://web.example.test';
process.env.SMS_PROVIDER = 'DISABLED';
process.env.PUSH_PROVIDER = 'DISABLED';
process.env.NEPALPAY_WEBHOOK_SECRET = 'integration-test-webhook-secret-integration-test';

async function main() {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required');
  const express = (await import('express')).default;
  const bcrypt = (await import('bcryptjs')).default;
  const { toNodeHandler } = await import('better-auth/node');
  const { default: prisma } = await import('../utils/db');
  const { auth } = await import('../utils/auth');
  const { limitFailedCredentialSignIn, failedSignInKey } = await import('../middleware/failed-sign-in-limiter');

  const tenant = await prisma.tenant.create({ data: { name: 'Limiter test', panNumber: `9${Date.now()}`.slice(0, 9) } });
  const email = 'limiter-user@example.test';
  const password = 'CorrectHorse-Battery9';
  const user = await prisma.user.create({
    data: { tenantId: tenant.id, email, passwordHash: 'unused', name: 'Limiter Test', firstName: 'L', lastName: 'T', phone: '9800000001' },
  });
  await prisma.account.create({
    data: { accountId: user.id, providerId: 'credential', userId: user.id, password: await bcrypt.hash(password, 10) },
  });

  const app = express();
  app.all('/api/auth/*', limitFailedCredentialSignIn, toNodeHandler(auth));
  const server = http.createServer(app).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const signIn = (ip: string, pw: string, mail = email) =>
    fetch(`${base}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': ip, origin: 'https://web.example.test' },
      body: JSON.stringify({ email: mail, password: pw }),
    });

  try {
    // 1. Many successful sign-ins from one IP are never limited (old rule: 5 per 15 min).
    for (let i = 0; i < 12; i++) assert.equal((await signIn('10.0.0.1', password)).status, 200, `success ${i}`);
    assert.equal(await prisma.rateLimit.count({ where: { key: failedSignInKey('10.0.0.1') } }), 0, 'successes must not count');

    // 2. Five wrong passwords are answered 401, the sixth attempt is 429 with Retry-After.
    for (let i = 0; i < 5; i++) assert.equal((await signIn('10.0.0.2', 'wrong-password-1')).status, 401, `failure ${i}`);
    const blocked = await signIn('10.0.0.2', 'wrong-password-1');
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.ok(Number(blocked.headers.get('x-retry-after')) > 0, 'legacy X-Retry-After header is kept');

    // 3. While blocked, even the right password is refused (existing protection preserved).
    assert.equal((await signIn('10.0.0.2', password)).status, 429);
    // The blocked requests did not extend the window or increase the count.
    const row = await prisma.rateLimit.findUnique({ where: { key: failedSignInKey('10.0.0.2') } });
    assert.equal(row?.count, 5);

    // 4. Other IPs are unaffected.
    assert.equal((await signIn('10.0.0.3', password)).status, 200);

    // 5. The window expires: age the row, the next attempt is allowed and succeeds, counter restarts.
    await prisma.rateLimit.update({ where: { key: failedSignInKey('10.0.0.2') }, data: { lastRequest: BigInt(Date.now() - 16 * 60 * 1000) } });
    assert.equal((await signIn('10.0.0.2', password)).status, 200);
    assert.equal((await signIn('10.0.0.2', 'wrong-password-2')).status, 401);
    assert.equal((await prisma.rateLimit.findUnique({ where: { key: failedSignInKey('10.0.0.2') } }))?.count, 1);

    // 6. Concurrent wrong passwords cannot exceed the allowance by racing.
    const burst = await Promise.all(Array.from({ length: 20 }, () => signIn('10.0.0.4', 'wrong-password-3')));
    const statuses = burst.map((r) => r.status);
    assert.equal(statuses.filter((s) => s === 401).length, 5, `statuses ${statuses.join(',')}`);
    assert.equal(statuses.filter((s) => s === 429).length, 15);

    // 7. A request the server rejects as malformed (400) is not counted as a failed password.
    const bad = await fetch(`${base}/api/auth/sign-in/email`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '10.0.0.5', origin: 'https://web.example.test' }, body: '{}',
    });
    assert.notEqual(bad.status, 200);
    assert.notEqual(bad.status, 401);
    assert.equal(await prisma.rateLimit.count({ where: { key: failedSignInKey('10.0.0.5') } }), 0);

    // 8. The library's own sign-in rule is off in production config, but its other limits remain:
    //    /request-password-reset still allows only 5 per 15 minutes per IP.
    const reset = () => fetch(`${base}/api/auth/request-password-reset`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '10.0.0.6', origin: 'https://web.example.test' },
      body: JSON.stringify({ email, redirectTo: 'https://web.example.test/reset' }),
    });
    const resetStatuses: number[] = [];
    for (let i = 0; i < 7; i++) resetStatuses.push((await reset()).status);
    assert.ok(resetStatuses.slice(5).every((s) => s === 429), `reset statuses ${resetStatuses.join(',')}`);
    // 10. Auth that completes AFTER the client disconnected is still counted exactly once, and the reservation is held until then.
    const slowApp = express();
    slowApp.post('/api/auth/sign-in/email', limitFailedCredentialSignIn, (_req, res) => {
      setTimeout(() => res.status(401).json({ message: 'bad' }), 300);
    });
    const slowServer = http.createServer(slowApp).listen(0);
    const slowBase = `http://127.0.0.1:${(slowServer.address() as AddressInfo).port}`;
    try {
      const ctrl: AbortController[] = [];
      const sent = Array.from({ length: 5 }, () => {
        const c = new AbortController(); ctrl.push(c);
        return fetch(`${slowBase}/api/auth/sign-in/email`, { method: 'POST', headers: { 'x-real-ip': '10.0.0.8', 'content-type': 'application/json' }, body: '{}', signal: c.signal }).catch(() => null);
      });
      await new Promise((r) => setTimeout(r, 100));
      ctrl.forEach((c) => c.abort());
      await Promise.all(sent);
      // Auth has not finished yet (300 ms): reservations are still held, so a 6th attempt is refused now.
      const during = await fetch(`${slowBase}/api/auth/sign-in/email`, { method: 'POST', headers: { 'x-real-ip': '10.0.0.8', 'content-type': 'application/json' }, body: '{}' });
      assert.equal(during.status, 429, 'reservations held while auth completes after disconnect');
      await new Promise((r) => setTimeout(r, 600));
      const counted = (await prisma.rateLimit.findUnique({ where: { key: failedSignInKey('10.0.0.8') } }))?.count;
      assert.equal(counted, 5, 'each late 401 counted exactly once (no double count, no miss)');
    } finally { slowServer.close(); }

    // 11. Client already gone when the counter read finishes: reservation is released, nothing counted, auth never starts.
    for (let i = 0; i < 8; i++) {
      let nextCalled = false;
      const fakeReq: any = { method: 'POST', originalUrl: '/api/auth/sign-in/email', headers: { 'x-real-ip': '10.0.0.9' }, socket: {} };
      const fakeRes: any = { destroyed: true, writableEnded: false, setHeader() {}, status() { return this; }, json() { return this; }, once() {}, end() {} };
      await limitFailedCredentialSignIn(fakeReq, fakeRes, () => { nextCalled = true; });
      assert.equal(nextCalled, false, 'auth must not start for a request whose client left');
    }
    assert.equal((await signIn('10.0.0.9', password)).status, 200, 'no leaked reservations: IP still usable after 8 vanished requests');
    assert.equal(await prisma.rateLimit.count({ where: { key: failedSignInKey('10.0.0.9') } }), 0);
    console.log('PASS failed-only sign-in limit with real better-auth and Postgres');
  } finally {
    server.close();
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: 'failed-sign-in:10.0.0.' } } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
