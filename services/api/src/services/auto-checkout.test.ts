import assert from 'node:assert/strict';
import { runAutoCheckout } from './auto-checkout';
import { nepalDayBounds } from './timetable-service';

const TENANT = 'tenant-1';
const BRANCH = { id: 'branch-1', name: 'Kathmandu Centre', latitude: 27.7172, longitude: 85.324 };

type StampRow = {
  userId: string;
  branchId: string;
  stampType: string;
  timestamp: Date;
  branch: typeof BRANCH;
};

function stamp(userId: string, stampType: string, minutesIntoDay: number, day: Date): StampRow {
  const { start } = nepalDayBounds(day);
  return {
    userId,
    branchId: BRANCH.id,
    stampType,
    timestamp: new Date(start.getTime() + minutesIntoDay * 60_000),
    branch: BRANCH,
  };
}

/** Minimal stand-in for the slice of prisma the service touches. */
function fakeDb(rows: StampRow[]) {
  const created: any[] = [];
  const notified: any[] = [];
  let capturedWhere: any;
  return {
    created,
    notified,
    get where() {
      return capturedWhere;
    },
    db: {
      teacherAttendance: {
        findMany: async (args: any) => {
          capturedWhere = args.where;
          return [...rows].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        },
        create: async (args: any) => {
          created.push(args.data);
          return { id: `stamp-${created.length}`, ...args.data };
        },
      },
      notification: {
        create: async (args: any) => {
          notified.push(args.data);
          return { id: `notification-${notified.length}` };
        },
      },
    } as any,
  };
}

const DAY = new Date('2026-10-05T06:00:00Z');

const cases: Array<[string, () => Promise<void>]> = [];
function test(name: string, run: () => Promise<void>) {
  cases.push([name, run]);
}

test('closes a day left open on an IN stamp', async () => {
  const fake = fakeDb([stamp('teacher-1', 'IN', 120, DAY)]);
  const result = await runAutoCheckout({ tenantId: TENANT, now: DAY, db: fake.db });

  assert.equal(result.closed, 1);
  assert.equal(result.examined, 1);
  assert.equal(fake.created.length, 1);
  assert.equal(fake.created[0].stampType, 'AUTO_OUT');
  assert.equal(fake.created[0].userId, 'teacher-1');
});

test('closes a day left open on a RE_IN stamp', async () => {
  const fake = fakeDb([
    stamp('teacher-1', 'IN', 60, DAY),
    stamp('teacher-1', 'OUT', 120, DAY),
    stamp('teacher-1', 'RE_IN', 180, DAY),
  ]);
  const result = await runAutoCheckout({ tenantId: TENANT, now: DAY, db: fake.db });
  assert.equal(result.closed, 1, 'the last stamp is RE_IN, so the day is open');
});

test('leaves a day that was already closed', async () => {
  for (const closing of ['OUT', 'AUTO_OUT']) {
    const fake = fakeDb([stamp('teacher-1', 'IN', 60, DAY), stamp('teacher-1', closing, 300, DAY)]);
    const result = await runAutoCheckout({ tenantId: TENANT, now: DAY, db: fake.db });
    assert.equal(result.closed, 0, `a day ending in ${closing} must not be closed again`);
    assert.equal(fake.created.length, 0);
  }
});

test('is idempotent across consecutive runs', async () => {
  const rows = [stamp('teacher-1', 'IN', 120, DAY)];
  const fake = fakeDb(rows);
  const first = await runAutoCheckout({ tenantId: TENANT, now: DAY, db: fake.db });
  assert.equal(first.closed, 1);

  // Feed the generated stamp back in, as a second run against the store would see.
  rows.push({ ...stamp('teacher-1', 'AUTO_OUT', 1439, DAY) });
  const second = await runAutoCheckout({ tenantId: TENANT, now: DAY, db: fake.db });
  assert.equal(second.closed, 0, 'a second run must not double-close');
});

