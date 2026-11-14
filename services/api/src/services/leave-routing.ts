import type { PrismaClient } from '@prisma/client';
import { normalizeSchedule, SCHEDULE_DAYS } from '../utils/schedule';

/**
 * Leave approval routing.
 *
 * Rules (agreed with the product owner, 2026-11-14):
 * - Staff: the Branch Admin decides (L1). A request longer than
 *   `staffL2DaysOver` working days, or of an always-L2 type (Long Sick), also
 *   needs the Tenant Admin (L2).
 * - Students: the Branch Admin's decision is always final.
 * - Working days for staff are the days the person would normally mark IN:
 *   weekdays on their timetable, excluding Saturdays and academic-calendar
 *   holidays. Staff without a timetable fall back to every day except
 *   Saturday and holidays.
 * - A staff request the branch leaves unanswered for `escalateAfterHours`
 *   becomes actionable by the Tenant Admin.
 *
 * All values are snapshotted onto the Leave row at submission, so editing the
 * tenant policy never reroutes a request already in flight.
 */

export interface LeavePolicy {
  staffL2DaysOver: number;
  alwaysL2Types: string[];
  escalateAfterHours: number | null;
}

export const DEFAULT_LEAVE_POLICY: LeavePolicy = {
  staffL2DaysOver: 3,
  alwaysL2Types: ['LONG_SICK'],
  escalateAfterHours: 48,
};

const WEEKLY_OFF_DAY = 'Sat';
const NEPAL_OFFSET_MS = 345 * 60_000;

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Reads the tenant's `leavePolicy` JSON, falling back to defaults for anything missing or malformed. */
export function resolveLeavePolicy(raw: unknown): LeavePolicy {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const staffL2DaysOver = positiveInt(source.staffL2DaysOver) ?? DEFAULT_LEAVE_POLICY.staffL2DaysOver;
  const alwaysL2Types = Array.isArray(source.alwaysL2Types) && source.alwaysL2Types.every((item) => typeof item === 'string')
    ? source.alwaysL2Types as string[]
    : DEFAULT_LEAVE_POLICY.alwaysL2Types;
  const escalateAfterHours = source.escalateAfterHours === null
    ? null
    : positiveInt(source.escalateAfterHours) || DEFAULT_LEAVE_POLICY.escalateAfterHours;
  return { staffL2DaysOver, alwaysL2Types, escalateAfterHours };
}

/** Calendar date (YYYY-MM-DD) of an instant in Nepal time. Date-only inputs (UTC midnight) keep their date. */
export function nepalDateKey(value: Date): string {
  return new Date(value.getTime() + NEPAL_OFFSET_MS).toISOString().slice(0, 10);
}

/** Inclusive list of YYYY-MM-DD keys between two instants, in Nepal time. */
export function dateKeysBetween(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(`${nepalDateKey(start)}T00:00:00Z`);
  const last = nepalDateKey(end);
  // Hard cap guards against absurd ranges; requests are validated well below this.
  for (let guard = 0; guard < 400; guard += 1) {
    const key = cursor.toISOString().slice(0, 10);
    keys.push(key);
    if (key >= last) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function weekdayOf(key: string): string {
  return SCHEDULE_DAYS[new Date(`${key}T00:00:00Z`).getUTCDay()];
}

export interface TimetableClass {
  schedule: unknown;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
}

export interface WorkingDayInput {
  start: Date;
  end: Date;
  /** Classes the staff member teaches; empty for non-teaching staff. */
  classes: TimetableClass[];
  /** Holiday ranges (academic calendar HOLIDAY events) relevant to the branch. */
  holidays: Array<{ startDate: Date; endDate: Date }>;
}

/** Counts the working days a leave covers, per the rules at the top of this file. */
export function countWorkingDays({ start, end, classes, holidays }: WorkingDayInput): number {
  const holidayKeys = new Set(holidays.flatMap((holiday) => dateKeysBetween(holiday.startDate, holiday.endDate)));
  const timetable = classes.map((klass) => ({
    days: new Set(normalizeSchedule(klass.schedule).map((slot) => slot.day)),
    from: klass.effectiveFrom ? nepalDateKey(klass.effectiveFrom) : null,
    until: klass.effectiveUntil ? nepalDateKey(klass.effectiveUntil) : null,
  })).filter((klass) => klass.days.size > 0);

  return dateKeysBetween(start, end).filter((key) => {
    const weekday = weekdayOf(key);
    if (weekday === WEEKLY_OFF_DAY || holidayKeys.has(key)) return false;
    if (!timetable.length) return true;
    return timetable.some((klass) =>
      klass.days.has(weekday)
      && (!klass.from || klass.from <= key)
      && (!klass.until || klass.until >= key));
  }).length;
}

export interface RoutingDecision {
  requiredLevel: 1 | 2;
  escalatesAt: Date | null;
}

export function routeLeave(input: {
  subjectType: 'STAFF' | 'STUDENT';
  leaveType: string;
  days: number;
  policy: LeavePolicy;
  submittedAt: Date;
}): RoutingDecision {
  const { subjectType, leaveType, days, policy, submittedAt } = input;
  if (subjectType === 'STUDENT') return { requiredLevel: 1, escalatesAt: null };
  const needsL2 = policy.alwaysL2Types.includes(leaveType) || days > policy.staffL2DaysOver;
  const escalatesAt = policy.escalateAfterHours
    ? new Date(submittedAt.getTime() + policy.escalateAfterHours * 3_600_000)
    : null;
  return { requiredLevel: needsL2 ? 2 : 1, escalatesAt };
}

/** True when a PENDING staff leave has sat at the branch past its escalation time. */
export function isEscalated(leave: { status: string; escalatesAt: Date | null }, now = new Date()): boolean {
  return leave.status === 'PENDING' && Boolean(leave.escalatesAt && leave.escalatesAt.getTime() <= now.getTime());
}

/** Loads the timetable and holidays needed to count a staff member's working days. */
export async function loadWorkingDayContext(
  db: Pick<PrismaClient, 'class' | 'academicEvent'>,
  params: { tenantId: string; branchId: string; userId: string; start: Date; end: Date },
): Promise<Pick<WorkingDayInput, 'classes' | 'holidays'>> {
  const [classes, holidays] = await Promise.all([
    db.class.findMany({
      where: { teacherId: params.userId, archivedAt: null, course: { tenantId: params.tenantId } },
      select: { schedule: true, effectiveFrom: true, effectiveUntil: true },
    }),
    db.academicEvent.findMany({
      where: {
        tenantId: params.tenantId,
        eventType: 'HOLIDAY',
        OR: [{ branchId: null }, { branchId: params.branchId }],
        startDate: { lte: params.end },
        endDate: { gte: new Date(params.start.getTime() - 86_400_000) },
      },
      select: { startDate: true, endDate: true },
    }),
  ]);
  return { classes, holidays };
}

export const APPROVED_LEAVE_STATUS = 'APPROVED_LEVEL2' as const;
