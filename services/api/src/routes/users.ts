import { trustedSecurityMobile } from '../utils/security-mobile';
import { calendarAccessWhere } from '../services/calendar-access';
import { Router, Response } from 'express';
import prisma from '../utils/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware } from '../middleware/auth';
import {
  BRANCH_ADMIN_CREATABLE_ROLES,
  TENANT_ADMIN_CREATABLE_ROLES,
  ensureTenantRole,
  isCanonicalRole,
  type CanonicalRoleName,
} from '../utils/roles';
import { UserPayload } from '@tms/types';
import { canReleaseAdmissionLogins } from '../utils/billing-rules';
import { activateAdmissionAndSendLogins } from '../utils/admission-logins';
import { studentBillingSummary } from '../utils/student-billing-summary';
import { invoiceLineItems } from '../utils/invoice-document';
import { normalizeSchedule } from '../utils/schedule';
import { parseStrictKeys, parseStrictObject, readFiniteNumber, readTrimmedString } from '../utils/request-validation';
import { salaryStructureFor, type SupportedContractType } from '../services/payroll-service';
import { bsToAdInstant, toBsDateString } from '../utils/nepali';
import {
  createAdmissionRecords,
  findConflictingAccount,
  generateTempPassword,
  loadAdmissionPlacement,
  normalizeEmail,
  validateAdmissionDetails,
  validateIdentityFields,
  type AdmissionDetails,
  type AdmissionSettlement,
} from '../services/admission-service';
import { privateImageUrl, storePrivateBytes } from '../services/object-storage';
import { normalizeStudentPhoto } from '../services/student-photo';
import { classAverageByAssessment, classAverageOnScale, type PublishedScoreLike } from '../utils/result-averages';
import { persistPortalNotifications } from '../services/portal-notifications';

const router = Router();

// --- Authorization helpers (explicit, not delegated to generic hasPermission) ---

function isTenantAdmin(user: UserPayload): boolean {
  // Tenant-wide Tenant Admin role (branchId === null).
  return user.roles.some((r) => r.roleName === 'Tenant Admin' && r.branchId === null);
}

// Branch ids this user administers as a Branch Admin.
function branchAdminScopes(user: UserPayload): string[] {
  return user.roles
    .filter((r) => r.roleName === 'Branch Admin' && r.branchId)
    .map((r) => r.branchId as string);
}

// Verify the target branch exists AND belongs to the caller's tenant.
// tenantId comes from the JWT claim (authMiddleware makes it authoritative),
// so this can never be widened by a spoofed header.
async function resolveBranchInTenant(tenantId: string, branchId: string) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.tenantId !== tenantId) {
    return null;
  }
  return branch;
}

interface CreateUserResult {
  userId: string;
  email: string;
  temporaryPassword: string;
}

const STAFF_ROLE_NAMES: CanonicalRoleName[] = ['Teacher', 'Accountant', 'Receptionist', 'Janitor'];

// Shared creation core: creates the User, assigns the role scoped to a branch
// (or tenant-wide for Branch Admin managers), and creates the matching domain
// record (StaffRecord / Student / Parent).
async function provisionUser(params: {
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  roleName: CanonicalRoleName;
  branchId: string | null;
  gradeId?: string | null;
  linkedStudentId?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
  admissionStatus?: 'PENDING_PAYMENT' | 'READY_FOR_LOGIN' | 'ACTIVE';
  compensation?: { contractType: SupportedContractType; amount: number };
}): Promise<CreateUserResult> {
  const temporaryPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  const roleId = await ensureTenantRole(params.tenantId, params.roleName);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        tenantId: params.tenantId,
        email: params.email,
        name: `${params.firstName} ${params.lastName}`.trim(),
        firstName: params.firstName,
        lastName: params.lastName,
        phone: params.phone || '',
        passwordHash,
        status: params.status ?? 'ACTIVE',
      },
    });

    await tx.account.create({
      data: {
        accountId: created.id,
        providerId: 'credential',
        userId: created.id,
        password: passwordHash,
      },
    });

    await tx.userRole.create({
      data: { userId: created.id, roleId, branchId: params.branchId },
    });

    if (STAFF_ROLE_NAMES.includes(params.roleName)) {
      if (!params.compensation) throw new Error('Compensation is required when creating staff.');
      await tx.staffRecord.create({
        data: {
          userId: created.id,
          joiningDate: new Date(),
          designation: params.roleName,
          contractType: params.compensation.contractType,
          salaryStructure: salaryStructureFor(params.compensation.contractType, params.compensation.amount),
        },
      });
    } else if (params.roleName === 'Student') {
      await tx.student.create({
        data: {
          userId: created.id,
          admissionDate: new Date(),
          emergencyContact: params.phone || '',
          gradeId: params.gradeId ?? null,
          admissionStatus: params.admissionStatus ?? 'ACTIVE',
        },
      });
    } else if (params.roleName === 'Parent') {
      const parent = await tx.parent.create({ data: { userId: created.id } });
      if (params.linkedStudentId) {
        await tx.studentParent.create({
          data: { studentId: params.linkedStudentId, parentId: parent.id },
        });
      }
    }

    return created;
  });

  return { userId: user.id, email: user.email, temporaryPassword };
}

// --- Caller capabilities: drives what the People UI can do ---
// Personal account endpoints derive identity exclusively from the session.
router.get('/me/account', authMiddleware, async (req: TenantRequest, res: Response) => {
  try {
  const account = await prisma.user.findFirst({ where: { id: req.user!.id, tenantId: req.tenantId! }, select: {
    userRoles: { select: { id: true, role: { select: { name: true } }, branchId: true, branch: { select: { name: true, tenantId: true } } } },
    id: true, firstName: true, lastName: true, email: true, emailVerified: true, phone: true, image: true,
    securityMobile: true, securityMobileVerifiedAt: true, twoFactorEnabled: true, tenant: { select: { name: true } },
  } });
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  const { securityMobile, securityMobileVerifiedAt, userRoles, image, ...profile } = account;
  const mobileVerified = Boolean(trustedSecurityMobile(account));
  const roles = userRoles.filter(assignment => !assignment.branch || assignment.branch.tenantId === req.tenantId)
    .map(assignment => ({ id: assignment.id, name: assignment.role.name, branchId: assignment.branchId, branchName: assignment.branch?.name ?? null }));
  const tenantAdmin = isTenantAdmin(req.user!);
  return res.json({ ...profile, photoUrl: await privateImageUrl(image), roles, mobileVerified, mobileVerifiedAt: mobileVerified ? securityMobileVerifiedAt : null,
    capabilities: { manageInstitution: tenantAdmin, manageSecurityMobile: true } });
  } catch { return res.status(500).json({ error: 'Unable to load or save your account. Please try again.' }); }
});

