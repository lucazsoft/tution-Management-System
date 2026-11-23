/** Delivery is closed until the operator selects an explicit audience. */
export type PushRecipientPolicy = (tenantId: string, userId: string, title: string, body: string) => boolean;

export function createPushRecipientPolicy(env: NodeJS.ProcessEnv): PushRecipientPolicy {
  const mode = (env.PUSH_DELIVERY_MODE || 'DISABLED').toUpperCase();
  const testTitle = env.PUSH_TEST_TITLE;
  const testBody = env.PUSH_TEST_BODY;
  if (mode === 'DISABLED') return () => false;
  if (mode === 'ALL') return () => true;
  if (mode !== 'ALLOWLIST') throw new Error('PUSH_DELIVERY_MODE must be DISABLED, ALLOWLIST or ALL.');
  let entries: unknown;
  try { entries = JSON.parse(env.PUSH_ALLOWED_RECIPIENTS || '[]'); }
  catch { throw new Error('PUSH_ALLOWED_RECIPIENTS must be a JSON recipient list.'); }
  if (!Array.isArray(entries) || entries.length === 0 || entries.some(entry =>
    !entry || typeof entry !== 'object' ||
    typeof entry.tenantId !== 'string' || !entry.tenantId.trim() ||
    typeof entry.userId !== 'string' || !entry.userId.trim())) {
    throw new Error('PUSH_ALLOWED_RECIPIENTS must contain explicit tenantId/userId pairs.');
  }
  if (!testTitle?.trim() || !testBody?.trim()) {
    throw new Error('ALLOWLIST requires exact PUSH_TEST_TITLE and PUSH_TEST_BODY.');
  }
  const allowed = new Set(entries.map(entry => JSON.stringify([entry.tenantId, entry.userId])));
  return (tenantId, userId, title, body) => allowed.has(JSON.stringify([tenantId, userId])) &&
    title === testTitle && body === testBody;
}
