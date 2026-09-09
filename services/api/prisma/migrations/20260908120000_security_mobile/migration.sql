-- Existing phone values are deliberately not backfilled as verified.
ALTER TABLE "User" ADD COLUMN "securityMobile" TEXT,
ADD COLUMN "securityMobileVerifiedAt" TIMESTAMP(3);