// Authenticated users may update only their own portrait. Student portraits
// remain attached to the official enrollment branch and use the same image
// validation/private storage pipeline as administrator-uploaded portraits.
router.put('/me/account/photo', authMiddleware, async (req: TenantRequest, res: Response) => {
  const shape = parseStrictKeys(req.body, ['image']);
  if (!shape.success) return res.status(400).json({ error: shape.error });
  try {
    const student = await prisma.student.findFirst({
      where: { userId: req.user!.id, user: { tenantId: req.tenantId! } },
      select: {
        id: true,
        userId: true,
        enrollments: {
          where: { status: { in: ['ACTIVE', 'BLOCKED'] } },
          select: { class: { select: { branchId: true } } },
          take: 1,
        },
      },
    });
    const branchId = student?.enrollments[0]?.class.branchId;
    if (!student || !branchId) return res.status(404).json({ error: 'Active student enrollment not found.' });
    const normalized = await normalizeStudentPhoto(shape.data.image);
    const mediaId = crypto.randomUUID();
    const reference = await storePrivateBytes(
      { bytes: normalized.bytes, contentType: normalized.contentType },
      { tenantId: req.tenantId!, branchId, category: 'student-photos', id: student.id },
    );
    const objectKey = reference.slice(3);
    await prisma.$transaction([
      prisma.mediaObject.updateMany({ where: { tenantId: req.tenantId!, category: 'STUDENT_PHOTO', ownerType: 'STUDENT', ownerId: student.id, status: 'ACTIVE' }, data: { status: 'REPLACED', replacedAt: new Date() } }),
      prisma.mediaObject.create({ data: { id: mediaId, tenantId: req.tenantId!, branchId, category: 'STUDENT_PHOTO', ownerType: 'STUDENT', ownerId: student.id, objectKey, mimeType: normalized.contentType, byteSize: normalized.bytes.length, sha256: crypto.createHash('sha256').update(normalized.bytes).digest('hex'), width: normalized.width, height: normalized.height, createdBy: req.user!.id } }),
      prisma.user.update({ where: { id: student.userId }, data: { image: reference } }),
    ]);
    return res.json({ message: 'Profile photo updated.', photoUrl: await privateImageUrl(reference) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profile photo storage is unavailable.';
    const invalidImage = /photo|image|buffer/i.test(message);
    return res.status(invalidImage ? 400 : 503).json({ error: message });
  }
});
router.patch('/me/account', authMiddleware, async (req: TenantRequest, res: Response) => {
  try {
  const shape = parseStrictKeys(req.body, ['firstName', 'lastName']);
  if (!shape.success) return res.status(400).json({ error: shape.error });
  const firstName = readTrimmedString(shape.data, 'firstName', { required: true, maxLength: 100, message: 'Enter a first name of 1-100 characters.' });
  const lastName = readTrimmedString(shape.data, 'lastName', { required: true, maxLength: 100, message: 'Enter a last name of 1-100 characters.' });
  if (!firstName.success) return res.status(400).json({ error: firstName.error });
  if (!lastName.success) return res.status(400).json({ error: lastName.error });
  const changed = await prisma.user.updateMany({ where: { id: req.user!.id, tenantId: req.tenantId! }, data: {
    firstName: firstName.data, lastName: lastName.data, name: `${firstName.data} ${lastName.data}`,
  } });
  if (!changed.count) return res.status(404).json({ error: 'Account not found.' });
  return res.json({ firstName: firstName.data, lastName: lastName.data, name: `${firstName.data} ${lastName.data}` });
  } catch { return res.status(500).json({ error: 'Unable to load or save your account. Please try again.' }); }
});

router.get('/me', authMiddleware, async (req: TenantRequest, res: Response) => {
  const user = req.user as UserPayload;
  const tenantAdmin = isTenantAdmin(user);
  const scopes = branchAdminScopes(user);

  try {
    const branches = await prisma.branch.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(tenantAdmin ? {} : { id: { in: scopes } }),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });

    return res.json({
      isTenantAdmin: tenantAdmin,
      isBranchAdmin: scopes.length > 0,
      canManagePeople: tenantAdmin || scopes.length > 0,
      creatableRoles: tenantAdmin ? TENANT_ADMIN_CREATABLE_ROLES : BRANCH_ADMIN_CREATABLE_ROLES,
      manageableBranches: branches,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to load capabilities.', details: error.message });
  }
});

// Admission creates inactive Student/Parent accounts and a branch-priced invoice.
// Logins are activated and delivered by SMS only after that invoice is paid.
router.post('/admissions', authMiddleware, async (req: TenantRequest, res: Response) => {
  const admissionShape = parseStrictKeys(req.body, ['branchId', 'gradeId', 'classId', 'classIds', 'student', 'parent', 'admissionDetails']);
  if (!admissionShape.success) return res.status(400).json({ error: admissionShape.error });
  const caller = req.user as UserPayload;
  const tenantAdmin = isTenantAdmin(caller);
  const scopes = branchAdminScopes(caller);
  const branchId = typeof admissionShape.data.branchId === 'string' ? admissionShape.data.branchId.trim() : '';
  const gradeId = typeof admissionShape.data.gradeId === 'string' ? admissionShape.data.gradeId.trim() : '';
  const legacyClassId = typeof admissionShape.data.classId === 'string' ? admissionShape.data.classId.trim() : '';
  const classIds = Array.from(new Set(Array.isArray(admissionShape.data.classIds) ? admissionShape.data.classIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map((value) => value.trim()) : legacyClassId ? [legacyClassId] : []));
  if (!tenantAdmin && !scopes.includes(branchId)) {
    return res.status(403).json({ error: 'Only the Tenant Admin or assigned Branch Admin may create admissions.' });
  }

  const studentFields = validateIdentityFields(admissionShape.data.student);
  const parentFields = validateIdentityFields(admissionShape.data.parent);
  const admissionDetails = validateAdmissionDetails(admissionShape.data.admissionDetails);
  if (!branchId || !gradeId || classIds.length > 20 || !studentFields || !parentFields || !admissionDetails.success) {
    return res.status(400).json({
      error: admissionDetails.success ? 'Branch, grade, and complete student and primary guardian identity details are required.' : admissionDetails.error,
    });
  }

  const placement = await loadAdmissionPlacement(req.tenantId!, { branchId, gradeId, classIds });
  if (!placement.success) return res.status(placement.status).json({ error: placement.error });
  const { branch, grade, regularClasses } = placement.data;
  const regularClass = regularClasses[0];

  if (studentFields.email === parentFields.email) {
    return res.status(400).json({ error: 'Student and parent must use different email addresses.' });
  }
  const conflict = await findConflictingAccount([studentFields.email, parentFields.email]);
  if (conflict) return res.status(409).json({ error: `An account already exists for ${conflict}.` });

  const admittedAt = new Date(admissionDetails.data.admittedAt);
  if (Number.isNaN(admittedAt.getTime())) {
    return res.status(400).json({ error: 'A valid admission date and time are required.' });
  }

  try {
    const result = await createAdmissionRecords({
      tenantId: req.tenantId!,
      placement: placement.data,
      student: studentFields,
      parent: parentFields,
      details: admissionDetails.data,
      admittedAt,
      admittedBy: { id: req.user!.id, name: `${req.user!.firstName} ${req.user!.lastName}`.trim() },
      settlement: 'DUE',
    });

    const delivery = result.readyForLogin
      ? await activateAdmissionAndSendLogins(req.tenantId!, result.student.id)
      : null;
    return res.status(201).json({
      message: !result.readyForLogin
        ? 'Admission saved. Login IDs will be sent by SMS after payment.'
        : delivery?.delivered
          ? 'Admission completed and login IDs were sent by SMS.'
          : 'Admission completed, but SMS delivery failed. Retry login delivery.',
      admission: {
        studentId: result.student.id,
        parentId: result.parent.id,
        branchId,
        gradeId,
        classId: regularClass?.id ?? null,
        classIds: regularClasses.map((item) => item.id),
        admissionNumber: result.admissionNumber,
        admittedAt: admittedAt.toISOString(),
        status: result.student.admissionStatus,
        invoiceId: result.invoice.id,
        admissionFee: result.invoice.netPayable,
        record: {
          institutionName: result.tenant.name,
          branchName: branch.name,
          branchAddress: branch.address,
          gradeName: grade.name,
          className: regularClasses.length ? regularClasses.map((item) => `${item.course.name} · ${item.name}`).join(', ') : 'Regular grade admission',
          student: { ...studentFields, ...admissionDetails.data },
          primaryGuardian: result.admissionRecord.primaryGuardian,
          admittedBy: result.admissionRecord.admittedBy,
        },
      },
      loginDelivery: delivery,
    });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Student or parent email already exists.' });
    return res.status(500).json({ error: 'Failed to create admission.' });
  }
});

router.post('/admissions/:studentId/issue-logins', authMiddleware, async (req: TenantRequest, res: Response) => {
  const caller = req.user as UserPayload;
  const student = await prisma.student.findFirst({
    where: { id: req.params.studentId, user: { tenantId: req.tenantId! } },
    include: {
      user: { include: { userRoles: true } },
      studentParents: { include: { parent: { include: { user: true } } } },
      invoices: { where: { invoiceType: 'ADMISSION' }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!student) return res.status(404).json({ error: 'Admission not found.' });
  const branchId = student.user.userRoles.find((role) => role.branchId)?.branchId;
  if (!branchId || (!isTenantAdmin(caller) && !branchAdminScopes(caller).includes(branchId))) {
    return res.status(403).json({ error: 'Only the Tenant Admin or assigned Branch Admin may issue these logins.' });
  }
  if (!canReleaseAdmissionLogins(student.admissionStatus, student.invoices[0]?.status)) {
    return res.status(409).json({ error: 'Admission payment must be recorded before logins can be issued.' });
  }
  try {
    const delivery = await activateAdmissionAndSendLogins(req.tenantId!, student.id);
    if (!delivery.delivered) {
      // This is an expected external-provider rejection, not an unexpected
      // server fault. A 4xx dependency status preserves the safe provider
      // reason; the API security boundary intentionally redacts all 5xx bodies.
      return res.status(424).json({
        error: `SMS delivery failed. ${delivery.failures.join(' ') || 'Check both phone numbers and retry.'}`,
        delivery,
      });
    }
    return res.json({ message: 'Admission activated and login IDs were sent by SMS.', delivery });
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : 'Unable to issue admission logins.' });
  }
});

// --- List users in the caller's tenant (branch admins see only their branch) ---
router.get('/', authMiddleware, async (req: TenantRequest, res: Response) => {
  const user = req.user as UserPayload;
  const tenantAdmin = isTenantAdmin(user);
  const scopes = branchAdminScopes(user);

  if (!tenantAdmin && scopes.length === 0) {
    return res.status(403).json({ error: 'You do not have permission to view the user directory.' });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        tenantId: req.tenantId!,
        // Branch admins only see users who hold a role in one of their branches.
        ...(tenantAdmin ? {} : { userRoles: { some: { branchId: { in: scopes } } } }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        userRoles: { include: { role: true, branch: true } },
        student: { select: { id: true, grade: { select: { id: true, name: true } }, studentParents: { select: { parent: { select: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } } } } } } },
      },
    });

    const userList = await Promise.all(
      users.map(async (u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        phone: u.phone,
        photoUrl: await privateImageUrl(u.image),
        status: u.status,
        gradeId: u.student?.grade?.id ?? null,
        gradeName: u.student?.grade?.name ?? null,
        studentId: u.student?.id ?? null,
        parents: u.student?.studentParents.map((link) => ({ id: link.parent.user.id, name: `${link.parent.user.firstName} ${link.parent.user.lastName}`.trim(), email: link.parent.user.email, phone: link.parent.user.phone })) ?? [],
        roles: u.userRoles.map((ur) => ({
          role: ur.role.name,
          branchId: ur.branchId,
          branchName: ur.branch?.name ?? null,
        })),
        createdAt: u.createdAt,
      }))
    );

    return res.json({
      users: userList,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to list users.', details: error.message });
  }
});

// --- Consolidated profile for any user in the tenant ---
// Returns a role-appropriate overview: students show enrolments + fee ledger,
// parents show their children + each child's dues, teachers show assigned classes.
async function studentFeeSummary(studentId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { studentId },
    include: { branch: { select: { name: true } } },
    orderBy: { dueDate: 'desc' },
  });
  const num = (v: any) => Number(v ?? 0);
  const totalBilled = invoices.reduce((s, i) => s + num(i.netPayable), 0);
  const totalPaid = invoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + num(i.netPayable), 0);
  const totalDue = invoices
    .filter((i) => i.status === 'UNPAID' || i.status === 'OVERDUE')
    .reduce((s, i) => s + num(i.netPayable), 0);
  const overdueCount = invoices.filter((i) => i.status === 'OVERDUE').length;
  return {
    totalBilled,
    totalPaid,
    totalDue,
    overdueCount,
    invoices: invoices.slice(0, 8).map((i) => ({
      id: i.id,
      netPayable: num(i.netPayable),
      status: i.status,
      dueDate: i.dueDate,
      paymentDate: i.paymentDate,
      invoiceType: i.invoiceType,
      amount: num(i.amount),
      discount: num(i.discount),
      fine: num(i.fine),
      panNumberSnapshot: i.panNumberSnapshot,
      vatRateSnapshot: num(i.vatRateSnapshot),
      lineItems: invoiceLineItems(i.lineItemsSnapshot, i.invoiceType, i.amount),
      transactionId: i.transactionId,
      createdAt: i.createdAt,
      billingCycleStart: i.billingCycleStart,
      billingCycleEnd: i.billingCycleEnd,
      branchName: i.branch.name,
    })),
  };
}

async function manageableStudentPhoto(req: TenantRequest, studentId: string) {
  const scopes = branchAdminScopes(req.user!);
  if (!isTenantAdmin(req.user!) && !scopes.length) return null;
  return prisma.student.findFirst({
    where: {
      id: studentId,
      user: { tenantId: req.tenantId! },
      enrollments: { some: { status: { in: ['ACTIVE', 'BLOCKED'] }, ...(isTenantAdmin(req.user!) ? {} : { class: { branchId: { in: scopes } } }) } },
    },
    select: {
      id: true,
      userId: true,
      user: { select: { image: true } },
      enrollments: {
        where: { status: { in: ['ACTIVE', 'BLOCKED'] }, ...(isTenantAdmin(req.user!) ? {} : { class: { branchId: { in: scopes } } }) },
        select: { class: { select: { branchId: true } } },
        take: 1,
      },
    },
  });
}

