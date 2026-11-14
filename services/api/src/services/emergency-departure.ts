import { normaliseAakashPhoneNumber } from '../utils/phone';

/**
 * Parent alerts for a student's emergency departure.
 *
 * Every linked guardian gets one SMS (deduplicated by phone, so two guardians
 * sharing a number get one text). A failed or missing SMS never undoes the
 * recorded departure; the caller reports what was actually delivered so staff
 * know when to phone the family themselves.
 */

export interface Guardian {
  userId: string;
  phone: string | null;
}

export interface DepartureAlertResult {
  /** Linked guardians found for the student. */
  guardians: number;
  /** Distinct valid numbers an SMS was attempted for. */
  attempted: number;
  sent: number;
  failed: number;
  /** Guardians with no usable 10-digit mobile number on file. */
  withoutPhone: number;
}

interface SmsSender {
  sendSms(to: string, message: string): Promise<{ success: boolean }>;
}

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

/** Valid Nepali mobile number in the 10-digit form the gateway accepts, or null. */
export function usablePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const normalised = normaliseAakashPhoneNumber(phone);
  return /^9\d{9}$/.test(normalised) ? normalised : null;
}

export async function alertGuardians(
  sender: SmsSender,
  guardians: Guardian[],
  message: string,
): Promise<DepartureAlertResult> {
  const phones = new Set<string>();
  let withoutPhone = 0;
  for (const guardian of guardians) {
    const phone = usablePhone(guardian.phone);
    if (phone) phones.add(phone);
    else withoutPhone += 1;
  }
  let sent = 0;
  let failed = 0;
  for (const phone of phones) {
    try {
      const result = await sender.sendSms(phone, message);
      if (result.success) sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { guardians: guardians.length, attempted: phones.size, sent, failed, withoutPhone };
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
