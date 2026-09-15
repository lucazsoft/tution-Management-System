import { Prisma } from '@prisma/client';
import prisma from '../utils/db';

export interface PortalNoticeInput {
  id: string;
  title: string;
  message: string;
  icon: string;
  destination: string;
  occurredAt: string;
  channels?: string[];
  urgent?: boolean;
  studentId?: string;
}

export async function persistPortalNotifications(tenantId: string, userId: string, notices: PortalNoticeInput[]) {
  if (!notices.length) return [];
  await prisma.$transaction(notices.map((notice) => prisma.portalNotification.upsert({
    where: { tenantId_userId_sourceKey: { tenantId, userId, sourceKey: notice.id } },
    create: {
      tenantId, userId, studentId: notice.studentId, sourceKey: notice.id, title: notice.title,
      message: notice.message, icon: notice.icon, destination: notice.destination,
      channels: (notice.channels ?? []) as Prisma.InputJsonArray, urgent: Boolean(notice.urgent),
      occurredAt: new Date(notice.occurredAt),
    },
    update: {
      studentId: notice.studentId, title: notice.title, message: notice.message, icon: notice.icon,
      destination: notice.destination, channels: (notice.channels ?? []) as Prisma.InputJsonArray,
      urgent: Boolean(notice.urgent), occurredAt: new Date(notice.occurredAt),
    },
  })));
  const records = await prisma.portalNotification.findMany({
    where: { tenantId, userId, sourceKey: { in: notices.map((notice) => notice.id) } },
  });
  const bySource = new Map(records.map((record) => [record.sourceKey, record]));
  return notices.map((notice) => {
    const record = bySource.get(notice.id)!;
    return { ...notice, id: record.id, unread: record.readAt == null };
  });
}