router.put('/students/:studentId/photo', authMiddleware, async (req: TenantRequest, res: Response) => {
  const shape = parseStrictKeys(req.body, ['image']);
  if (!shape.success) return res.status(400).json({ error: shape.error });
  const student = await manageableStudentPhoto(req, req.params.studentId);
  const branchId = student?.enrollments[0]?.class.branchId;
  if (!student || !branchId) return res.status(404).json({ error: 'Student not found in an assigned branch.' });
  try {
    const normalized = await normalizeStudentPhoto(shape.data.image);
    const bytes = normalized.bytes;
    const mediaId = crypto.randomUUID();
    const reference = await storePrivateBytes({ bytes, contentType: normalized.contentType }, { tenantId: req.tenantId!, branchId, category: 'student-photos', id: student.id });
    const objectKey = reference.slice(3);
    await prisma.$transaction([
      prisma.mediaObject.updateMany({ where: { tenantId: req.tenantId!, category: 'STUDENT_PHOTO', ownerType: 'STUDENT', ownerId: student.id, status: 'ACTIVE' }, data: { status: 'REPLACED', replacedAt: new Date() } }),
      prisma.mediaObject.create({ data: { id: mediaId, tenantId: req.tenantId!, branchId, category: 'STUDENT_PHOTO', ownerType: 'STUDENT', ownerId: student.id, objectKey, mimeType: normalized.contentType, byteSize: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), width: normalized.width, height: normalized.height, createdBy: req.user!.id } }),
      prisma.user.update({ where: { id: student.userId }, data: { image: reference } }),
    ]);
    return res.json({ message: 'Student photo updated.', photoUrl: await privateImageUrl(reference) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Student photo storage is unavailable.';
    const invalidImage = /photo|image|buffer/i.test(message);
    return res.status(invalidImage ? 400 : 503).json({ error: message });
  }
});

router.delete('/students/:studentId/photo', authMiddleware, async (req: TenantRequest, res: Response) => {
  const student = await manageableStudentPhoto(req, req.params.studentId);
  if (!student) return res.status(404).json({ error: 'Student not found in an assigned branch.' });
  await prisma.$transaction([
    prisma.mediaObject.updateMany({ where: { tenantId: req.tenantId!, category: 'STUDENT_PHOTO', ownerType: 'STUDENT', ownerId: student.id, status: 'ACTIVE' }, data: { status: 'DELETED', deletedAt: new Date() } }),
    prisma.user.update({ where: { id: student.userId }, data: { image: null } }),
  ]);
  return res.json({ message: 'Student photo removed.' });
});

// Authenticated student self-service aggregate. This deliberately resolves the
// student from the verified session user rather than accepting a student ID.
router.get('/me/student-portal', authMiddleware, async (req: TenantRequest, res: Response) => {
  try {
    const student = await prisma.student.findFirst({
      where: { userId: req.user!.id, user: { tenantId: req.tenantId! } },
      include: {
        user: {
          include: {
            tenant: { select: { name: true, leavePolicy: true } },
            userRoles: { include: { branch: true } },
          },
        },
        grade: true,
        enrollments: {
          where: { status: { in: ['ACTIVE', 'BLOCKED'] }, OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] },
          include: {
            course: true,
            class: {
              include: {
                assignedTeacher: { select: { firstName: true, lastName: true } },
                branch: { select: { id: true, name: true, address: true } },
                syllabi: { include: { chapters: { orderBy: { position: 'asc' }, include: { topics: { orderBy: { position: 'asc' }, include: { logs: { orderBy: { logDate: 'desc' }, take: 20 } } } } }, dailyLogs: { orderBy: { logDate: 'desc' }, take: 20 } } },
              },
            },
          },
        },
        studentAttendance: {
          include: { class: { include: { course: true } } },
          orderBy: { date: 'desc' },
        },
        invoices: { include: { branch: { select: { name: true } } }, orderBy: { dueDate: 'desc' } },
        certificates: { include: { template: true }, orderBy: { issuedDate: 'desc' } },
      },
    });
    if (!student) {
      return res.status(404).json({ error: 'No student record is linked to this account.' });
    }

    const classIds = student.enrollments.map((enrollment) => enrollment.classId);
    const homeworkRows = classIds.length
      ? await prisma.homework.findMany({
          where: { classId: { in: classIds } },
          include: {
            class: { include: { assignedTeacher: { select: { firstName: true, lastName: true } } } },
            submissions: true,
          },
          orderBy: { deadline: 'asc' },
        })
      : [];

    const branchIds = Array.from(new Set(student.enrollments.map((enrollment) => enrollment.class.branchId)));
    const [calendarRows, leaveRows, scoreRows] = await Promise.all([
      prisma.academicEvent.findMany({
        where: await calendarAccessWhere(req.user!, req.tenantId!, { viewerRole: 'Student' }),
        orderBy: { startDate: 'asc' },
      }),
      prisma.leave.findMany({
        where: { tenantId: req.tenantId!, userId: student.userId },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.studentScore.findMany({
        where: { tenantId: req.tenantId!, studentId: student.id, publishedAt: { not: null } },
        orderBy: { testDate: 'desc' },
      }),
    ]);

    const resultDefinitionIds = scoreRows.map((row) => row.resultDefinitionId).filter((id): id is string => Boolean(id));
    const legacyScoreGroups = scoreRows.filter((row) => !row.resultDefinitionId);
    const peerScoreRows = scoreRows.length ? await prisma.studentScore.findMany({
      where: {
        tenantId: req.tenantId!,
        publishedAt: { not: null },
        OR: [
          ...(resultDefinitionIds.length ? [{ resultDefinitionId: { in: resultDefinitionIds } }] : []),
          ...legacyScoreGroups.map((row) => ({ resultDefinitionId: null, subject: row.subject, assessment: row.assessment, testDate: row.testDate })),
        ],
      },
      select: { id: true, resultDefinitionId: true, subject: true, assessment: true, testDate: true, score: true, maximum: true },
    }) : [];
    const peerScores: PublishedScoreLike[] = peerScoreRows.map((row) => ({
      ...row,
      score: Number(row.score),
      maximum: Number(row.maximum),
    }));
    const classAverages = classAverageByAssessment(peerScores);

    const parseNumericGrade = (value: string | null | undefined) => {
      if (!value) return null;
      const match = value.match(/(-?\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?/);
      if (!match) return null;
      const score = Number(match[1]);
      const maximum = match[2] ? Number(match[2]) : 100;
      return Number.isFinite(score) && Number.isFinite(maximum) && maximum > 0 ? { score, maximum } : null;
    };
    const formatDate = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kathmandu' });
    const courseTypeLabel = (value: string) => value.split('_').map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join('-');
    const attendanceLabel = (value: string) => {
      if (value === 'EXCUSED') return 'Absent (Excused)';
      if (value === 'BLOCKED') return 'Absent';
      return value.charAt(0) + value.slice(1).toLowerCase();
    };
    const invoiceState = (status: string, dueDate: Date) => {
      if (status === 'PAID') return 'Paid';
      if (status === 'OVERDUE' || dueDate.getTime() < Date.now()) return 'Overdue';
      return dueDate.getTime() - Date.now() <= 3 * 86400000 ? 'Due soon' : 'Upcoming';
    };
    const eventKind = (value: string) => value === 'FEE_DUE' ? 'Fee due' : value === 'EVENT' ? 'Ceremony' : value.charAt(0) + value.slice(1).toLowerCase();

    const weekday = new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'Asia/Kathmandu' }).format(new Date());
    const normalizedWeekday = weekday.toLowerCase();
    const todaySessions = student.enrollments.flatMap((enrollment) => {
      const schedule = normalizeSchedule(enrollment.class.schedule);
      return schedule
        .filter((slot) => {
          const day = typeof slot.day === 'string' ? slot.day.toLowerCase() : '';
          return day === normalizedWeekday || day === normalizedWeekday.slice(0, 3);
        })
        .map((slot, index) => ({
          id: `${enrollment.classId}-${index}`,
          time: slot.startTime,
          endTime: slot.endTime,
          subject: enrollment.course.name,
          teacher: enrollment.class.assignedTeacher
            ? `${enrollment.class.assignedTeacher.firstName} ${enrollment.class.assignedTeacher.lastName}`
            : 'Teacher not assigned',
          room: slot.room || enrollment.class.name,
          type: courseTypeLabel(enrollment.course.type),
        }));
    }).sort((a, b) => a.time.localeCompare(b.time));
    const weeklySessions = student.enrollments.flatMap((enrollment) => {
      const schedule = normalizeSchedule(enrollment.class.schedule);
      return schedule.map((slot, index) => ({
        id: `${enrollment.classId}-${index}`, day: String(slot.day || ''),
        time: slot.startTime,
        endTime: slot.endTime,
        subject: enrollment.course.name,
        teacher: enrollment.class.assignedTeacher ? `${enrollment.class.assignedTeacher.firstName} ${enrollment.class.assignedTeacher.lastName}` : 'Teacher not assigned',
        room: slot.room || enrollment.class.name,
        className: enrollment.class.name, type: courseTypeLabel(enrollment.course.type),
      }));
    });

    const homework = homeworkRows.map((row) => {
      const ownSubmission = row.submissions.find((submission) => submission.studentId === student.id);
      const overdue = !ownSubmission && row.deadline.getTime() < Date.now();
      const soon = !ownSubmission && row.deadline.getTime() - Date.now() <= 2 * 86400000;
      return {
        id: row.id,
        subject: row.subject,
        title: row.title,
        teacher: row.class.assignedTeacher
          ? `${row.class.assignedTeacher.firstName} ${row.class.assignedTeacher.lastName}`
          : 'Teacher',
        dueLabel: ownSubmission ? `Completed ${formatDate(ownSubmission.createdAt)}` : formatDate(row.deadline),
        urgency: overdue ? 'overdue' : soon ? 'soon' : 'normal',
        completed: Boolean(ownSubmission),
        description: row.description ?? undefined,
        contentUrl: row.contentUrl ?? undefined,
        submissionUrl: ownSubmission?.submissionUrl ?? undefined,
        teacherRemarks: ownSubmission?.remarks ?? undefined,
      };
    });

    const homeworkResults = homeworkRows.flatMap((row) => {
      const ownSubmission = row.submissions.find((submission) => submission.studentId === student.id);
      const ownGrade = parseNumericGrade(ownSubmission?.grade);
      if (!ownSubmission || !ownGrade) return [];
      const percentages = row.submissions
        .map((submission) => parseNumericGrade(submission.grade))
        .filter((grade): grade is { score: number; maximum: number } => Boolean(grade))
        .map((grade) => (grade.score / grade.maximum) * 100);
      const classPercentage = percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : (ownGrade.score / ownGrade.maximum) * 100;
      return [{
        id: ownSubmission.id,
        subject: row.subject,
        assessment: row.title,
        score: ownGrade.score,
        maximum: ownGrade.maximum,
        classAverage: Math.round((classPercentage / 100) * ownGrade.maximum * 10) / 10,
        publishedLabel: `Graded ${formatDate(ownSubmission.updatedAt)}`,
        testDate: ownSubmission.updatedAt.toISOString(),
        academicYear: ownSubmission.updatedAt.getFullYear(),
        teacherRemarks: ownSubmission.remarks ?? undefined,
      }];
    });

    const results = [
      ...scoreRows.map((row) => {
        const normalized: PublishedScoreLike = { ...row, score: Number(row.score), maximum: Number(row.maximum) };
        return {
        id: row.id, subject: row.subject, assessment: row.assessment, score: normalized.score, maximum: normalized.maximum,
        passMarks: row.passMarks == null ? undefined : Number(row.passMarks), percentile: row.percentile == null ? undefined : Number(row.percentile),
        resultSheetUrl: row.resultSheetUrl ?? undefined, classAverage: classAverageOnScale(normalized, classAverages), publishedLabel: `Shared ${formatDate(row.publishedAt!)}`,
        testDate: row.testDate.toISOString(), academicYear: row.testDate.getFullYear(),
      }}),
      ...homeworkResults,
    ];
    const syllabi = student.enrollments.flatMap((enrollment) => enrollment.class.syllabi.map((syllabus) => ({
      id: syllabus.id, className: enrollment.class.name, subject: syllabus.subject,
      teacherName: enrollment.class.assignedTeacher ? `${enrollment.class.assignedTeacher.firstName} ${enrollment.class.assignedTeacher.lastName}`.trim() : undefined,
      chapters: syllabus.chapters.map((chapter) => ({ id: chapter.id, title: chapter.title, position: chapter.position, status: chapter.status, topics: chapter.topics.map((topic) => ({ id: topic.id, title: topic.title, position: topic.position, status: topic.status, logs: topic.logs.map((log) => ({ id: log.id, status: log.status, notes: log.notes, logDate: formatDate(log.logDate) })) })) })),
      dailyLogs: syllabus.dailyLogs.map((log) => ({ id: log.id, chapterId: log.chapterId, status: log.status, notes: log.notes, logDate: formatDate(log.logDate) })),
    })));

    const insightMap = new Map<string, number[]>();
    results.slice().reverse().forEach((result) => {
      const values = insightMap.get(result.subject) ?? [];
      values.push(Math.round((result.score / result.maximum) * 100));
      insightMap.set(result.subject, values);
    });
    const insights = Array.from(insightMap.entries()).map(([subject, history]) => ({
      subject,
      average: Math.round(history.reduce((sum, value) => sum + value, 0) / history.length),
      previousAverage: history.length > 1
        ? Math.round(history.slice(0, -1).reduce((sum, value) => sum + value, 0) / (history.length - 1))
        : history[0],
      history,
    }));

    const attendance = student.studentAttendance.map((record) => {
      const approvedLeave = leaveRows.find((leave) =>
        ['APPROVED_LEVEL1', 'APPROVED_LEVEL2'].includes(leave.status)
        && leave.startDate <= record.date
        && leave.endDate >= record.date
      );
      return {
        id: record.id,
        date: formatDate(record.date),
        subject: record.class.course.name,
        session: record.class.name,
        state: attendanceLabel(record.status),
        leaveReason: approvedLeave?.reason,
      };
    });
    const attendanceCounts = student.studentAttendance.reduce<Record<string, number>>((counts, record) => {
      counts[record.status] = (counts[record.status] ?? 0) + 1;
      return counts;
    }, {});
    const markedAttendance = student.studentAttendance.length;
    const attendanceRate = markedAttendance ? Math.round(((attendanceCounts.PRESENT ?? 0) / markedAttendance) * 100) : null;

    const invoices = student.invoices.map((invoice) => ({
      id: invoice.id,
      invoiceType: invoice.invoiceType,
      paymentDate: invoice.paymentDate ? formatDate(invoice.paymentDate) : null,
      cycle: invoice.billingCycleStart.toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'Asia/Kathmandu' }),
      dueDate: formatDate(invoice.dueDate),
      state: invoiceState(invoice.status, invoice.dueDate),
      qrAvailable: invoice.status !== 'PAID',
      paymentReference: invoice.transactionId ?? invoice.id,
      netPayable: Number(invoice.netPayable),
      document: {
        id: invoice.id,
        invoiceType: invoice.invoiceType,
        status: invoice.status,
        institutionName: student.user.tenant.name,
        panNumber: invoice.panNumberSnapshot,
        vatRate: Number(invoice.vatRateSnapshot),
        studentName: `${student.user.firstName} ${student.user.lastName}`,
        admissionNumber: student.admissionNumber,
        gradeName: student.grade?.name ?? null,
        branchName: invoice.branch.name,
        issuedAt: invoice.createdAt,
        dueDate: invoice.dueDate,
        paymentDate: invoice.paymentDate,
        billingCycleStart: invoice.billingCycleStart,
        billingCycleEnd: invoice.billingCycleEnd,
        transactionId: invoice.transactionId,
        lines: invoiceLineItems(invoice.lineItemsSnapshot, invoice.invoiceType, invoice.amount),
        discount: Number(invoice.discount),
        fine: Number(invoice.fine),
        netPayable: Number(invoice.netPayable),
      },
      lines: [
        ...invoiceLineItems(invoice.lineItemsSnapshot, invoice.invoiceType, invoice.amount),
        ...(Number(invoice.discount) ? [{ label: 'Discount', amount: -Number(invoice.discount) }] : []),
        ...(Number(invoice.fine) ? [{ label: 'Fine', amount: Number(invoice.fine) }] : []),
      ],
    }));
    const outstanding = student.invoices
      .filter((invoice) => invoice.status === 'UNPAID' || invoice.status === 'OVERDUE')
      .reduce((sum, invoice) => sum + Number(invoice.netPayable), 0);

    const events = calendarRows.map((event) => ({
      id: event.id,
      date: formatDate(event.startDate),
      day: event.startDate.toLocaleDateString('en', { day: '2-digit', timeZone: 'Asia/Kathmandu' }),
      month: event.startDate.toLocaleDateString('en', { month: 'short', timeZone: 'Asia/Kathmandu' }).toUpperCase(),
      title: event.title,
      kind: eventKind(event.eventType),
      details: event.description ?? '',
    }));
    const certificates = student.certificates.map((certificate) => {
      const snapshot = certificate.snapshot as { templateName?: string; gradeName?: string } | null;
      return {
        id: certificate.certificateId,
        title: snapshot?.templateName || certificate.template.name,
        course: snapshot?.gradeName || student.grade?.name || 'Student record',
        issuedDate: formatDate(certificate.issuedDate),
        fileName: certificate.pdfUrl?.split('/').pop() || `${certificate.certificateId}.pdf`,
        pdfUrl: `/certificates/${encodeURIComponent(certificate.certificateId)}/download`,
        htmlUrl: (certificate.template.layoutConfig as { renderMode?: string }).renderMode === 'HTML' ? `/certificates/${encodeURIComponent(certificate.certificateId)}/html` : undefined,
      };
    });

    const generatedNotifications = [
      ...student.invoices
        .filter((invoice) => invoice.status === 'OVERDUE' || (invoice.status === 'UNPAID' && invoice.dueDate.getTime() - Date.now() <= 3 * 86400000))
        .map((invoice) => ({
          id: `invoice-${invoice.id}`,
          title: invoice.status === 'OVERDUE' ? 'Fee overdue' : 'Fee due soon',
          message: `${moneyForNotification(Number(invoice.netPayable))} is due on ${formatDate(invoice.dueDate)}.`,
          time: formatDate(invoice.updatedAt),
          occurredAt: invoice.updatedAt.toISOString(),
          icon: 'payments',
          destination: '/student/fees',
          unread: true,
        })),
      ...homeworkRows
        .filter((row) => !row.submissions.some((submission) => submission.studentId === student.id))
        .map((row) => ({
          id: `homework-${row.id}`,
          title: 'Homework assigned',
          message: `${row.subject} homework is due ${formatDate(row.deadline)}.`,
          time: formatDate(row.createdAt),
          occurredAt: row.createdAt.toISOString(),
          icon: 'assignment',
          destination: '/student/homework',
          unread: row.createdAt.getTime() >= Date.now() - 7 * 86400000,
        })),
      ...homeworkRows.flatMap((row) => {
        const submission = row.submissions.find((item) => item.studentId === student.id);
        return submission?.grade ? [{
          id: `result-${submission.id}`,
          title: 'New result published',
          message: `${row.subject}: ${row.title} has been graded.`,
          time: formatDate(submission.updatedAt),
          occurredAt: submission.updatedAt.toISOString(),
          icon: 'trending_up',
          destination: '/student/results',
          unread: submission.updatedAt.getTime() >= Date.now() - 7 * 86400000,
        }] : [];
      }),
      ...student.studentAttendance.map((record) => ({
        id: `attendance-${record.id}`,
        title: 'Attendance marked',
        message: `${record.class.course.name}: ${attendanceLabel(record.status)} on ${formatDate(record.date)}.`,
        time: formatDate(record.updatedAt),
        occurredAt: record.updatedAt.toISOString(),
        icon: 'fact_check',
        destination: '/student/attendance',
        unread: record.updatedAt.getTime() >= Date.now() - 7 * 86400000,
      })),
      ...leaveRows
        .filter((leave) => leave.status === 'APPROVED_LEVEL2' || leave.status === 'REJECTED')
        .map((leave) => ({
          id: `leave-${leave.id}`,
          title: leave.status === 'APPROVED_LEVEL2' ? 'Leave approved' : 'Leave rejected',
          message: `${formatDate(leave.startDate)}${leave.startDate.getTime() === leave.endDate.getTime() ? '' : ` to ${formatDate(leave.endDate)}`}: ${leave.remarks || leave.reason}.`,
          time: formatDate(leave.updatedAt),
          occurredAt: leave.updatedAt.toISOString(),
          icon: leave.status === 'APPROVED_LEVEL2' ? 'event_available' : 'event_busy',
          destination: '/student/attendance',
          unread: leave.updatedAt.getTime() >= Date.now() - 7 * 86400000,
        })),
      ...student.certificates.map((certificate) => ({
        id: `certificate-${certificate.id}`,
        title: 'Certificate issued',
        message: `${certificate.template.name} is ready to download.`,
        time: formatDate(certificate.issuedDate),
        occurredAt: certificate.issuedDate.toISOString(),
        icon: 'workspace_premium',
        destination: '/student/certificates',
        unread: certificate.issuedDate.getTime() >= Date.now() - 7 * 86400000,
      })),
    ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const notifications = await persistPortalNotifications(req.tenantId!, req.user!.id, generatedNotifications);

    const assignedBranch = student.user.userRoles.find((role) => role.branch)?.branch ?? student.enrollments[0]?.class.branch;
    return res.json({
      generatedAt: new Date().toISOString(),
      studentProfile: {
        name: `${student.user.firstName} ${student.user.lastName}`,
        initials: `${student.user.firstName.charAt(0)}${student.user.lastName.charAt(0)}`.toUpperCase(),
        photoUrl: await privateImageUrl(student.user.image),
        institution: student.user.tenant.name,
        grade: student.grade?.name ?? 'Grade not assigned',
        branch: assignedBranch?.name ?? 'Branch not assigned',
        branchId: assignedBranch?.id ?? '',
        branchAddress: assignedBranch?.address,
        rollNumber: student.admissionNumber ?? student.id.slice(0, 6).toUpperCase(),
        enrollmentId: student.id,
        academicYear: `${new Date().getFullYear()}/${String(new Date().getFullYear() + 1).slice(-2)}`,
        validUntil: 'While actively enrolled',
        blocked: student.enrollments.some((enrollment) => enrollment.status === 'BLOCKED') || student.invoices.some((invoice) => invoice.status === 'OVERDUE'),
        outstanding,
        attendanceRate,
        attendanceCounts: {
          present: attendanceCounts.PRESENT ?? 0,
          absent: attendanceCounts.ABSENT ?? 0,
          excused: attendanceCounts.EXCUSED ?? 0,
        },
      },
      todaySessions,
      weeklySessions,
      homework,
      results,
      insights,
      syllabi,
      attendance,
      invoices,
      events,
      certificates,
      leaves: leaveRows.map((leave) => ({
        id: leave.id,
        dates: `${formatDate(leave.startDate)}${leave.startDate.getTime() === leave.endDate.getTime() ? '' : ` – ${formatDate(leave.endDate)}`}`,
        reason: leave.reason.includes(':') ? leave.reason.split(':')[0].trim() : leave.reason,
        state: leave.status === 'APPROVED_LEVEL2' ? 'Approved' : leave.status === 'REJECTED' ? 'Rejected' : 'Pending',
        detail: leave.remarks || leave.reason,
      })),
      notifications,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to load the student portal.', details: error.message });
  }
});

function moneyForNotification(value: number): string {
  return `NPR ${value.toLocaleString('en-NP')}`;
}

router.get('/:id/profile', authMiddleware, async (req: TenantRequest, res: Response) => {
  const caller = req.user as UserPayload;
  const tenantAdmin = isTenantAdmin(caller);
  const scopes = branchAdminScopes(caller);
  if (!tenantAdmin && scopes.length === 0) {
    return res.status(403).json({ error: 'You do not have permission to view profiles.' });
  }

  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: {
        userRoles: { include: { role: true, branch: true } },
        tenant: { select: { name: true } },
        student: {
          include: {
            grade: { select: { name: true, monthlyFee: true, billingMode: true } },
            studentParents: {
              include: {
                parent: {
                  include: {
                    user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true } },
                  },
                },
              },
            },
          },
        },
        parent: true,
        staffRecord: true,
      },
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found in your institution.' });
    }

    // Branch admins may only view users who hold a role in one of their branches.
    if (!tenantAdmin) {
      const inScope = user.userRoles.some((ur) => ur.branchId && scopes.includes(ur.branchId));
      if (!inScope) {
        return res.status(403).json({ error: 'This user is outside the branches you manage.' });
      }
    }

    const roleNames = user.userRoles.map((ur) => ur.role.name);
    const base = {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phone: user.phone,
      status: user.status,
      createdAt: user.createdAt,
      institutionName: user.tenant.name,
      photoUrl: await privateImageUrl(user.image),
      roles: user.userRoles.map((ur) => ({ role: ur.role.name, branchName: ur.branch?.name ?? null })),
    };

    const detail: Record<string, unknown> = {};

    // Student overview: enrolments + fee ledger + attendance.
    if (user.student) {
      const enrollments = await prisma.enrollment.findMany({
        where: { studentId: user.student.id },
        include: {
          course: { select: { id: true, name: true, feeStructure: true, isTaxExempt: true, isExtraActivity: true, taxPercentage: true } },
          class: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      const billing = studentBillingSummary(user.student.grade, enrollments);
      const fees = await studentFeeSummary(user.student.id);
      const academicEnrollments = enrollments.filter((enrollment) => !enrollment.course.isExtraActivity);
      const validFrom = academicEnrollments.map((enrollment) => enrollment.validFrom).find(Boolean) ?? null;
      const validUntil = academicEnrollments.map((enrollment) => enrollment.validUntil).find(Boolean) ?? null;
      const enrollmentAccess = {
        status: !validFrom || !validUntil ? 'PENDING' : validUntil.getTime() <= Date.now() ? 'EXPIRED' : 'ACTIVE',
        validFrom,
        validUntil,
      };
      const gradeTuition = user.student.grade?.billingMode === 'GRADE' ? Number(user.student.grade.monthlyFee ?? 0) : 0;
      const attendance = await prisma.studentAttendance.groupBy({
        by: ['status'],
        where: { studentId: user.student.id },
        _count: { _all: true },
      });
      detail.student = {
        admissionNumber: user.student.admissionNumber,
        admissionDate: user.student.admissionDate,
        admissionRecord: user.student.admissionRecord,
        emergencyContact: user.student.emergencyContact,
        studentId: user.student.id,
        grade: user.student.grade?.name ?? null,
        gradeTuition,
        monthlyFee: billing.recurringTotal,
        billing,
        enrollmentAccess,
        guardians: user.student.studentParents.map((link) => ({
          userId: link.parent.user.id,
          name: `${link.parent.user.firstName} ${link.parent.user.lastName}`,
          email: link.parent.user.email,
          phone: link.parent.user.phone,
          status: link.parent.user.status,
        })),
        enrollments: enrollments.map((e) => ({
          id: e.id,
          courseName: e.course.name,
          className: e.class.name,
          status: e.status,
          accessStatus: e.validUntil && e.validUntil.getTime() <= Date.now() ? 'EXPIRED' : e.status,
          validFrom: e.validFrom,
          validUntil: e.validUntil,
          category: e.course.isExtraActivity ? 'ACTIVITY' : 'ACADEMIC',
          fee: billing.lines.find((line) => line.enrollmentId === e.id)?.amount ?? 0,
        })),
        fees,
        attendance: attendance.reduce<Record<string, number>>((acc, a) => {
          acc[a.status] = a._count._all;
          return acc;
        }, {}),
      };
    }

    // Parent overview: children + each child's fee summary.
    if (user.parent) {
      const links = await prisma.studentParent.findMany({
        where: { parentId: user.parent.id },
        include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } },
      });
      const children = await Promise.all(
        links.map(async (l) => {
          const fees = await studentFeeSummary(l.studentId);
          const enrollCount = await prisma.enrollment.count({ where: { studentId: l.studentId, status: 'ACTIVE' } });
          return {
            studentId: l.studentId,
            studentUserId: l.student.userId,
            name: `${l.student.user.firstName} ${l.student.user.lastName}`,
            activeEnrollments: enrollCount,
            totalPaid: fees.totalPaid,
            totalDue: fees.totalDue,
            overdueCount: fees.overdueCount,
          };
        })
      );
      detail.parent = { children };
    }

    // Teacher overview: assigned classes + grades taught + session stats.
    if (roleNames.includes('Teacher')) {
      const assigned = await prisma.class.findMany({
        where: { teacherId: user.id },
        include: {
          course: { select: { name: true, grade: { select: { name: true, sortOrder: true } } } },
          branch: { select: { name: true } },
          _count: { select: { enrollments: true } },
        },
      });
      const sessionCount = await prisma.teacherSession.count({ where: { teacherId: user.id } });
      const pendingUpdates = await prisma.teacherSession.count({ where: { teacherId: user.id, dailyUpdateSubmitted: false } });

      // Distinct grades taught, ordered by the grade ladder.
      const gradeMap = new Map<string, number>();
      for (const c of assigned) {
        if (c.course.grade) gradeMap.set(c.course.grade.name, c.course.grade.sortOrder);
      }
      const gradesTaught = Array.from(gradeMap.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([name]) => name);

      detail.teacher = {
        assignedClasses: assigned.map((c) => ({
          className: c.name,
          courseName: c.course.name,
          branchName: c.branch.name,
          gradeName: c.course.grade?.name ?? null,
          enrollmentCount: c._count.enrollments,
        })),
        gradesTaught,
        totalSessions: sessionCount,
        pendingUpdates,
      };
    }

    // Staff overview (accountant/receptionist/janitor/teacher share StaffRecord).
    if (user.staffRecord) {
      detail.staff = {
        designation: user.staffRecord.designation,
        contractType: user.staffRecord.contractType,
        joiningDate: user.staffRecord.joiningDate,
        salaryStructure: user.staffRecord.salaryStructure,
      };
    }

    return res.json({ ...base, detail });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to load profile.', details: error.message });
  }
});

