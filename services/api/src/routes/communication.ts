import { Router, Response } from 'express';
import prisma from '../utils/db';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware } from '../middleware/auth';
import { PushNotificationService } from '../services/push-notification';
import { isTenantAdmin, managedBranchIds } from '../utils/access-control';
import { parseStrictKeys, readTrimmedString } from '../utils/request-validation';

const router = Router();

async function canUseThread(userId: string, tenantId: string, studentId: string, otherUserId?: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, user: { tenantId } },
    include: {
      studentParents: { include: { parent: true } },
      enrollments: { where: { status: { in: ['ACTIVE', 'BLOCKED'] } }, include: { class: true } },
    },
  });
  if (!student) return null;
  const parentUserIds = student.studentParents.map((link) => link.parent.userId);
  const teacherIds = student.enrollments.map((enrollment) => enrollment.class.teacherId).filter((id): id is string => Boolean(id));
  const branchIds = [...new Set(student.enrollments.map((enrollment) => enrollment.class.branchId))];
  const adminIds = (await prisma.userRole.findMany({ where: { branchId: { in: branchIds }, role: { name: 'Branch Admin' }, user: { tenantId } }, select: { userId: true } })).map((role) => role.userId);
  const userIsParent = parentUserIds.includes(userId);
  const userIsTeacher = teacherIds.includes(userId);
  const userIsAdmin = adminIds.includes(userId);
  if (!userIsParent && !userIsTeacher && !userIsAdmin) return null;
  if (otherUserId && userIsParent && !teacherIds.includes(otherUserId) && !adminIds.includes(otherUserId)) return null;
  if (otherUserId && userIsTeacher && !parentUserIds.includes(otherUserId)) return null;
  if (otherUserId && userIsAdmin && !parentUserIds.includes(otherUserId)) return null;
  return { student, parentUserIds, teacherIds, adminIds, userIsParent };
}

router.get('/admin/parent-contacts', authMiddleware, async (req: TenantRequest, res: Response) => {
  const branchIds = managedBranchIds(req.user!);
  if (!branchIds.length) return res.status(403).json({ error: 'Only a Branch Admin may view branch parent contacts.' });
  try {
    const links = await prisma.studentParent.findMany({
      where: { student: { user: { tenantId: req.tenantId!, userRoles: { some: { branchId: { in: branchIds } } } } } },
      include: { student: { include: { grade: { select: { name: true } }, user: { select: { firstName: true, lastName: true, userRoles: { include: { branch: true } } } } } }, parent: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } } } },
      orderBy: { student: { user: { firstName: 'asc' } } },
    });
    const contacts = links.map((link) => ({ studentId: link.studentId, studentName: `${link.student.user.firstName} ${link.student.user.lastName}`.trim(), gradeName: link.student.grade?.name ?? 'Grade not assigned', branchName: link.student.user.userRoles.find((role) => role.branchId && branchIds.includes(role.branchId))?.branch?.name ?? 'Branch', parentId: link.parent.user.id, parentName: `${link.parent.user.firstName} ${link.parent.user.lastName}`.trim(), parentEmail: link.parent.user.email, parentPhone: link.parent.user.phone }));
    return res.json({ contacts });
  } catch (error: any) { return res.status(500).json({ error: 'Failed to load parent contacts.', details: error.message }); }
});

router.post('/messages', authMiddleware, async (req: TenantRequest, res: Response) => {
  const { studentId, receiverId, messageText } = req.body;
  const text = typeof messageText === 'string' ? messageText.trim() : '';
  if (!studentId || !receiverId || !text) {
    return res.status(400).json({ error: 'Student, recipient, and message are required.' });
  }
  if (text.length > 4000) return res.status(422).json({ error: 'Message must be 4,000 characters or fewer.' });
  try {
    const access = await canUseThread(req.user!.id, req.tenantId!, studentId, receiverId);
    if (!access) return res.status(403).json({ error: 'You may only message an assigned teacher or linked parent for this student.' });
    const message = await prisma.parentMessage.create({
      data: { tenantId: req.tenantId!, studentId, senderId: req.user!.id, receiverId, messageText: text },
    });
    await PushNotificationService.sendPush(req.tenantId!, receiverId, 'New school message', `New message regarding ${access.student.id}.`);
    return res.status(201).json({ message: 'Message sent.', record: message });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to send message.', details: error.message });
  }
});

