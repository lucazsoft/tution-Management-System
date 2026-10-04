import assert from 'node:assert/strict';
import {
  bsToAdInstant,
  currentAdmissionTenure,
  formatBsDate,
  getAdmissionTenure,
  getBillingPeriod,
  parseBsDate,
  toBsDateString,
} from './nepali';

void (async () => {
  const tenure = await getAdmissionTenure(new Date('2026-09-04T12:00:00.000Z'));
  assert.equal(await formatBsDate(tenure.start), 'Bhadra 19, 2083');
  assert.equal(await formatBsDate(tenure.end), 'Bhadra 18, 2084');
  assert.ok(tenure.end > tenure.start);

  const period = await getBillingPeriod(new Date('2026-09-15T00:00:00.000Z'), 10);
  assert.equal(period.label, 'Bhadra 2083');
  assert.equal(await formatBsDate(period.cycleStart), 'Bhadra 1, 2083');
  assert.equal(await formatBsDate(period.cycleEnd), `Bhadra ${period.daysInMonth}, 2083`);
  assert.equal(period.dueDate.getTime() - period.cycleStart.getTime(), 10 * 86_400_000);
  assert.ok(period.cycleStart <= new Date('2026-09-15T00:00:00.000Z'));
  assert.ok(period.cycleEnd >= new Date('2026-09-15T00:00:00.000Z'));

  // --- BS parsing: the bulk admission import trusts this to reject bad rows ---
  const parsed = await parseBsDate('2080-03-15');
  assert.deepEqual(parsed, { year: 2080, monthIndex: 2, day: 15 });
  assert.deepEqual(await parseBsDate(' 2080-3-5 '), { year: 2080, monthIndex: 2, day: 5 },
    'single-digit months and days, and surrounding spaces, are tolerated');
  assert.equal(await parseBsDate('2080-13-01'), null, 'BS has only 12 months');
  assert.equal(await parseBsDate('2080-00-01'), null, 'month is 1-indexed in the CSV');
  assert.equal(await parseBsDate('2080-03-00'), null, 'day must be at least 1');
  assert.equal(await parseBsDate('2080-09-30'), null, 'Poush 2080 has only 29 days');
  assert.deepEqual(await parseBsDate('2080-09-29'), { year: 2080, monthIndex: 8, day: 29 });
  assert.deepEqual(await parseBsDate('2080-02-32'), { year: 2080, monthIndex: 1, day: 32 },
    'Jestha 2080 really does have 32 days — month length is per year, not fixed');
  assert.equal(await parseBsDate('1800-01-01'), null, 'outside the shipped calendar data');
  assert.equal(await parseBsDate('2080/03/15'), null, 'only YYYY-MM-DD is accepted');
  assert.equal(await parseBsDate('not a date'), null);

  // A BS date round-trips through AD unchanged.
  const admitted = await bsToAdInstant('2080-03-15', '10:00');
  assert.ok(admitted, 'a real BS date converts');
  assert.equal(await toBsDateString(admitted!), '2080-03-15');
  assert.equal(await formatBsDate(admitted!), 'Asar 15, 2080');

  // The wall clock is Nepal time (UTC+05:45), so 10:00 NPT is 04:15 UTC.
  assert.equal(admitted!.toISOString().slice(11, 16), '04:15');
  const midday = await bsToAdInstant('2080-03-15', '12:00');
  assert.equal(midday!.toISOString().slice(0, 10), admitted!.toISOString().slice(0, 10),
    'a midday anchor keeps the AD calendar date, which date-of-birth storage relies on');
  assert.equal(await bsToAdInstant('2080-03-15', '24:00'), null, 'hours past 23 are rejected');
  assert.equal(await bsToAdInstant('2080-03-15', '10:60'), null, 'minutes past 59 are rejected');
  assert.equal(await bsToAdInstant('2080-03-15', '10'), null, 'the clock needs HH:mm');

  // --- Backdated admissions get a live tenure, not an expired one ---
  const backdated = await currentAdmissionTenure(admitted!, new Date('2026-09-04T00:00:00.000Z'));
  assert.equal(backdated.yearsElapsed, 3, 'Asar 2080 to Bhadra 2083 is three whole BS years');
  assert.ok(backdated.start <= new Date('2026-09-04T00:00:00.000Z'), 'the window has already started');
  assert.ok(backdated.end >= new Date('2026-09-04T00:00:00.000Z'), 'and has not expired');
  assert.equal(await formatBsDate(backdated.start), 'Asar 15, 2083');

  // A fresh admission is in its first tenure year and matches getAdmissionTenure.
  const fresh = await currentAdmissionTenure(new Date('2026-09-04T12:00:00.000Z'), new Date('2026-09-04T12:00:00.000Z'));
  assert.equal(fresh.yearsElapsed, 0);
  assert.equal(fresh.start.getTime(), tenure.start.getTime());
  assert.equal(fresh.end.getTime(), tenure.end.getTime());

  console.log('Nepali billing period, BS parsing, and admission tenure tests passed');
})();
