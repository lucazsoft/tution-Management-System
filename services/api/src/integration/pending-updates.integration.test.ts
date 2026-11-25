import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const TEST_SCHEMA = 'pending_updates_integration';
const TEST_PASSWORD = 'Integration-Only-Password-2026!';

function integrationDatabaseUrl(): string {
  const configured =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/tms?schema=public';
  const url = new URL(configured);
  url.searchParams.set('schema', TEST_SCHEMA);
  return url.toString();
}

function resetIntegrationSchema(databaseUrl: string): void {
  const apiRoot = path.resolve(__dirname, '../..');
  const result = spawnSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'reset', '--force', '--skip-seed'],
    {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Unable to reset integration schema.\n${result.error?.message ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
}

interface HttpResult {
  status: number;
  body: any;
  headers: Headers;
}

async function main(): Promise<void> {
  const databaseUrl = integrationDatabaseUrl();
  process.env.DATABASE_URL = databaseUrl;
  process.env.BETTER_AUTH_SECRET = 'tenant-admin-integration-secret-at-least-32-characters';
  process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0';
  process.env.WEB_ORIGIN = 'http://localhost:5173';
  process.env.NODE_ENV = 'test';
  process.env.PLATFORM_ADMIN_ENABLED = 'false';
  process.env.SMS_PROVIDER = 'MOCK';
  process.env.CONNECTIPS_ENABLED = 'false';

  resetIntegrationSchema(databaseUrl);

  // These modules must load only after the isolated DATABASE_URL is installed.
  const [{ PrismaClient }, { default: app }, { getMockVerificationCodeForTest }] = await Promise.all([
    import('@prisma/client'),
    import('../server'),
    import('../utils/delivery'),
  ]);
  const prisma = new PrismaClient();
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const request = async (
      method: string,
      route: string,
      cookie?: string,
      body?: unknown,
      extraHeaders: Record<string, string> = {},
    ): Promise<HttpResult> => {
      const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers: {
          origin: process.env.WEB_ORIGIN!,
          ...(cookie ? { cookie } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
      });
      const text = await response.text();
      return {
        status: response.status,
        body: text ? JSON.parse(text) : null,
        headers: response.headers,
      };
    };


    const sc = async (email: string, tenantId: string, roleName: string, permissions: string[]) => {
      const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
      const role = await prisma.role.create({ data: { tenantId, name: roleName, permissions } });
      return prisma.user.create({
        data: {
          tenantId, email, name: roleName, firstName: roleName.split(' ')[0], lastName: 'Integration',
          phone: '9800000000', passwordHash, status: 'ACTIVE',
          accounts: { create: { accountId: email, providerId: 'credential', password: passwordHash } },
          userRoles: { create: { roleId: role.id, branchId: null } },
        },
      });
    };
    const signIn = async (email: string): Promise<string> => {
      const response = await request('POST', '/api/auth/sign-in/email', undefined, { email, password: TEST_PASSWORD });
      assert.equal(response.status, 200, `sign-in failed: ${JSON.stringify(response.body)}`);
      const setCookies: string[] = (response.headers as any).getSetCookie?.() ?? [response.headers.get('set-cookie')].filter(Boolean);
      return setCookies.map((value) => value.split(';', 1)[0]).join('; ');
    };

    const [tenantA, tenantB] = await Promise.all([
      prisma.tenant.create({ data: { name: 'Pending Tenant A', panNumber: '910000001' } }),
      prisma.tenant.create({ data: { name: 'Pending Tenant B', panNumber: '910000002' } }),
    ]);
    const mkBranch = (tenantId: string, name: string) => prisma.branch.create({
      data: { tenantId, name, address: 'Damak', latitude: 27.7172, longitude: 85.324, admissionFee: 0, radiusMeters: 100 },
    });
    const [branchA, branchB] = await Promise.all([mkBranch(tenantA.id, 'A Damak'), mkBranch(tenantB.id, 'B Branch')]);
    const mkCourse = (tenantId: string, branchId: string, name: string) => prisma.course.create({
      data: { tenantId, branchId, name, feeStructure: {} },
    });
    const mkClass = (courseId: string, branchId: string, name: string, teacherId: string | null, archived = false) =>
      prisma.class.create({
        data: { courseId, branchId, name, teacherId, schedule: [], archivedAt: archived ? new Date() : null },
      });

    const teacher = await sc('teacher@pending.tms.local', tenantA.id, 'Teacher', ['mark_geo_attendance']);
    const other = await sc('other@pending.tms.local', tenantA.id, 'Teacher', ['mark_geo_attendance']);
    const teacherB = await sc('teacher@b.pending.tms.local', tenantB.id, 'Teacher', ['mark_geo_attendance']);

    const courseA = await mkCourse(tenantA.id, branchA.id, 'Science course');
    const courseB = await mkCourse(tenantB.id, branchB.id, 'B course');
    const ownClass = await mkClass(courseA.id, branchA.id, 'Own class', teacher.id);
    const reassigned = await mkClass(courseA.id, branchA.id, 'Science', other.id); // reassigned after the session
    const archived = await mkClass(courseA.id, branchA.id, 'Old archived', teacher.id, true);
    const bClass = await mkClass(courseB.id, branchB.id, 'B class', teacherB.id);

    const day = (offset: number) => {
      const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d;
    };
    const mkSession = (teacherId: string, classId: string, date: Date, submitted = false) =>
      prisma.teacherSession.create({ data: { teacherId, classId, date, dailyUpdateSubmitted: submitted, status: 'PRESENT_UPDATE_PENDING' } });

    const reassignedSession = await mkSession(teacher.id, reassigned.id, new Date('2026-09-02T00:00:00Z'));
    const archivedSession = await mkSession(teacher.id, archived.id, new Date('2026-09-03T00:00:00Z'));
    const todaySession = await mkSession(teacher.id, ownClass.id, day(0));
    // Another teacher's pending session and another tenant's must never appear.
    await mkSession(other.id, reassigned.id, new Date('2026-09-04T00:00:00Z'));
    await mkSession(teacherB.id, bClass.id, new Date('2026-09-05T00:00:00Z'));
    // Anomaly: a session of this teacher on a class that belongs to another tenant must be ignored by both sides.
    await mkSession(teacher.id, bClass.id, new Date('2026-09-06T00:00:00Z'));

    const cookie = await signIn('teacher@pending.tms.local');
    const inBody = { branchId: branchA.id, latitude: 27.7172, longitude: 85.324, gpsAccuracy: 5 };
    const workspace = async () => {
      const r = await request('GET', '/api/teacher/workspace', cookie);
      assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
      return r.body.pendingUpdates as Array<{ sessionId: string; className: string; courseName: string; date: string }>;
    };

    // 1. The reported defect: guard blocks, and the list must now show why.
    const blocked = await request('POST', '/api/attendance/in', cookie, inBody);
    assert.equal(blocked.status, 403, 'check-in is blocked by past pending sessions');
    const list1 = await workspace();
    const ids1 = list1.map((i) => i.sessionId);
    assert(ids1.includes(reassignedSession.id), 'reassigned-class session must be listed');
    assert(ids1.includes(archivedSession.id), 'archived-class session must be listed');
    assert(ids1.includes(todaySession.id), "today's pending session stays listed (no regression)");
    assert.equal(ids1.length, 3, 'no other teacher or tenant session leaks in: ' + JSON.stringify(list1));
    const entry = list1.find((i) => i.sessionId === reassignedSession.id)!;
    assert.equal(entry.className, 'Science');
    assert.equal(entry.courseName, 'Science course');

    // 2. Submit through the same route the portal uses; clear every past blocker.
    for (const id of [reassignedSession.id, archivedSession.id]) {
      const res = await request('POST', `/api/teacher/session/${id}/update`, cookie, { updateContent: 'Test summary' });
      assert.equal(res.status, 200, JSON.stringify(res.body));
    }
    // The session of the other tenant's class (anomaly) is not visible and still blocks until handled: guard and list agree.
    const still = await request('POST', '/api/attendance/in', cookie, inBody);
    assert.equal(still.status, 200, 'guard passes once visible blockers are submitted: ' + JSON.stringify(still.body));
    const list2 = (await workspace()).map((i) => i.sessionId);
    assert(!list2.includes(reassignedSession.id) && !list2.includes(archivedSession.id));
    assert(list2.includes(todaySession.id), "today's session is still pending and listed");

    // 3. Cross-tenant and cross-teacher isolation of the submit route.
    const foreign = await prisma.teacherSession.findFirstOrThrow({ where: { teacherId: other.id } });
    const denied = await request('POST', `/api/teacher/session/${foreign.id}/update`, cookie, { updateContent: 'x' });
    assert.equal(denied.status, 404, 'cannot submit another teacher\'s session');

    // 4. Cap: more blockers than the list limit must never become permanent and invisible.
    const bulkDate = (i: number) => new Date(Date.UTC(2026, 0, 1 + i));
    await prisma.teacherSession.createMany({
      data: Array.from({ length: 205 }, (_, i) => ({ teacherId: teacher.id, classId: reassigned.id, date: bulkDate(i), status: 'PRESENT_UPDATE_PENDING' as const })),
    });
    // Mark OUT first so a fresh IN is possible is unnecessary: the guard is checked before stamps.
    const blocked2 = await request('POST', '/api/attendance/in', cookie, inBody);
    assert.equal(blocked2.status, 403);
    let rounds = 0;
    while (true) {
      const list = (await workspace()).filter((i) => i.sessionId !== todaySession.id);
      if (!list.length) break;
      assert(list.length <= 200, 'list is capped');
      rounds += 1;
      assert(rounds < 5, 'draining must finish');
      for (const item of list) {
        const res = await request('POST', `/api/teacher/session/${item.sessionId}/update`, cookie, { updateContent: 'Bulk test summary' });
        assert.equal(res.status, 200);
      }
    }
    assert.equal(rounds, 2, '205 blockers drain in two rounds, none stuck invisible');

    // 5. After the whole backlog is submitted, the guard clears for check-in (a second IN is fine: first stamp already exists, so expect either ok or an already-in rule, but never the pending 403).
    const finalTry = await request('POST', '/api/attendance/in', cookie, inBody);
    assert.notEqual(finalTry.status === 403 && String(finalTry.body?.error).includes('pending'), true, 'no pending block remains');
    const remaining = await prisma.teacherSession.count({
      where: { teacherId: teacher.id, dailyUpdateSubmitted: false, date: { lt: day(0) }, class: { course: { tenantId: tenantA.id } } },
    });
    assert.equal(remaining, 0);
    console.log('pending-updates integration passed (rounds=' + rounds + ')');
  } finally {
    await prisma.$disconnect();
    server.close();
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
