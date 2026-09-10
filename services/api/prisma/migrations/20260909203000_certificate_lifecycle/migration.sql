ALTER TABLE "CertificateTemplate"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Certificate"
ALTER COLUMN "pdfUrl" DROP NOT NULL,
ADD COLUMN "snapshot" JSONB,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "revokedAt" TIMESTAMP(3),
ADD COLUMN "revokedBy" TEXT,
ADD COLUMN "revocationReason" TEXT;

CREATE INDEX "Certificate_branchId_status_issuedDate_idx" ON "Certificate"("branchId", "status", "issuedDate");
