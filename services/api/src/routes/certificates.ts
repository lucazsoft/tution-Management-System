import { Router, Response, Request } from 'express';
import prisma from '../utils/db';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware, hasPermission } from '../middleware/auth';
import { CertificateType } from '@tms/types';
import { canAccessBranch, isTenantAdmin } from '../utils/access-control';
import crypto from 'node:crypto';
import { certificateDesign, renderCertificatePdf, snapshotFromRecord, type CertificateSnapshot } from '../services/certificate-renderer';

const router = Router();

type HtmlCertificateLayout = { renderMode?: string; html?: string };

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

function renderCertificateHtml(template: string, values: Record<string, unknown>) {
  const rendered = template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g, (_match, key: string) => escapeHtml(values[key] ?? ''));
  return /<html[\s>]/i.test(rendered)
    ? rendered
    : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${rendered}</body></html>`;
}

router.get('/options', authMiddleware, async (req: TenantRequest, res: Response) => {
  const certificateAdmin = isTenantAdmin(req.user!) || req.user!.roles.some((role: { roleName: string }) => role.roleName === 'Branch Admin');
  if (!certificateAdmin) return res.status(403).json({ error: 'Certificate tools are available to institution administrators.' });
  try {
    const [templates, students] = await Promise.all([
      prisma.certificateTemplate.findMany({
        where: { tenantId: req.tenantId!, status: 'ACTIVE' },
        select: { id: true, name: true, type: true, layoutConfig: true, status: true, version: true, updatedAt: true },
        orderBy: { name: 'asc' },
      }),
      prisma.student.findMany({
        where: {
          user: { tenantId: req.tenantId! },
          enrollments: { some: { status: { in: ['ACTIVE', 'BLOCKED'] } } },
        },
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true } },
          grade: { select: { name: true } },
          enrollments: {
            where: { status: { in: ['ACTIVE', 'BLOCKED'] } },
            select: { class: { select: { branch: { select: { id: true, name: true } } } } },
          },
        },
        orderBy: { user: { firstName: 'asc' } },
      }),
    ]);
    const options = students.flatMap((student) => {
      const branches = [...new Map(student.enrollments.map((entry) => [entry.class.branch.id, entry.class.branch])).values()];
      return branches
        .filter((branch) => isTenantAdmin(req.user!) || canAccessBranch(req.user!, branch.id))
        .map((branch) => ({
          studentId: student.id,
          studentName: `${student.user.firstName} ${student.user.lastName}`.trim(),
          gradeName: student.grade?.name ?? 'Ungraded',
          branchId: branch.id,
          branchName: branch.name,
        }));
    });
    return res.json({
      templates: templates.map((template) => {
        const layout = template.layoutConfig as HtmlCertificateLayout & { sourceFile?: { name?: string; mimeType?: string } };
        return {
          id: template.id,
          name: template.name,
          type: template.type,
          status: template.status,
          version: template.version,
          updatedAt: template.updatedAt,
          layoutConfig: {
            renderMode: layout.renderMode === 'HTML' ? 'HTML' : layout.renderMode === 'DESIGN' ? 'DESIGN' : 'FILE',
            ...(layout.renderMode === 'DESIGN' ? certificateDesign(layout, template.name) : {}),
            ...(layout.sourceFile ? { sourceFile: { name: layout.sourceFile.name ?? '', mimeType: layout.sourceFile.mimeType ?? '' } } : {}),
          },
        };
      }),
      students: options,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to load certificate options.' });
  }
});

router.get('/issued', authMiddleware, async (req: TenantRequest, res: Response) => {
  const certificateAdmin = isTenantAdmin(req.user!) || req.user!.roles.some((role: { roleName: string }) => role.roleName === 'Branch Admin');
  if (!certificateAdmin) return res.status(403).json({ error: 'Certificate records are available to institution administrators.' });
  try {
    const records = await prisma.certificate.findMany({
      where: {
        template: { tenantId: req.tenantId! },
        ...(isTenantAdmin(req.user!) ? {} : { branchId: { in: req.user!.roles.filter((role: { roleName: string; branchId: string | null }) => role.roleName === 'Branch Admin' && role.branchId).map((role: { roleName: string; branchId: string | null }) => role.branchId!) } }),
      },
      include: { template: true, branch: true, student: { include: { user: true, grade: true } } },
      orderBy: { issuedDate: 'desc' },
      take: 250,
    });
    return res.json({ certificates: records.map((record) => {
      const snapshot = snapshotFromRecord({ ...record, template: { ...record.template, tenant: null } });
      return { certificateId: record.certificateId, status: record.status, issuedDate: record.issuedDate, studentName: snapshot.studentName, gradeName: snapshot.gradeName, branchName: snapshot.branchName, templateName: snapshot.templateName, templateType: snapshot.templateType, revokedAt: record.revokedAt, revocationReason: record.revocationReason };
    }) });
  } catch {
    return res.status(500).json({ error: 'Failed to load issued certificates.' });
  }
});

router.post('/:certificateId/revoke', authMiddleware, async (req: TenantRequest, res: Response) => {
  if (!isTenantAdmin(req.user!)) return res.status(403).json({ error: 'Only the Tenant Admin may revoke certificates.' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 5 || reason.length > 300) return res.status(400).json({ error: 'Enter a revocation reason between 5 and 300 characters.' });
  const record = await prisma.certificate.findFirst({ where: { certificateId: req.params.certificateId, template: { tenantId: req.tenantId! } } });
  if (!record) return res.status(404).json({ error: 'Certificate not found.' });
  if (record.status === 'REVOKED') return res.status(409).json({ error: 'Certificate is already revoked.' });
  await prisma.certificate.update({ where: { id: record.id }, data: { status: 'REVOKED', revokedAt: new Date(), revokedBy: req.user!.id, revocationReason: reason } });
  return res.json({ message: 'Certificate revoked.' });
});

router.post('/templates/:templateId/archive', authMiddleware, async (req: TenantRequest, res: Response) => {
  if (!isTenantAdmin(req.user!)) return res.status(403).json({ error: 'Only the Tenant Admin may archive certificate templates.' });
  const result = await prisma.certificateTemplate.updateMany({ where: { id: req.params.templateId, tenantId: req.tenantId!, status: 'ACTIVE' }, data: { status: 'ARCHIVED' } });
  if (!result.count) return res.status(404).json({ error: 'Active certificate template not found.' });
  return res.json({ message: 'Certificate template archived.' });
});

router.get(
  '/:certificateId/html',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    try {
      const certificate = await prisma.certificate.findFirst({
        where: { certificateId: req.params.certificateId, template: { tenantId: req.tenantId! } },
        include: {
          template: { include: { tenant: { select: { name: true } } } },
          branch: true,
          student: { include: { grade: true, user: true, studentParents: { include: { parent: true } } } },
        },
      });
      if (!certificate) return res.status(404).json({ error: 'Certificate not found.' });
      const ownsCertificate = certificate.student.userId === req.user!.id;
      const linkedParent = certificate.student.studentParents.some((link) => link.parent.userId === req.user!.id);
      const staffAccess = isTenantAdmin(req.user!) || canAccessBranch(req.user!, certificate.branchId);
      if (!ownsCertificate && !linkedParent && !staffAccess) return res.status(404).json({ error: 'Certificate not found.' });

      const layout = certificate.template.layoutConfig as HtmlCertificateLayout;
      if (layout.renderMode !== 'HTML' || !layout.html) return res.status(404).json({ error: 'This certificate template has no HTML rendering.' });
      const studentName = `${certificate.student.user.firstName} ${certificate.student.user.lastName}`.trim();
      const html = renderCertificateHtml(layout.html, {
        studentName,
        gradeName: certificate.student.grade?.name ?? 'Enrolled student',
        branchName: certificate.branch.name,
        templateName: certificate.template.name,
        certificateType: certificate.template.type,
        issuedDate: certificate.issuedDate.toLocaleDateString('en-GB'),
        certificateId: certificate.certificateId,
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data: https:");
      res.setHeader('Cache-Control', 'private, no-store');
      return res.send(html);
    } catch {
      return res.status(500).json({ error: 'Failed to render certificate HTML.' });
    }
  },
);

router.get(
  '/:certificateId/download',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    try {
      const certificate = await prisma.certificate.findFirst({
        where: {
          certificateId: req.params.certificateId,
          template: { tenantId: req.tenantId! },
        },
        include: {
          template: true,
          branch: true,
          student: {
            include: {
              grade: true,
              user: true,
              studentParents: { include: { parent: true } },
            },
          },
        },
      });
      if (!certificate) return res.status(404).json({ error: 'Certificate not found.' });

      const ownsCertificate = certificate.student.userId === req.user!.id;
      const linkedParent = certificate.student.studentParents.some((link) => link.parent.userId === req.user!.id);
      const staffAccess = isTenantAdmin(req.user!) || canAccessBranch(req.user!, certificate.branchId);
      if (!ownsCertificate && !linkedParent && !staffAccess) {
        return res.status(404).json({ error: 'Certificate not found.' });
      }

      const snapshot = snapshotFromRecord(certificate);
      const safeFileName = `${certificate.certificateId}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
      res.setHeader('Cache-Control', 'private, no-store');

      return res.send(await renderCertificatePdf(snapshot));
    } catch (error: any) {
      if (!res.headersSent) return res.status(500).json({ error: 'Failed to generate certificate PDF.' });
      res.end();
    }
  },
);

