import assert from 'node:assert/strict';
import attendanceRouter from './attendance';
import prisma from '../utils/db';

const TEACHER = 'teacher-session-id';
const TENANT = 'tenant-session-id';
const BRANCH = 'branch-1';
const BRANCH_LAT = 27.7172;
const BRANCH_LNG = 85.324;

/** Latitude offsets whose great-circle distance from the branch centre is known. */
const OFFSET_200M = 0.0018; // 200.15 m
const OFFSET_110M = 0.00099; // 110.08 m - inside a 100 m fence once accuracy is credited

function endpointHandler(path: '/in' | '/out') {
  const layer = (attendanceRouter as any).stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.post,
  );
  assert(layer, `POST ${path} route must exist`);
  return layer.route.stack.at(-1).handle as (req: any, res: any) => Promise<void>;
}

type Scenario = {
  path: '/in' | '/out';
  body?: Record<string, unknown>;
  /** A session with an unsubmitted daily update, or null when the teacher is clear. */
  pendingSession?: unknown;
  /** The branch the assignment lookup resolves to, or null when unassigned. */
  branch?: Record<string, unknown> | null;
  /** The teacher's most recent stamp of the current Nepal day, if any. */
  lastStampToday?: { stampType: string } | null;
};

type Outcome = {
  statusCode: number;
  body: any;
  created: boolean;
  createdData: any;
  branchWhere: any;
};

const defaultBranch = {
  id: BRANCH,
  name: 'Kathmandu Centre',
  tenantId: TENANT,
  latitude: BRANCH_LAT,
  longitude: BRANCH_LNG,
  radiusMeters: 100,
};

/**
 * Drives one handler against stubbed persistence. Every stub is restored in
 * `finally` so a failing assertion cannot leak state into the next scenario.
 */
async function callEndpoint(scenario: Scenario): Promise<Outcome> {
  const originalPending = prisma.teacherSession.findFirst;
  const originalBranch = prisma.branch.findFirst;
  const originalCreate = prisma.teacherAttendance.create;
  const originalLastStamp = prisma.teacherAttendance.findFirst;
  const originalTransaction = prisma.$transaction;
  const originalNotify = (prisma as any).notification?.create;

  let created = false;
  let createdData: any;
  let branchWhere: any;

  // The route runs its read-then-write inside an interactive transaction; the
  // stubbed prisma stands in for the transaction client.
  prisma.$transaction = (async (fn: any) => fn(prisma)) as any;
  // Marking OUT presupposes an open IN, so that is the default precondition for
  // /out scenarios; /in defaults to a clean day. Either can be overridden.
  const defaultLastStamp = scenario.path === '/out' ? { stampType: 'IN' } : null;
  prisma.teacherAttendance.findFirst = (async () =>
    scenario.lastStampToday !== undefined ? scenario.lastStampToday : defaultLastStamp) as any;
  prisma.teacherSession.findFirst = (async () => scenario.pendingSession ?? null) as any;
  prisma.branch.findFirst = (async (args: any) => {
    branchWhere = args.where;
    return scenario.branch === undefined ? defaultBranch : scenario.branch;
  }) as any;
  prisma.teacherAttendance.create = (async (args: any) => {
    created = true;
    createdData = args.data;
    return { id: 'stamp-1', ...args.data };
  }) as any;
  if ((prisma as any).notification) {
    (prisma as any).notification.create = (async () => ({ id: 'notification-1' })) as any;
  }

  try {
    let statusCode = 200;
    let responseBody: any;
    const req = {
      body: scenario.body ?? {
        branchId: BRANCH,
        latitude: BRANCH_LAT,
        longitude: BRANCH_LNG,
        gpsAccuracy: 5,
      },
      user: { id: TEACHER },
      tenantId: TENANT,
    };
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: any) {
        responseBody = body;
        return this;
      },
    };

    await endpointHandler(scenario.path)(req, res);
    return { statusCode, body: responseBody, created, createdData, branchWhere };
  } finally {
    prisma.teacherSession.findFirst = originalPending;
    prisma.branch.findFirst = originalBranch;
    prisma.teacherAttendance.create = originalCreate;
    prisma.teacherAttendance.findFirst = originalLastStamp;
    prisma.$transaction = originalTransaction;
    if ((prisma as any).notification && originalNotify) {
      (prisma as any).notification.create = originalNotify;
    }
  }
}

function geoBody(overrides: Record<string, unknown> = {}) {
  return {
    branchId: BRANCH,
    latitude: BRANCH_LAT,
    longitude: BRANCH_LNG,
    gpsAccuracy: 5,
    ...overrides,
  };
}

const cases: Array<[string, () => Promise<void>]> = [];
function test(name: string, run: () => Promise<void>) {
  cases.push([name, run]);
}

// -- Branch assignment scoping ----------------------------------------------

