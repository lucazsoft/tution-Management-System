// Synthetic portal scopes and two-source inbox regression checks. No real accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const output = process.env.TMS_TEST_OUTPUT_DIR || path.join(os.tmpdir(), 'tms-notification-checks');
await fs.mkdir(output, { recursive: true });
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html' };
const server = http.createServer(async (req, res) => {
  let file = path.resolve(dist, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return; }
  try { if (!(await fs.stat(file)).isFile()) throw new Error('not file'); } catch { file = path.join(dist, 'index.html'); }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.end(await fs.readFile(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--disable-sync'] });
const context = await browser.newContext();
const page = await context.newPage();
const children = ['one', 'two'].map((id) => ({ id, name: `Test Child ${id}`, initials: 'TC', grade: 'Fixture grade', branch: 'Fixture branch', rollNumber: id,
  blocked: false, attendanceRate: 100, outstanding: 0 }));
let role = 'Student';
let read = false;
let failRead = false;
let failEvents = false;
let wrongChild = false;
const posts = [];
const childScopes = [];
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await context.addInitScript(() => {
  window.__permissionRequests = 0;
  if ('Notification' in window) Notification.requestPermission = async () => { window.__permissionRequests++; return 'denied'; };
});
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
  if (!url.pathname.startsWith('/api/')) return route.continue();
  let status = 200;
  let body = {};
  const notice = { id: 'shared-id', title: 'Synthetic portal alert', message: 'A current alert with an independently read account event.',
    time: '22 November 2026', occurredAt: '2026-11-22T10:00:00Z', destination: role === 'Parent' ? 'notifications' : '/student/notifications',
    unread: !read, icon: 'notifications', channels: ['Push'], urgent: false };
  if (url.pathname.endsWith('/auth/get-session')) body = { session: { id: 'fixture-session', userId: 'fixture-user', expiresAt: '2099-01-01T00:00:00Z' },
    user: { id: 'fixture-user', name: 'Fixture User', email: 'fixture@example.test', roles: [{ roleName: role, branchId: null }] } };
  else if (url.pathname.endsWith('/portal-notifications/read')) {
    posts.push({ path: url.pathname, data: route.request().postDataJSON() });
    if (failRead) { status = 503; body = { error: 'Synthetic failure' }; }
    else { read = true; body = { message: 'Read' }; }
  } else if (url.pathname.endsWith('/notifications/read-all')) {
    posts.push({ path: url.pathname }); body = { count: 1 };
  } else if (url.pathname.endsWith('/notifications')) {
    if (failEvents) { status = 503; body = { error: 'Synthetic event source failure' }; }
    else body = { notifications: [{ id: 'shared-id', title: 'Synthetic account event', body: 'Event history remains separate.', destination: '/student/notifications',
      createdAt: '2026-11-22T09:00:00Z', readAt: null }], total: 1, unreadCount: 1 };
  } else if (url.pathname.endsWith('/users/me/student-portal')) {
    body = { generatedAt: '2026-11-22T11:00:00Z', studentProfile: { name: 'Synthetic Student', initials: 'SS', enrollmentId: 'fixture-student',
      institution: 'Fixture school', grade: 'Fixture grade', branch: 'Fixture branch', rollNumber: 'fixture', academicYear: '2026/27', blocked: false, outstanding: 0 },
      notifications: [notice], todaySessions: [], weeklySessions: [], homework: [], results: [], insights: [], syllabi: [], attendance: [], invoices: [], events: [], certificates: [] };
  } else if (url.pathname.endsWith('/parent/portal')) {
    const requested = url.searchParams.get('studentId') || 'one'; childScopes.push(requested);
    const selected = children.find((child) => child.id === (wrongChild ? 'two' : requested));
    body = { generatedAt: '2026-11-22T11:00:00Z', children, selected, notifications: [{ ...notice, title: `Alert for ${selected.name}` }],
      sessions: [], attendance: [], remarks: [], teachers: [], appointments: [], leaves: [], invoices: [], certificates: [], messages: [], events: [], syllabi: [] };
  } else { status = 503; body = { error: 'Unrelated fixture endpoint' }; }
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' } });
});
try {
  await page.setViewportSize({ width: 390, height: 950 });
  await page.goto(origin + '/student/notifications');
  const toggle = page.locator('.tms-inbox-toggle');
  await toggle.waitFor();
  await toggle.click();
  const panel = page.locator('.tms-inbox-panel');
  await panel.getByText('Current student alerts', { exact: true }).waitFor();
  await page.locator('.student-notification-button').waitFor();
  assert.equal(await panel.locator('li').count(), 2, 'Equal raw IDs from different stores must remain separate');
  assert.equal(await toggle.locator('strong').textContent(), '2');
  await page.screenshot({ path: path.join(output, 'student-sources-390.png'), fullPage: true });
  await panel.locator('[data-notification-source=portal] li button').click();
  await page.waitForFunction(() => document.querySelector('.tms-inbox-toggle strong')?.textContent === '1');
  assert(posts.some((post) => post.path === '/api/portal-notifications/read' && post.data.ids[0] === 'shared-id'));
  assert(!posts.some((post) => /\/notifications\/shared-id\/read/.test(post.path)), 'Portal reads cannot mark event history');
  await page.waitForFunction(() => document.querySelector('.student-notification-button span:last-child')?.textContent === '0');
  // Retain a usable portal list if the independent account-event source fails.
  failEvents = true;
  await toggle.click();
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
  await panel.getByRole('alert').filter({ hasText: 'Some notification sources' }).waitFor();
  assert.equal(await panel.locator('li').count(), 1);
  failEvents = false; read = false;
  role = 'Parent';
  await page.goto(origin + '/parent/notifications?child=one');
  await toggle.waitFor(); await toggle.click();
  await panel.getByText('Alert for Test Child one', { exact: true }).waitFor();
  await page.locator('.parent-notification-button').waitFor();
  await page.screenshot({ path: path.join(output, 'parent-sources-390.png'), fullPage: true });
  // Switch using the real linked-child control. Neither old rows nor reads cross the scope.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Test Child two.*Fixture grade/ }).click();
  await toggle.click();
  await panel.getByText('Alert for Test Child two', { exact: true }).waitFor();
  assert.equal(await panel.getByText('Alert for Test Child one', { exact: true }).count(), 0);
  assert(childScopes.includes('one') && childScopes.includes('two'));
  failRead = true;
  await panel.locator('[data-notification-source=portal] li button').click();
  await panel.getByRole('alert').filter({ hasText: 'The action did not finish' }).waitFor();
  assert.equal(await panel.locator('[data-notification-source=portal] .is-unread').count(), 1);
  failRead = false;
  await panel.getByRole('button', { name: 'Mark all read', exact: true }).click();
  assert(posts.some((post) => post.path === '/api/notifications/read-all'));
  await page.waitForFunction(() => document.querySelector('.parent-notification-button span:last-child')?.textContent === '0');
  // A bad/mismatched parent response is never shown as the requested child.
  wrongChild = true;
  await page.goto(origin + '/parent/notifications?child=one');
  await toggle.waitFor(); await toggle.click();
  await panel.getByRole('alert').filter({ hasText: 'Some notification sources' }).waitFor();
  assert.equal(await panel.locator('[data-notification-source=portal]').count(), 0);
  assert.equal(await page.evaluate(() => window.__permissionRequests), 0);
  assert.deepEqual(errors, []);
  console.log('PASS synthetic source groups, independent IDs/read endpoints, portal refresh after reads, partial failure, selected-child switch and mismatch protection. External requests blocked.');
  console.log(`Screenshots: ${output}`);
} finally {
  await context.close(); await browser.close(); await new Promise((resolve) => server.close(resolve));
}