// 1. Create a Master Certificate Template (Tenant Admin only)
router.post(
  '/templates',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    if (!isTenantAdmin(req.user!)) {
      return res.status(403).json({ error: 'Only the Tenant Admin may create master certificate templates.' });
    }
    const { name, type, layoutConfig } = req.body;

    if (!name || !type || !layoutConfig) {
      return res.status(400).json({ error: 'Missing required parameters: name, type, layoutConfig.' });
    }
    if (!['COMPLETION', 'ACHIEVEMENT', 'ATTENDANCE', 'CUSTOM'].includes(String(type))) return res.status(400).json({ error: 'Choose a supported certificate type.' });
    const htmlLayout = layoutConfig as HtmlCertificateLayout;
    if (htmlLayout.renderMode === 'HTML' && (typeof htmlLayout.html !== 'string' || !htmlLayout.html.trim())) {
      return res.status(400).json({ error: 'HTML certificate templates require HTML content.' });
    }
    if (htmlLayout.renderMode === 'HTML' && htmlLayout.html!.length > 250_000) {
      return res.status(413).json({ error: 'HTML certificate templates must be smaller than 250 KB.' });
    }
    if (htmlLayout.renderMode === 'FILE') return res.status(400).json({ error: 'File-backed templates are being migrated. Create a structured certificate design.' });
    if (htmlLayout.renderMode && !['DESIGN', 'HTML'].includes(String(htmlLayout.renderMode))) return res.status(400).json({ error: 'Choose a supported certificate template format.' });
    const normalizedLayout = htmlLayout.renderMode === 'HTML' ? htmlLayout : certificateDesign(layoutConfig, String(name).trim());

    try {
      const template = await prisma.certificateTemplate.create({
        data: {
          tenantId: req.tenantId!,
          name: String(name).trim().slice(0, 120),
          type: type as CertificateType,
          layoutConfig: JSON.parse(JSON.stringify(normalizedLayout)),
        },
      });

      return res.status(201).json({ message: 'Certificate template created successfully.', template });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to create certificate template.' });
    }
  }
);

