// Identity rules for phone-linked admission logins (docs/planphone.md).
//
// - Student and parent emails are optional. A missing one becomes a generated
//   login ID `firstname.lastname@<LOGIN_EMAIL_DOMAIN>` that never receives mail.
// - A student either has a phone of their own, or the admission ticks
//   "Use parent's number as primary" (`useGuardianPhone`). Never both, never neither.
// - The parent phone is always required: it receives the parent login, and the
//   student login too when the student is guardian-linked.
// - A sibling is linked to the existing parent account instead of being rejected.
import type { Prisma } from '@prisma/client';
import prisma from '../utils/db';
import { normaliseAakashPhoneNumber } from '../utils/phone';
import { loginEmailDomain } from '../utils/runtime-config';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS = /^[0-9+()\-\s]*$/;
const NAME_MAX = 100;

export interface AdmissionPerson {
  firstName: string;
  lastName: string;
  /** Normalised email, or '' when the system must generate a login ID. */
  email: string;
  phone: string;
}

export interface AdmissionStudentInput extends AdmissionPerson {
  usesGuardianPhone: boolean;
}

type Parsed<T> = { success: true; data: T } | { success: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value.trim() : null;
}

/** Accepts JSON booleans and the yes/no/true/false spellings a CSV carries. */
export function readYesNo(value: unknown): boolean | null {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(text)) return true;
  if (['false', 'no', 'n', '0'].includes(text)) return false;
  return null;
}

/** Ten local digits Aakash can deliver to, or null. */
export function deliverablePhone(value: string): string | null {
  const phone = normaliseAakashPhoneNumber(value || '');
  return /^\d{10}$/.test(phone) ? phone : null;
}

function parsePerson(body: unknown, allowed: string[], who: string): Parsed<AdmissionPerson> {
  if (!isPlainObject(body)) return { success: false, error: `${who} details are required.` };
  const unexpected = Object.keys(body).find((key) => !allowed.includes(key));
  if (unexpected) return { success: false, error: `Unexpected field: ${unexpected}.` };
  const firstName = readText(body, 'firstName');
  const lastName = readText(body, 'lastName');
  const email = readText(body, 'email');
  const phone = readText(body, 'phone');
  if (!firstName || firstName.length > NAME_MAX) return { success: false, error: `A valid ${who.toLowerCase()} first name is required.` };
  if (!lastName || lastName.length > NAME_MAX) return { success: false, error: `A valid ${who.toLowerCase()} last name is required.` };
  if (email === null || email.length > 254 || (email && !EMAIL.test(email))) {
    return { success: false, error: `The ${who.toLowerCase()} email is invalid. Leave it blank to generate a login ID.` };
  }
  if (phone === null || phone.length > 30 || !PHONE_CHARS.test(phone)) {
    return { success: false, error: `The ${who.toLowerCase()} phone must contain only digits and phone punctuation.` };
  }
  return { success: true, data: { firstName, lastName, email: email.toLowerCase(), phone } };
}

export function parseAdmissionStudent(body: unknown): Parsed<AdmissionStudentInput> {
  const person = parsePerson(body, ['firstName', 'lastName', 'email', 'phone', 'useGuardianPhone'], 'Student');
  if (!person.success) return person;
  const usesGuardianPhone = readYesNo((body as Record<string, unknown>).useGuardianPhone);
  if (usesGuardianPhone === null) return { success: false, error: "useGuardianPhone must be true or false." };
  const { phone } = person.data;
  if (usesGuardianPhone && phone) {
    return { success: false, error: "Enter the student's phone number or tick 'Use parent's number as primary', not both." };
  }
  if (!usesGuardianPhone && !phone) {
    return { success: false, error: "Enter the student's phone number or tick 'Use parent's number as primary'." };
  }
  if (phone && !deliverablePhone(phone)) {
    return { success: false, error: "The student's phone must be a 10-digit Nepal mobile number." };
  }
  return { success: true, data: { ...person.data, usesGuardianPhone } };
}

