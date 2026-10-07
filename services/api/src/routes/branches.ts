import { Router, Response } from 'express';
import prisma from '../utils/db';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware, hasPermission } from '../middleware/auth';
import { isTenantAdmin, managedBranchIds } from '../utils/access-control';
import { parseGeofenceConfig, readGeofenceNumber } from '../utils/geo';

const router = Router();

// All branch operations are tenant-scoped: the tenant comes from the caller's
// verified session, so client-controlled tenant headers cannot cross boundaries.

// List only the branches the authenticated administrator is allowed to manage.
// Lower-privilege roles must use their role-specific/self-service contracts;
// this management projection includes attendance geofence configuration.
router.get('/', authMiddleware, async (req: TenantRequest, res: Response) => {
  const tenantWide = isTenantAdmin(req.user!);
  const branchIds = managedBranchIds(req.user!);
  if (!tenantWide && branchIds.length === 0) {
    return res.status(403).json({ error: 'Only Tenant Admins and assigned Branch Admins may list branches.' });
  }

  try {
    const branches = await prisma.branch.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(tenantWide ? {} : { id: { in: branchIds } }),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { courses: true } },
      },
    });

    return res.json({
      branches: await Promise.all(branches.map(async branch => {
        const staffCount = await prisma.user.count({
          where: {
            tenantId: req.tenantId!,
            status: 'ACTIVE',
            staffRecord: { isNot: null },
            userRoles: { some: { branchId: branch.id, role: { name: { not: 'Student' } } } },
          },
        });

        return {
          id: branch.id,
          name: branch.name,
          address: branch.address,
          latitude: branch.latitude,
          longitude: branch.longitude,
          radiusMeters: branch.radiusMeters,
          gracePeriodMinutes: branch.gracePeriodMinutes,
          admissionFee: branch.admissionFee,
          createdAt: branch.createdAt,
          staffCount,
          courseCount: branch._count.courses,
        };
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to list branches.', details: error.message });
  }
});

// Create a branch (Tenant Admin / manage_branches)
router.post('/', authMiddleware, hasPermission('manage_branches'), async (req: TenantRequest, res: Response) => {
  const { name, address, latitude, longitude, radiusMeters, gracePeriodMinutes, admissionFee } = req.body;

  if (!name || !address) {
    return res.status(400).json({ error: 'Branch name and address are required.' });
  }

  const geofence = parseGeofenceConfig({ latitude, longitude, radiusMeters });
  if (!geofence.success) {
    return res.status(400).json({ error: geofence.error });
  }

  let grace = 15;
  if (gracePeriodMinutes !== undefined && gracePeriodMinutes !== null && gracePeriodMinutes !== '') {
    const parsed = readGeofenceNumber(gracePeriodMinutes, 'gracePeriodMinutes');
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    grace = Math.round(parsed.data);
  }

  try {
    const branch = await prisma.branch.create({
      data: {
        tenantId: req.tenantId!,
        name: String(name).trim(),
        address: String(address).trim(),
        latitude: geofence.data.latitude,
        longitude: geofence.data.longitude,
        radiusMeters: geofence.data.radiusMeters,
        gracePeriodMinutes: grace,
        admissionFee: Number.isFinite(Number(admissionFee)) && Number(admissionFee) >= 0 ? Math.round(Number(admissionFee)) : 0,
      },
    });

    return res.status(201).json({ message: 'Branch created.', branch });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to create branch.', details: error.message });
  }
});

// Update a branch (Tenant Admin / manage_branches)
router.put('/:id', authMiddleware, hasPermission('manage_branches'), async (req: TenantRequest, res: Response) => {
  const { id } = req.params;
  const { name, address, latitude, longitude, radiusMeters, gracePeriodMinutes, admissionFee } = req.body;

  try {
    const existing = await prisma.branch.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== req.tenantId) {
      return res.status(404).json({ error: 'Branch not found.' });
    }

    const data: Record<string, unknown> = {};
    if (typeof name === 'string' && name.trim()) data.name = name.trim();
    if (typeof address === 'string' && address.trim()) data.address = address.trim();
    // Geofence fields are rejected rather than skipped when invalid: silently
    // dropping an out-of-range coordinate reported "Branch updated." while
    // leaving the fence where it was, which is indistinguishable from success.
    const geofenceFields = [
      ['latitude', latitude],
      ['longitude', longitude],
      ['radiusMeters', radiusMeters],
      ['gracePeriodMinutes', gracePeriodMinutes],
    ] as const;
    for (const [field, value] of geofenceFields) {
      if (value === undefined) continue;
      const parsed = readGeofenceNumber(value, field);
      if (!parsed.success) return res.status(400).json({ error: parsed.error });
      data[field] = field === 'gracePeriodMinutes' ? Math.round(parsed.data) : parsed.data;
    }
    if (admissionFee !== undefined && Number.isFinite(Number(admissionFee)) && Number(admissionFee) >= 0) {
      data.admissionFee = Math.round(Number(admissionFee));
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided to update.' });
    }

    const branch = await prisma.branch.update({ where: { id }, data });
    return res.json({ message: 'Branch updated.', branch });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update branch.', details: error.message });
  }
});

export default router;
