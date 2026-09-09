CREATE TABLE "MobileRecovery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "newPhone" TEXT NOT NULL,
  "oldPhone" TEXT NOT NULL,
  "accountUpdatedAt" TIMESTAMP(3) NOT NULL,
  "credentialHash" TEXT NOT NULL,
  "reviewer" TEXT NOT NULL,
  "reviewReference" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "codeHash" TEXT,
  "codeExpiresAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "sends" INTEGER NOT NULL DEFAULT 0,
  "lastSentAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "MobileRecovery_tokenHash_key" ON "MobileRecovery"("tokenHash");
CREATE INDEX "MobileRecovery_userId_consumedAt_idx" ON "MobileRecovery"("userId", "consumedAt");
CREATE TABLE "RecoverySmsNotice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "recoveryId" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "leaseUntil" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "RecoverySmsNotice_recoveryId_recipient_key" ON "RecoverySmsNotice"("recoveryId", "recipient");