for (const path of ['/in', '/out'] as const) {
  test(`POST ${path} rejects a branch the teacher is not assigned to`, async () => {
    const outcome = await callEndpoint({ path, branch: null });
    assert.equal(outcome.statusCode, 403);
    assert.match(outcome.body.error, /assigned/i);
    assert.equal(outcome.created, false, 'no stamp may be written');
    assert.deepEqual(outcome.branchWhere, {
      id: BRANCH,
      tenantId: TENANT,
      classes: {
        some: {
          teacherId: TEACHER,
          archivedAt: null,
          course: { tenantId: TENANT },
        },
      },
    });
  });
}

// -- Input validation -------------------------------------------------------

for (const path of ['/in', '/out'] as const) {
  const invalid: Array<[string, Record<string, unknown>]> = [
    ['latitude above range', geoBody({ latitude: 91 })],
    ['latitude below range', geoBody({ latitude: -91 })],
    ['longitude above range', geoBody({ longitude: 181 })],
    ['longitude below range', geoBody({ longitude: -181 })],
    ['negative accuracy', geoBody({ gpsAccuracy: -1 })],
    ['non-numeric latitude', geoBody({ latitude: 'here' })],
    ['missing branchId', { latitude: BRANCH_LAT, longitude: BRANCH_LNG, gpsAccuracy: 5 }],
    ['unexpected extra key', geoBody({ spoofed: true })],
  ];

  for (const [label, body] of invalid) {
    test(`POST ${path} rejects ${label} with 400`, async () => {
      const outcome = await callEndpoint({ path, body });
      assert.equal(outcome.statusCode, 400, `${label} must be a 400`);
      assert.equal(outcome.created, false);
    });
  }
}

// -- GPS accuracy threshold -------------------------------------------------

for (const path of ['/in', '/out'] as const) {
  test(`POST ${path} rejects an imprecise fix with 422`, async () => {
    const outcome = await callEndpoint({ path, body: geoBody({ gpsAccuracy: 20.01 }) });
    assert.equal(outcome.statusCode, 422);
    assert.match(outcome.body.error, /accuracy/i);
    assert.equal(outcome.created, false);
  });

  test(`POST ${path} accepts a fix exactly at the 20 m accuracy limit`, async () => {
    const outcome = await callEndpoint({ path, body: geoBody({ gpsAccuracy: 20 }) });
    assert.equal(outcome.statusCode, 200);
    assert.equal(outcome.created, true);
    assert.equal(outcome.createdData.gpsAccuracy, 20);
  });
}

// -- Geofence radius --------------------------------------------------------

for (const path of ['/in', '/out'] as const) {
  test(`POST ${path} records a stamp at the branch centre`, async () => {
    const outcome = await callEndpoint({ path });
    assert.equal(outcome.statusCode, 200);
    assert.equal(outcome.created, true);
    assert.equal(outcome.createdData.userId, TEACHER);
    assert.equal(outcome.createdData.branchId, BRANCH);
    assert.equal(outcome.createdData.stampType, path === '/in' ? 'IN' : 'OUT');
  });

  test(`POST ${path} rejects a fix 200 m outside a 100 m fence`, async () => {
    const outcome = await callEndpoint({
      path,
      body: geoBody({ latitude: BRANCH_LAT + OFFSET_200M }),
    });
    assert.equal(outcome.statusCode, 403);
    assert.match(outcome.body.error, /geofence/i);
    assert.equal(outcome.created, false);
  });
}

// Phase 2 (lenient accuracy margin) deliberately flips the two cases below:
// 110 m out with a 20 m accuracy credit becomes a 90 m worst case, inside a
// 100 m fence. They are asserted here so that change is explicit in the diff.
test('PRE-PHASE-2 POST /in rejects 110 m out even with a 20 m accuracy credit', async () => {
  const outcome = await callEndpoint({
    path: '/in',
    body: geoBody({ latitude: BRANCH_LAT + OFFSET_110M, gpsAccuracy: 20 }),
  });
  assert.equal(outcome.statusCode, 403);
  assert.equal(outcome.created, false);
});

test('PRE-PHASE-2 POST /out is blocked outside the fence, stranding a departed teacher', async () => {
  const outcome = await callEndpoint({
    path: '/out',
    body: geoBody({ latitude: BRANCH_LAT + OFFSET_200M }),
  });
  assert.equal(outcome.statusCode, 403);
  assert.equal(outcome.created, false, 'the teacher cannot close their own stamp');
});

// -- Mandatory daily-update gate (IN only) ----------------------------------

test('POST /in is blocked while a previous daily update is unsubmitted', async () => {
  const outcome = await callEndpoint({
    path: '/in',
    pendingSession: { id: 'session-overdue' },
  });
  assert.equal(outcome.statusCode, 403);
  assert.match(outcome.body.error, /daily class update/i);
  assert.equal(outcome.body.pendingSessionId, 'session-overdue');
  assert.equal(outcome.created, false);
});

test('POST /in checks the daily-update gate before the accuracy threshold', async () => {
  const outcome = await callEndpoint({
    path: '/in',
    pendingSession: { id: 'session-overdue' },
    body: geoBody({ gpsAccuracy: 999 }),
  });
  assert.equal(outcome.statusCode, 403, 'the pending-update gate takes precedence over 422');
  assert.match(outcome.body.error, /daily class update/i);
});

