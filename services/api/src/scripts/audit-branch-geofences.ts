/**
 * Read-only audit of branch geofence configuration.
 *
 * Phase 1 tightened the write paths, but rows created before that may still
 * violate the new bounds. Nothing is mutated here: a wrong branch centre can
 * only be corrected by someone who knows where the branch actually is, so this
 * reports and exits rather than guessing.
 *
 * Run with: npm run audit:geofences
 */
import prisma from '../utils/db';
import { GEOFENCE_LIMITS } from '../utils/geo';

/** Centres the onboarding paths substitute when no coordinates are supplied. */
const PLACEHOLDER_CENTRES: Array<{ latitude: number; longitude: number; label: string }> = [
  { latitude: 27.6915, longitude: 85.3422, label: 'onboarding placeholder (Kathmandu)' },
  { latitude: 0, longitude: 0, label: 'null island (legacy provision fallback)' },
];

const PLACEHOLDER_TOLERANCE_DEGREES = 0.0001;

type Issue = { severity: 'BLOCKING' | 'WARNING'; detail: string };

function auditBranch(branch: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  gracePeriodMinutes: number;
}): Issue[] {
  const issues: Issue[] = [];
  const { latitude, longitude, radiusMeters, gracePeriodMinutes } = branch;

  if (!Number.isFinite(latitude) || latitude < GEOFENCE_LIMITS.latitude.min || latitude > GEOFENCE_LIMITS.latitude.max) {
    issues.push({ severity: 'BLOCKING', detail: `latitude ${latitude} is outside -90..90` });
  }
  if (!Number.isFinite(longitude) || longitude < GEOFENCE_LIMITS.longitude.min || longitude > GEOFENCE_LIMITS.longitude.max) {
    issues.push({ severity: 'BLOCKING', detail: `longitude ${longitude} is outside -180..180` });
  }

  for (const centre of PLACEHOLDER_CENTRES) {
    if (
      Math.abs(latitude - centre.latitude) < PLACEHOLDER_TOLERANCE_DEGREES &&
      Math.abs(longitude - centre.longitude) < PLACEHOLDER_TOLERANCE_DEGREES
    ) {
      issues.push({
        severity: 'BLOCKING',
        detail: `centre is the ${centre.label}; teachers cannot mark attendance until it is set`,
      });
    }
  }

  if (radiusMeters < GEOFENCE_LIMITS.radiusMeters.min) {
    issues.push({
      severity: 'BLOCKING',
      detail: `radius ${radiusMeters} m is below the ${GEOFENCE_LIMITS.radiusMeters.min} m floor and may be unsatisfiable`,
    });
  }
  if (radiusMeters > GEOFENCE_LIMITS.radiusMeters.max) {
    issues.push({
      severity: 'WARNING',
      detail: `radius ${radiusMeters} m exceeds the ${GEOFENCE_LIMITS.radiusMeters.max} m ceiling, effectively disabling the fence`,
    });
  }
  if (gracePeriodMinutes > GEOFENCE_LIMITS.gracePeriodMinutes.max) {
    issues.push({
      severity: 'WARNING',
      detail: `grace period ${gracePeriodMinutes} min exceeds the ${GEOFENCE_LIMITS.gracePeriodMinutes.max} min ceiling`,
    });
  }

  return issues;
}

async function main() {
  const branches = await prisma.branch.findMany({
    select: {
      id: true,
      name: true,
      tenantId: true,
      latitude: true,
      longitude: true,
      radiusMeters: true,
      gracePeriodMinutes: true,
      tenant: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  let blocking = 0;
  let warnings = 0;

  for (const branch of branches) {
    const issues = auditBranch(branch);
    if (issues.length === 0) continue;
    console.log(`\n${branch.tenant?.name ?? branch.tenantId} / ${branch.name}  [${branch.id}]`);
    console.log(`  centre ${branch.latitude}, ${branch.longitude}  radius ${branch.radiusMeters} m`);
    for (const issue of issues) {
      console.log(`  ${issue.severity === 'BLOCKING' ? 'BLOCKING' : 'WARNING '}  ${issue.detail}`);
      if (issue.severity === 'BLOCKING') blocking += 1;
      else warnings += 1;
    }
  }

  console.log(
    `\nAudited ${branches.length} branch${branches.length === 1 ? '' : 'es'}: ` +
      `${blocking} blocking, ${warnings} warning${warnings === 1 ? '' : 's'}.`,
  );
  if (blocking > 0) {
    console.log('Blocking rows need a real centre set via the branch settings screen.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
