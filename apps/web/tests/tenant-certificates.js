import { ClientFunction, RequestMock, Selector } from 'testcafe';

const mock = RequestMock().onRequestTo(/\/api\//).respond((req, res) => {
  const path = new URL(req.url).pathname;
  res.headers['content-type'] = 'application/json';
  res.headers['access-control-allow-origin'] = 'http://localhost:5190';
  res.headers['access-control-allow-credentials'] = 'true';
  if (path.endsWith('/auth/get-session')) return res.setBody({ session: { id: 'session', userId: 'admin', expiresAt: '2099-01-01T00:00:00Z' }, user: { id: 'admin', name: 'Admin User', email: 'admin@example.test', roles: [{ roleName: 'Tenant Admin', branchId: null }] } });
  if (path.endsWith('/certificates/options')) return res.setBody({ templates: [{ id: 'template-1', name: 'Academic Excellence', type: 'ACHIEVEMENT', status: 'ACTIVE', version: 1, updatedAt: '2026-09-09T00:00:00Z', layoutConfig: { renderMode: 'DESIGN', theme: 'ACADEMIC', title: 'Certificate of Excellence', presentationLine: 'This certificate is proudly presented to', achievementLine: 'For outstanding academic achievement', signatoryName: 'Principal', signatoryTitle: 'School principal' } }], students: [{ studentId: 'student-1', studentName: 'Sample Student', gradeName: 'Grade 10', branchId: 'branch-1', branchName: 'Main Branch' }] });
  if (path.endsWith('/certificates/issued')) return res.setBody({ certificates: [{ certificateId: 'CERT-2026-EXAMPLE', status: 'ACTIVE', issuedDate: '2026-09-09T00:00:00Z', studentName: 'Sample Student', gradeName: 'Grade 10', branchName: 'Main Branch', templateName: 'Academic Excellence', templateType: 'ACHIEVEMENT', revokedAt: null, revocationReason: null }] });
  return res.setBody({ notifications: [], unreadCount: 0, branches: [] });
});

const hasOverflow = ClientFunction(() => document.documentElement.scrollWidth > window.innerWidth);
const selectTab = ClientFunction((index) => document.querySelectorAll('.tenant-certificate-tabs button')[index]?.click());

fixture('Tenant certificates').page('http://localhost:5190/tenant/certificates');

test.requestHooks(mock)('separates issue, design, and certificate history with responsive layouts', async t => {
  await t.expect(Selector('.tenant-certificate-tabs').exists).ok();
  await t.expect(Selector('button').withExactText('Issue certificate').exists).ok();
  await selectTab(1);
  await t.expect(Selector('.tenant-certificate-tabs button').nth(1).hasClass('is-active')).ok();
  await t.expect(Selector('.tenant-certificate-design-preview').exists).ok();
  await t.expect(Selector('#certificate-html').exists).notOk();
  await selectTab(2);
  await t.expect(Selector('.tenant-certificate-table').innerText).contains('CERT-2026-EXAMPLE');
  for (const [width, height] of [[375, 812], [768, 900], [1280, 900]]) {
    await t.resizeWindow(width, height).expect(hasOverflow()).notOk(`Certificate page overflows at ${width}px`);
  }
});
