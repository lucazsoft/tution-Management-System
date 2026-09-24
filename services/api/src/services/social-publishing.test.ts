import assert from 'node:assert/strict';
import type { UserPayload } from '@tms/types';
import {
  MissingCredentialsAdapter,
  executeDueSocialPosts,
  scheduleApprovedPost,
  SocialPostRecord,
  SocialPublishingRepository,
} from './social-publishing';

const actor = (tenantId: string, roleName: string): UserPayload => ({
  id: 'actor-1', tenantId, email: 'actor@example.test', firstName: 'Test', lastName: 'Actor',
  roles: [{ roleName, branchId: roleName === 'Tenant Admin' ? null : 'branch-a', permissions: [] }],
});

class MemoryRepository implements SocialPublishingRepository {
  posts: SocialPostRecord[];
  audits: Array<{ tenantId: string; postId: string; outcome: string; detail: string }> = [];

  constructor(posts: SocialPostRecord[]) { this.posts = posts; }

  async scheduleApproved(tenantId: string, postId: string, scheduledFor: Date, actorId: string) {
    const post = this.posts.find(row => row.id === postId && row.tenantId === tenantId && row.status === 'APPROVED');
    if (!post) return null;
    Object.assign(post, { status: 'SCHEDULED', scheduledFor, scheduledById: actorId });
    return { ...post };
  }

  async claimDue(tenantId: string, now: Date) {
    const post = this.posts.find(row => row.tenantId === tenantId && row.status === 'SCHEDULED' && row.scheduledFor && row.scheduledFor <= now);
    if (!post) return null;
    post.status = 'PUBLISHING'; post.attemptCount += 1;
    return { ...post };
  }

  async completeAttempt(tenantId: string, postId: string, result: { outcome: 'PUBLISHED' | 'BLOCKED' | 'FAILED'; providerPostId?: string; detail: string }, attemptedAt: Date) {
    const post = this.posts.find(row => row.id === postId && row.tenantId === tenantId && row.status === 'PUBLISHING');
    if (!post) return false;
    Object.assign(post, {
      status: result.outcome,
      providerPostId: result.providerPostId ?? null,
      lastError: result.outcome === 'PUBLISHED' ? null : result.detail,
      lastAttemptAt: attemptedAt,
      publishedAt: result.outcome === 'PUBLISHED' ? attemptedAt : null,
    });
    this.audits.push({ tenantId, postId, outcome: result.outcome, detail: result.detail });
    return true;
  }
}

const post = (overrides: Partial<SocialPostRecord> = {}): SocialPostRecord => ({
  id: 'post-1', tenantId: 'tenant-a', platform: 'META', content: 'Hello', mediaUrls: [],
  status: 'APPROVED', scheduledFor: null, attemptCount: 0, ...overrides,
});

async function main() {
  const now = new Date('2026-09-09T06:00:00.000Z');

  const schedulingRepo = new MemoryRepository([post()]);
  await assert.rejects(
    () => scheduleApprovedPost({ actor: actor('tenant-a', 'Branch Admin'), tenantId: 'tenant-a', postId: 'post-1', scheduledFor: now }, schedulingRepo),
    /Only the Tenant Admin/,
  );
  await assert.rejects(
    () => scheduleApprovedPost({ actor: actor('tenant-b', 'Tenant Admin'), tenantId: 'tenant-a', postId: 'post-1', scheduledFor: now }, schedulingRepo),
    /Institution scope mismatch/,
  );
  const scheduled = await scheduleApprovedPost({ actor: actor('tenant-a', 'Tenant Admin'), tenantId: 'tenant-a', postId: 'post-1', scheduledFor: now }, schedulingRepo);
  assert.equal(scheduled.status, 'SCHEDULED');

  const notDueRepo = new MemoryRepository([post({ status: 'SCHEDULED', scheduledFor: new Date(now.getTime() + 1) })]);
  assert.deepEqual(await executeDueSocialPosts({ tenantId: 'tenant-a', now, repository: notDueRepo, adapters: { META: new MissingCredentialsAdapter('META') } }), { claimed: 0, published: 0, blocked: 0, failed: 0 });
  assert.equal(notDueRepo.posts[0].attemptCount, 0);

  const missingCredentialsRepo = new MemoryRepository([post({ status: 'SCHEDULED', scheduledFor: new Date(now.getTime() - 1) })]);
  assert.deepEqual(await executeDueSocialPosts({ tenantId: 'tenant-a', now, repository: missingCredentialsRepo, adapters: { META: new MissingCredentialsAdapter('META') } }), { claimed: 1, published: 0, blocked: 1, failed: 0 });
  assert.equal(missingCredentialsRepo.posts[0].status, 'BLOCKED');
  assert.equal(missingCredentialsRepo.posts[0].attemptCount, 1);
  assert.match(missingCredentialsRepo.posts[0].lastError!, /credentials are not configured/);
  assert.deepEqual(missingCredentialsRepo.audits.map(row => row.outcome), ['BLOCKED']);

  const publishedRepo = new MemoryRepository([post({ status: 'SCHEDULED', scheduledFor: new Date(now.getTime() - 1) })]);
  let calls = 0;
  const adapter = { publish: async () => { calls++; return { outcome: 'PUBLISHED' as const, providerPostId: 'provider-123', detail: 'Provider accepted post.' }; } };
  assert.deepEqual(await executeDueSocialPosts({ tenantId: 'tenant-a', now, repository: publishedRepo, adapters: { META: adapter } }), { claimed: 1, published: 1, blocked: 0, failed: 0 });
  assert.deepEqual(await executeDueSocialPosts({ tenantId: 'tenant-a', now, repository: publishedRepo, adapters: { META: adapter } }), { claimed: 0, published: 0, blocked: 0, failed: 0 });
  assert.equal(calls, 1, 'a completed post must never be published twice');
  assert.equal(publishedRepo.posts[0].providerPostId, 'provider-123');

  const otherTenantRepo = new MemoryRepository([post({ tenantId: 'tenant-b', status: 'SCHEDULED', scheduledFor: new Date(now.getTime() - 1) })]);
  assert.deepEqual(await executeDueSocialPosts({ tenantId: 'tenant-a', now, repository: otherTenantRepo, adapters: { META: adapter } }), { claimed: 0, published: 0, blocked: 0, failed: 0 });

  console.log('Social publishing tests passed: authorization, tenant scope, due times, idempotency, persistence, and missing credentials.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
