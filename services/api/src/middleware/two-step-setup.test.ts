import assert from 'node:assert/strict';
import prisma from '../utils/db';
import { requireVerifiedMobileForSetup } from './two-step-setup';
let user: any;
let query: any;
(prisma as any).user.findFirst = async (args: any) => { query = args.where; return user; };
async function invoke() {
  let status = 200; let passed = false;
  await requireVerifiedMobileForSetup({ user: { id: 'self' }, tenantId: 'tenant' } as any, { status(code: number) { status = code; return this; }, json() {} } as any, () => { passed = true; });
  return { status, passed };
}
async function main() {
  process.env.SMS_PROVIDER = 'AAKASH'; process.env.AAKASH_SMS_AUTH_TOKEN = 'test';
  user = null; assert.equal((await invoke()).status, 409);
  user = { status: 'ACTIVE', phone: '9812345678' }; assert.equal((await invoke()).passed, false);
  user.securityMobile = user.phone; user.securityMobileVerifiedAt = new Date();
  assert.equal((await invoke()).passed, true);
  assert.deepEqual(query, { id: 'self', tenantId: 'tenant' });
  user.phone = '9800000000'; assert.equal((await invoke()).passed, false);
  user.phone = user.securityMobile; user.status = 'SUSPENDED'; assert.equal((await invoke()).passed, false);
  user.status = 'ACTIVE'; process.env.SMS_PROVIDER = 'OFF'; assert.equal((await invoke()).status, 503);
  console.log('PASS two-step setup requires active own-account verified mobile and configured SMS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
