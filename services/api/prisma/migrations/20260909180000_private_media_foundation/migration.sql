CREATE TABLE "MediaObject" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "category" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "MediaObject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaObject_objectKey_key" ON "MediaObject"("objectKey");
CREATE INDEX "MediaObject_tenantId_category_ownerType_ownerId_status_idx" ON "MediaObject"("tenantId", "category", "ownerType", "ownerId", "status");
CREATE INDEX "MediaObject_tenantId_branchId_category_idx" ON "MediaObject"("tenantId", "branchId", "category");
ALTER TABLE "MediaObject" ADD CONSTRAINT "MediaObject_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaObject" ADD CONSTRAINT "MediaObject_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