// --- Student analytics (admin / branch-admin / assigned teacher / parent / self) ---
router.get('/:id/analytics', authMiddleware, async (req: TenantRequest, res: Response) => {
  const caller = req.user as UserPayload;
  try {
    const target = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: { student: { include: { grade: { select: { name: true } } } } },
    });
    if (!target || !target.student) {
      return res.status(404).json({ error: 'Student not found in your institution.' });
    }
    const studentId = target.student.id;

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId },
      include: {
        course: { select: { name: true } },
        class: { select: { id: true, name: true, teacherId: true, assignedTeacher: { select: { firstName: true, lastName: true } } } },
      },
    });
    const classIds = Array.from(new Set(enrollments.map((e) => e.classId)));

    // Access: admin (scoped), self, assigned teacher, or a linked parent.
    let allowed = isTenantAdmin(caller) || caller.id === target.id;
    const scopes = branchAdminScopes(caller);
    if (!allowed && scopes.length > 0) {
      allowed = Boolean(await prisma.userRole.findFirst({ where: { userId: target.id, branchId: { in: scopes } } }));
    }
    if (!allowed && classIds.length > 0) {
      allowed = Boolean(await prisma.class.findFirst({ where: { id: { in: classIds }, teacherId: caller.id } }));
    }
    if (!allowed) {
      const parent = await prisma.parent.findUnique({ where: { userId: caller.id } });
      if (parent) {
        allowed = Boolean(await prisma.studentParent.findFirst({ where: { studentId, parentId: parent.id } }));
      }
    }
    if (!allowed) {
      return res.status(403).json({ error: 'You do not have access to this student\'s analytics.' });
    }

    // Attendance — full records power the totals, the monthly trend, and per-course rates.
    const attRecords = await prisma.studentAttendance.findMany({
      where: { studentId },
      select: { classId: true, status: true, date: true },
      orderBy: { date: 'asc' },
    });
    const countStatus = (s: string) => attRecords.filter((r) => r.status === s).length;
    const present = countStatus('PRESENT'), absent = countStatus('ABSENT'), excused = countStatus('EXCUSED'), blocked = countStatus('BLOCKED');
    const totalMarked = attRecords.length;

    const today = new Date();
    const attendanceTrend = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1);
      const inMonth = attRecords.filter((r) => r.date.getFullYear() === d.getFullYear() && r.date.getMonth() === d.getMonth());
      const p = inMonth.filter((r) => r.status === 'PRESENT').length;
      return {
        month: d.toLocaleString('en', { month: 'short' }),
        present: p,
        total: inMonth.length,
        rate: inMonth.length ? Math.round((p / inMonth.length) * 100) : null,
      };
    });

    // Fees
    const fees = await studentFeeSummary(studentId);
    const billed = fees.totalPaid + fees.totalDue;

    // Homework — every assignment in the student's classes matched to their submissions,
    // so the profile can track each homework individually (status, lateness, grade).
    const homeworks = classIds.length
      ? await prisma.homework.findMany({
          where: { classId: { in: classIds } },
          orderBy: { deadline: 'desc' },
          select: { id: true, classId: true, subject: true, title: true, deadline: true },
        })
      : [];
    const subs = await prisma.homeworkSubmission.findMany({
      where: { studentId },
      select: { homeworkId: true, grade: true, remarks: true, createdAt: true, updatedAt: true },
    });
    const subByHw = new Map(subs.map((s) => [s.homeworkId, s]));
    const courseByClass = new Map(enrollments.map((e) => [e.classId, e.course.name]));

    const nowMs = Date.now();
    const homeworkTimeline = homeworks.slice(0, 30).map((hw) => {
      const sub = subByHw.get(hw.id);
      const status = sub
        ? (sub.grade != null ? 'GRADED' : 'SUBMITTED')
        : (hw.deadline.getTime() < nowMs ? 'OVERDUE' : 'PENDING');
      return {
        id: hw.id,
        title: hw.title,
        subject: hw.subject,
        course: courseByClass.get(hw.classId) ?? null,
        deadline: hw.deadline,
        status,
        late: sub ? sub.createdAt.getTime() > hw.deadline.getTime() : false,
        grade: sub?.grade ?? null,
        submittedAt: sub?.createdAt ?? null,
      };
    });

    const assigned = homeworks.length;
    const submittedHw = homeworks.filter((hw) => subByHw.has(hw.id));
    const submitted = submittedHw.length;
    const graded = submittedHw.filter((hw) => subByHw.get(hw.id)!.grade != null).length;
    const onTime = submittedHw.filter((hw) => subByHw.get(hw.id)!.createdAt.getTime() <= hw.deadline.getTime()).length;
    const overdueHw = homeworks.filter((hw) => !subByHw.has(hw.id) && hw.deadline.getTime() < nowMs).length;

    // Per-course mapping — one entry per enrolment with the class, teacher, and the
    // student's attendance/homework performance inside that course.
    const perCourse = enrollments.map((e) => {
      const classAtt = attRecords.filter((r) => r.classId === e.classId);
      const classPresent = classAtt.filter((r) => r.status === 'PRESENT').length;
      const classHw = homeworks.filter((h) => h.classId === e.classId);
      return {
        course: e.course.name,
        className: e.class.name,
        teacher: e.class.assignedTeacher ? `${e.class.assignedTeacher.firstName} ${e.class.assignedTeacher.lastName}` : null,
        status: e.status,
        attendanceRate: classAtt.length ? Math.round((classPresent / classAtt.length) * 100) : null,
        homeworkAssigned: classHw.length,
        homeworkSubmitted: classHw.filter((h) => subByHw.has(h.id)).length,
      };
    });

    // Recent activity — submissions, grades received, attendance marks, and fee
    // payments merged into one newest-first feed.
    const hwTitle = new Map(homeworks.map((h) => [h.id, h.title]));
    const activity: Array<{ type: string; date: Date; label: string; detail?: string }> = [];
    subs.forEach((s) => {
      const title = hwTitle.get(s.homeworkId);
      if (!title) return;
      activity.push({ type: 'submission', date: s.createdAt, label: `Submitted "${title}"` });
      if (s.grade != null) {
        activity.push({ type: 'grade', date: s.updatedAt, label: `Received ${s.grade} for "${title}"`, detail: s.remarks ?? undefined });
      }
    });
    attRecords.slice(-20).forEach((r) => {
      const course = courseByClass.get(r.classId);
      const word = r.status.charAt(0) + r.status.slice(1).toLowerCase();
      activity.push({ type: 'attendance', date: r.date, label: `${word} in ${course ?? 'class'}` });
    });
    fees.invoices.forEach((i) => {
      if (i.paymentDate) activity.push({ type: 'payment', date: i.paymentDate, label: `Paid invoice — NPR ${i.netPayable.toLocaleString()}` });
    });
    activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Graph connections
    const teachers = Array.from(new Set(
      enrollments.map((e) => e.class.assignedTeacher ? `${e.class.assignedTeacher.firstName} ${e.class.assignedTeacher.lastName}` : null).filter(Boolean) as string[]
    ));
    const parentLinks = await prisma.studentParent.findMany({
      where: { studentId },
      include: { parent: { include: { user: { select: { firstName: true, lastName: true } } } } },
    });

    return res.json({
      name: `${target.firstName} ${target.lastName}`,
      grade: target.student.grade?.name ?? null,
      attendance: {
        present, absent, excused, blocked, totalMarked,
        rate: totalMarked ? Math.round((present / totalMarked) * 100) : null,
        trend: attendanceTrend,
      },
      homework: {
        assigned, submitted, graded,
        pending: Math.max(0, assigned - submitted),
        overdue: overdueHw,
        completionRate: assigned ? Math.round((submitted / assigned) * 100) : null,
        onTimeRate: submitted ? Math.round((onTime / submitted) * 100) : null,
        timeline: homeworkTimeline,
      },
      fees: {
        paid: fees.totalPaid, due: fees.totalDue, overdue: fees.overdueCount,
        collectionRate: billed ? Math.round((fees.totalPaid / billed) * 100) : null,
      },
      activeCourses: enrollments.filter((e) => e.status === 'ACTIVE').map((e) => e.course.name),
      perCourse,
      activity: activity.slice(0, 15),
      connections: {
        courses: Array.from(new Set(enrollments.map((e) => e.course.name))),
        teachers,
        parents: parentLinks.map((pl) => `${pl.parent.user.firstName} ${pl.parent.user.lastName}`),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to load analytics.', details: error.message });
  }
});

