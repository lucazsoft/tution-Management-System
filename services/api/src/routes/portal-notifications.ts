import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { TenantRequest } from '../middleware/tenant';
import prisma from '../utils/db';

const router = Router();

router.post('/read', authMiddleware, async (req: TenantRequest, res: Response) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id: unknown): id is string => typeof id === 'string' && id.length <= 128) : [];
  if (!ids.length) return res.status(400).json({ error: 'At least one notification ID is required.' });
  await prisma.portalNotification.updateMany({
    where: { id: { in: ids }, tenantId: req.tenantId!, userId: req.user!.id },
    data: { readAt: new Date() },
  });
  return res.json({ message: 'Notifications marked as read.' });
});

export default router;
