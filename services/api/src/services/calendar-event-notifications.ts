import prisma from '../utils/db';
import { PushNotificationService } from './push-notification';
import {
  AUDIENCE_NOTIFIES,
  currentEnrollmentWhere,
  type CalendarAudience,
  type CalendarReader,
} from './calendar-access';

export type PublishedCalendarEvent = {
  id: string;
  tenantId: string;
  branchId: string | null;
  classId: string | null;
  audience: string;
  title: string;
  description?: string | null;
  eventType: string;
  startDate: Date;
  endDate: Date;
};

export const CALENDAR_NOTIFICATION_CATEGORY = 'CALENDAR';

/** In-app destination per reader; also used as the push deep link. */
export const CALENDAR_DESTINATIONS: Record<CalendarReader, string> = {
  TEACHER: '/teacher/calendar',
  PARENT: '/parent/calendar',
  STUDENT: '/student/calendar',
};

// When one person holds several reader roles they get a single notification
// that opens the first portal in this order.
const READER_PRIORITY: CalendarReader[] = ['TEACHER', 'PARENT', 'STUDENT'];

type RecipientDb = {
  student: { findMany(args: any): Promise<Array<{ userId: string; studentParents: Array<{ parent: { userId: string } }> }>> };
  class: { findMany(args: any): Promise<Array<{ teacherId: string | null }>> };
  userRole: { findMany(args: any): Promise<Array<{ userId: string }>> };
};

type NotifyDb = RecipientDb & {
  notification: { createMany(args: { data: Array<Record<string, unknown>> }): Promise<unknown> };
};

type PushSender = {
  sendPushToUsers(
    tenantId: string,
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<{ sent: number; failed: number }>;
};

/**
 * Resolves the users an event is designated to, mirroring the calendar
 * read scope in `calendarAccessWhere`: tenant-wide events reach everyone in
 * the institution, branch events reach that branch, class events reach that
 * class, and the audience decides which reader roles are included.
 */
export async function resolveCalendarRecipients(
  db: RecipientDb,
  event: PublishedCalendarEvent,
  now = new Date(),
): Promise<Map<string, CalendarReader>> {
  const readers = new Set(AUDIENCE_NOTIFIES[event.audience as CalendarAudience] ?? []);
  const byRole: Record<CalendarReader, Set<string>> = { STUDENT: new Set(), PARENT: new Set(), TEACHER: new Set() };
  const classScope = {
    archivedAt: null,
    course: { tenantId: event.tenantId },
    ...(event.classId ? { id: event.classId } : event.branchId ? { branchId: event.branchId } : {}),
  };
  const activeUser = { tenantId: event.tenantId, status: 'ACTIVE' };

  if (readers.has('STUDENT') || readers.has('PARENT')) {
    const enrollment = currentEnrollmentWhere(now);
    const students = await db.student.findMany({
      where: {
        user: activeUser,
        enrollments: { some: { ...enrollment, class: { ...(enrollment.class as object), ...classScope } } },
      },
      select: {
        userId: true,
        studentParents: {
          where: { parent: { user: activeUser } },
          select: { parent: { select: { userId: true } } },
        },
      },
    });
    for (const student of students) {
      if (readers.has('STUDENT')) byRole.STUDENT.add(student.userId);
      if (readers.has('PARENT')) student.studentParents.forEach((link) => byRole.PARENT.add(link.parent.userId));
    }
  }

  if (readers.has('TEACHER')) {
    const [classes, branchTeachers] = await Promise.all([
      db.class.findMany({
        where: { ...classScope, teacherId: { not: null }, assignedTeacher: { is: activeUser } },
        select: { teacherId: true },
      }),
      // Class-specific events stay with that class's teacher; branch and
      // tenant-wide events also reach teachers assigned to the branch.
      event.classId ? Promise.resolve([]) : db.userRole.findMany({
        where: {
          role: { name: 'Teacher' },
          user: activeUser,
          ...(event.branchId ? { branchId: event.branchId } : {}),
        },
        select: { userId: true },
      }),
    ]);
    classes.forEach((entry) => entry.teacherId && byRole.TEACHER.add(entry.teacherId));
    branchTeachers.forEach((entry) => byRole.TEACHER.add(entry.userId));
  }

  const recipients = new Map<string, CalendarReader>();
  for (const reader of READER_PRIORITY) {
    for (const userId of byRole[reader]) if (!recipients.has(userId)) recipients.set(userId, reader);
  }
  return recipients;
}

const EVENT_LABELS: Record<string, string> = {
  HOLIDAY: 'Holiday',
  EXAM: 'Exam',
  FEE_DUE: 'Fee deadline',
  EVENT: 'Event',
};

function formatDay(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kathmandu',
  });
}

export function calendarNotificationText(event: PublishedCalendarEvent) {
  const label = EVENT_LABELS[event.eventType] ?? 'Event';
  const start = formatDay(event.startDate);
  const end = formatDay(event.endDate);
  const when = start === end ? start : `${start} – ${end}`;
  const details = event.description?.trim().replace(/\s+/g, ' ');
  const body = details ? `${when}. ${details.length > 140 ? `${details.slice(0, 137)}…` : details}` : when;
  return { title: `${label}: ${event.title}`, body };
}

/**
 * Writes an inbox notification for every designated recipient and pushes it
 * to their registered devices. Fail-open: an event is already saved when this
 * runs, so delivery problems are logged and reported, never thrown.
 */
export async function notifyCalendarEventPublished(
  event: PublishedCalendarEvent,
  options: { actorId?: string; db?: NotifyDb; push?: PushSender; now?: Date } = {},
): Promise<{ recipients: number; pushed: number }> {
  const db = options.db ?? (prisma as unknown as NotifyDb);
  const push = options.push ?? PushNotificationService;
  try {
    const recipients = await resolveCalendarRecipients(db, event, options.now);
    if (options.actorId) recipients.delete(options.actorId);
    if (!recipients.size) return { recipients: 0, pushed: 0 };

    const { title, body } = calendarNotificationText(event);
    const rows = [...recipients].map(([userId, reader]) => ({
      tenantId: event.tenantId,
      userId,
      ...(event.branchId ? { branchId: event.branchId } : {}),
      category: CALENDAR_NOTIFICATION_CATEGORY,
      title,
      body,
      destination: CALENDAR_DESTINATIONS[reader],
      entityId: event.id,
    }));
    for (let offset = 0; offset < rows.length; offset += 1000) {
      await db.notification.createMany({ data: rows.slice(offset, offset + 1000) });
    }

    let pushed = 0;
    const results = await Promise.allSettled(READER_PRIORITY.map((reader) => {
      const userIds = [...recipients].filter(([, role]) => role === reader).map(([userId]) => userId);
      return userIds.length
        ? push.sendPushToUsers(event.tenantId, userIds, title, body, {
          deepLink: CALENDAR_DESTINATIONS[reader],
          category: CALENDAR_NOTIFICATION_CATEGORY,
          eventId: event.id,
        })
        : Promise.resolve({ sent: 0, failed: 0 });
    }));
    results.forEach((result) => { if (result.status === 'fulfilled') pushed += result.value.sent; });
    return { recipients: recipients.size, pushed };
  } catch (error) {
    console.warn(JSON.stringify({
      event: 'CALENDAR_NOTIFICATION_FAILED',
      tenantId: event.tenantId,
      academicEventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    }));
    return { recipients: 0, pushed: 0 };
  }
}
