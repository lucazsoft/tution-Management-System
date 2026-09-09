import 'dotenv/config';
import os from 'node:os';
import prisma from '../utils/db';
import { approveMobileRecovery, deliverRecoveryNotices } from '../services/mobile-recovery';

// Privileged host tool: access is controlled by deployment-host/DB credentials.
// Never expose this command through an application endpoint or accept web input.
async function main() {
  const [action, tenantId, userId, phone, reference, acknowledgement] = process.argv.slice(2);
  if (action === 'retry-notices') { await deliverRecoveryNotices(); return; }
  if (action !== 'approve' || !tenantId || !userId || !phone || !reference || acknowledgement !== 'IDENTITY_REVIEW_COMPLETED') {
    throw new Error('Usage: mobile-recovery approve <tenantId> <userId> <newPhone> <reviewTicket> IDENTITY_REVIEW_COMPLETED | retry-notices');
  }
  const grant = await approveMobileRecovery({ tenantId, userId, phone, reference, reviewer: `${os.hostname()}/${os.userInfo().username}` });
  // Deliberate one-time operator output, never an application log. Do not run in CI.
  console.log(JSON.stringify({ ...grant, instruction: 'Deliver this token only through the identity-verified support interaction. It expires in 24 hours. Do not put it in a URL or ticket log.' }, null, 2));
}
main().catch(() => { console.error('Recovery operation failed. Check command arguments, account eligibility and database availability.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
