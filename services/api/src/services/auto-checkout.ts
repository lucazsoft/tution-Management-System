/**
 * Closes teacher attendance days that were never marked OUT.
 *
 * Without this, a teacher who forgets to check out (or who left the premises
 * before doing so) leaves an open IN stamp forever: `checkedIn` stays true in
 * the workspace payload and the day never resolves. The sequence guard in
 * routes/attendance.ts treats AUTO_OUT as "absent", so a later return on the
 * same day is correctly recorded as RE_IN.
 *
 * End of day is the Nepal calendar day boundary. Branch has no closing-time
 * field, so there is nothing more precise to key off; a branch-specific closing
 * time would make this job tighter and is the natural follow-up.
 */
import prisma from '../utils/db';
import { nepalCalendarDate, nepalDayBounds } from './timetable-service';
import { recordNotification } from './notification-records';

/** Stamp types that leave a teacher counted as on-site. */
const PRESENT_STAMP_TYPES = ['IN', 'RE_IN'];

export type AutoCheckoutResult = {
  /** The Nepal calendar day that was closed, as YYYY-MM-DD. */
  day: string;
  /** Teachers with at least one stamp in the window. */
  examined: number;
  /** Teachers whose open day was closed with an AUTO_OUT stamp. */
  closed: number;
};

type AutoCheckoutDb = Pick<typeof prisma, 'teacherAttendance' | 'notification'>;

/**
 * Closes every open attendance day for [tenantId].
 *
 * Defaults to the previous Nepal day: running against the current day would
 * close teachers who are still legitimately on-site. Pass [now] to target a
 * different day (the day containing that instant is the one closed).
 */
export async function runAutoCheckout(options: {
  tenantId: string;
  now?: Date;
  db?: AutoCheckoutDb;
}): Promise<AutoCheckoutResult> {
  const db = options.db ?? prisma;
  const reference = options.now ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { start, end } = nepalDayBounds(reference);

  const stamps = await db.teacherAttendance.findMany({
    where: {
      timestamp: { gte: start, lte: end },
      branch: { tenantId: options.tenantId },
    },
    orderBy: { timestamp: 'asc' },
    include: { branch: { select: { id: true, name: true, latitude: true, longitude: true } } },
  });

  // Last stamp wins per teacher; ascending order means later writes overwrite.
  const lastByTeacher = new Map<string, (typeof stamps)[number]>();
  for (const stamp of stamps) {
    lastByTeacher.set(stamp.userId, stamp);
  }

  let closed = 0;
  for (const [userId, stamp] of lastByTeacher) {
    if (!PRESENT_STAMP_TYPES.includes(stamp.stampType)) continue;

    // Recorded at the branch centre with zero accuracy: this stamp is
    // system-generated and no device reported a position for it. The AUTO_OUT
    // type is what marks it as synthetic to every reader.
    const created = await db.teacherAttendance.create({
      data: {
        userId,
        branchId: stamp.branchId,
        stampType: 'AUTO_OUT',
        latitude: stamp.branch.latitude,
        longitude: stamp.branch.longitude,
        gpsAccuracy: 0,
        timestamp: end,
      },
    });
    closed += 1;

    // Fail-open, as in the attendance routes: a notification failure must not
    // roll back a close, or the day would stay open until the next run.
    await recordNotification(db, {
      tenantId: options.tenantId,
      userId,
      branchId: stamp.branchId,
      category: 'ATTENDANCE',
      title: 'Attendance closed automatically',
      body: `You were not marked OUT at ${stamp.branch.name}, so the day was closed automatically.`,
      destination: 'attendance',
      entityId: created.id,
    });
  }

  return {
    // The Nepal calendar label, not `start`: the window opens at 18:15 UTC on
    // the previous calendar day, so slicing `start` would report the day before.
    day: nepalCalendarDate(reference).toISOString().slice(0, 10),
    examined: lastByTeacher.size,
    closed,
  };
}
