// Shared admission core.
//
// Both the single-admission form (POST /users/admissions) and the CSV bulk
// import (POST /users/admissions/bulk) run through these helpers, so an
// imported student is indistinguishable from a walk-in admission: same
// validation, same admission number, same admissionRecord JSON, same BLOCKED
// enrolments, same ADMISSION invoice, same SMS login release.
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import prisma from '../utils/db';
import { ensureTenantRole } from '../utils/roles';
import { parseStrictObject } from '../utils/request-validation';
import { currentAdmissionTenure, getAdmissionTenure } from '../utils/nepali';

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function generateTempPassword(): string {
  // Satisfies the shared password policy: length, upper, lower, digit, special.
  return `Tms!${crypto.randomBytes(6).toString('hex')}A9`;
}

export interface AdmissionIdentity {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

/** Identity fields for a student, parent, or any other provisioned account. */
export function validateIdentityFields(body: unknown): AdmissionIdentity | null {
  const parsed = parseStrictObject<{ firstName: string; lastName: string; email: string; phone: string }>(body, {
    fields: {
      firstName: { required: true, maxLength: 100, normalize: (value) => value.trim(), message: 'A valid first name is required.' },
      lastName: { required: true, maxLength: 100, normalize: (value) => value.trim(), message: 'A valid last name is required.' },
      email: { required: true, maxLength: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, normalize: (value) => normalizeEmail(value), message: 'A valid email address is required.' },
      phone: { required: false, maxLength: 30, pattern: /^[0-9+()\-\s]*$/, normalize: (value) => value.trim(), message: 'Phone must contain only digits and phone punctuation.' },
    },
  });
  if (!parsed.success) return null;
  return {
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    email: parsed.data.email,
    phone: parsed.data.phone ?? '',
  };
}

export function validateAdmissionDetails(body: unknown) {
  return parseStrictObject(body, {
    fields: {
      admittedAt: { required: true, maxLength: 40, message: 'Admission date and time are required.' },
      dateOfBirth: { required: true, maxLength: 10, pattern: /^\d{4}-\d{2}-\d{2}$/, message: 'A valid student date of birth is required.' },
      gender: { required: true, maxLength: 30, message: 'Student gender is required.' },
      bloodGroup: { required: false, maxLength: 10, message: 'Blood group is too long.' },
      nationality: { required: true, maxLength: 80, message: 'Student nationality is required.' },
      permanentAddress: { required: true, maxLength: 500, message: 'Student permanent address is required.' },
      temporaryAddress: { required: false, maxLength: 500, message: 'Student temporary address is too long.' },
      school: { required: false, maxLength: 200, message: 'School name is too long.' },
      medicalNotes: { required: false, maxLength: 2000, message: 'Medical notes are too long.' },
      fatherName: { required: true, maxLength: 200, message: "Father's full name is required." },
      fatherPhone: { required: true, maxLength: 30, pattern: /^[0-9+()\-\s]+$/, message: "A valid father's phone number is required." },
      fatherEmail: { required: false, maxLength: 254, pattern: /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, normalize: normalizeEmail, message: "Father's email is invalid." },
      fatherOccupation: { required: false, maxLength: 150, message: "Father's occupation is too long." },
      motherName: { required: true, maxLength: 200, message: "Mother's full name is required." },
      motherPhone: { required: true, maxLength: 30, pattern: /^[0-9+()\-\s]+$/, message: "A valid mother's phone number is required." },
      motherEmail: { required: false, maxLength: 254, pattern: /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, normalize: normalizeEmail, message: "Mother's email is invalid." },
      motherOccupation: { required: false, maxLength: 150, message: "Mother's occupation is too long." },
      optionalParentName: { required: false, maxLength: 200, message: "Optional parent's name is too long." },
      optionalParentPhone: { required: false, maxLength: 30, pattern: /^$|^[0-9+()\-\s]+$/, message: "Optional parent's phone number is invalid." },
      optionalParentEmail: { required: false, maxLength: 254, pattern: /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, normalize: normalizeEmail, message: "Optional parent's email is invalid." },
      optionalParentOccupation: { required: false, maxLength: 150, message: "Optional parent's occupation is too long." },
      optionalParentRelationship: { required: false, maxLength: 80, message: "Optional parent's relationship is too long." },
      primaryParent: { required: true, maxLength: 30, pattern: /^(Father|Mother|Optional parent)$/, message: 'Select which recorded parent receives account credentials.' },
      emergencyContactName: { required: true, maxLength: 200, message: 'Emergency contact name is required.' },
      emergencyContactPhone: { required: true, maxLength: 30, pattern: /^[0-9+()\-\s]+$/, message: 'A valid emergency contact phone is required.' },
      emergencyContactRelationship: { required: true, maxLength: 80, message: 'Emergency contact relationship is required.' },
    },
  });
}

export type AdmissionDetails = Extract<ReturnType<typeof validateAdmissionDetails>, { success: true }>['data'];

export interface AdmissionPlacement {
  branch: { id: string; name: string; address: string; admissionFee: number };
  grade: { id: string; name: string; billingMode: string; monthlyFee: number };
  regularClasses: Array<{ id: string; name: string; courseId: string; course: { name: string; feeStructure: unknown } }>;
}

/**
 * Resolve branch, grade, and regular classes, enforcing the grade's billing
 * mode: GRADE grades are admitted at grade level with no class rows, SUBJECT
 * grades (Class 11-12) need exactly one priced class per chosen subject.
 */
export async function loadAdmissionPlacement(
  tenantId: string,
  input: { branchId: string; gradeId: string; classIds: string[] },
): Promise<{ success: true; data: AdmissionPlacement } | { success: false; status: 400 | 404 | 409; error: string }> {
  const [branch, grade, regularClasses] = await Promise.all([
    prisma.branch.findFirst({ where: { id: input.branchId, tenantId } }),
    prisma.grade.findFirst({ where: { id: input.gradeId, tenantId } }),
    prisma.class.findMany({
      where: {
        id: { in: input.classIds },
        branchId: input.branchId,
        course: { tenantId, gradeId: input.gradeId, type: 'REGULAR', isExtraActivity: false },
      },
      include: { course: true },
    }),
  ]);

  if (!branch || !grade || regularClasses.length !== input.classIds.length) {
    return { success: false, status: 404, error: 'Branch, grade, or a matching regular class was not found in your institution.' };
  }
  if (grade.billingMode === 'GRADE' && regularClasses.length) {
    return { success: false, status: 400, error: 'Regular admissions are grade-based. Enroll extra classes separately after admission.' };
  }
  if (grade.billingMode === 'SUBJECT') {
    if (!regularClasses.length) {
      return { success: false, status: 400, error: 'Choose at least one subject class for a subject-billed grade.' };
    }
    if (new Set(regularClasses.map((item) => item.courseId)).size !== regularClasses.length) {
      return { success: false, status: 400, error: 'Choose only one class for each subject.' };
    }
    const missingPrice = regularClasses.find((item) => Number((item.course.feeStructure as { monthlyBase?: number })?.monthlyBase ?? 0) <= 0);
    if (missingPrice) {
      return { success: false, status: 409, error: `${missingPrice.course.name} needs a monthly price before admission.` };
    }
  }
  return { success: true, data: { branch, grade, regularClasses } };
}

/**
 * `DUE` bills the branch admission fee now and holds logins until it is paid.
 * `ALREADY_PAID` is for admissions collected off-system — typically students
 * imported from paper or a previous system — so the ledger records the fee as
 * settled on the admission date rather than charging the family a second time.
 */
export type AdmissionSettlement = 'DUE' | 'ALREADY_PAID';

export interface CreateAdmissionParams {
  tenantId: string;
  placement: AdmissionPlacement;
  student: AdmissionIdentity;
  parent: AdmissionIdentity;
  details: AdmissionDetails;
  admittedAt: Date;
  admittedBy: { id: string; name: string };
  settlement: AdmissionSettlement;
  /** Extra BS-calendar references merged into the stored admissionRecord. */
  recordExtras?: Record<string, unknown>;
  now?: Date;
}

function buildAdmissionNumber(admittedAt: Date): string {
  return `ADM-${admittedAt.toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/** Reject reused emails up front so a row fails before any account is created. */
export async function findConflictingAccount(emails: string[]): Promise<string | null> {
  const existing = await prisma.user.findFirst({ where: { email: { in: emails } }, select: { email: true } });
  return existing?.email ?? null;
}

export async function createAdmissionRecords(params: CreateAdmissionParams) {
  const { tenantId, placement, student: studentFields, parent: parentFields, details, admittedAt, settlement } = params;
  const { branch, grade, regularClasses } = placement;
  const now = params.now ?? new Date();
  const alreadyPaid = settlement === 'ALREADY_PAID';

  const [studentRoleId, parentRoleId] = await Promise.all([
    ensureTenantRole(tenantId, 'Student'),
    ensureTenantRole(tenantId, 'Parent'),
  ]);
  const studentPassword = generateTempPassword();
  const parentPassword = generateTempPassword();
  const [studentPasswordHash, parentPasswordHash] = await Promise.all([
    bcrypt.hash(studentPassword, 10),
    bcrypt.hash(parentPassword, 10),
  ]);

  const admissionNumber = buildAdmissionNumber(admittedAt);
  const savedAdmissionRecord = {
    ...details,
    ...(params.recordExtras ?? {}),
    primaryGuardian: {
      name: `${parentFields.firstName} ${parentFields.lastName}`.trim(),
      email: parentFields.email,
      phone: parentFields.phone,
      relationship: details.primaryParent,
    },
    admittedBy: params.admittedBy,
    admittedAt: admittedAt.toISOString(),
  };

  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 7);

  // A fee due now is billed against the tenure that starts now. A fee already
  // collected is billed against the tenure that was running on the admission
  // date, which is what the receipt the family already holds says.
  const ledgerTenure = await getAdmissionTenure(alreadyPaid ? admittedAt : now);

  // Access, unlike the ledger, has to be live. A student admitted in 2080 is
  // years into their admission, so their enrolment window is the tenure year
  // containing today — otherwise every imported student lands with an expired
  // window and is silently dropped from billing and class access.
  const accessWindow = alreadyPaid ? await currentAdmissionTenure(admittedAt, now) : null;

  const result = await prisma.$transaction(async (tx) => {
    const studentUser = await tx.user.create({
      data: {
        tenantId,
        email: studentFields.email,
        name: `${studentFields.firstName} ${studentFields.lastName}`,
        firstName: studentFields.firstName,
        lastName: studentFields.lastName,
        phone: studentFields.phone,
        passwordHash: studentPasswordHash,
        status: 'INACTIVE',
      },
    });
    await tx.account.create({
      data: { accountId: studentUser.id, providerId: 'credential', userId: studentUser.id, password: studentPasswordHash },
    });
    await tx.userRole.create({ data: { userId: studentUser.id, roleId: studentRoleId, branchId: branch.id } });
    const student = await tx.student.create({
      data: {
        userId: studentUser.id,
        gradeId: grade.id,
        admissionNumber,
        admissionDate: admittedAt,
        emergencyContact: details.emergencyContactPhone,
        admissionRecord: savedAdmissionRecord,
        admissionStatus: alreadyPaid || branch.admissionFee === 0 ? 'READY_FOR_LOGIN' : 'PENDING_PAYMENT',
      },
    });
    await tx.enrollment.createMany({
      data: regularClasses.map((item) => ({
        studentId: student.id,
        courseId: item.courseId,
        classId: item.id,
        status: 'BLOCKED' as const,
        admissionDate: admittedAt,
        // Left null for an unpaid admission: payment sets the window.
        validFrom: accessWindow?.start ?? null,
        validUntil: accessWindow ? new Date(accessWindow.end.getTime() + 86_400_000) : null,
      })),
    });

    const parentUser = await tx.user.create({
      data: {
        tenantId,
        email: parentFields.email,
        name: `${parentFields.firstName} ${parentFields.lastName}`,
        firstName: parentFields.firstName,
        lastName: parentFields.lastName,
        phone: parentFields.phone,
        passwordHash: parentPasswordHash,
        status: 'INACTIVE',
      },
    });
    await tx.account.create({
      data: { accountId: parentUser.id, providerId: 'credential', userId: parentUser.id, password: parentPasswordHash },
    });
    await tx.userRole.create({ data: { userId: parentUser.id, roleId: parentRoleId, branchId: branch.id } });
    const parent = await tx.parent.create({ data: { userId: parentUser.id } });
    await tx.studentParent.create({ data: { studentId: student.id, parentId: parent.id } });

    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const settled = alreadyPaid || branch.admissionFee === 0;
    const invoice = await tx.invoice.create({
      data: {
        tenantId,
        studentId: student.id,
        branchId: branch.id,
        invoiceType: 'ADMISSION',
        panNumberSnapshot: tenant.panNumber,
        vatRateSnapshot: tenant.vatRate,
        lineItemsSnapshot: [{ label: 'One-time admission fee', amount: Number(branch.admissionFee) }],
        amount: branch.admissionFee,
        netPayable: branch.admissionFee,
        billingCycleStart: ledgerTenure.start,
        billingCycleEnd: ledgerTenure.end,
        dueDate: alreadyPaid ? admittedAt : dueDate,
        status: settled ? 'PAID' : 'UNPAID',
        paymentDate: settled ? (alreadyPaid ? admittedAt : now) : null,
      },
    });
    return { student, studentUser, parent, parentUser, invoice, tenant };
  });

  return {
    ...result,
    admissionNumber,
    admissionRecord: savedAdmissionRecord,
    studentPassword,
    parentPassword,
    accessWindow,
    /** True when logins can be released immediately (no fee outstanding). */
    readyForLogin: alreadyPaid || branch.admissionFee === 0,
  };
}
