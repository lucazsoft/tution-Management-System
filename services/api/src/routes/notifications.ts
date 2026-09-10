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

export default router;
