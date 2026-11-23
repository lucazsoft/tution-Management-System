-- Day-based L1/L2 leave routing, 48h escalation, cancellation and a decision audit trail.
ALTER TYPE "LeaveStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE TYPE "LeaveSubject" AS ENUM ('STAFF', 'STUDENT');

ALTER TABLE "Leave"
  ADD COLUMN "subjectType" "LeaveSubject" NOT NULL DEFAULT 'STAFF',
  ADD COLUMN "days" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "requiredLevel" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "escalatesAt" TIMESTAMP(3),
  ADD COLUMN "escalationNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "requestedById" TEXT;

CREATE INDEX "Leave_tenantId_status_idx" ON "Leave"("tenantId", "status");

CREATE TABLE "LeaveDecision" (
  "id" TEXT NOT NULL,
  "leaveId" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "remarks" TEXT,
  "escalated" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveDecision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LeaveDecision_leaveId_createdAt_idx" ON "LeaveDecision"("leaveId", "createdAt");
ALTER TABLE "LeaveDecision" ADD CONSTRAINT "LeaveDecision_leaveId_fkey"
  FOREIGN KEY ("leaveId") REFERENCES "Leave"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveDecision" ADD CONSTRAINT "LeaveDecision_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: keep every existing request on the route it was submitted under.
UPDATE "Leave" l SET "subjectType" = 'STUDENT'
  WHERE EXISTS (SELECT 1 FROM "Student" s WHERE s."userId" = l."userId");
UPDATE "Leave" SET "days" = GREATEST(1, ("endDate"::date - "startDate"::date) + 1);
UPDATE "Leave" SET "requiredLevel" = 2 WHERE "leaveType" = 'LONG_SICK';
UPDATE "Leave" SET "escalatesAt" = "createdAt" + INTERVAL '48 hours'
  WHERE "status" = 'PENDING' AND "subjectType" = 'STAFF';
-- Record the historic decision we can still attribute, so the timeline is not empty.
INSERT INTO "LeaveDecision" ("id", "leaveId", "level", "action", "actorId", "remarks", "createdAt")
  SELECT gen_random_uuid()::text, l."id",
         CASE WHEN l."status" = 'APPROVED_LEVEL1' THEN 1 WHEN l."requiredLevel" = 2 THEN 2 ELSE 1 END,
         CASE WHEN l."status" = 'REJECTED' THEN 'REJECT' ELSE 'APPROVE' END,
         l."approvedBy", l."remarks", l."updatedAt"
  FROM "Leave" l
  WHERE l."approvedBy" IS NOT NULL
    AND l."status" IN ('APPROVED_LEVEL1', 'APPROVED_LEVEL2', 'REJECTED')
    AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = l."approvedBy");