test('closes several teachers independently', async () => {
  const fake = fakeDb([
    stamp('teacher-open', 'IN', 60, DAY),
    stamp('teacher-closed', 'IN', 60, DAY),
    stamp('teacher-closed', 'OUT', 300, DAY),
    stamp('teacher-also-open', 'RE_IN', 200, DAY),
  ]);
  const result = await runAutoCheckout({ tenantId: TENANT, now: DAY, db: fake.db });
  assert.equal(result.examined, 3);
  assert.equal(result.closed, 2);
  const closedUsers = fake.created.map((row) => row.userId).sort();
  assert.deepEqual(closedUsers, ['teacher-also-open', 'teacher-open']);
});

test('the synthetic stamp sits at the branch centre with zero accuracy', async () => {
  const fake = fakeDb([stamp('teacher-1', 'IN', 120, DAY)]);
  await runAutoCheckout({ tenantId: TENANT, now: DAY, db: fake.db });
  const row = fake.created[0];
  assert.equal(row.latitude, BRANCH.latitude);
  assert.equal(row.longitude, BRANCH.longitude);
  assert.equal(row.gpsAccuracy, 0);
});

test('the synthetic stamp is timestamped at the close of the day', async () => {
  const fake = fakeDb([stamp('teacher-1', 'IN', 120, DAY)]);
  await runAutoCheckout({ tenantId: TENANT, now: DAY, db: fake.db });
  const { end } = nepalDayBounds(DAY);
  assert.equal(fake.created[0].timestamp.getTime(), end.getTime());
});

test('the query is scoped to the tenant and to one Nepal day', async () => {
  const fake = fakeDb([]);
  await runAutoCheckout({ tenantId: TENANT, now: DAY, db: fake.db });
  const { start, end } = nepalDayBounds(DAY);
  assert.deepEqual(fake.where.branch, { tenantId: TENANT });
  assert.equal(fake.where.timestamp.gte.getTime(), start.getTime());
  assert.equal(fake.where.timestamp.lte.getTime(), end.getTime());
});

test('reports the Nepal calendar day, not the UTC window start', async () => {
  const fake = fakeDb([]);
  const result = await runAutoCheckout({ tenantId: TENANT, now: DAY, db: fake.db });
  // The window opens 2026-10-04T18:15Z, but the day being closed is the 5th.
  assert.equal(result.day, '2026-10-05');
});

test('defaults to the previous day so teachers still on-site are untouched', async () => {
  const fake = fakeDb([]);
  await runAutoCheckout({ tenantId: TENANT, db: fake.db });
  const yesterday = nepalDayBounds(new Date(Date.now() - 24 * 60 * 60 * 1000));
  assert.equal(fake.where.timestamp.gte.getTime(), yesterday.start.getTime());
});

test('notifies each teacher whose day was closed', async () => {
  const fake = fakeDb([stamp('teacher-1', 'IN', 120, DAY)]);
  await runAutoCheckout({ tenantId: TENANT, now: DAY, db: fake.db });
  assert.equal(fake.notified.length, 1);
  assert.equal(fake.notified[0].userId, 'teacher-1');
  assert.equal(fake.notified[0].category, 'ATTENDANCE');
  assert.match(fake.notified[0].body, /not marked OUT/i);
});

test('a notification failure does not roll back the close', async () => {
  const fake = fakeDb([stamp('teacher-1', 'IN', 120, DAY)]);
  fake.db.notification.create = async () => {
    throw new Error('notification store unavailable');
  };
  const result = await runAutoCheckout({ tenantId: TENANT, now: DAY, db: fake.db });
  assert.equal(result.closed, 1, 'the stamp must survive a notification failure');
  assert.equal(fake.created.length, 1);
});

async function main() {
  let failures = 0;
  for (const [name, run] of cases) {
    try {
      await run();
    } catch (error) {
      failures += 1;
      console.error(`FAIL  ${name}`);
      console.error(error instanceof Error ? error.message : error);
    }
  }
  if (failures > 0) {
    throw new Error(`${failures} of ${cases.length} auto-checkout scenarios failed.`);
  }
  console.log(`Auto-checkout: ${cases.length} scenarios passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
