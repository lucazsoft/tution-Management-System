CREATE TYPE "SocialPlatform" AS ENUM ('META', 'TIKTOK', 'LINKEDIN');
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'BLOCKED', 'FAILED');
CREATE TYPE "SocialPublishOutcome" AS ENUM ('PUBLISHED', 'BLOCKED', 'FAILED');

CREATE TABLE "SocialMediaPost" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "platform" "SocialPlatform" NOT NULL,
  "content" TEXT NOT NULL,
  "mediaUrls" JSONB,
  "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "scheduledFor" TIMESTAMP(3),
  "scheduledById" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "providerPostId" TEXT,
  "lastError" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialMediaPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialPublishAttempt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "outcome" "SocialPublishOutcome" NOT NULL,
  "detail" TEXT NOT NULL,
  "providerPostId" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialPublishAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SocialMediaPost_tenantId_status_scheduledFor_idx" ON "SocialMediaPost"("tenantId", "status", "scheduledFor");
CREATE INDEX "SocialPublishAttempt_tenantId_postId_attemptedAt_idx" ON "SocialPublishAttempt"("tenantId", "postId", "attemptedAt");
ALTER TABLE "SocialMediaPost" ADD CONSTRAINT "SocialMediaPost_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPublishAttempt" ADD CONSTRAINT "SocialPublishAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPublishAttempt" ADD CONSTRAINT "SocialPublishAttempt_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialMediaPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
