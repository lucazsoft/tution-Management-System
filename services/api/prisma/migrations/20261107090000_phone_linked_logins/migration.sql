-- Phone-linked logins (docs/planphone.md, phase 1).
ALTER TABLE "User" ADD COLUMN "loginEmailGenerated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Student" ADD COLUMN "usesGuardianPhone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StudentParent" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- At most one primary guardian per student.
CREATE UNIQUE INDEX "StudentParent_one_primary_per_student"
ON "StudentParent"("studentId") WHERE "isPrimary";

-- Backfill: a student's only (or first-created) parent link becomes primary.
-- Admission has always created exactly one link, so this is deterministic.
UPDATE "StudentParent" sp
SET "isPrimary" = true
WHERE sp."parentId" = (
  SELECT sp2."parentId" FROM "StudentParent" sp2
  JOIN "Parent" p ON p."id" = sp2."parentId"
  WHERE sp2."studentId" = sp."studentId"
  ORDER BY p."createdAt" ASC, sp2."parentId" ASC
  LIMIT 1
);

-- Backfill: students without a phone of their own are linked to their guardian.
UPDATE "Student" s
SET "usesGuardianPhone" = true
FROM "User" u
WHERE u."id" = s."userId" AND btrim(u."phone") = '';
