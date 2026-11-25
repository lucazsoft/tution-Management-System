import prisma from '../utils/db';
import { nepalCalendarDate } from './timetable-service';

/**
 * Past daily updates a teacher still owes. This is the single definition used by
 * the Mark IN guard (routes/attendance.ts) and by the teacher workspace list, so
 * the portal always shows every session that blocks check-in. It deliberately
 * ignores which teacher owns the class today: a session assigned to the teacher
 * on its date still needs their update after the class is reassigned.
 */
export function pendingPastSessionWhere(teacherId: string, tenantId: string, today = nepalCalendarDate()) {
  return {
    teacherId,
    dailyUpdateSubmitted: false,
    date: { lt: today },
    class: { course: { tenantId } },
  };
}

export async function listPendingPastUpdates(teacherId: string, tenantId: string) {
  const sessions = await prisma.teacherSession.findMany({
    where: pendingPastSessionWhere(teacherId, tenantId),
    include: { class: { include: { course: true } } },
    orderBy: { date: 'desc' },
    take: 200,
  });
  return sessions.map((session) => ({
    sessionId: session.id,
    classId: session.classId,
    className: session.class.name,
    courseName: session.class.course.name,
    date: session.date,
  }));
}

/** Past sessions that block check-in first, then any other listed session (for example today's), without duplicates. */
export function mergePendingUpdates<T extends { sessionId: string }>(blocking: T[], listed: T[]): T[] {
  const seen = new Set(blocking.map((item) => item.sessionId));
  return [...blocking, ...listed.filter((item) => !seen.has(item.sessionId))];
}
