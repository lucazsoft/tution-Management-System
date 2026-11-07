// Geofenced teacher attendance: distance maths and the server-side checks in
// POST /api/attendance/in and /out. Database calls are stubbed, and the auth
// module is replaced so the router loads without runtime secrets.
import assert from 'node:assert/strict';
import prisma from '../utils/db';
import { calculateDistanceInMeters } from '../utils/geo';

const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  auth: { api: { getSession: async () => null } },
} } as NodeModule;
const attendanceRouter = require('./attendance').default;

// Shared reference distances; apps/mobile/test/geo_distance_test.dart checks
// the Flutter Haversine against the same numbers.
const BRANCH = { lat: 27.7172, lng: 85.324 }; // Kathmandu
const ONE_MILLIDEGREE_LAT_METERS = 111.19; // 0.001° of latitude
const KATHMANDU_TO_POKHARA_METERS = 142_394; // 27.7172,85.324 -> 28.2096,83.9856 (air distance ~142 km)

function handler(path: '/in' | '/out') {
  const layer = attendanceRouter.stack.find((entry: any) => entry.route?.path === path && entry.route?.methods?.post);
  assert(layer, `POST ${path} route must exist`);
  // The last handler is the route body; auth and permission run before it.
  return layer.route.stack.at(-1).handle as (req: any, res: any) => Promise<void>;
}

type Call = { status: number; body: any; created: any[]; branchQueried: boolean };

async function call(path: '/in' | '/out', body: Record<string, unknown>, options: { pendingSession?: boolean; radius?: number } = {}): Promise<Call> {
  const original = {
    pending: prisma.teacherSession.findFirst,
    branch: prisma.branch.findFirst,
    create: prisma.teacherAttendance.create,
    notification: (prisma as any).notification?.create,
  };
  const created: any[] = [];
  let branchQueried = false;
  prisma.teacherSession.findFirst = (async () => (options.pendingSession ? { id: 'pending-1' } : null)) as any;
  prisma.branch.findFirst = (async () => {
    branchQueried = true;
    return { id: 'b1', name: 'Main', tenantId: 't1', latitude: BRANCH.lat, longitude: BRANCH.lng, radiusMeters: options.radius ?? 100 };
  }) as any;
  prisma.teacherAttendance.create = (async (args: any) => { created.push(args.data); return { id: 'stamp-1', ...args.data }; }) as any;
  if ((prisma as any).notification) (prisma as any).notification.create = async () => ({ id: 'n1' });

  let status = 200;
  let responseBody: any;
  const res = {
    status(code: number) { status = code; return this; },
    json(value: any) { responseBody = value; return this; },
  };
  try {
    await handler(path)({ body, user: { id: 'teacher-1' }, tenantId: 't1' }, res);
  } finally {
    prisma.teacherSession.findFirst = original.pending;
    prisma.branch.findFirst = original.branch;
    prisma.teacherAttendance.create = original.create;
    if ((prisma as any).notification) (prisma as any).notification.create = original.notification;
  }
  return { status, body: responseBody, created, branchQueried };
}

/** A point `meters` north of the branch centre. */
const north = (meters: number) => ({ branchId: 'b1', latitude: BRANCH.lat + meters / 111_195, longitude: BRANCH.lng, gpsAccuracy: 5 });

