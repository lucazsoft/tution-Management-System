import { Router, Response } from 'express';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware } from '../middleware/auth';
import { scheduleApprovedPost, SocialPublishingError } from '../services/social-publishing';
import { prismaSocialPublishingRepository } from '../services/social-publishing-store';

const router = Router();

router.post('/posts/:id/schedule', authMiddleware, async (req: TenantRequest, res: Response) => {
  const scheduledFor = new Date(req.body?.scheduledFor);
  try {
    const post = await scheduleApprovedPost({
      actor: req.user!, tenantId: req.tenantId!, postId: req.params.id, scheduledFor,
    }, prismaSocialPublishingRepository);
    return res.json({ message: 'Approved social post scheduled.', post });
  } catch (error) {
    if (error instanceof SocialPublishingError) return res.status(error.statusCode).json({ error: error.message });
    throw error;
  }
});

export default router;