export function parseAdmissionParent(body: unknown): Parsed<AdmissionPerson> {
  const person = parsePerson(body, ['firstName', 'lastName', 'email', 'phone'], 'Parent');
  if (!person.success) return person;
  if (!deliverablePhone(person.data.phone)) {
    return { success: false, error: "The parent's phone is required and must be a 10-digit Nepal mobile number. Logins are sent to it by SMS." };
  }
  return person;
}

/** `Rām Śarmā-K.C.` → `ram.sarma.kc`; letters and digits only, never empty. */
export function loginEmailLocalPart(firstName: string, lastName: string): string {
  const slug = (value: string) => value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('.');
  const local = [slug(firstName), slug(lastName)].filter(Boolean).join('.').slice(0, 48).replace(/\.+$/, '');
  return local || 'user';
}

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * First free `name`, `name2`, `name3`… at the login domain. Runs inside the
 * admission transaction; a concurrent admission taking the same address makes
 * the insert fail with P2002, which `createAdmissionRecords` retries.
 */
export async function generateLoginEmail(db: Db, firstName: string, lastName: string, domain = loginEmailDomain()): Promise<string> {
  const local = loginEmailLocalPart(firstName, lastName);
  const taken = await db.user.findMany({
    where: { email: { startsWith: `${local}`, endsWith: `@${domain}` } },
    select: { email: true },
  });
  const used = new Set(taken.map((row) => row.email));
  for (let n = 1; n < 10_000; n += 1) {
    const candidate = `${n === 1 ? local : `${local}${n}`}@${domain}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('Unable to generate a unique login ID for this name.');
}

export type ExistingParent =
  | { kind: 'none' }
  | { kind: 'parent'; parentId: string; userId: string; email: string; phone: string }
  | { kind: 'conflict'; status: 404 | 409; error: string; parentChoices?: ParentChoice[] };

export interface ParentChoice { userId: string; name: string; email: string; childCount: number }

/**
 * Decides whether the admission links to an existing parent account:
 * 1. `existingParentUserId` — the admin chose the parent explicitly.
 * 2. A real email that already exists — linked if it is a Parent here, else 409.
 * 3. No email — matched by normalised phone; two or more matches are never guessed.
 */
export async function findExistingParent(
  tenantId: string,
  parent: AdmissionPerson,
  existingParentUserId?: string,
): Promise<ExistingParent> {
  const parentSelect = {
    id: true, email: true, phone: true, tenantId: true, firstName: true, lastName: true,
    parent: { select: { id: true, _count: { select: { studentParents: true } } } },
  } as const;

  if (existingParentUserId) {
    const user = await prisma.user.findFirst({ where: { id: existingParentUserId, tenantId }, select: parentSelect });
    if (!user?.parent) return { kind: 'conflict', status: 404, error: 'The chosen parent account was not found in your institution.' };
    return { kind: 'parent', parentId: user.parent.id, userId: user.id, email: user.email, phone: user.phone };
  }

  if (parent.email) {
    const user = await prisma.user.findUnique({ where: { email: parent.email }, select: parentSelect });
    if (!user) return { kind: 'none' };
    if (user.tenantId !== tenantId || !user.parent) {
      return { kind: 'conflict', status: 409, error: `An account already exists for ${parent.email}.` };
    }
    return { kind: 'parent', parentId: user.parent.id, userId: user.id, email: user.email, phone: user.phone };
  }

  const phone = deliverablePhone(parent.phone);
  if (!phone) return { kind: 'none' };
  const candidates = await prisma.user.findMany({
    where: { tenantId, phone: { endsWith: phone.slice(-7) }, parent: { isNot: null } },
    select: parentSelect,
    take: 20,
  });
  const matches = candidates.filter((user) => deliverablePhone(user.phone) === phone);
  if (matches.length === 0) return { kind: 'none' };
  if (matches.length > 1) {
    return {
      kind: 'conflict',
      status: 409,
      error: 'More than one parent account uses this phone number. Choose the parent account to link this student to.',
      parentChoices: matches.map((user) => ({
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        childCount: user.parent!._count.studentParents,
      })),
    };
  }
  const [match] = matches;
  return { kind: 'parent', parentId: match.parent!.id, userId: match.id, email: match.email, phone: match.phone };
}
