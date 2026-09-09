import { ClientFunction, RequestMock, Selector } from 'testcafe';

const defaults = { staticQrEnabled: true, staticQrImageUrl: 'https://example.test/default.png', accountName: 'Tenant', accountNumber: '0012345', bankName: 'Bank', instructions: '', connectIpsEnabled: true, source: 'tenant_default' };
let stored = null;
let writes = 0;
let readStatus = 200;
let verificationRequests = 0;
const mock = roleName => RequestMock().onRequestTo(/\/api\//).respond((req, res) => {
  const url = new URL(req.url);
  const method = req.method.toLowerCase();
  res.headers['content-type'] = 'application/json';
  res.headers['cache-control'] = 'no-store';
  res.headers['access-control-allow-origin'] = 'http://localhost:5189';
  res.headers['access-control-allow-credentials'] = 'true';
  res.headers['access-control-allow-methods'] = 'GET, PUT, DELETE, POST, OPTIONS';
  res.headers['access-control-allow-headers'] = 'Content-Type';
  if (method === 'options') { res.setBody({}); return; }
  if (url.pathname.endsWith('/auth/get-session')) {
    res.setBody({ session: { id: 'session', userId: 'admin', expiresAt: '2099-01-01T00:00:00Z' }, user: { id: 'admin', name: 'Admin', email: 'admin@example.test', roles: [{ roleName, branchId: roleName === 'Tenant Admin' ? null : 'a' }] } }); return;
  }
  if (url.pathname.endsWith('/admin/branches/payment-settings')) {
    res.setBody({ tenantDefaults: defaults, branches: [{ branch: { id: 'a', name: 'Alpha', location: 'North' }, hasCustomSettings: Boolean(stored), settings: stored }] }); return;
  }
  if (url.pathname.endsWith('/payment-settings/verification')) { verificationRequests++; res.setBody({ challengeId: 'challenge', destination: '******1234', expiresIn: 300 }); return; }
  if (url.pathname.endsWith('/branches/a/payment-settings')) {
    const body = JSON.parse(req.body.toString());
    if (body.verification?.code !== '123456') { res.statusCode = 403; res.setBody({ error: 'Invalid SMS code' }); return; }
    writes++; stored = method === 'delete' ? null : JSON.parse(req.body.toString()); res.setBody({ message: 'Saved' }); return;
  }
  if (url.pathname.endsWith('/payment-settings')) {
    if (readStatus !== 200) { res.statusCode = readStatus; res.setBody({ error: 'Backend validation message' }); return; }
    res.setBody(stored?.staticQrEnabled ? { ...defaults, ...stored, source: 'branch' } : defaults); return;
  }
  if (url.pathname.endsWith('/branches')) { res.setBody({ branches: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Unassigned' }] }); return; }
  res.setBody({ notifications: [], unreadCount: 0, branches: [] });
});
const field = name => Selector(`[name="${name}"]`);
const panel = Selector('.branch-payment-settings');
const edit = panel.find('button').withExactText('Edit settings');
const save = panel.find('button').withExactText('Continue to SMS verification');
const overflow = ClientFunction(() => document.documentElement.scrollWidth > window.innerWidth);
fixture('Branch payment settings').page('http://localhost:5189/tenant/payment-settings?branchId=a')
  .beforeEach(() => { stored = null; writes = 0; readStatus = 200; verificationRequests = 0; });

test.requestHooks(mock('Tenant Admin'))('tenant admin edits once, confirms once, and returns to a clean saved state', async t => {
  await t.expect(panel.find('.payment-source').innerText).contains('Tenant defaults');
  await t.expect(panel.find('input[type=file]').exists).notOk();
  await t.wait(500);
  await t.expect(edit.count).eql(1).expect(edit.hasAttribute('disabled')).notOk();
  await t.click(edit);
  await t.expect(panel.innerText).contains('No changes yet');
  await t.expect(save.hasAttribute('disabled')).ok();
  await t.click(panel.find('[type="checkbox"]'));
  await t.click(save).expect(field('staticQrImageUrl').getAttribute('aria-invalid')).eql('true');
  await t.setFilesToUpload(field('staticQrImageUrl'), './fixtures/payment-qr.png');
  await t.expect(panel.find('img[alt="QR image ready to save"]').exists).ok({ timeout: 3000 });
  await t.typeText(field('accountNumber'), '12', { replace: true }).click(save);
  await t.expect(field('accountNumber').getAttribute('aria-invalid')).eql('true');
  await t.typeText(field('accountNumber'), '0012345', { replace: true });
  await t.typeText(field('accountName'), 'Alpha account', { replace: true });
  await t.typeText(field('bankName'), 'Nabil Bank', { replace: true }).click(save);
  await t.expect(panel.find('.payment-field-error').count).eql(0);
  await t.expect(panel.innerText).contains('FINAL SECURITY CHECK');
  await t.typeText(field('verificationCode'), '123456');
  await t.expect(panel.find('button').withExactText('Confirm and save').hasAttribute('disabled')).notOk();
  await t.click(panel.find('button').withExactText('Confirm and save'));
  await t.expect(writes).eql(1);
  await t.expect(stored.staticQrEnabled).ok();
  await t.expect(stored.accountNumber).eql('0012345');
  await t.expect(panel.find('.payment-source').innerText).contains('Custom for this branch');
  await t.expect(panel.find('input[type=file]').exists).notOk();
  await t.expect(panel.find('button').withText('Replace QR image').exists).notOk();
  await t.expect(verificationRequests).eql(1);
  for (const width of [375, 768, 1280]) {
    await t.resizeWindow(width, 900).wait(300).expect(overflow()).notOk();
  }
  await t.click(edit);
  await t.expect(panel.find('button').withText('Replace QR image').exists).ok();
  await t.expect(save.hasAttribute('disabled')).ok();
  await t.expect(verificationRequests).eql(1);
  await t.click(panel.find('[type="checkbox"]')).click(save);
  await t.typeText(field('verificationCode'), '123456');
  await t.expect(panel.find('button').withExactText('Confirm reset').hasAttribute('disabled')).notOk();
  await t.click(panel.find('button').withExactText('Confirm reset'));
  await t.expect(panel.find('.payment-source').innerText).contains('Tenant defaults');
  await t.expect(stored).eql(null);
});

test.page('http://localhost:5189/branch/payment-settings?branchId=a').requestHooks(mock('Branch Admin'))('branch admin sees only assigned branch and cannot edit', async t => {
  await t.expect(panel.exists).ok();
  await t.expect(panel.find('form').exists).notOk();
  await t.expect(panel.find('button').count).eql(0);
  await t.expect(panel.innerText).contains('Read only');
  await t.expect(Selector('option').withText('Unassigned').exists).notOk();
  await t.expect(Selector('h2').withText('All branch configurations').exists).notOk();
  await t.expect(writes).eql(0);
});

test.requestHooks(mock('Tenant Admin'))('settings errors are actionable and retry recovers', async t => {
  await t.expect(panel.exists).ok();
  readStatus = 403;
  await t.navigateTo('http://localhost:5189/tenant/payment-settings?branchId=a');
  await t.expect(panel.innerText).contains('Insufficient permissions');
  readStatus = 404;
  await t.click(panel.find('button').withText('Retry'));
  await t.expect(panel.innerText).contains('Branch not found');
  readStatus = 200;
  await t.click(panel.find('button').withText('Retry'));
  await t.expect(panel.find('button').withText('Edit settings').exists).ok();
});
