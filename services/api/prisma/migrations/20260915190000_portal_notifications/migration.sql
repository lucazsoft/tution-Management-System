CREATE TABLE "PortalNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentId" TEXT,
    "sourceKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "channels" JSONB,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortalNotification_tenantId_userId_sourceKey_key" ON "PortalNotification"("tenantId", "userId", "sourceKey");
CREATE INDEX "PortalNotification_tenantId_userId_studentId_occurredAt_idx" ON "PortalNotification"("tenantId", "userId", "studentId", "occurredAt");
CREATE INDEX "PortalNotification_tenantId_userId_readAt_idx" ON "PortalNotification"("tenantId", "userId", "readAt");
