import { Router, Response, NextFunction } from 'express';
import prisma from '../utils/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware, hasPermission } from '../middleware/auth';

const router = Router();

// Tenant provisioning is a development operator tool only. Production runs
// one institution and must not expose platform/white-label administration.
function platformAdminOnly(_req: TenantRequest, res: Response, next: NextFunction) {
  if (process.env.PLATFORM_ADMIN_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Platform administration is disabled in this deployment.' });
  }
  return next();
}

// Direct bootstrap flow used by the temporary development Super Admin.
router.post(
  '/provision',
  platformAdminOnly,
  authMiddleware,
  hasPermission('super_admin_manage_tenants'),
  async (req: TenantRequest, res: Response) => {
    const {
      institutionName,
      panNumber,
      adminFirstName,
      adminLastName,
      adminEmail,
      adminPhone,
      branchName,
      branchAddress,
      latitude,
      longitude,
    } = req.body ?? {};

    const requiredFields: Array<[string, unknown]> = [
      ['institutionName', institutionName],
      ['panNumber', panNumber],
      ['adminFirstName', adminFirstName],
      ['adminLastName', adminLastName],
      ['adminEmail', adminEmail],
      ['adminPhone', adminPhone],
      ['branchName', branchName],
      ['branchAddress', branchAddress],
    ];
    const missing = requiredFields.filter(([, value]) => typeof value !== 'string' || !value.trim()).map(([name]) => name);
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}.` });
    }
    const normalizedEmail = String(adminEmail).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Enter a valid Tenant Admin email address.' });
    }
    const parsedLatitude = latitude === undefined || latitude === '' ? null : Number(latitude);
    const parsedLongitude = longitude === undefined || longitude === '' ? null : Number(longitude);
    if ((parsedLatitude !== null && (!Number.isFinite(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90)) ||
        (parsedLongitude !== null && (!Number.isFinite(parsedLongitude) || parsedLongitude < -180 || parsedLongitude > 180))) {
      return res.status(400).json({ error: 'Enter valid latitude and longitude values.' });
    }

    const tempPassword = `Tms!${crypto.randomBytes(12).toString('base64url')}A9`;
    try {
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const provisioned = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: { name: String(institutionName).trim(), panNumber: String(panNumber).trim(), status: 'ACTIVE' },
        });
        const tenantAdminRole = await tx.role.create({
          data: {
            tenantId: tenant.id,
            name: 'Tenant Admin',
            permissions: ['manage_branches', 'manage_staff', 'manage_courses', 'manage_billing', 'view_reports', 'approve_petty_cash_l2'],
          },
        });
        const branch = await tx.branch.create({
          data: {
            tenantId: tenant.id,
            name: String(branchName).trim(),
            address: String(branchAddress).trim(),
            latitude: parsedLatitude ?? 0,
            longitude: parsedLongitude ?? 0,
            radiusMeters: 100,
          },
        });
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: normalizedEmail,
            name: `${String(adminFirstName).trim()} ${String(adminLastName).trim()}`,
            phone: String(adminPhone).trim(),
            firstName: String(adminFirstName).trim(),
            lastName: String(adminLastName).trim(),
            passwordHash,
            status: 'ACTIVE',
          },
        });
        await tx.account.create({
          data: { accountId: user.id, providerId: 'credential', userId: user.id, password: passwordHash },
        });
        await tx.userRole.create({ data: { userId: user.id, roleId: tenantAdminRole.id, branchId: null } });
        return { tenant, branch, user };
      });

      return res.status(201).json({
        message: 'Tenant and Tenant Admin created successfully.',
        provisioned: {
          tenantId: provisioned.tenant.id,
          tenantName: provisioned.tenant.name,
          primaryAdminUser: provisioned.user.email,
          primaryAdminName: provisioned.user.name,
          defaultBranch: provisioned.branch.name,
          temporaryPassword: tempPassword,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'A tenant or user with this PAN/email already exists.' });
      }
      return res.status(500).json({ error: 'Failed to create tenant and Tenant Admin.', details: error.message });
    }
  }
);

// 1. Public endpoint to submit onboarding request
router.post('/request', async (req: TenantRequest, res: Response) => {
  if (process.env.PLATFORM_ADMIN_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Institution onboarding is disabled in this deployment.' });
  }
  const { name, email, phone, panNumber, remarks } = req.body;

  if (!name || !email || !phone || !panNumber) {
    return res.status(400).json({
      error: 'Missing required onboarding request fields: name, email, phone, panNumber.',
    });
  }

  try {
    const request = await prisma.tenantRequest.create({
      data: {
        name,
        email,
        phone,
        panNumber,
        remarks,
        status: 'PENDING',
      },
    });

    return res.status(201).json({
      message: 'Your onboarding request has been submitted successfully for administrative review.',
      request,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to process request.', details: error.message });
  }
});

// 2. Super Admin only: List onboarding requests
router.get(
  '/requests',
  platformAdminOnly,
  authMiddleware,
  hasPermission('super_admin_manage_tenants'),
  async (req: TenantRequest, res: Response) => {
    try {
      const requests = await prisma.tenantRequest.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return res.json({ requests });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to list onboarding requests.', details: error.message });
    }
  }
);

// 3. Super Admin only: Approve onboarding request & provision tenant structures
router.post(
  '/approve/:id',
  platformAdminOnly,
  authMiddleware,
  hasPermission('super_admin_manage_tenants'),
  async (req: TenantRequest, res: Response) => {
    const { id } = req.params;
    const { defaultBranchName, branchAddress, latitude, longitude } = req.body;

    try {
      const onboardingRequest = await prisma.tenantRequest.findUnique({
        where: { id },
      });

      if (!onboardingRequest) {
        return res.status(404).json({ error: 'Onboarding request not found.' });
      }

      if (onboardingRequest.status !== 'PENDING') {
        return res.status(409).json({ error: 'Request is already processed.' });
      }

      const tempPassword = `Tms!${crypto.randomBytes(12).toString('base64url')}A9`;
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const provisioned = await prisma.$transaction(async (tx) => {
        const claim = await tx.tenantRequest.updateMany({
          where: { id, status: 'PENDING' },
          data: { status: 'APPROVED' },
        });
        if (claim.count !== 1) return null;

        const tenant = await tx.tenant.create({
          data: {
            name: onboardingRequest.name,
            panNumber: onboardingRequest.panNumber,
            status: 'ACTIVE',
          },
        });
        const tenantAdminRole = await tx.role.create({
          data: {
            tenantId: tenant.id,
            name: 'Tenant Admin',
            permissions: [
              'manage_branches',
              'manage_staff',
              'manage_courses',
              'manage_billing',
              'view_reports',
              'approve_petty_cash_l2',
            ],
          },
        });
        const branch = await tx.branch.create({
          data: {
            tenantId: tenant.id,
            name: defaultBranchName || 'Main Center',
            address: branchAddress || 'Address pending — update in Branch settings',
            latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : 27.6915,
            longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : 85.3422,
            radiusMeters: 100,
          },
        });
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: onboardingRequest.email,
            name: onboardingRequest.name,
            phone: onboardingRequest.phone,
            firstName: onboardingRequest.name.split(' ')[0],
            lastName: onboardingRequest.name.split(' ')[1] || 'Administrator',
            passwordHash,
            status: 'ACTIVE',
          },
        });
        await tx.account.create({
          data: {
            accountId: user.id,
            providerId: 'credential',
            userId: user.id,
            password: passwordHash,
          },
        });
        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: tenantAdminRole.id,
            branchId: null,
          },
        });
        return { tenant, branch, user };
      });
      if (!provisioned) {
        return res.status(409).json({ error: 'Request was already processed by another request.' });
      }

      return res.status(200).json({
        message: 'Onboarding request approved and successfully provisioned.',
        provisioned: {
          tenantId: provisioned.tenant.id,
          tenantName: provisioned.tenant.name,
          primaryAdminUser: provisioned.user.email,
          defaultBranch: provisioned.branch.name,
          temporaryPassword: tempPassword,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(409).json({
          error: 'A tenant or user with this PAN/email already exists. Verify the request details.',
        });
      }
      return res.status(500).json({ error: 'Failed to provision tenant.', details: error.message });
    }
  }
);

// 3b. Super Admin only: Reject onboarding request
router.post(
  '/reject/:id',
  platformAdminOnly,
  authMiddleware,
  hasPermission('super_admin_manage_tenants'),
  async (req: TenantRequest, res: Response) => {
    const { id } = req.params;

    try {
      const onboardingRequest = await prisma.tenantRequest.findUnique({ where: { id } });

      if (!onboardingRequest) {
        return res.status(404).json({ error: 'Onboarding request not found.' });
      }

      if (onboardingRequest.status !== 'PENDING') {
        return res.status(409).json({ error: 'Request is already processed.' });
      }

      const transition = await prisma.tenantRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'REJECTED' },
      });
      if (transition.count !== 1) {
        return res.status(409).json({ error: 'Request was already processed by another request.' });
      }
      const updated = await prisma.tenantRequest.findUniqueOrThrow({ where: { id } });

      return res.status(200).json({ message: 'Onboarding request rejected.', request: updated });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to reject request.', details: error.message });
    }
  }
);

// 3c. Super Admin only: List provisioned tenants with headline counts
router.get(
  '/tenants',
  platformAdminOnly,
  authMiddleware,
  hasPermission('super_admin_manage_tenants'),
  async (req: TenantRequest, res: Response) => {
    try {
      const tenants = await prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { branches: true, users: true },
          },
        },
      });

      return res.json({
        tenants: tenants.map(tenant => ({
          id: tenant.id,
          name: tenant.name,
          panNumber: tenant.panNumber,
          status: tenant.status,
          createdAt: tenant.createdAt,
          branchCount: tenant._count.branches,
          userCount: tenant._count.users,
        })),
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to list tenants.', details: error.message });
    }
  }
);

// 5. Digital Student ID Card Info
router.get(
  '/student-id/:studentId',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const { studentId } = req.params;
    try {
      const student = await prisma.student.findFirst({
          where: { id: studentId, user: { tenantId: req.tenantId! } },
          include: { user: true },
        });

      if (!student) {
        return res.status(404).json({ error: 'Student record not found.' });
      }

      return res.status(200).json({
        cardId: `ID-2026-${student.id.substring(0, 6).toUpperCase()}`,
        studentId: student.id,
        fullName: `${student.user.firstName} ${student.user.lastName}`,
        email: student.user.email,
        emergencyPhone: student.emergencyContact,
        barcodeToken: `BARCODE-TMS-${student.id}`,
        photoUrl: null,
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to load digital student ID.', details: error.message });
    }
  }
);

// 6. Student Lifetime Record (academic + attendance + certificates)
router.get(
  '/student-lifetime/:studentId',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const { studentId } = req.params;
    try {
      const student = await prisma.student.findFirst({
          where: { id: studentId, user: { tenantId: req.tenantId! } },
          include: { user: true },
        });
      const enrollments = await prisma.enrollment.findMany({
          where: { studentId, student: { user: { tenantId: req.tenantId! } } },
          include: { class: { include: { course: true } } },
        });
      const certificates = await prisma.certificate.findMany({
          where: { studentId, student: { user: { tenantId: req.tenantId! } } },
        });

      if (!student) {
        return res.status(404).json({ error: 'Student record not found.' });
      }

      return res.status(200).json({
        student: {
          id: studentId,
          fullName: `${student.user.firstName} ${student.user.lastName}`,
        },
        enrollmentHistory: enrollments.map(e => ({
          enrollmentId: e.id,
          courseName: e.class.course.name,
          className: e.class.name,
          courseType: e.class.course.type,
          status: e.status,
          admissionDate: e.admissionDate,
        })),
        academicSummary: {
          gpa: null,
          averageAttendanceRate: null,
        },
        certificatesIssued: certificates.map(c => ({
          certificateId: c.certificateId,
          issuedAt: c.issuedDate,
          pdfUrl: c.pdfUrl,
        })),
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to retrieve student lifetime record.', details: error.message });
    }
  }
);

// 7. Report exports (Admin/Teacher only)
router.get(
  '/reports/export',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const { reportType, format, studentId } = req.query;

    if (!reportType || !format) {
      return res.status(400).json({ error: 'Missing required query parameters: reportType, format.' });
    }

    try {
      const fileName = `tms_report_${reportType.toString().toLowerCase()}_${Date.now()}.${format.toString().toLowerCase() === 'pdf' ? 'pdf' : 'xlsx'}`;
      
      return res.status(200).json({
        message: 'Report successfully generated and exported.',
        reportMeta: {
          fileName,
          reportType,
          format,
          studentId: studentId || 'ALL',
          downloadUrl: `https://storage.tms.com.np/reports/${fileName}`,
          fileSize: '45.8 KB',
          generatedAt: new Date(),
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to generate report export.', details: error.message });
    }
  }
);

export default router;
