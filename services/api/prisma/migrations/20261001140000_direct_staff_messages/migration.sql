-- Allow authorized staff-to-staff conversations without inventing a student context.
ALTER TABLE "ParentMessage" ALTER COLUMN "studentId" DROP NOT NULL;