// --- Tenant Admin creates a Branch Admin (manager) for a branch ---
router.post('/branch-admin', authMiddleware, async (req: TenantRequest, res: Response) => {
  const user = req.user as UserPayload;

  if (!isTenantAdmin(user)) {
    return res.status(403).json({ error: 'Only a Tenant Admin can create branch managers.' });
  }

  const requestShape = parseStrictKeys(req.body, ['firstName', 'lastName', 'email', 'phone', 'branchId']);
  if (!requestShape.success) return res.status(400).json({ error: requestShape.error });
  const fields = validateIdentityFields({
    firstName: requestShape.data.firstName,
    lastName: requestShape.data.lastName,
    email: requestShape.data.email,
    phone: requestShape.data.phone,
  });
  if (!fields) {
    return res.status(400).json({ error: 'firstName, lastName, and email are required.' });
  }

  const branchId = typeof requestShape.data.branchId === 'string' ? requestShape.data.branchId.trim() : '';
  if (!branchId) {
    return res.status(400).json({ error: 'branchId is required for a branch manager.' });
  }

  const branch = await resolveBranchInTenant(req.tenantId!, branchId);
  if (!branch) {
    return res.status(404).json({ error: 'Branch not found in your institution.' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email: fields.email } });
    if (existing) {
      return res.status(409).json({ error: 'A user with this email already exists.' });
    }

    const result = await provisionUser({
      tenantId: req.tenantId!,
      ...fields,
      roleName: 'Branch Admin',
      branchId,
    });

    return res.status(201).json({
      message: `Branch manager created for ${branch.name}.`,
      user: { id: result.userId, email: result.email, branch: branch.name },
      temporaryPassword: result.temporaryPassword,
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'A user with this email already exists.' });
    }
    return res.status(500).json({ error: 'Failed to create branch manager.', details: error.message });
  }
});

