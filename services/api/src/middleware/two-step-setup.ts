import { Response, NextFunction } from 'express';
import { TenantRequest } from './tenant';
import prisma from '../utils/db';
import { trustedSecurityMobile } from '../utils/security-mobile';
import { authenticationSmsConfigured } from '../utils/delivery';

export async function requireVerifiedMobileForSetup(req: TenantRequest, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findFirst({ where: { id: req.user!.id, tenantId: req.tenantId! } });
    if (!user || user.status !== 'ACTIVE' || !trustedSecurityMobile(user)) return res.status(409).json({ error: 'Verify your security mobile before setting up two-step sign-in.' });
    if (!authenticationSmsConfigured()) return res.status(503).json({ error: 'SMS authentication is temporarily unavailable.' });
    return next();
  } catch { return res.status(503).json({ error: 'Unable to check mobile verification.' }); }
}
