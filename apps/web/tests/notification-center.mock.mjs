// Local production-bundle UI verification. All API replies are synthetic.
// Every non-local request is blocked. This never talks to Firebase or a TMS server.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const output = process.env.TMS_TEST_OUTPUT_DIR || path.join(os.tmpdir(), 'tms-notification-checks');
await fs.mkdir(output, { recursive: true });
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html' };
const server = http.createServer(async (req, res) => {
  const route = new URL(req.url, 'http://localhost').pathname;
  let filename = path.resolve(dist, '.' + route);
  if (!filename.startsWith(dist + path.sep) && filename !== dist) { res.writeHead(403); res.end(); return; }
  try {
    if (!(await fs.stat(filename)).isFile()) throw new Error('not file');
  } catch { filename = path.join(dist, 'index.html'); }
  res.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream');
  res.end(await fs.readFile(filename));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true, args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--disable-sync'] });
const context = await browser.newContext();
const page = await context.newPage();
let notices = [
  { id: 'test-notice-1', title: 'Calendar update', body: 'A synthetic classroom event for this local test.', destination: '/tenant/account', readAt: null, createdAt: '2026-11-22T10:00:00Z' },
  { id: 'test-notice-2', title: 'Institution update', body: 'A second synthetic account update.', destination: '/tenant/account', readAt: null, createdAt: '2026-11-22T09:00:00Z' },
];
let failInbox = false;
let markRead = 0;
let markAll = 0;
let permissionRequests = 0;
const attemptedExternal = [];
await context.addInitScript(() => {
  window.__permissionRequests = 0;
  if ('Notification' in window) Notification.requestPermission = async () => { window.__permissionRequests++; return 'denied'; };
});
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    attemptedExternal.push(url.origin); await route.abort(); return;
  }
  if (!url.pathname.startsWith('/api/')) return route.continue();
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'content-type': 'application/json' };
  let body = {};
  let status = 200;
  if (url.pathname.endsWith('/auth/get-session')) body = { session: { id: 'test-session', userId: 'test-user', expiresAt: '2099-01-01T00:00:00Z' }, user: { id: 'test-user', name: 'Local Test User', email: 'local@example.test', roles: [{ roleName: 'Tenant Admin', branchId: null }] } };
  else if (url.pathname.endsWith('/users/me/account')) body = { firstName: 'Local', lastName: 'Test User', email: 'local@example.test', phone: '', emailVerified: false, mobileVerified: false, twoFactorEnabled: false, roles: [{ id: 'test-role', name: 'Tenant Admin', branchId: null, branchName: 'Test' }], tenant: { name: 'Local fixture' }, capabilities: { manageInstitution: true, manageSecurityMobile: true } };
  else if (url.pathname.endsWith('/notifications/read-all')) { markAll++; notices = notices.map((n) => ({ ...n, readAt: '2026-11-22T11:00:00Z' })); body = { count: notices.length }; }
  else if (/\/notifications\/[^/]+\/read$/.test(url.pathname)) { markRead++; const id = decodeURIComponent(url.pathname.split('/').at(-2)); notices = notices.map((n) => n.id === id ? { ...n, readAt: '2026-11-22T11:00:00Z' } : n); body = { read: true }; }
  else if (url.pathname.endsWith('/notifications')) {
    if (failInbox) { status = 503; body = { error: 'Synthetic unavailable state.' }; }
    else body = { notifications: notices, total: notices.length, unreadCount: notices.filter((n) => !n.readAt).length, page: 1, pageSize: 50 };
  } else { status = 503; body = { error: 'Unrelated page data not part of this local fixture.' }; }
  await route.fulfill({ status, headers, body: JSON.stringify(body) });
});
try {
  await page.goto(origin + '/tenant/account');
  const toggle = page.locator('.tms-inbox-toggle');
  await toggle.waitFor();
  await page.waitForFunction(() => document.querySelector('.tms-inbox-toggle')?.textContent.includes('2'));
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await toggle.click();
    const panel = page.locator('.tms-inbox-panel');
    await panel.waitFor();
    const box = await panel.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width, `Inbox overflow at ${width}`);
    assert.equal(await panel.locator('li').count(), 2);
    assert(await panel.getByRole('button', { name: 'Enable browser notifications', exact: true }).isDisabled());
    await page.screenshot({ path: path.join(output, `inbox-${width}.png`), fullPage: true });
    await page.keyboard.press('Escape');
    assert.equal(await panel.count(), 0);
    assert(await toggle.evaluate((element) => element === document.activeElement));
  }
  await toggle.click();
  await page.locator('.tms-inbox-panel li button').first().click();
  await page.waitForFunction(() => document.querySelector('.tms-inbox-toggle')?.textContent.includes('1'));
  assert.equal(markRead, 1);
  await toggle.click();
  await page.getByRole('button', { name: 'Mark all read', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.tms-inbox-toggle strong'));
  assert.equal(markAll, 1);
  failInbox = true;
  await page.locator('.tms-inbox-panel').getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Could not load updates' }).waitFor();
  failInbox = false;
  notices = [];
  await page.locator('.tms-inbox-panel').getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText('No account updates yet.', { exact: true }).waitFor();
  permissionRequests = await page.evaluate(() => window.__permissionRequests);
  assert.equal(permissionRequests, 0, 'No permission prompt on load or disabled-config UI');
  assert(attemptedExternal.every((url) => url === 'https://fonts.googleapis.com'), 'No provider/API requests beyond blocked existing font stylesheets');
  console.log('Existing external font stylesheet requests were blocked; all API data was mocked.');
  console.log('PASS mock inbox: 320/390/1280px, real count/list, read/read-all, keyboard, empty/error states, no automatic permissions and external requests blocked.');
  console.log(`Screenshots: ${output}`);
} finally {
  await context.close(); await browser.close(); await new Promise((resolve) => server.close(resolve));
}
