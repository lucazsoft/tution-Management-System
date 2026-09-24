import type { Prisma } from '@prisma/client';
import prisma from '../utils/db';
import type { SocialPostRecord, SocialPublishingRepository, SocialPublishResult } from './social-publishing';

function asMediaUrls(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function mapPost(row: any): SocialPostRecord {
  return { ...row, mediaUrls: asMediaUrls(row.mediaUrls) } as SocialPostRecord;
}

export const prismaSocialPublishingRepository: SocialPublishingRepository = {
  async scheduleApproved(tenantId, postId, scheduledFor, actorId) {
    return prisma.$transaction(async tx => {
      const update = await tx.socialMediaPost.updateMany({
        where: { id: postId, tenantId, status: 'APPROVED' },
        data: { status: 'SCHEDULED', scheduledFor, scheduledById: actorId, lastError: null },
      });
      if (update.count !== 1) return null;
      return mapPost(await tx.socialMediaPost.findFirstOrThrow({ where: { id: postId, tenantId } }));
    });
  },

  async claimDue(tenantId, now) {
    return prisma.$transaction(async tx => {
      const candidate = await tx.socialMediaPost.findFirst({
        where: { tenantId, status: 'SCHEDULED', scheduledFor: { lte: now } },
        orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
      });
      if (!candidate) return null;
      const update = await tx.socialMediaPost.updateMany({
        where: { id: candidate.id, tenantId, status: 'SCHEDULED', scheduledFor: { lte: now } },
        data: { status: 'PUBLISHING', lastAttemptAt: now, attemptCount: { increment: 1 } },
      });
      if (update.count !== 1) return null;
      return mapPost(await tx.socialMediaPost.findFirstOrThrow({ where: { id: candidate.id, tenantId, status: 'PUBLISHING' } }));
    });
  },

  async completeAttempt(tenantId, postId, result: SocialPublishResult, attemptedAt) {
    return prisma.$transaction(async tx => {
      const update = await tx.socialMediaPost.updateMany({
        where: { id: postId, tenantId, status: 'PUBLISHING' },
        data: {
          status: result.outcome,
          providerPostId: result.providerPostId ?? null,
          lastError: result.outcome === 'PUBLISHED' ? null : result.detail,
          publishedAt: result.outcome === 'PUBLISHED' ? attemptedAt : null,
          lastAttemptAt: attemptedAt,
        },
      });
      if (update.count !== 1) return false;
      await tx.socialPublishAttempt.create({
        data: {
          tenantId, postId, outcome: result.outcome, detail: result.detail,
          providerPostId: result.providerPostId ?? null, attemptedAt,
        },
      });
      return true;
    });
  },
};