test('POST /out ignores the daily-update gate so a session can always be closed', async () => {
  const outcome = await callEndpoint({
    path: '/out',
    pendingSession: { id: 'session-overdue' },
  });
  assert.equal(outcome.statusCode, 200);
  assert.equal(outcome.created, true);
});

// -- Stamp sequencing --------------------------------------------------------

test('the first IN of the day is stamped IN', async () => {
  const outcome = await callEndpoint({ path: '/in', lastStampToday: null });
  assert.equal(outcome.statusCode, 200);
  assert.equal(outcome.createdData.stampType, 'IN');
});

test('a second IN while already present is rejected with 409', async () => {
  for (const stampType of ['IN', 'RE_IN']) {
    const outcome = await callEndpoint({ path: '/in', lastStampToday: { stampType } });
    assert.equal(outcome.statusCode, 409, `last stamp ${stampType} must block another IN`);
    assert.match(outcome.body.error, /already marked IN/i);
    assert.equal(outcome.created, false);
  }
});

test('returning after an OUT is stamped RE_IN', async () => {
  for (const stampType of ['OUT', 'AUTO_OUT']) {
    const outcome = await callEndpoint({ path: '/in', lastStampToday: { stampType } });
    assert.equal(outcome.statusCode, 200, `last stamp ${stampType} must allow a return`);
    assert.equal(outcome.createdData.stampType, 'RE_IN');
  }
});

test('a RE_IN response tells the teacher they came back rather than arrived', async () => {
  const outcome = await callEndpoint({ path: '/in', lastStampToday: { stampType: 'OUT' } });
  assert.match(outcome.body.message, /back IN/i);
});

test('OUT closes an open IN or RE_IN', async () => {
  for (const stampType of ['IN', 'RE_IN']) {
    const outcome = await callEndpoint({ path: '/out', lastStampToday: { stampType } });
    assert.equal(outcome.statusCode, 200, `last stamp ${stampType} must be closable`);
    assert.equal(outcome.createdData.stampType, 'OUT');
  }
});

test('OUT with no stamp today is rejected with 409', async () => {
  const outcome = await callEndpoint({ path: '/out', lastStampToday: null });
  assert.equal(outcome.statusCode, 409);
  assert.match(outcome.body.error, /nothing to mark OUT/i);
  assert.equal(outcome.created, false);
});

test('a second OUT while already absent is rejected with 409', async () => {
  for (const stampType of ['OUT', 'AUTO_OUT']) {
    const outcome = await callEndpoint({ path: '/out', lastStampToday: { stampType } });
    assert.equal(outcome.statusCode, 409, `last stamp ${stampType} must block another OUT`);
    assert.match(outcome.body.error, /already marked OUT/i);
    assert.equal(outcome.created, false);
  }
});

test('the sequence lookup is scoped to the teacher and bounded to one day', async () => {
  let capturedWhere: any;
  const originalFind = prisma.teacherAttendance.findFirst;
  const originalTransaction = prisma.$transaction;
  const originalBranch = prisma.branch.findFirst;
  const originalCreate = prisma.teacherAttendance.create;
  const originalPending = prisma.teacherSession.findFirst;
  prisma.$transaction = (async (fn: any) => fn(prisma)) as any;
  prisma.teacherSession.findFirst = (async () => null) as any;
  prisma.branch.findFirst = (async () => defaultBranch) as any;
  prisma.teacherAttendance.create = (async (args: any) => ({ id: 'stamp-1', ...args.data })) as any;
  prisma.teacherAttendance.findFirst = (async (args: any) => {
    capturedWhere = args.where;
    return null;
  }) as any;
  try {
    await endpointHandler('/in')(
      { body: geoBody(), user: { id: TEACHER }, tenantId: TENANT },
      { status() { return this; }, json() { return this; } },
    );
  } finally {
    prisma.teacherAttendance.findFirst = originalFind;
    prisma.$transaction = originalTransaction;
    prisma.branch.findFirst = originalBranch;
    prisma.teacherAttendance.create = originalCreate;
    prisma.teacherSession.findFirst = originalPending;
  }
  assert.equal(capturedWhere.userId, TEACHER);
  // Teacher-scoped, not branch-scoped: a teacher cannot be on-site at two
  // branches at once, so a second IN elsewhere is still a duplicate.
  assert.equal(capturedWhere.branchId, undefined);
  assert.ok(capturedWhere.timestamp?.gte instanceof Date, 'window must have a start');
  assert.ok(capturedWhere.timestamp?.lte instanceof Date, 'window must have an end');
  const span = capturedWhere.timestamp.lte.getTime() - capturedWhere.timestamp.gte.getTime();
  assert.equal(span, 24 * 60 * 60 * 1000 - 1, 'window must span exactly one day');
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
    throw new Error(`${failures} of ${cases.length} attendance scenarios failed.`);
  }
  console.log(`Attendance geo-attendance API: ${cases.length} scenarios passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
