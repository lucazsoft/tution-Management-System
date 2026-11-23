import assert from 'node:assert/strict';
import { createPushRecipientPolicy } from './push-recipient-policy';
assert.equal(createPushRecipientPolicy({})('t', 'u', 'T', 'B'), false);
assert.equal(createPushRecipientPolicy({PUSH_DELIVERY_MODE:'DISABLED'})('t', 'u', 'T', 'B'), false);
assert.throws(() => createPushRecipientPolicy({PUSH_DELIVERY_MODE:'unexpected'}));
for (const value of ['not-json', '{}', '[]', '[{}]', '[{"tenantId":"t","userId":""}]']) {
  assert.throws(() => createPushRecipientPolicy({PUSH_DELIVERY_MODE:'ALLOWLIST', PUSH_ALLOWED_RECIPIENTS:value}));
}
const policy = createPushRecipientPolicy({PUSH_DELIVERY_MODE:'ALLOWLIST',
  PUSH_TEST_TITLE:'T', PUSH_TEST_BODY:'B',
  PUSH_ALLOWED_RECIPIENTS:JSON.stringify([{tenantId:'t',userId:'u'}])});
assert.equal(policy('t','u','T','B'),true);
assert.equal(policy('other','u','T','B'),false);
assert.equal(policy('t','other','T','B'),false);
assert.equal(createPushRecipientPolicy({PUSH_DELIVERY_MODE:'ALL'})('t','u','T','B'),true);
console.log('PASS closed default, explicit modes, malformed rejection, exact tenant/recipient scope');

assert.equal(policy('t','u','Normal workflow','B'),false);
assert.equal(policy('t','u','T','Unapproved content'),false);

assert.throws(() => createPushRecipientPolicy({PUSH_DELIVERY_MODE:'ALLOWLIST', PUSH_ALLOWED_RECIPIENTS:JSON.stringify([{tenantId:'t',userId:'u'}])}));
