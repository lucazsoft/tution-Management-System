import assert from 'node:assert/strict';
import prisma from '../utils/db';
import { prismaSocialPublishingRepository } from './social-publishing-store';

const calls: Array<{ name: string; args: any }> = [];
let status = 'APPROVED';
const row: any = {
  id: 'post-1', tenantId: 'tenant-a', platform: 'META', content: 'Hello', mediaUrls: [],
  status, scheduledFor: null, scheduledById: null, attemptCount: 0,
};

(prisma as any).$transaction = async (operation: any) => operation(prisma);
(prisma as any).socialMediaPost = {
  updateMany: async (args: any) => {
    calls.push({ name: 'updateMany', args });
    if (args.where.tenantId !== 'tenant-a' || args.where.id !== 'post-1' || args.where.status !== status) return { count: 0 };
    status = args.data.status ?? status;
    const { attemptCount, ...data } = args.data;
    Object.assign(row, data, { status });
    if (attemptCount?.increment) row.attemptCount += attemptCount.increment;
    return { count: 1 };
  },
  findFirst: async (args: any) => {
    calls.push({ name: 'findFirst', args });
    if (args.where.tenantId !== 'tenant-a' || (args.where.status && args.where.status !== status)) return null;
    if (args.where.scheduledFor?.lte && row.scheduledFor > args.where.scheduledFor.lte) return null;
    return { ...row };
  },
  findFirstOrThrow: async (args: any) => {
    calls.push({ name: 'findFirstOrThrow', args });
    assert.equal(args.where.tenantId, 'tenant-a');
    return { ...row };
  },
};
(prisma as any).socialPublishAttempt = {
  create: async (args: any) => { calls.push({ name: 'audit.create', args }); return args.data; },
};

async function main() {
  const scheduledFor = new Date('2026-09-09T06:00:00.000Z');
  const scheduled = await prismaSocialPublishingRepository.scheduleApproved('tenant-a', 'post-1', scheduledFor, 'admin-1');
  assert.equal(scheduled?.status, 'SCHEDULED');
  assert.equal(calls[0].args.where.status, 'APPROVED');
  assert.equal(calls[0].args.where.tenantId, 'tenant-a');

  const notDue = await prismaSocialPublishingRepository.claimDue('tenant-a', new Date(scheduledFor.getTime() - 1));
  assert.equal(notDue, null);

  const claimed = await prismaSocialPublishingRepository.claimDue('tenant-a', scheduledFor);
  assert.equal(claimed?.status, 'PUBLISHING');
  assert.equal(claimed?.attemptCount, 1);
  const claimUpdate = calls.find(call => call.name === 'updateMany' && call.args.data.status === 'PUBLISHING')!;
  assert.equal(claimUpdate.args.where.tenantId, 'tenant-a');
  assert.equal(claimUpdate.args.where.status, 'SCHEDULED');
  assert.ok(claimUpdate.args.where.scheduledFor.lte);

  assert.equal(await prismaSocialPublishingRepository.completeAttempt('tenant-a', 'post-1', { outcome: 'BLOCKED', detail: 'credentials absent' }, scheduledFor), true);
  assert.equal(status, 'BLOCKED');
  const audit = calls.find(call => call.name === 'audit.create')!;
  assert.deepEqual({ tenantId: audit.args.data.tenantId, postId: audit.args.data.postId, outcome: audit.args.data.outcome }, { tenantId: 'tenant-a', postId: 'post-1', outcome: 'BLOCKED' });

  assert.equal(await prismaSocialPublishingRepository.completeAttempt('tenant-b', 'post-1', { outcome: 'PUBLISHED', providerPostId: 'fake', detail: 'bad scope' }, scheduledFor), false);
  assert.equal(status, 'BLOCKED');
  console.log('Social publishing store tests passed: atomic tenant-scoped schedule, claim, completion, and audit persistence.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
