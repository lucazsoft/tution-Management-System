import prisma from '../utils/db';
import { normalizeSchedule, SCHEDULE_DAYS } from '../utils/schedule';

const NEPAL_TIME_ZONE = 'Asia/Kathmandu';

export function nepalCalendarDate(value = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NEPAL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(number('year'), number('month') - 1, number('day')));
}

/**
 * The absolute instants bounding one Nepal calendar day.
 *
 * `nepalCalendarDate` returns UTC midnight of the Nepal date, which is a label
 * rather than a moment: the Nepal day itself runs from 18:15 UTC the previous
 * day (UTC+05:45). Timestamp columns store real instants, so day-scoped stamp
 * queries need this window, not the label.
 *
 * The offset is read from the IANA zone rather than hardcoded so the arithmetic
 * stays correct if Nepal's offset is ever redefined.
 */
export function nepalDayBounds(value = new Date()): { start: Date; end: Date } {
  const label = nepalCalendarDate(value);
  const offsetMinutes = nepalOffsetMinutes(value);
  const start = new Date(label.getTime() - offsetMinutes * 60_000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60_000 - 1) };
}

/** Minutes that Nepal local time is ahead of UTC at [value]. */
function nepalOffsetMinutes(value: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NEPAL_TIME_ZONE,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(value);
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  // Intl renders midnight as hour 24 in some runtimes; normalise it to 0.
  const hour = number('hour') % 24;
  const asUtc = Date.UTC(
    number('year'), number('month') - 1, number('day'),
    hour, number('minute'), number('second'),
  );
  return Math.round((asUtc - Math.floor(value.getTime() / 1000) * 1000) / 60_000);
}

export function nepalWeekday(value = new Date()): string {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: NEPAL_TIME_ZONE, weekday: 'short' }).format(value);
  return SCHEDULE_DAYS.find((day) => day === short) ?? short;
}

export async function generateDailyTeacherSessions(params: { tenantId: string; instant?: Date }) {
  const instant = params.instant ?? new Date();
  const date = nepalCalendarDate(instant);
  const day = nepalWeekday(instant);
  const classes = await prisma.class.findMany({
    where: {
      archivedAt: null,
      teacherId: { not: null },
      course: { tenantId: params.tenantId },
      AND: [
        { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: date } }] },
        { OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: date } }] },
      ],
    },
    select: { id: true, teacherId: true, schedule: true },
  });
  const scheduled = classes.filter((klass) => normalizeSchedule(klass.schedule).some((slot) => slot.day === day));
  const existing = await prisma.teacherSession.findMany({
    where: { date, classId: { in: scheduled.map((klass) => klass.id) } },
    select: { teacherId: true, classId: true },
  });
  const keys = new Set(existing.map((item) => `${item.teacherId}:${item.classId}`));
  const missing = scheduled.filter((klass) => klass.teacherId && !keys.has(`${klass.teacherId}:${klass.id}`));
  if (missing.length) await prisma.teacherSession.createMany({
    data: missing.map((klass) => ({ teacherId: klass.teacherId!, classId: klass.id, date })),
  });
  return { date, day, eligible: scheduled.length, created: missing.length };
}
