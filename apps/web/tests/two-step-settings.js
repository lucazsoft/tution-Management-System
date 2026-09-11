import { RequestMock, Selector } from 'testcafe';
let enabled = false;
let verified = true;
const mock = RequestMock().onRequestTo(/\/api\//).respond((req, res) => {
  res.headers['content-type'] = 'application/json';
  res.headers['access-control-allow-origin'] = 'http://localhost:5193';
  res.headers['access-control-allow-credentials'] = 'true';
  res.headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
  res.headers['access-control-allow-headers'] = 'Content-Type';
  if (req.method === 'OPTIONS') return res.setBody({});
  const path = new URL(req.url).pathname;
  if (path.endsWith('/auth/get-session')) return res.setBody({ session: { id: 's', userId: 'u', expiresAt: '2099-01-01T00:00:00Z' }, user: { id: 'u', name: 'Student', email: 'student@example.test', roles: [{ roleName: 'Student', branchId: 'branch' }] } });
  if (path.endsWith('/users/me/account')) return res.setBody({ twoFactorEnabled: enabled, mobileVerified: verified, phone: '9812345678' });
  if (path.endsWith('/two-factor/enable')) return res.setBody({ backupCodes: ['recovery-one', 'recovery-two'], totpURI: 'unused' });
  if (path.endsWith('/two-factor/verify-otp')) {
    if (JSON.parse(req.body.toString()).code !== '123456') { res.statusCode = 400; return res.setBody({ message: 'Invalid code' }); }
    enabled = true; return res.setBody({ status: true });
  }
  if (path.endsWith('/two-factor/disable')) { enabled = false; return res.setBody({ status: true }); }
  return res.setBody({ status: true });
});
fixture('Two-step setup').page('http://localhost:5193/student/security');
test.requestHooks(mock)('requires verification, confirms SMS, shows recovery codes, and disables with password', async t => {
  const section = Selector('.account-section').withText('Use an SMS code after your password');
  await t.click(section.find('button').withText('Set up'));
  await t.typeText(section.find('input[type=password]'), 'CorrectPassword123!').click(section.find('button').withText('Send setup code'));
  await t.typeText(section.find('input[autocomplete=one-time-code]'), '000000').click(section.find('button').withText('Confirm code'));
  await t.expect(section.find('[role=alert]').innerText).contains('Invalid code');
  await t.typeText(section.find('input[autocomplete=one-time-code]'), '123456', { replace: true }).click(section.find('button').withText('Confirm code'));
  await t.expect(section.innerText).contains('recovery-one').expect(section.find('button').withExactText('Done').hasAttribute('disabled')).ok();
  await t.click(section.find('input[type=checkbox]')).click(section.find('button').withExactText('Done'));
  await t.expect(section.innerText).notContains('recovery-one');
  await t.click(section.find('button').withText('Turn off two-step'));
  await t.typeText(section.find('input[type=password]'), 'CorrectPassword123!').click(section.find('button').withExactText('Turn off'));
  await t.expect(section.innerText).contains('has been turned off');
  verified = false;
  await t.navigateTo('http://localhost:5193/student/security');
  await t.expect(section.find('button').withText('Set up').hasAttribute('disabled')).ok();
  await t.expect(section.find('a').getAttribute('href')).eql('/student/account');
});