function distanceMaths() {
  assert.equal(calculateDistanceInMeters(BRANCH.lat, BRANCH.lng, BRANCH.lat, BRANCH.lng), 0);
  const milli = calculateDistanceInMeters(BRANCH.lat, BRANCH.lng, BRANCH.lat + 0.001, BRANCH.lng);
  assert.ok(Math.abs(milli - ONE_MILLIDEGREE_LAT_METERS) < 0.05, `0.001° latitude should be ~111.19 m, got ${milli}`);
  const pokhara = calculateDistanceInMeters(BRANCH.lat, BRANCH.lng, 28.2096, 83.9856);
  assert.ok(Math.abs(pokhara - KATHMANDU_TO_POKHARA_METERS) < 500, `Kathmandu to Pokhara should be ~142.4 km, got ${pokhara}`);
  // Symmetric, and correct across the antimeridian (179.999 -> -179.999 is ~222 m at the equator).
  assert.equal(calculateDistanceInMeters(1, 2, 3, 4), calculateDistanceInMeters(3, 4, 1, 2));
  const antimeridian = calculateDistanceInMeters(0, 179.999, 0, -179.999);
  assert.ok(antimeridian > 200 && antimeridian < 250, `antimeridian distance should be ~222 m, got ${antimeridian}`);
  console.log('PASS distance maths: zero, 111.19 m per 0.001° latitude, Kathmandu–Pokhara 142.4 km, symmetry, antimeridian');
}

async function geofence() {
  for (const path of ['/in', '/out'] as const) {
    const inside = await call(path, north(50));
    assert.equal(inside.status, 200, `${path}: 50 m from the centre is inside a 100 m fence`);
    assert.equal(inside.created.length, 1);
    assert.equal(inside.created[0].stampType, path === '/in' ? 'IN' : 'OUT');
    assert.equal(inside.created[0].gpsAccuracy, 5);

    const edge = await call(path, north(99.5));
    assert.equal(edge.status, 200, `${path}: 99.5 m is still inside`);

    const outside = await call(path, north(150));
    assert.equal(outside.status, 403, `${path}: 150 m is outside a 100 m fence`);
    assert.match(outside.body.error, /Geofence violation/);
    assert.ok(Math.abs(outside.body.distanceComputed - 150) < 1);
    assert.equal(outside.created.length, 0, `${path}: no stamp outside the fence`);

    const wider = await call(path, north(150), { radius: 200 });
    assert.equal(wider.status, 200, `${path}: the branch's own radius is used, not a fixed 100 m`);
  }
  console.log('PASS geofence: inside, near the edge, outside (403, no stamp), per-branch radius — IN and OUT');
}

async function accuracyAndInput() {
  for (const path of ['/in', '/out'] as const) {
    assert.equal((await call(path, { ...north(10), gpsAccuracy: 20 })).status, 200, `${path}: 20 m accuracy is allowed`);
    const coarse = await call(path, { ...north(10), gpsAccuracy: 20.01 });
    assert.equal(coarse.status, 422, `${path}: accuracy over 20 m is refused`);
    assert.equal(coarse.branchQueried, false, `${path}: a coarse fix is refused before any branch lookup`);

    assert.equal((await call(path, { ...north(10), latitude: 91 })).status, 400, `${path}: latitude over 90`);
    assert.equal((await call(path, { ...north(10), longitude: -181 })).status, 400, `${path}: longitude under -180`);
    assert.equal((await call(path, { ...north(10), latitude: '27.7' })).status, 400, `${path}: coordinates must be numbers`);
    assert.equal((await call(path, { ...north(10), gpsAccuracy: -1 })).status, 400, `${path}: negative accuracy`);
    assert.equal((await call(path, { ...north(10), teacherId: 'someone-else' })).status, 400, `${path}: unknown fields are rejected`);
    assert.equal((await call(path, { latitude: 27.7, longitude: 85.3, gpsAccuracy: 5 })).status, 400, `${path}: branchId is required`);
  }
  console.log('PASS accuracy and input: 20 m allowed, 20.01 m refused early, range, type and unknown-field checks');
}

async function dailyUpdateGate() {
  const blocked = await call('/in', north(10), { pendingSession: true });
  assert.equal(blocked.status, 403);
  assert.match(blocked.body.error, /Daily class update pending/);
  assert.equal(blocked.created.length, 0);
  console.log('PASS daily-update gate: IN is blocked while an earlier session lacks its update');
}

async function main() {
  distanceMaths();
  await geofence();
  await accuracyAndInput();
  await dailyUpdateGate();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
