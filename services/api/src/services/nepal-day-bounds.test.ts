import assert from 'node:assert/strict';
import { nepalCalendarDate, nepalDayBounds } from './timetable-service';

const cases: Array<[string, () => void]> = [];
function test(name: string, run: () => void) {
  cases.push([name, run]);
}

/** Nepal is UTC+05:45, so its day runs 18:15 UTC to 18:15 UTC. */
test('a Nepal day starts at 18:15 UTC on the previous calendar day', () => {
  const { start } = nepalDayBounds(new Date('2026-10-06T01:15:00Z'));
  assert.equal(start.toISOString(), '2026-10-05T18:15:00.000Z');
});

test('the window is 24 hours long', () => {
  const { start, end } = nepalDayBounds(new Date('2026-10-06T01:15:00Z'));
  const span = end.getTime() - start.getTime();
  assert.equal(span, 24 * 60 * 60 * 1000 - 1);
});

test('an instant always falls inside its own day window', () => {
  const samples = [
    '2026-10-06T01:15:00Z', // 07:00 Nepal
    '2026-10-05T18:15:00Z', // 00:00 Nepal, first instant of Oct 6
    '2026-10-06T18:14:59Z', // 23:59:59 Nepal, last instant of Oct 6
    '2026-01-01T00:00:00Z',
    '2026-07-15T12:00:00Z',
  ];
  for (const sample of samples) {
    const instant = new Date(sample);
    const { start, end } = nepalDayBounds(instant);
    assert.ok(instant >= start && instant <= end, `${sample} must fall in its own window`);
  }
});

test('the boundary instants land on different Nepal days', () => {
  // 18:14:59Z is the last moment of Oct 5 in Nepal; 18:15:00Z begins Oct 6.
  const before = new Date('2026-10-05T18:14:59Z');
  const after = new Date('2026-10-05T18:15:00Z');
  assert.equal(nepalCalendarDate(before).toISOString().slice(0, 10), '2026-10-05');
  assert.equal(nepalCalendarDate(after).toISOString().slice(0, 10), '2026-10-06');
  assert.notEqual(nepalDayBounds(before).start.getTime(), nepalDayBounds(after).start.getTime());
});

test('consecutive day windows abut without gap or overlap', () => {
  const first = nepalDayBounds(new Date('2026-10-06T01:15:00Z'));
  const second = nepalDayBounds(new Date('2026-10-07T01:15:00Z'));
  assert.equal(second.start.getTime() - first.end.getTime(), 1, 'windows must be contiguous');
});

test('the window label matches nepalCalendarDate', () => {
  const instant = new Date('2026-10-06T16:00:00Z'); // 21:45 Nepal
  const { start } = nepalDayBounds(instant);
  // start + the 5h45m offset is UTC midnight of the Nepal calendar date.
  const label = new Date(start.getTime() + (5 * 60 + 45) * 60_000);
  assert.equal(label.toISOString(), nepalCalendarDate(instant).toISOString());
});

// A pre-dawn Nepal stamp is the case where a server-local day window (as used
// by dayBounds in routes/teacher.ts) disagrees with the Nepal day.
test('a pre-dawn Nepal stamp belongs to the Nepal day, not the UTC one', () => {
  const instant = new Date('2026-10-05T19:00:00Z'); // 00:45 Nepal on Oct 6
  assert.equal(nepalCalendarDate(instant).toISOString().slice(0, 10), '2026-10-06');
  const { start, end } = nepalDayBounds(instant);
  assert.ok(instant >= start && instant <= end);
});

let failures = 0;
for (const [name, run] of cases) {
  try {
    run();
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}`);
    console.error(error instanceof Error ? error.message : error);
  }
}
if (failures > 0) {
  console.error(`${failures} of ${cases.length} Nepal day-window scenarios failed.`);
  process.exitCode = 1;
} else {
  console.log(`Nepal day windows: ${cases.length} scenarios passed.`);
}
