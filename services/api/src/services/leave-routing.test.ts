import assert from 'node:assert/strict';
import {
  countWorkingDays,
  dateKeysBetween,
  DEFAULT_LEAVE_POLICY,
  isEscalated,
  nepalDateKey,
  resolveLeavePolicy,
  routeLeave,
} from './leave-routing';

const d = (value: string) => new Date(value);
// 2026-11-15 is a Sunday; 2026-11-21 is a Saturday.
const SUN = '2026-11-15';

// --- Nepal date keys ---
assert.equal(nepalDateKey(d('2026-11-15')), '2026-11-15', 'date-only input keeps its date');
assert.equal(nepalDateKey(d('2026-11-14T18:30:00Z')), '2026-11-15', '00:15 NPT is already the next day');
assert.deepEqual(dateKeysBetween(d('2026-11-30'), d('2026-12-02')), ['2026-11-30', '2026-12-01', '2026-12-02']);

// --- Working days: no timetable → every day except Saturday ---
assert.equal(countWorkingDays({ start: d(SUN), end: d('2026-11-21'), classes: [], holidays: [] }), 6);
assert.equal(countWorkingDays({ start: d('2026-11-21'), end: d('2026-11-21'), classes: [], holidays: [] }), 0, 'Saturday only');

// --- Holidays are skipped ---
assert.equal(countWorkingDays({
  start: d(SUN), end: d('2026-11-21'), classes: [],
  holidays: [{ startDate: d('2026-11-17'), endDate: d('2026-11-18') }],
}), 4);

// --- Timetable days: Sun/Tue/Thu teacher taking Sun–Fri off = 3 days ---
const sunTueThu = [{
  schedule: [
    { day: 'Sun', startTime: '07:00', endTime: '08:00', room: 'A' },
    { day: 'Tue', startTime: '07:00', endTime: '08:00', room: 'A' },
    { day: 'Thu', startTime: '07:00', endTime: '08:00', room: 'A' },
  ],
  effectiveFrom: null, effectiveUntil: null,
}];
assert.equal(countWorkingDays({ start: d(SUN), end: d('2026-11-20'), classes: sunTueThu, holidays: [] }), 3);

// Saturday on a timetable still does not count.
assert.equal(countWorkingDays({
  start: d('2026-11-21'), end: d('2026-11-21'), holidays: [],
  classes: [{ schedule: [{ day: 'Sat', startTime: '07:00', endTime: '08:00', room: '' }], effectiveFrom: null, effectiveUntil: null }],
}), 0);

// A class that ends mid-leave stops contributing after effectiveUntil.
assert.equal(countWorkingDays({
  start: d(SUN), end: d('2026-11-20'), holidays: [],
  classes: [{ ...sunTueThu[0], effectiveUntil: d('2026-11-17') }],
}), 2, 'Sun + Tue only');

// --- Policy parsing ---
assert.deepEqual(resolveLeavePolicy(null), DEFAULT_LEAVE_POLICY);
assert.deepEqual(resolveLeavePolicy({ staffL2DaysOver: 'x', escalateAfterHours: -4 }), DEFAULT_LEAVE_POLICY);
assert.equal(resolveLeavePolicy({ staffL2DaysOver: 5 }).staffL2DaysOver, 5);
assert.equal(resolveLeavePolicy({ escalateAfterHours: null }).escalateAfterHours, null);

// --- Routing matrix ---
const at = d('2026-11-14T06:00:00Z');
const route = (subjectType: 'STAFF' | 'STUDENT', leaveType: string, days: number) =>
  routeLeave({ subjectType, leaveType, days, policy: DEFAULT_LEAVE_POLICY, submittedAt: at });
assert.equal(route('STAFF', 'CASUAL', 3).requiredLevel, 1, 'staff 3 days → branch only');
assert.equal(route('STAFF', 'CASUAL', 4).requiredLevel, 2, 'staff 4 days → tenant too');
assert.equal(route('STAFF', 'SICK', 4).requiredLevel, 2);
assert.equal(route('STAFF', 'LONG_SICK', 1).requiredLevel, 2, 'long sick always L2');
assert.equal(route('STUDENT', 'CASUAL', 30).requiredLevel, 1, 'students stay with the branch');
assert.equal(route('STUDENT', 'LONG_SICK', 30).requiredLevel, 1);
assert.equal(route('STUDENT', 'CASUAL', 1).escalatesAt, null, 'students never escalate');
assert.equal(route('STAFF', 'CASUAL', 1).escalatesAt?.toISOString(), '2026-11-16T06:00:00.000Z', '48h escalation');

// --- Escalation ---
const escalatesAt = d('2026-11-16T06:00:00Z');
assert.equal(isEscalated({ status: 'PENDING', escalatesAt }, d('2026-11-16T05:59:59Z')), false);
assert.equal(isEscalated({ status: 'PENDING', escalatesAt }, d('2026-11-16T06:00:00Z')), true);
assert.equal(isEscalated({ status: 'APPROVED_LEVEL1', escalatesAt }, d('2026-12-01')), false);
assert.equal(isEscalated({ status: 'PENDING', escalatesAt: null }, d('2026-12-01')), false);

console.log('leave-routing tests passed');
