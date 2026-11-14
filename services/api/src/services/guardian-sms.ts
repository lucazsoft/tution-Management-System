import type { PrismaClient } from '@prisma/client';
import { normaliseAakashPhoneNumber } from '../utils/phone';

/**
 * SMS to a student's linked guardians (parents).
 *
 * Shared by emergency departures, payment receipts and fee reminders so every
 * parent-facing SMS uses real numbers from the parent accounts and the
 * configured gateway (getSmsSender), never a placeholder or a mock.
 */

export interface Guardian {
  userId: string;
  phone: string | null;
}

export interface GuardianSmsResult {
  /** Linked, active guardians found for the student. */
  guardians: number;
  /** Distinct valid numbers an SMS was attempted for. */
  attempted: number;
  sent: number;
  failed: number;
  /** Guardians with no usable 10-digit mobile number on file. */
  withoutPhone: number;
}

export interface SmsSender {
  sendSms(to: string, message: string): Promise<{ success: boolean }>;
}

/** Valid Nepali mobile number in the 10-digit form the gateway accepts, or null. */
export function usablePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const normalised = normaliseAakashPhoneNumber(phone);
  return /^9\d{9}$/.test(normalised) ? normalised : null;
}

/** Texts each distinct valid number once; failures are counted, never thrown. */
export async function smsGuardians(
  sender: SmsSender,
  guardians: Guardian[],
  message: string,
): Promise<GuardianSmsResult> {
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

type GuardianLink = { parent: { user: { id: string; phone: string | null; status: string } } };

/** Active guardians from a student's parent links. */
export function activeGuardians(links: GuardianLink[]): Guardian[] {
  return links
    .map((link) => link.parent.user)
    .filter((user) => user.status === 'ACTIVE')
    .map((user) => ({ userId: user.id, phone: user.phone }));
}

/** Prisma include that loads what [activeGuardians] needs. */
export const GUARDIAN_LINKS_INCLUDE = {
  studentParents: { include: { parent: { include: { user: { select: { id: true, phone: true, status: true } } } } } },
} as const;

/** Loads the active guardians of one student. */
export async function findGuardians(
  db: Pick<PrismaClient, 'studentParent'>,
  studentId: string,
): Promise<Guardian[]> {
  const links = await db.studentParent.findMany({
    where: { studentId },
    include: { parent: { include: { user: { select: { id: true, phone: true, status: true } } } } },
  });
  return activeGuardians(links);
}

/** Integer rupee amount with Nepali digit grouping, e.g. 125000 → "1,25,000". */
export function formatRupees(amount: number): string {
  return Math.round(amount).toLocaleString('en-IN');
}
