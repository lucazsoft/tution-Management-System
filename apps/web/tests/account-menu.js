import { ClientFunction, RequestMock, Selector } from 'testcafe';

const origin = 'http://localhost:5192';
const roles = [
  ['Tenant Admin', '/tenant/account', '/tenant/security'],
  ['Branch Admin', '/branch/account', '/branch/security'],
  ['Teacher', '/teacher/account', '/teacher/security'],
  ['Accountant', '/staff/account', '/staff/security'],
  ['Parent', '/parent/account', '/parent/security'],
  ['Student', '/student/account', '/student/security'],
  ['Super Admin', null, '/platform/security'],
  ['Receptionist', null, '/staff/reception#security'],
  ['Janitor', null, '/staff/tasks#security'],
];

fixture('Shared account menu');
for (const [role, accountPath, securityPath] of roles) {
  const mock = RequestMock().onRequestTo(/\/api\//).respond((req, res) => {
    res.headers['content-type'] = 'application/json';
    res.headers['access-control-allow-origin'] = origin;
    res.headers['access-control-allow-credentials'] = 'true';
    const path = new URL(req.url).pathname;
    if (path.endsWith('/auth/get-session')) return res.setBody({ session: { id: 's', userId: 'user', expiresAt: '2099-01-01T00:00:00Z' }, user: { id: 'user', name: 'Sample User', email: 'user@example.test', roles: [{ roleName: role, branchId: role === 'Tenant Admin' || role === 'Super Admin' ? null : 'branch' }] } });
    if (path.endsWith('/users/me/account')) return res.setBody({ firstName: 'Sample', lastName: 'User', email: 'user@example.test', phone: '', emailVerified: false, mobileVerified: false, twoFactorEnabled: false, roles: [{ id: 'r', name: role, branchId: 'branch', branchName: 'Main' }], tenant: { name: 'School' }, capabilities: { manageInstitution: role === 'Tenant Admin', manageSecurityMobile: role === 'Tenant Admin' } });
    // Unrelated workspace requests may fail; personal navigation must still work.
    res.statusCode = 503;
    return res.setBody({ error: 'Workspace data unavailable in menu fixture.' });
  });
  test.page(origin + (accountPath || securityPath)).requestHooks(mock)(`${role}: destinations, keyboard, dismissal, mobile and sign-out control`, async t => {
    const trigger = Selector('[aria-label="User account menu"]');
    const panel = Selector('.account-menu__panel');
    await t.expect(trigger.exists).ok();
    await t.click(trigger).expect(trigger.getAttribute('aria-expanded')).eql('true');
    await t.expect(panel.find('a').withText('My account').count).eql(accountPath ? 1 : 0);
    if (accountPath) await t.expect(panel.find('a').withText('My account').getAttribute('href')).eql(accountPath);
    await t.expect(panel.find('a').withText('Security').getAttribute('href')).eql(securityPath);
    await t.expect(panel.find('button').withText('Sign out').exists).ok();
    await t.pressKey('tab').expect(panel.find('a').nth(0).focused).ok();
    await t.pressKey('esc').expect(panel.exists).notOk().expect(trigger.focused).ok();
    await t.click(trigger).click(panel.find('a').withText('Security'));
    await t.expect(ClientFunction(() => location.pathname + location.hash)()).eql(securityPath);
    await t.expect(panel.exists).notOk();
    for (const width of [375, 768, 1280]) {
      await t.resizeWindow(width, 1000).click(trigger);
      await t.expect(ClientFunction(() => { const box = document.querySelector('.account-menu__panel').getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; })()).ok();
      await t.pressKey('esc');
    }
    await t.click(trigger);
    await ClientFunction(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))();
    await t.expect(panel.exists).notOk();
  });
}