// 2. Issue a Certificate to a Student (Branch Admin / Tenant Admin)
router.post(
  '/issue',
  authMiddleware,
  hasPermission('issue_certificates'),
  async (req: TenantRequest, res: Response) => {
    const { studentId, templateId, branchId, studentNameHint, courseNameHint } = req.body;

    if (!studentId || !templateId || !branchId) {
      return res.status(400).json({ error: 'Missing required parameters: studentId, templateId, branchId.' });
    }
    if (!canAccessBranch(req.user!, branchId)) {
      return res.status(403).json({ error: 'You may only issue certificates for your assigned branch.' });
    }
    try {
      const [student, template, branch] = await Promise.all([
        prisma.student.findFirst({ where: {
          id: studentId,
          user: { tenantId: req.tenantId! },
          enrollments: { some: { status: { in: ['ACTIVE', 'BLOCKED'] }, class: { branchId } } },
        }, include: { user: true, grade: true } }),
        prisma.certificateTemplate.findFirst({ where: { id: templateId, tenantId: req.tenantId!, status: 'ACTIVE' }, include: { tenant: { select: { name: true } } } }),
        prisma.branch.findFirst({ where: { id: branchId, tenantId: req.tenantId! } }),
      ]);
      if (!student || !template || !branch) {
        return res.status(404).json({ error: 'Student, template, or branch was not found, or the student is not enrolled in this branch.' });
      }

      // Generate unique verification ID
      const verificationId = `CERT-${new Date().getFullYear()}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const issuedDate = new Date();
      const snapshot: CertificateSnapshot = {
        studentName: `${student.user.firstName} ${student.user.lastName}`.trim(),
        gradeName: student.grade?.name ?? 'Enrolled student',
        branchName: branch.name,
        institutionName: template.tenant.name,
        templateName: template.name,
        templateType: template.type,
        templateVersion: template.version,
        issuedDate: issuedDate.toLocaleDateString('en-GB'),
        certificateId: verificationId,
        design: certificateDesign(template.layoutConfig, template.name),
      };

      const certificate = await prisma.certificate.create({
        data: {
          certificateId: verificationId,
          studentId,
          templateId,
          branchId,
          issuerId: req.user!.id,
          issuedDate,
          pdfUrl: null,
          snapshot: JSON.parse(JSON.stringify(snapshot)),
        },
      });

      return res.status(201).json({
        message: 'Certificate successfully generated and assigned to student file.',
        certificate,
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to issue certificate.' });
    }
  }
);

// 3. Public Verification Validation (Public, bypasses tenant constraints in middleware)
router.get(
  '/verify/:verificationId',
  async (req: Request, res: Response) => {
    const { verificationId } = req.params;

    try {
      const cert = await prisma.certificate.findUnique({
        where: { certificateId: verificationId },
        include: {
          student: {
            include: {
              user: true,
            },
          },
          template: true,
        },
      });

      if (!cert) {
        return res.status(404).json({ error: 'Certificate verification failed. Record not found.' });
      }

      const snapshot = cert.snapshot && typeof cert.snapshot === 'object' ? cert.snapshot as unknown as CertificateSnapshot : null;
      return res.status(200).json({
        isValid: cert.status === 'ACTIVE',
        status: cert.status,
        certificateId: cert.certificateId,
        studentName: snapshot?.studentName ?? `${cert.student.user.firstName} ${cert.student.user.lastName}`,
        issuedDate: cert.issuedDate,
        templateName: snapshot?.templateName ?? cert.template.name,
        type: snapshot?.templateType ?? cert.template.type,
        institutionName: snapshot?.institutionName ?? null,
        branchName: snapshot?.branchName ?? null,
        revokedAt: cert.revokedAt,
        revocationReason: cert.status === 'REVOKED' ? cert.revocationReason : null,
      });
    } catch (error: any) {
      return res.status(503).json({ isValid: false, error: 'Certificate verification is temporarily unavailable.' });
    }
  }
);

export default router;
