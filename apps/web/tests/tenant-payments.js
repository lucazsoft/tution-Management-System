import { RequestMock, Selector } from 'testcafe';

const proof = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=';
const mock = RequestMock().onRequestTo(/\/api\//).respond((req, res) => {
  const url = new URL(req.url);
  res.headers['content-type'] = 'application/json';
  res.headers['access-control-allow-origin'] = 'http://localhost:5189';
  res.headers['access-control-allow-credentials'] = 'true';
  if (url.pathname.endsWith('/auth/get-session')) {
    res.setBody({ session: { id: 'session', userId: 'admin', expiresAt: '2099-01-01T00:00:00Z' }, user: { id: 'admin', name: 'Admin', email: 'admin@example.test', roles: [{ roleName: 'Tenant Admin', branchId: null }] } }); return;
  }
  if (url.pathname.endsWith('/finances/payment-attempts')) {
    res.setBody({ attempts: [{ id: 'attempt-1', txnId: 'qr_test', provider: 'BANK', referenceId: 'TEST-REF-123', amount: 3955, status: 'SUCCESS', gatewayStatus: 'APPROVED', gatewayMessage: null, receiptProof: proof, createdAt: '2026-09-08T14:15:17.000Z', confirmedAt: '2026-09-08T14:20:00.000Z', failedAt: null, reviewedAt: '2026-09-08T14:20:00.000Z', reviewRemarks: 'Matched', invoiceId: 'invoice-1', invoiceStatus: 'PAID', branchId: 'branch-example', branchName: 'Example Branch', studentName: 'Sample Student' }] }); return;
  }
  res.setBody({ notifications: [], unreadCount: 0, branches: [] });
});

fixture('Tenant payments').page('http://localhost:5189/tenant/payments');

test.requestHooks(mock)('opens uploaded payment proof inside the app with branch context', async t => {
  await t.expect(Selector('.payments-table').innerText).contains('Example Branch');
  await t.click(Selector('button').withExactText('View payment proof'));
  const dialog = Selector('.payments-proof-dialog');
  await t.expect(dialog.visible).ok();
  await t.expect(dialog.innerText).contains('Sample Student');
  await t.expect(dialog.innerText).contains('Example Branch');
  await t.expect(dialog.innerText).contains('TEST-REF-123');
  await t.expect(dialog.find('img').getAttribute('src')).eql(proof);
  await t.pressKey('esc');
  await t.expect(dialog.exists).notOk();
});
