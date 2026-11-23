-- Control Center automation runs (reminders and alerts): last-run display and SMS cooldown.
CREATE TABLE "AutomationRun" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "taskName" TEXT NOT NULL,
  "startedById" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AutomationRun_tenantId_taskName_createdAt_idx" ON "AutomationRun"("tenantId", "taskName", "createdAt");
