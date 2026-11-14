import assert from 'node:assert/strict';
import prisma from '../utils/db';

// Replace the auth module before loading the router: it validates runtime
// secrets at import time, and CI runs these suites with no environment.
const authPath = require.resolve('../utils/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  auth: { api: { getSession: async () => null } },
} } as NodeModule;
const attendanceRouter = require('./attendance').default;

function endpointHandler(path: '/in' | '/out') {
  const layer = (attendanceRouter as any).stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.post,
  );
  assert(layer, `POST ${path} route must exist`);
  return layer.route.stack.at(-1).handle as (req: any, res: any) => Promise<void>;
}

async function rejectsUnassignedTeacherBranch(path: '/in' | '/out') {
  const originalPending = prisma.teacherSession.findFirst;
  const originalBranch = prisma.branch.findFirst;
  const originalCreate = prisma.teacherAttendance.create;
  let capturedWhere: any;
  let created = false;

  prisma.teacherSession.findFirst = (async () => null) as any;
  prisma.branch.findFirst = (async (args: any) => {
    capturedWhere = args.where;
    const assignedTeacher = args.where?.classes?.some?.teacherId;
    return assignedTeacher === 'teacher-session-id'
      ? null
      : {
          id: 'branch-other',
          tenantId: 'tenant-session-id',
          latitude: 27.7172,
          longitude: 85.324,
          radiusMeters: 100,
        };
  }) as any;
  prisma.teacherAttendance.create = (async () => {
    created = true;
    return { id: 'stamp-1' } as any;
  }) as any;

  try {
    let statusCode = 200;
    let responseBody: any;
    const req = {
      body: {
        branchId: 'branch-other',
        latitude: 27.7172,
        longitude: 85.324,
        gpsAccuracy: 5,
      },
      user: { id: 'teacher-session-id' },
      tenantId: 'tenant-session-id',
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

    await endpointHandler(path)(req, res);

    assert.equal(statusCode, 403, `POST ${path} must reject an unassigned branch`);
    assert.match(responseBody.error, /assigned/i);
    assert.equal(created, false, `POST ${path} must not create an attendance stamp`);
    assert.deepEqual(capturedWhere, {
      id: 'branch-other',
      tenantId: 'tenant-session-id',
      classes: {
        some: {
          teacherId: 'teacher-session-id',
          archivedAt: null,
          course: { tenantId: 'tenant-session-id' },
        },
      },
    });
  } finally {
    prisma.teacherSession.findFirst = originalPending;
    prisma.branch.findFirst = originalBranch;
    prisma.teacherAttendance.create = originalCreate;
  }
}

async function main() {
  await rejectsUnassignedTeacherBranch('/in');
  await rejectsUnassignedTeacherBranch('/out');
  console.log('Attendance branch-assignment API tests passed for IN and OUT.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
