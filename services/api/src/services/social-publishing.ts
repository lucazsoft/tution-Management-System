import type { UserPayload } from '@tms/types';
import { isTenantAdmin } from '../utils/access-control';

export type SocialPlatform = 'META' | 'TIKTOK' | 'LINKEDIN';
export type SocialPostStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'BLOCKED' | 'FAILED';

export interface SocialPostRecord {
  id: string;
  tenantId: string;
  platform: SocialPlatform;
  content: string;
  mediaUrls: string[];
  status: SocialPostStatus;
  scheduledFor: Date | null;
  scheduledById?: string | null;
  attemptCount: number;
  providerPostId?: string | null;
  lastError?: string | null;
  lastAttemptAt?: Date | null;
  publishedAt?: Date | null;
}

export interface SocialPublishResult {
  outcome: 'PUBLISHED' | 'BLOCKED' | 'FAILED';
  providerPostId?: string;
  detail: string;
}

export interface SocialProviderAdapter {
  publish(post: Pick<SocialPostRecord, 'id' | 'tenantId' | 'platform' | 'content' | 'mediaUrls'>): Promise<SocialPublishResult>;
}

export type SocialProviderAdapters = Partial<Record<SocialPlatform, SocialProviderAdapter>>;

export interface SocialPublishingRepository {
  scheduleApproved(tenantId: string, postId: string, scheduledFor: Date, actorId: string): Promise<SocialPostRecord | null>;
  claimDue(tenantId: string, now: Date): Promise<SocialPostRecord | null>;
  completeAttempt(tenantId: string, postId: string, result: SocialPublishResult, attemptedAt: Date): Promise<boolean>;
}

export class SocialPublishingError extends Error {
  constructor(message: string, readonly statusCode: number) { super(message); }
}

/** Explicit safe adapter used until a provider credentialed client is installed. */
export class MissingCredentialsAdapter implements SocialProviderAdapter {
  constructor(private readonly platform: SocialPlatform) {}

  async publish(): Promise<SocialPublishResult> {
    return {
      outcome: 'BLOCKED',
      detail: `${this.platform} publishing credentials are not configured; no external publication was attempted.`,
    };
  }
}

export async function scheduleApprovedPost(
  input: { actor: UserPayload; tenantId: string; postId: string; scheduledFor: Date },
  repository: SocialPublishingRepository,
): Promise<SocialPostRecord> {
  if (input.actor.tenantId !== input.tenantId) throw new SocialPublishingError('Institution scope mismatch.', 403);
  if (!isTenantAdmin(input.actor)) throw new SocialPublishingError('Only the Tenant Admin may schedule approved social posts.', 403);
  if (!Number.isFinite(input.scheduledFor.getTime())) throw new SocialPublishingError('A valid scheduled time is required.', 400);
  const scheduled = await repository.scheduleApproved(input.tenantId, input.postId, input.scheduledFor, input.actor.id);
  if (!scheduled) throw new SocialPublishingError('Approved social post not found in this institution.', 409);
  return scheduled;
}

export async function executeDueSocialPosts(input: {
  tenantId: string;
  now?: Date;
  repository: SocialPublishingRepository;
  adapters: SocialProviderAdapters;
  limit?: number;
}): Promise<{ claimed: number; published: number; blocked: number; failed: number }> {
  if (!input.tenantId) throw new SocialPublishingError('Institution scope is required.', 400);
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const totals = { claimed: 0, published: 0, blocked: 0, failed: 0 };
  while (totals.claimed < limit) {
    const post = await input.repository.claimDue(input.tenantId, now);
    if (!post) break;
    totals.claimed++;
    const adapter = input.adapters[post.platform] ?? new MissingCredentialsAdapter(post.platform);
    let result: SocialPublishResult;
    try {
      result = await adapter.publish(post);
    } catch (error) {
      result = {
        outcome: 'FAILED',
        detail: error instanceof Error ? `Provider request failed: ${error.message}` : 'Provider request failed.',
      };
    }
    const persisted = await input.repository.completeAttempt(input.tenantId, post.id, result, now);
    if (persisted) totals[result.outcome.toLowerCase() as 'published' | 'blocked' | 'failed']++;
  }
  return totals;
}