router.get('/messages/thread/:studentId', authMiddleware, async (req: TenantRequest, res: Response) => {
  const teacherId = typeof req.query.teacherId === 'string' ? req.query.teacherId : undefined;
  try {
    const access = await canUseThread(req.user!.id, req.tenantId!, req.params.studentId, teacherId);
    if (!access) return res.status(404).json({ error: 'Conversation not found.' });
    const participantIds = teacherId ? [req.user!.id, teacherId] : [req.user!.id];
    const messages = await prisma.parentMessage.findMany({
      where: {
        tenantId: req.tenantId!,
        studentId: req.params.studentId,
        ...(teacherId ? {
          OR: [
            { senderId: participantIds[0], receiverId: participantIds[1] },
            { senderId: participantIds[1], receiverId: participantIds[0] },
          ],
        } : { OR: [{ senderId: req.user!.id }, { receiverId: req.user!.id }] }),
      },
      include: { sender: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    await prisma.parentMessage.updateMany({
      where: { id: { in: messages.filter((message) => message.receiverId === req.user!.id && !message.readAt).map((message) => message.id) } },
      data: { readAt: new Date() },
    });
    return res.json({ messages });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to load conversation.' });
  }
});

router.post('/broadcast', authMiddleware, async (req: TenantRequest, res: Response) => {
  if (!isTenantAdmin(req.user!)) return res.status(403).json({ error: 'Only the Tenant Admin may broadcast.' });
  const shape = parseStrictKeys(req.body, ['title', 'message', 'audienceRoles']);
  if (!shape.success) return res.status(400).json({ error: shape.error });
  const title = readTrimmedString(shape.data, 'title', { required: true, maxLength: 160, message: 'A broadcast title is required and must be 160 characters or fewer.' });
  const message = readTrimmedString(shape.data, 'message', { required: true, maxLength: 4_000, message: 'A broadcast message is required and must be 4000 characters or fewer.' });
  if (!title.success) return res.status(400).json({ error: title.error });
  if (!message.success) return res.status(400).json({ error: message.error });
  const audienceRoles = shape.data.audienceRoles;
  if (audienceRoles !== undefined && (!Array.isArray(audienceRoles) || audienceRoles.length > 8 || audienceRoles.some((role) => typeof role !== 'string' || role.trim().length === 0 || role.length > 64))) {
    return res.status(400).json({ error: 'audienceRoles must be an array of up to eight role names.' });
  }
  const normalizedAudienceRoles = audienceRoles === undefined
    ? undefined
    : [...new Set((audienceRoles as string[]).map((role: string) => role.trim()))];
  try {
    const record = await prisma.broadcast.create({
      data: {
        tenantId: req.tenantId!,
        authorId: req.user!.id,
        title: title.data,
        message: message.data,
        audienceRoles: normalizedAudienceRoles,
      },
    });
    return res.status(201).json({ message: 'Broadcast published.', broadcast: record });
  } catch {
    return res.status(500).json({ error: 'Failed to publish broadcast.' });
  }
});

router.get('/broadcasts', authMiddleware, async (req: TenantRequest, res: Response) => {
  try {
    const roleNames = new Set(req.user!.roles.map((role: { roleName: string }) => role.roleName));
    const records = await prisma.broadcast.findMany({
      where: { tenantId: req.tenantId! },
      include: { author: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const broadcasts = records.filter((record) => {
      const audience = Array.isArray(record.audienceRoles) ? record.audienceRoles.filter((role: unknown): role is string => typeof role === 'string') : [];
      return audience.length === 0 || audience.some((role) => roleNames.has(role));
    });
    return res.json({ broadcasts });
  } catch {
    return res.status(500).json({ error: 'Failed to load broadcasts.' });
  }
});

export default router;
