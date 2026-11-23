import { smsGuardians, usablePhone, type Guardian, type GuardianSmsResult } from './guardian-sms';

/**
 * Parent alerts for a student's emergency departure.
 *
 * Every linked guardian gets one SMS (deduplicated by phone, so two guardians
 * sharing a number get one text). A failed or missing SMS never undoes the
 * recorded departure; the caller reports what was actually delivered so staff
 * know when to phone the family themselves.
 */

export type { Guardian };
export type DepartureAlertResult = GuardianSmsResult;
export { usablePhone };

/** One SMS per distinct guardian number; see guardian-sms.ts. */
export const alertGuardians = smsGuardians;

const NEPAL_OFFSET_MS = 345 * 60_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14:05, 15 Nov" in Nepal time. */
export function nepalTimeLabel(at: Date): string {
  const local = new Date(at.getTime() + NEPAL_OFFSET_MS);
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}, ${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]}`;
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function departureMessage(input: {
  studentName: string;
  branchName: string;
  at: Date;
  reason: string;
  collectedBy?: string | null;
}): string {
  const collected = input.collectedBy?.trim() ? ` Collected by: ${clip(input.collectedBy, 60)}.` : '';
  return `ALERT: ${clip(input.studentName, 60)} left ${clip(input.branchName, 60)} early at ${nepalTimeLabel(input.at)}. `
    + `Reason: ${clip(input.reason, 120)}.${collected} Please contact the branch if this is unexpected.`;
}

/** Staff-facing summary of who was reached. */
export function departureSummary(result: DepartureAlertResult): string {
  if (result.guardians === 0) {
    return 'Emergency departure recorded. No parent is linked to this student, so no SMS was sent. Please call the family.';
  }
  if (result.sent === 0) {
    return 'Emergency departure recorded, but no parent SMS could be sent. Please call the family.';
  }
  const reached = `Parent SMS sent to ${result.sent} number${result.sent === 1 ? '' : 's'}`;
  const gaps = result.failed + result.withoutPhone;
  return gaps > 0
    ? `Emergency departure recorded. ${reached}; ${gaps} parent contact${gaps === 1 ? '' : 's'} could not be reached by SMS.`
    : `Emergency departure recorded. ${reached}.`;
}