// --- Create staff or student in a branch ---
// Tenant Admin: any branch in the tenant. Branch Admin: only their own branch(es).
// Neither can create Branch Admins or escalate here.
router.post('/', authMiddleware, async (req: TenantRequest, res: Response) => {
  const user = req.user as UserPayload;
  const tenantAdmin = isTenantAdmin(user);
  const scopes = branchAdminScopes(user);

  if (!tenantAdmin && scopes.length === 0) {
    return res.status(403).json({ error: 'You do not have permission to create users.' });
  }

  const requestShape = parseStrictKeys(req.body, ['firstName', 'lastName', 'email', 'phone', 'role', 'branchId', 'gradeId', 'studentId', 'contractType', 'baseMonthlySalary', 'hourlyRate']);
  if (!requestShape.success) return res.status(400).json({ error: requestShape.error });
  const fields = validateIdentityFields({
    firstName: requestShape.data.firstName,
    lastName: requestShape.data.lastName,
    email: requestShape.data.email,
    phone: requestShape.data.phone,
  });
  if (!fields) {
    return res.status(400).json({ error: 'firstName, lastName, and email are required.' });
  }

  const roleName = typeof requestShape.data.role === 'string' ? requestShape.data.role.trim() : '';
  if (!isCanonicalRole(roleName)) {
    return res.status(400).json({ error: 'Unknown role.' });
  }

  // A Branch Admin can only create the branch-level roles, never managers/admins.
  const allowedRoles = tenantAdmin ? TENANT_ADMIN_CREATABLE_ROLES : BRANCH_ADMIN_CREATABLE_ROLES;
  if (!allowedRoles.includes(roleName)) {
    return res.status(403).json({ error: `You are not allowed to create the role "${roleName}".` });
  }
  if (roleName === 'Branch Admin') {
    return res.status(400).json({ error: 'Use the branch-manager endpoint to create Branch Admins.' });
  }

  let compensation: { contractType: SupportedContractType; amount: number } | undefined;
  if (STAFF_ROLE_NAMES.includes(roleName)) {
    const contractType = typeof requestShape.data.contractType === 'string' ? requestShape.data.contractType.trim() : '';
    if (contractType !== 'FIXED' && contractType !== 'HOUR_RATE') {
      return res.status(400).json({ error: 'Staff contractType must be FIXED or HOUR_RATE.' });
    }
    const field = contractType === 'FIXED' ? 'baseMonthlySalary' : 'hourlyRate';
    const amount = readFiniteNumber(requestShape.data, field, {
      min: 0.01,
      max: 100_000_000,
      message: contractType === 'FIXED'
        ? 'Base monthly salary must be greater than zero.'
        : 'Hourly rate must be greater than zero.',
    });
    if (!amount.success) return res.status(400).json({ error: amount.error });
    compensation = { contractType, amount: amount.data };
  }

  const branchId = typeof requestShape.data.branchId === 'string' ? requestShape.data.branchId.trim() : '';
  if (!branchId) {
    return res.status(400).json({ error: 'branchId is required.' });
  }

  const branch = await resolveBranchInTenant(req.tenantId!, branchId);
  if (!branch) {
    return res.status(404).json({ error: 'Branch not found in your institution.' });
  }

  // Branch admins are confined to the branches they manage.
  if (!tenantAdmin && !scopes.includes(branchId)) {
    return res.status(403).json({ error: 'You can only add users to a branch you manage.' });
  }

  // Optional grade for students — must belong to the tenant.
  let gradeId: string | null = null;
  if (roleName === 'Student' && typeof requestShape.data.gradeId === 'string' && requestShape.data.gradeId.trim()) {
    const grade = await prisma.grade.findFirst({ where: { id: requestShape.data.gradeId.trim(), tenantId: req.tenantId! } });
    if (!grade) {
      return res.status(404).json({ error: 'Grade not found in your institution.' });
    }
    gradeId = grade.id;
  }

  let linkedStudentId: string | null = null;
  if (roleName === 'Parent') {
    linkedStudentId = typeof req.body?.studentId === 'string' ? req.body.studentId : '';
    if (!linkedStudentId) {
      return res.status(400).json({ error: 'studentId is required when creating a Parent.' });
    }
    const student = await prisma.student.findFirst({
      where: {
        id: linkedStudentId,
        user: { tenantId: req.tenantId!, userRoles: { some: { branchId } } },
      },
      select: { id: true },
    });
    if (!student) {
      return res.status(404).json({ error: 'Student not found in the selected branch.' });
    }
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email: fields.email } });
    if (existing) {
      return res.status(409).json({ error: 'A user with this email already exists.' });
    }

    const result = await provisionUser({
      tenantId: req.tenantId!,
      ...fields,
      roleName,
      branchId,
      gradeId,
      linkedStudentId,
      compensation,
    });

    return res.status(201).json({
      message: `${roleName} created in ${branch.name}.`,
      user: { id: result.userId, email: result.email, role: roleName, branch: branch.name },
      temporaryPassword: result.temporaryPassword,
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'A user with this email already exists.' });
    }
    return res.status(500).json({ error: 'Failed to create user.', details: error.message });
  }
});

// --- Bulk admission import (from a CSV parsed to JSON on the client) ---
//
// Every row runs the same path as the single-admission form: identical field
// validation, admission number, admissionRecord JSON, placement rules, BLOCKED
// enrolments, ADMISSION invoice, and SMS login release. The only parts specific
// to importing are Bikram Sambat dates (admins hold BS records, not AD) and the
// "fee already paid" flag, which lets a student admitted years ago be entered
// now without being billed a second time.

