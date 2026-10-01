ALTER TABLE "Appointment" ADD COLUMN "proposedById" TEXT;

CREATE INDEX "Appointment_proposedById_status_idx"
ON "Appointment"("proposedById", "status");
