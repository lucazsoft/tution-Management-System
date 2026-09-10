import { ClientFunction, RequestMock, Selector } from 'testcafe';

let passwordRequest;
const mock = RequestMock().onRequestTo(/\/api\//).respond((req, res) => {
  res.headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
  res.headers['access-control-allow-headers'] = 'Content-Type';
  res.headers['content-type'] = 'application/json';
  res.headers['access-control-allow-origin'] = 'http://localhost:5190';
  res.headers['access-control-allow-credentials'] = 'true';
  if (req.method === 'OPTIONS') return res.setBody({});
  const path = new URL(req.url).pathname;
  if (path.endsWith('/auth/get-session')) return res.setBody({ session: { id: 'session', userId: 'student', expiresAt: '2099-01-01T00:00:00Z' }, user: { id: 'student', name: 'Sample Student', email: 'student@example.test', roles: [{ roleName: 'Student', branchId: 'branch' }] } });
  if (path.endsWith('/auth/change-password')) {
    passwordRequest = JSON.parse(req.body.toString());
    return res.setBody({ token: 'test-session', user: { id: 'student' } });
  }
  return res.setBody({ notifications: [], unreadCount: 0, branches: [] });
});

fixture('Shared account password').page('http://localhost:5190/student/security');
test.requestHooks(mock)('clears the form and requests revocation of other sessions after success', async t => {
  passwordRequest = undefined;
  // TestCafe proxies the dev-server socket; its connection overlay is unrelated to the form.
  await ClientFunction(() => {
    document.querySelector('#webpack-dev-server-client-overlay')?.remove();
    // TestCafe's HTTP proxy is not a secure context; only toast IDs need this shim.
    if (!crypto.randomUUID) crypto.randomUUID = () => `test-${Date.now()}-${Math.random()}`;
  })();
  await t.typeText('#currentPassword', 'OldPassword123!')
    .typeText('#newPassword', 'NewPassword123!')
    .typeText('#confirmPassword', 'NewPassword123!')
    .click(Selector('button').withExactText('Change Password'))
    .expect(Selector('body').innerText).contains('Password changed. Other sessions have been signed out.')
    .expect(Selector('#currentPassword').value).eql('')
    .expect(Selector('#newPassword').value).eql('')
    .expect(Selector('#confirmPassword').value).eql('')
    .expect(Selector('body').innerText).notContains("Cannot read properties");
  await t.expect(passwordRequest).eql({ currentPassword: 'OldPassword123!', newPassword: 'NewPassword123!', revokeOtherSessions: true });
});