const BULK_ADMISSION_FIELDS = [
  'firstName', 'lastName', 'email', 'phone',
  'admissionDateBs', 'admissionTime', 'feeAlreadyPaid',
  'branchName', 'gradeName', 'subjects',
  'dateOfBirthBs', 'gender', 'bloodGroup', 'nationality', 'permanentAddress', 'temporaryAddress', 'school', 'medicalNotes',
  'fatherName', 'fatherPhone', 'fatherEmail', 'fatherOccupation',
  'motherName', 'motherPhone', 'motherEmail', 'motherOccupation',
  'optionalParentName', 'optionalParentPhone', 'optionalParentEmail', 'optionalParentOccupation', 'optionalParentRelationship',
  'primaryParent',
  'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelationship',
] as const;

type BulkAdmissionField = typeof BULK_ADMISSION_FIELDS[number];
type BulkAdmissionRow = Partial<Record<BulkAdmissionField, string>>;

// Each created row sends two SMS messages, so the batch is capped well below
// the 500 the old student-only import allowed.
const BULK_ADMISSION_LIMIT = 200;

/**
 * Shape-check the envelope only. Field-level problems are reported per row, so
 * one bad address does not reject a 200-student file.
 */
function parseBulkAdmissionImport(body: unknown): { success: true; data: BulkAdmissionRow[] } | { success: false; error: string } {
  const request = parseStrictKeys(body, ['students']);
  if (!request.success) return request;
  const rows = request.data.students;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > BULK_ADMISSION_LIMIT) {
    return { success: false, error: `students must contain between 1 and ${BULK_ADMISSION_LIMIT} rows.` };
  }

  const normalized: BulkAdmissionRow[] = [];
  for (const [index, row] of rows.entries()) {
    const shape = parseStrictKeys(row, BULK_ADMISSION_FIELDS);
    if (!shape.success) return { success: false, error: `Row ${index + 1}: ${shape.error}` };
    const record: BulkAdmissionRow = {};
    for (const key of BULK_ADMISSION_FIELDS) {
      const value = shape.data[key];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string') return { success: false, error: `Row ${index + 1}: ${key} must be text.` };
      if (value.length > 2000) return { success: false, error: `Row ${index + 1}: ${key} is too long.` };
      record[key] = value.trim();
    }
    normalized.push(record);
  }
  return { success: true, data: normalized };
}

const FEE_PAID_YES = new Set(['yes', 'y', 'true', '1', 'paid']);
const FEE_PAID_NO = new Set(['', 'no', 'n', 'false', '0', 'unpaid', 'due']);

/** Split a full name into the first/last pair the account model needs. */
function splitFullName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? '';
  return { firstName, lastName: parts.join(' ') || firstName };
}

interface BulkAdmissionResult {
  row: number;
  name: string;
  email: string;
  status: 'created' | 'error';
  admissionNumber?: string;
  admissionDateBs?: string;
  admissionStatus?: string;
  invoiceId?: string;
  admissionFee?: number;
  feeSettled?: boolean;
  tenureYear?: number;
  loginsSent?: boolean;
  warning?: string;
  error?: string;
}

router.post('/admissions/bulk', authMiddleware, async (req: TenantRequest, res: Response) => {
  const caller = req.user as UserPayload;
  const tenantAdmin = isTenantAdmin(caller);
  const scopes = branchAdminScopes(caller);
  if (!tenantAdmin && scopes.length === 0) {
    return res.status(403).json({ error: 'Only the Tenant Admin or an assigned Branch Admin may import admissions.' });
  }

  const input = parseBulkAdmissionImport(req.body);
  if (!input.success) return res.status(400).json({ error: input.error });
  const rows = input.data;

  // Resolve the names a CSV can refer to once, scoped for branch admins.
  const [branches, gradeList, classList] = await Promise.all([
    prisma.branch.findMany({
      where: { tenantId: req.tenantId!, ...(tenantAdmin ? {} : { id: { in: scopes } }) },
      select: { id: true, name: true },
    }),
    prisma.grade.findMany({ where: { tenantId: req.tenantId! }, select: { id: true, name: true, billingMode: true } }),
    prisma.class.findMany({
      where: { course: { tenantId: req.tenantId!, type: 'REGULAR', isExtraActivity: false } },
      select: { id: true, branchId: true, course: { select: { name: true, gradeId: true } } },
      orderBy: { name: 'asc' },
    }),
  ]);
  const branchByName = new Map(branches.map((branch) => [branch.name.trim().toLowerCase(), branch]));
  const soleBranch = branches.length === 1 ? branches[0] : null;
  const gradeByName = new Map(gradeList.map((grade) => [grade.name.trim().toLowerCase(), grade]));

  // First class per branch + grade + subject, matching how the admission form
  // defaults a chosen subject to its first available class.
  const classBySubject = new Map<string, string>();
  for (const item of classList) {
    const key = `${item.branchId}:${item.course.gradeId}:${item.course.name.trim().toLowerCase()}`;
    if (!classBySubject.has(key)) classBySubject.set(key, item.id);
  }

  const admittedBy = { id: req.user!.id, name: `${req.user!.firstName} ${req.user!.lastName}`.trim() };
  const seenEmails = new Set<string>();
  const results: BulkAdmissionResult[] = [];
  const now = new Date();

  for (let index = 0; index < rows.length; index++) {
    const raw = rows[index];
    const rowNo = index + 1;
    const field = (key: BulkAdmissionField) => raw[key] ?? '';
    const rowName = `${field('firstName')} ${field('lastName')}`.trim();
    const rowEmail = normalizeEmail(field('email'));
    const fail = (error: string) => {
      results.push({ row: rowNo, name: rowName, email: rowEmail, status: 'error', error });
    };

    // 1. Branch and grade, referenced by name.
    const branchKey = field('branchName').toLowerCase();
    const branchRef = branchKey ? branchByName.get(branchKey) : soleBranch;
    if (!branchRef) {
      fail(branchKey
        ? `Branch "${field('branchName')}" was not found or is outside your access.`
        : 'Branch is required when the institution has more than one branch.');
      continue;
    }
    const gradeKey = field('gradeName').toLowerCase();
    const gradeRef = gradeKey ? gradeByName.get(gradeKey) : undefined;
    if (!gradeRef) {
      fail(gradeKey ? `Grade "${field('gradeName')}" does not exist. Create it under Grades first.` : 'Grade is required.');
      continue;
    }

    // 2. Subjects, which only subject-billed grades (Class 11-12) carry.
    const subjectNames = field('subjects').split(';').map((name) => name.trim()).filter(Boolean);
    if (gradeRef.billingMode === 'GRADE' && subjectNames.length) {
      fail(`${gradeRef.name} is billed per grade. Leave Subjects empty and enroll extra classes after admission.`);
      continue;
    }
    if (gradeRef.billingMode === 'SUBJECT' && !subjectNames.length) {
      fail(`${gradeRef.name} is billed per subject. List the subjects separated by semicolons, for example "Physics;Chemistry;Maths".`);
      continue;
    }
    const classIds: string[] = [];
    const unknownSubject = subjectNames.find((name) => {
      const classId = classBySubject.get(`${branchRef.id}:${gradeRef.id}:${name.toLowerCase()}`);
      if (!classId) return true;
      if (!classIds.includes(classId)) classIds.push(classId);
      return false;
    });
    if (unknownSubject) {
      fail(`Subject "${unknownSubject}" has no class for ${gradeRef.name} at ${branchRef.name}. Create the course and its class first.`);
      continue;
    }
    if (classIds.length !== subjectNames.length) {
      fail('The same subject is listed more than once.');
      continue;
    }

    // 3. Bikram Sambat admission date and date of birth.
    const admissionDateBs = field('admissionDateBs');
    if (!admissionDateBs) {
      fail('Admission Date (BS) is required, written as YYYY-MM-DD in Bikram Sambat.');
      continue;
    }
    const admittedAt = await bsToAdInstant(admissionDateBs, field('admissionTime') || '10:00');
    if (!admittedAt) {
      fail(`"${admissionDateBs}"${field('admissionTime') ? ` ${field('admissionTime')}` : ''} is not a real Bikram Sambat date and Nepal time. Use YYYY-MM-DD and HH:mm, for example 2080-03-15 and 10:00.`);
      continue;
    }
    if (admittedAt.getTime() > now.getTime()) {
      fail('Admission Date (BS) cannot be in the future.');
      continue;
    }
    const dateOfBirthBs = field('dateOfBirthBs');
    // Anchored at midday so the Nepal-time offset cannot roll the AD calendar
    // date back a day when it is stored as a plain YYYY-MM-DD string.
    const dateOfBirth = dateOfBirthBs ? await bsToAdInstant(dateOfBirthBs, '12:00') : null;
    if (!dateOfBirth) {
      fail(dateOfBirthBs
        ? `"${dateOfBirthBs}" is not a real Bikram Sambat date of birth. Use YYYY-MM-DD.`
        : 'Date of Birth (BS) is required, written as YYYY-MM-DD in Bikram Sambat.');
      continue;
    }
    if (dateOfBirth.getTime() > now.getTime()) {
      fail('Date of Birth (BS) cannot be in the future.');
      continue;
    }

    // 4. Was the admission fee already collected off-system?
    const feeFlag = field('feeAlreadyPaid').toLowerCase();
    if (!FEE_PAID_YES.has(feeFlag) && !FEE_PAID_NO.has(feeFlag)) {
      fail('Fee Already Paid must be "yes" or "no".');
      continue;
    }
    const settlement: AdmissionSettlement = FEE_PAID_YES.has(feeFlag) ? 'ALREADY_PAID' : 'DUE';

    // 5. The recorded primary guardian receives the parent login, as in the form.
    const primaryParent = field('primaryParent');
    const guardian = primaryParent === 'Father'
      ? { name: field('fatherName'), email: field('fatherEmail'), phone: field('fatherPhone') }
      : primaryParent === 'Mother'
        ? { name: field('motherName'), email: field('motherEmail'), phone: field('motherPhone') }
        : primaryParent === 'Optional parent'
          ? { name: field('optionalParentName'), email: field('optionalParentEmail'), phone: field('optionalParentPhone') }
          : null;
    if (!guardian) {
      fail('Primary Parent must be "Father", "Mother", or "Optional parent".');
      continue;
    }
    if (!guardian.email) {
      fail(`${primaryParent} is the primary parent, so their email is required to create the parent login.`);
      continue;
    }

    // 6. Hand the assembled row to the admission form's own validators.
    const details: Record<string, string> = {
      admittedAt: admittedAt.toISOString(),
      dateOfBirth: dateOfBirth.toISOString().slice(0, 10),
      gender: field('gender'),
      bloodGroup: field('bloodGroup'),
      nationality: field('nationality') || 'Nepali',
      permanentAddress: field('permanentAddress'),
      temporaryAddress: field('temporaryAddress'),
      school: field('school'),
      medicalNotes: field('medicalNotes'),
      fatherName: field('fatherName'),
      fatherPhone: field('fatherPhone'),
      fatherEmail: field('fatherEmail'),
      fatherOccupation: field('fatherOccupation'),
      motherName: field('motherName'),
      motherPhone: field('motherPhone'),
      motherEmail: field('motherEmail'),
      motherOccupation: field('motherOccupation'),
      optionalParentName: field('optionalParentName'),
      optionalParentPhone: field('optionalParentPhone'),
      optionalParentEmail: field('optionalParentEmail'),
      optionalParentOccupation: field('optionalParentOccupation'),
      optionalParentRelationship: field('optionalParentRelationship'),
      primaryParent,
      emergencyContactName: field('emergencyContactName'),
      emergencyContactPhone: field('emergencyContactPhone'),
      emergencyContactRelationship: field('emergencyContactRelationship'),
    };
    const admissionDetails = validateAdmissionDetails(details);
    if (!admissionDetails.success) {
      fail(admissionDetails.error);
      continue;
    }

    const studentFields = validateIdentityFields({
      firstName: field('firstName'), lastName: field('lastName'), email: field('email'), phone: field('phone'),
    });
    if (!studentFields || !studentFields.phone) {
      fail('First Name, Last Name, a valid Email, and Phone are required for the student.');
      continue;
    }
    const guardianName = splitFullName(guardian.name);
    const parentFields = validateIdentityFields({
      firstName: guardianName.firstName, lastName: guardianName.lastName, email: guardian.email, phone: guardian.phone,
    });
    if (!parentFields || !parentFields.phone) {
      fail(`${primaryParent} needs a name, a valid email, and a phone number to receive the parent login.`);
      continue;
    }
    if (studentFields.email === parentFields.email) {
      fail('The student and the primary parent must use different email addresses.');
      continue;
    }

    // 7. Authoritative placement check — the same one the single form runs.
    const placement = await loadAdmissionPlacement(req.tenantId!, { branchId: branchRef.id, gradeId: gradeRef.id, classIds });
    if (!placement.success) {
      fail(placement.error);
      continue;
    }

    // 8. Email collisions, inside this file and against existing accounts.
    if (seenEmails.has(studentFields.email) || seenEmails.has(parentFields.email)) {
      fail('Duplicate email address within this file.');
      continue;
    }
    const conflict = await findConflictingAccount([studentFields.email, parentFields.email]);
    if (conflict) {
      fail(`An account already exists for ${conflict}.`);
      continue;
    }

    try {
      const created = await createAdmissionRecords({
        tenantId: req.tenantId!,
        placement: placement.data,
        student: studentFields,
        parent: parentFields,
        details: admissionDetails.data as AdmissionDetails,
        admittedAt,
        admittedBy,
        settlement,
        recordExtras: {
          admissionDateBs: await toBsDateString(admittedAt),
          dateOfBirthBs: await toBsDateString(dateOfBirth),
          importedAt: now.toISOString(),
          importSource: 'CSV bulk admission import',
        },
        now,
      });
      seenEmails.add(studentFields.email);
      seenEmails.add(parentFields.email);

      const result: BulkAdmissionResult = {
        row: rowNo,
        name: `${studentFields.firstName} ${studentFields.lastName}`,
        email: studentFields.email,
        status: 'created',
        admissionNumber: created.admissionNumber,
        admissionDateBs: await toBsDateString(admittedAt),
        admissionStatus: created.student.admissionStatus,
        invoiceId: created.invoice.id,
        admissionFee: Number(created.invoice.netPayable),
        feeSettled: created.invoice.status === 'PAID',
        // Which admission year the student is in today: 1 for a new admission,
        // 3 for someone admitted two BS years ago.
        tenureYear: (created.accessWindow?.yearsElapsed ?? 0) + 1,
      };

      // Logins go out by SMS exactly as for a walk-in admission: now when
      // nothing is owed, otherwise when the admission invoice is paid.
      if (created.readyForLogin) {
        try {
          const delivery = await activateAdmissionAndSendLogins(req.tenantId!, created.student.id);
          result.loginsSent = delivery.delivered;
          if (delivery.delivered) {
            result.admissionStatus = 'ACTIVE';
          } else {
            result.warning = `Admission saved, but SMS delivery is incomplete: ${delivery.failures.join(' ') || 'queued for retry.'}`;
          }
        } catch (error: unknown) {
          result.loginsSent = false;
          result.warning = `Admission saved, but the login SMS could not be queued: ${error instanceof Error ? error.message : 'delivery is unavailable.'}`;
        }
      } else {
        result.loginsSent = false;
        result.warning = 'Login IDs will be sent by SMS once the admission fee is paid.';
      }
      results.push(result);
    } catch (error: any) {
      fail(error?.code === 'P2002' ? 'The student or parent email already exists.' : 'Failed to create this admission.');
    }
  }

  const createdCount = results.filter((result) => result.status === 'created').length;
  return res.json({ createdCount, errorCount: results.length - createdCount, results });
});

