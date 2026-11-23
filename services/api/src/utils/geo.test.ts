import assert from 'node:assert/strict';
import {
  calculateDistanceInMeters,
  readGeofenceNumber,
  parseGeofenceConfig,
  DEFAULT_RADIUS_METERS,
} from './geo';

const cases: Array<[string, () => void]> = [];
function test(name: string, run: () => void) {
  cases.push([name, run]);
}

// -- Haversine ---------------------------------------------------------------

test('distance to the same point is zero', () => {
  assert.equal(calculateDistanceInMeters(27.7172, 85.324, 27.7172, 85.324), 0);
});

test('distance is symmetric', () => {
  const forward = calculateDistanceInMeters(27.7172, 85.324, 27.719, 85.326);
  const back = calculateDistanceInMeters(27.719, 85.326, 27.7172, 85.324);
  assert.ok(Math.abs(forward - back) < 1e-9, 'a->b must equal b->a');
});

test('one degree of latitude is about 111 km', () => {
  const metres = calculateDistanceInMeters(27.0, 85.0, 28.0, 85.0);
  assert.ok(metres > 110_000 && metres < 112_000, `got ${metres}`);
});

test('the fixtures used by the attendance tests hold their stated distances', () => {
  const at200 = calculateDistanceInMeters(27.7172, 85.324, 27.7172 + 0.0018, 85.324);
  const at110 = calculateDistanceInMeters(27.7172, 85.324, 27.7172 + 0.00099, 85.324);
  assert.ok(Math.round(at200) === 200, `expected ~200 m, got ${at200}`);
  assert.ok(Math.round(at110) === 110, `expected ~110 m, got ${at110}`);
});

// -- Coordinate coercion ----------------------------------------------------

test('accepts numbers and numeric strings', () => {
  assert.deepEqual(readGeofenceNumber(27.7172, 'latitude'), { success: true, data: 27.7172 });
  assert.deepEqual(readGeofenceNumber('27.7172', 'latitude'), { success: true, data: 27.7172 });
  assert.deepEqual(readGeofenceNumber('-85.324', 'longitude'), { success: true, data: -85.324 });
});

test('accepts the exact range boundaries', () => {
  for (const value of [-90, 90]) {
    assert.equal(readGeofenceNumber(value, 'latitude').success, true, `latitude ${value}`);
  }
  for (const value of [-180, 180]) {
    assert.equal(readGeofenceNumber(value, 'longitude').success, true, `longitude ${value}`);
  }
});

test('rejects the values that previously coerced to zero', () => {
  // Number('') and Number(null) are both 0, which silently placed branches at
  // 0,0 instead of failing the request.
  for (const value of ['', '   ', null, [], false]) {
    const result = readGeofenceNumber(value, 'latitude');
    assert.equal(result.success, false, `${JSON.stringify(value)} must be rejected`);
  }
});

test('rejects out-of-range coordinates', () => {
  for (const value of [91, -91, 500, 9999]) {
    assert.equal(readGeofenceNumber(value, 'latitude').success, false, `latitude ${value}`);
  }
  for (const value of [181, -181]) {
    assert.equal(readGeofenceNumber(value, 'longitude').success, false, `longitude ${value}`);
  }
});

test('rejects non-finite and non-numeric input', () => {
  for (const value of [NaN, Infinity, -Infinity, 'north', '12abc', {}, undefined]) {
    assert.equal(readGeofenceNumber(value, 'latitude').success, false, `${String(value)}`);
  }
});

test('range errors name the field and its bounds', () => {
  const result = readGeofenceNumber(500, 'latitude');
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error, /latitude/);
    assert.match(result.error, /-90/);
    assert.match(result.error, /90/);
  }
});

// -- Radius bounds ----------------------------------------------------------

test('radius enforces both the floor and the ceiling', () => {
  assert.equal(readGeofenceNumber(10, 'radiusMeters').success, true, 'floor is inclusive');
  assert.equal(readGeofenceNumber(5000, 'radiusMeters').success, true, 'ceiling is inclusive');
  assert.equal(readGeofenceNumber(9, 'radiusMeters').success, false, 'below floor');
  assert.equal(readGeofenceNumber(10_000_000, 'radiusMeters').success, false, 'fence-disabling radius');
  assert.equal(readGeofenceNumber(0, 'radiusMeters').success, false, 'zero radius');
  assert.equal(readGeofenceNumber(-100, 'radiusMeters').success, false, 'negative radius');
});

// -- Whole-config parsing ---------------------------------------------------

test('parses a complete geofence block', () => {
  const result = parseGeofenceConfig({ latitude: 27.7172, longitude: 85.324, radiusMeters: 250 });
  assert.deepEqual(result, {
    success: true,
    data: { latitude: 27.7172, longitude: 85.324, radiusMeters: 250 },
  });
});

test('defaults the radius when it is absent, null or blank', () => {
  for (const radiusMeters of [undefined, null, '']) {
    const result = parseGeofenceConfig({ latitude: 27.7172, longitude: 85.324, radiusMeters });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.radiusMeters, DEFAULT_RADIUS_METERS);
  }
});

test('a missing centre fails even when the radius is valid', () => {
  assert.equal(parseGeofenceConfig({ latitude: undefined, longitude: 85.324 }).success, false);
  assert.equal(parseGeofenceConfig({ latitude: 27.7172, longitude: undefined }).success, false);
  assert.equal(parseGeofenceConfig({ latitude: '', longitude: '' }).success, false);
});

test('an invalid radius fails the whole block rather than falling back', () => {
  const result = parseGeofenceConfig({ latitude: 27.7172, longitude: 85.324, radiusMeters: 10_000_000 });
  assert.equal(result.success, false, 'a bad radius must not silently become 100 m');
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
  console.error(`${failures} of ${cases.length} geofence scenarios failed.`);
  process.exitCode = 1;
} else {
  console.log(`Geofence math and configuration: ${cases.length} scenarios passed.`);
}
