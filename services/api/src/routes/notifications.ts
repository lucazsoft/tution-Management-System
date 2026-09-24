import { Router, Response } from 'express';
import { PushPlatform } from '@prisma/client';
import prisma from '../utils/db';
import { authMiddleware } from '../middleware/auth';
import { TenantRequest } from '../middleware/tenant';

const router = Router();
const tokenPattern = /^[A-Za-z0-9_:\-]{32,4096}$/;
const platforms: Record<string, PushPlatform> = {
  android: PushPlatform.ANDROID,
  ios: PushPlatform.IOS,
  web: PushPlatform.WEB,
};

function validToken(value: unknown): value is string {
  return typeof value === 'string' && tokenPattern.test(value);
}

router.post('/devices/register', authMiddleware, async (req: TenantRequest, res: Response) => {
  const token = req.body?.token;
  const requestedPlatform = req.body?.platform;
  const platform = typeof requestedPlatform === 'string'
    ? platforms[requestedPlatform.toLowerCase()]
    : undefined;

  if (!validToken(token) || !platform) {
    return res.status(400).json({ error: 'A valid push token and platform are required.' });
  }

  await prisma.devicePushToken.upsert({
    where: { token },
    create: {
      token,
      platform,
      tenantId: req.tenantId!,
      userId: req.user!.id,
    },
    update: {
      platform,
      tenantId: req.tenantId!,
      userId: req.user!.id,
    },
  });

  return res.status(201).json({ registered: true });
});

router.post('/devices/unregister', authMiddleware, async (req: TenantRequest, res: Response) => {
  const token = req.body?.token;
  if (!validToken(token)) {
    return res.status(400).json({ error: 'A valid push token is required.' });
  }

  await prisma.devicePushToken.deleteMany({
    where: {
      token,
      tenantId: req.tenantId!,
      userId: req.user!.id,
    },
  });

  return res.json({ unregistered: true });
});

const notificationStore = () => (prisma as any).notification;

function readPageParam(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

// Persistent notification inbox. Identity always comes from the Better Auth
// session cookie via authMiddleware — tenant/user ids in query or body are
// ignored so one session can never list or mutate another user's records.
router.get('/', authMiddleware, async (req: TenantRequest, res: Response) => {
  const page = readPageParam(req.query?.page, 1, 10_000);
  const pageSize = readPageParam(req.query?.pageSize, 20, 100);
  const where = { tenantId: req.tenantId!, userId: req.user!.id };

  const [records, total, unreadCount] = await Promise.all([
    notificationStore().findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    notificationStore().count({ where }),
    notificationStore().count({ where: { ...where, readAt: null } }),
  ]);

  return res.json({ notifications: records, page, pageSize, total, unreadCount });
});

router.post('/:id/read', authMiddleware, async (req: TenantRequest, res: Response) => {
  const id = typeof req.params?.id === 'string' ? req.params.id : '';
  if (!id) return res.status(400).json({ error: 'A notification id is required.' });

  const result = await notificationStore().updateMany({
    where: { id, tenantId: req.tenantId!, userId: req.user!.id },
    data: { readAt: new Date() },
  });
  if (result.count !== 1) {
    return res.status(404).json({ error: 'Notification not found.' });
  }
  return res.json({ read: true, id });
});

router.post('/read-all', authMiddleware, async (req: TenantRequest, res: Response) => {
  const result = await notificationStore().updateMany({
    where: { tenantId: req.tenantId!, userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  return res.json({ updated: result.count });
});

export default router;