// --- Update / deactivate a user (Tenant Admin, or Branch Admin in scope) ---

// Load a user in the caller's tenant and confirm they may manage them.
async function loadManageableUser(req: TenantRequest, id: string) {
  const caller = req.user as UserPayload;
  const tenantAdmin = isTenantAdmin(caller);
  const scopes = branchAdminScopes(caller);
  if (!tenantAdmin && scopes.length === 0) return { error: 403 as const };

  const user = await prisma.user.findFirst({
    where: { id, tenantId: req.tenantId! },
    include: { userRoles: { include: { role: { select: { name: true } } } }, student: true, staffRecord: true },
  });
  if (!user) return { error: 404 as const };

  if (!tenantAdmin) {
    // Protect the whole admin account, even when another role matches this branch.
    const adminTarget = user.userRoles.some((ur) =>
      ['Branch Admin', 'Tenant Admin', 'Super Admin'].includes(ur.role.name));
    if (adminTarget) return { error: 403 as const };
    const inScope = user.userRoles.some((ur) => ur.branchId && scopes.includes(ur.branchId));
    if (!inScope) return { error: 403 as const };
  }
  return { user };
}

router.put('/:id', authMiddleware, async (req: TenantRequest, res: Response) => {
  const loaded = await loadManageableUser(req, req.params.id);
  if (loaded.error) {
    return res.status(loaded.error).json({ error: loaded.error === 404 ? 'User not found in your institution.' : 'You cannot manage this user.' });
  }
  const { user } = loaded;
  if (typeof req.body?.phone === 'string' && req.body.phone.trim() !== user.phone) {
    const protectedRole = await prisma.userRole.findFirst({ where: { userId: user.id, role: { name: 'Tenant Admin' } } });
    if (protectedRole) return res.status(403).json({ error: 'Tenant admin security numbers cannot be changed through people management. Use verified account recovery.' });
  }

  const data: Record<string, unknown> = {};
  if (typeof req.body?.firstName === 'string' && req.body.firstName.trim()) data.firstName = req.body.firstName.trim();
  if (typeof req.body?.lastName === 'string' && req.body.lastName.trim()) data.lastName = req.body.lastName.trim();
  if (typeof req.body?.phone === 'string') data.phone = req.body.phone.trim();
  if (['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(req.body?.status)) data.status = req.body.status;

  let compensationUpdate: { contractType: SupportedContractType; salaryStructure: ReturnType<typeof salaryStructureFor> } | null = null;
  if (user.staffRecord && ['contractType', 'baseMonthlySalary', 'hourlyRate'].some((field) => field in (req.body ?? {}))) {
    const contractType = typeof req.body.contractType === 'string' ? req.body.contractType.trim() : user.staffRecord.contractType;
    if (contractType !== 'FIXED' && contractType !== 'HOUR_RATE') {
      return res.status(400).json({ error: 'Staff contractType must be FIXED or HOUR_RATE.' });
    }
    const field = contractType === 'FIXED' ? 'baseMonthlySalary' : 'hourlyRate';
    const amount = readFiniteNumber(req.body, field, {
      min: 0.01,
      max: 100_000_000,
      message: contractType === 'FIXED'
        ? 'Base monthly salary must be greater than zero.'
        : 'Hourly rate must be greater than zero.',
    });
    if (!amount.success) return res.status(400).json({ error: amount.error });
    compensationUpdate = { contractType, salaryStructure: salaryStructureFor(contractType, amount.data) };
  }

  // Grade reassignment (students only): string sets, null clears.
  let gradeUpdate: { gradeId: string | null } | null = null;
  if (user.student && 'gradeId' in (req.body ?? {})) {
    if (req.body.gradeId === null || req.body.gradeId === '') {
      gradeUpdate = { gradeId: null };
    } else if (typeof req.body.gradeId === 'string') {
      const grade = await prisma.grade.findFirst({ where: { id: req.body.gradeId, tenantId: req.tenantId! } });
      if (!grade) return res.status(404).json({ error: 'Grade not found in your institution.' });
      gradeUpdate = { gradeId: grade.id };
    }
  }

  if (Object.keys(data).length === 0 && !gradeUpdate && !compensationUpdate) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  const gradeChanged = gradeUpdate && user.student && gradeUpdate.gradeId !== user.student.gradeId;

  try {
    if (Object.keys(data).length > 0) await prisma.user.update({ where: { id: user.id }, data });
    if (gradeUpdate && user.student) await prisma.student.update({ where: { id: user.student.id }, data: gradeUpdate });
    if (compensationUpdate && user.staffRecord) {
      await prisma.staffRecord.update({ where: { id: user.staffRecord.id }, data: compensationUpdate });
    }

    // Promotion reconciliation: moving to a new grade completes active enrolments
    // in courses tied to a *different* graded level, so monthly billing (which is
    // the sum of active enrolments) drops the old grade's fees. Ungraded courses
    // are left untouched. The admin then enrols in the new grade's courses.
    let droppedEnrollments = 0;
    if (gradeChanged && gradeUpdate!.gradeId && user.student) {
      const result = await prisma.enrollment.updateMany({
        where: { studentId: user.student.id, status: 'ACTIVE', course: { gradeId: { notIn: [gradeUpdate!.gradeId] } } },
        data: { status: 'COMPLETED' },
      });
      droppedEnrollments = result.count;
    }

    return res.json({ message: 'User updated.', droppedEnrollments });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update user.', details: error.message });
  }
});

// Deactivate (soft-delete): sets status INACTIVE and drops active enrolments so
// billing stops. History (invoices, records) is preserved for audit.
router.delete('/:id', authMiddleware, async (req: TenantRequest, res: Response) => {
  const loaded = await loadManageableUser(req, req.params.id);
  if (loaded.error) {
    return res.status(loaded.error).json({ error: loaded.error === 404 ? 'User not found in your institution.' : 'You cannot manage this user.' });
  }
  const { user } = loaded;
  if (user.id === (req.user as UserPayload).id) {
    return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  }

  try {
    const deactivated = await prisma.$transaction(async (tx) => {
      const transition = await tx.user.updateMany({
        where: { id: user.id, tenantId: req.tenantId!, status: { not: 'INACTIVE' } },
        data: { status: 'INACTIVE' },
      });
      if (transition.count !== 1) return false;
      if (user.student) {
        await tx.enrollment.updateMany({
          where: { studentId: user.student.id, status: 'ACTIVE' },
          data: { status: 'DROPPED' },
        });
      }
      await tx.session.deleteMany({ where: { userId: user.id } });
      return true;
    });
    if (!deactivated) {
      return res.status(409).json({ error: 'User was already deactivated by another request.' });
    }
    return res.json({ message: 'User deactivated.' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to deactivate user.', details: error.message });
  }
});

export default router;
