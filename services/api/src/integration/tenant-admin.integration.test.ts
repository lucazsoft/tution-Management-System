import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const TEST_SCHEMA = 'tenant_admin_integration';
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

    const health = await request('GET', '/api/health');
    assert.equal(health.status, 200, 'health checks remain public');
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(health.headers.get('x-frame-options'), 'DENY');
    assert.equal(health.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(health.headers.get('content-security-policy'), "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    assert(health.headers.get('x-request-id'), 'API responses must include a correlation ID');

    const unexpectedFailure = await request('GET', '/api/_test/throw');
    assert.equal(unexpectedFailure.status, 500, 'unexpected failures must use the central error boundary');
    assert.equal(unexpectedFailure.body.error, 'Internal Server Error');
    assert(unexpectedFailure.body.requestId, 'unexpected failures must return a correlation ID');
    assert.equal(unexpectedFailure.body.message, undefined, 'unexpected failures must not disclose internal error messages');

    const malformedJson = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: {
        origin: process.env.WEB_ORIGIN!,
        'content-type': 'application/json',
      },
      body: '{',
    });
    assert.equal(malformedJson.status, 400, 'malformed JSON must be rejected as a client error');
    assert.equal((await malformedJson.json()).error, 'Malformed JSON request body.');

    const oversizedResetRequest = await request('POST', '/api/auth/forgot-password', undefined, {
      email: 'oversized@integration.tms.local',
      padding: 'x'.repeat(20 * 1024),
    });
    assert.equal(oversizedResetRequest.status, 413, 'legacy auth JSON must enforce its small body limit');
    assert.equal(oversizedResetRequest.body.error, 'Request payload is too large.');

    const unexpectedResetField = await request('POST', '/api/auth/forgot-password', undefined, {
      email: 'tenant-a-admin@integration.tms.local',
      role: 'Tenant Admin',
    });
    assert.equal(unexpectedResetField.status, 400, 'sensitive auth payloads must reject unknown fields');
    assert.equal(unexpectedResetField.body.error, 'Unexpected field: role.');

    const createTenantAdmin = async (
      tenantId: string,
      email: string,
      roleName = 'Tenant Admin',
      branchId: string | null = null,
      permissions: string[] = [],
    ) => {
      const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
      const role = await prisma.role.create({
        data: { tenantId, name: roleName, permissions },
      });
      const user = await prisma.user.create({
        data: {
          tenantId,
          email,
          name: roleName,
          firstName: roleName.split(' ')[0],
          lastName: 'Integration',
          phone: '9800000000',
          passwordHash,
          status: 'ACTIVE',
          accounts: {
            create: {
              accountId: email,
              providerId: 'credential',
              password: passwordHash,
            },
          },
          userRoles: { create: { roleId: role.id, branchId } },
        },
      });
      return user;
    };

    const signIn = async (email: string, password = TEST_PASSWORD): Promise<string> => {
      const response = await request('POST', '/api/auth/sign-in/email', undefined, {
        email,
        password,
      });
      assert.equal(response.status, 200, `sign-in failed for ${email}: ${JSON.stringify(response.body)}`);
      const setCookies: string[] =
        (response.headers as any).getSetCookie?.() ??
        [response.headers.get('set-cookie')].filter(Boolean);
      const cookie = setCookies.map((value) => value.split(';', 1)[0]).join('; ');
      assert(cookie, `sign-in for ${email} did not issue a session cookie`);
      return cookie;
    };

    const [tenantA, tenantB] = await Promise.all([
      prisma.tenant.create({ data: { name: 'Integration Tenant A', panNumber: '900000001' } }),
      prisma.tenant.create({ data: { name: 'Integration Tenant B', panNumber: '900000002' } }),
    ]);
    const [branchA, branchB] = await Promise.all([
      prisma.branch.create({
        data: {
          tenantId: tenantA.id, name: 'Tenant A Branch', address: 'Kathmandu',
          latitude: 27.7172, longitude: 85.324,
        },
      }),
      prisma.branch.create({
        data: {
          tenantId: tenantB.id, name: 'Tenant B Branch', address: 'Pokhara',
          latitude: 28.2096, longitude: 83.9856,
        },
      }),
    ]);
    const [adminA, adminB] = await Promise.all([
      createTenantAdmin(
        tenantA.id,
        'tenant-a-admin@integration.tms.local',
        'Tenant Admin',
        null,
        ['manage_branches', 'manage_students', 'manage_billing', 'view_reports'],
      ),
      createTenantAdmin(
        tenantB.id,
        'tenant-b-admin@integration.tms.local',
        'Tenant Admin',
        null,
        ['manage_branches', 'manage_students', 'manage_billing', 'view_reports'],
      ),
    ]);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failedLogin = await request('POST', '/api/auth/sign-in/email', undefined, {
        email: adminA.email,
        password: 'incorrect-password',
      });
      assert.equal(failedLogin.status, 401, 'an incorrect password must remain a generic login failure');
    }
    const blockedLogin = await request('POST', '/api/auth/sign-in/email', undefined, {
      email: adminA.email,
      password: 'incorrect-password',
    });
    assert.equal(blockedLogin.status, 429, 'the sixth failed login must be rate-limited');
    assert(blockedLogin.headers.get('x-retry-after'), 'rate-limited logins must provide a retry delay');
    for (let retry = 0; retry < 20; retry += 1) {
      const securityEvents = await (prisma as any).authSecurityEvent.count({
        where: { event: 'AUTH_LOGIN_RATE_LIMITED' },
      });
      if (securityEvents === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(
      await (prisma as any).authSecurityEvent.count({ where: { event: 'AUTH_LOGIN_RATE_LIMITED' } }),
      1,
      'a rate-limited login must create a security-monitoring event',
    );
    await (prisma as any).rateLimit.deleteMany();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const resetRequest = await request('POST', '/api/auth/forgot-password', undefined, {
        email: adminA.email,
      });
      assert.equal(resetRequest.status, 200, 'password-reset requests within the limit must return the generic success response');
    }
    const blockedResetRequest = await request('POST', '/api/auth/forgot-password', undefined, {
      email: adminA.email,
    });
    assert.equal(blockedResetRequest.status, 429, 'the sixth password-reset request must be rate-limited');
    assert(blockedResetRequest.headers.get('x-retry-after'), 'rate-limited reset requests must provide a retry delay');
    await (prisma as any).rateLimit.deleteMany();

    const branchAdminA = await createTenantAdmin(
      tenantA.id,
      'branch-a-admin@integration.tms.local',
      'Branch Admin',
      branchA.id,
      [
        'manage_branches', 'manage_students', 'manage_billing', 'view_reports',
        'manage_courses', 'manage_staff', 'approve_leave_l1',
        'issue_certificates', 'manage_resource_tasks', 'manage_branch_calendar',
      ],
    );
    const accountantA = await createTenantAdmin(
      tenantA.id,
      'accountant-a@integration.tms.local',
      'Accountant',
      branchA.id,
      ['manage_billing', 'manage_petty_cash', 'view_reports'],
    );

    const twoFactorUser = await createTenantAdmin(
      tenantA.id,
      'two-factor-admin@integration.tms.local',
      'Tenant Admin',
      null,
      ['manage_branches'],
    );
    await prisma.user.update({
      where: { id: twoFactorUser.id },
      data: { twoFactorEnabled: true, securityMobile: twoFactorUser.phone, securityMobileVerifiedAt: new Date() },
    });
    await prisma.twoFactor.create({
      data: {
        id: `sms-otp-${twoFactorUser.id}`,
        userId: twoFactorUser.id,
        secret: 'integration-sms-otp-placeholder',
        backupCodes: '[]',
      },
    });

    let response = await request('POST', '/api/auth/sign-in/email', undefined, {
      email: twoFactorUser.email,
      password: TEST_PASSWORD,
    });
    assert.equal(response.status, 200, '2FA password verification should start a challenge');
    assert.equal(response.body.twoFactorRedirect, true,
      'a 2FA-enabled user must not receive an authenticated session after password entry');
    const twoFactorChallengeCookies: string[] =
      (response.headers as any).getSetCookie?.() ??
      [response.headers.get('set-cookie')].filter(Boolean);
    const twoFactorChallengeCookie = twoFactorChallengeCookies
      .map((value) => value.split(';', 1)[0])
      .join('; ');
    response = await request('GET', '/api/branches', twoFactorChallengeCookie);
    assert.equal(response.status, 401,
      'a pending 2FA challenge must not authorize protected API requests');
    response = await request('POST', '/api/auth/two-factor/send-otp', twoFactorChallengeCookie, {});
    assert.equal(response.status, 200, 'a pending 2FA challenge should send a mock OTP');
    const twoFactorCode = getMockVerificationCodeForTest(twoFactorUser.email, 'TWO_FACTOR');
    assert(twoFactorCode, 'mock delivery should retain the 2FA OTP for integration verification');
    response = await request('POST', '/api/auth/two-factor/verify-otp', twoFactorChallengeCookie, {
      code: twoFactorCode,
      trustDevice: false,
    });
    assert.equal(response.status, 200, 'the correct OTP should create a session');
    const verifiedTwoFactorCookies: string[] =
      (response.headers as any).getSetCookie?.() ??
      [response.headers.get('set-cookie')].filter(Boolean);
    const verifiedTwoFactorCookie = verifiedTwoFactorCookies
      .map((value) => value.split(';', 1)[0])
      .join('; ');
    response = await request('GET', '/api/branches', verifiedTwoFactorCookie);
    assert.equal(response.status, 200,
      'a successfully verified 2FA session should access authorized protected routes');

    await (prisma as any).rateLimit.deleteMany();
    const [adminACookie, adminBCookie, branchAdminCookie, accountantCookie] = await Promise.all([
      signIn(adminA.email),
      signIn(adminB.email),
      signIn(branchAdminA.email),
      signIn(accountantA.email),
    ]);

    response = await request('GET', '/api/branches');
    assert.equal(response.status, 401, 'protected routes must reject missing sessions');

    response = await request('GET', '/api/users/me', adminACookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.isTenantAdmin, true);
    assert.deepEqual(response.body.manageableBranches.map((branch: any) => branch.id), [branchA.id]);

    response = await request('GET', '/api/branches', adminACookie, undefined, {
      'x-tenant-id': tenantB.id,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.branches.map((branch: any) => branch.id), [branchA.id],
      'client-controlled tenant headers must not change scope');

    response = await request('GET', '/api/branches', branchAdminCookie);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.branches.map((branch: any) => branch.id), [branchA.id],
      'Branch Admin branch listings must be derived from assigned branch roles');

    response = await request('GET', '/api/branches', accountantCookie);
    assert.equal(response.status, 403,
      'non-admin roles must not receive the branch-management projection or geofence configuration');

    response = await request('GET', '/api/finances/overview', branchAdminCookie);
    assert.equal(response.status, 200,
      'Branch Admin should receive finance totals scoped to the assigned branch');
    response = await request('GET', '/api/finances/overview', accountantCookie);
    assert.equal(response.status, 200,
      'branch-scoped finance roles should receive fee totals for their permitted branches');

    response = await request('GET', '/api/tenant-admin/dashboard', adminACookie);
    assert.equal(response.status, 200,
      'Tenant Admin dashboard must remain mounted when platform administration is disabled');
    assert.deepEqual(response.body.branchSummary.map((branch: any) => branch.branchId), [branchA.id]);
    response = await request('GET', '/api/tenant-admin/dashboard', branchAdminCookie);
    assert.equal(response.status, 403, 'Branch Admin must not receive institution-wide dashboard summaries');

    response = await request('POST', '/api/branches', adminACookie, {
      tenantId: tenantB.id,
      name: 'Created Safely',
      address: 'Lalitpur',
      latitude: 27.6588,
      longitude: 85.3247,
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.branch.tenantId, tenantA.id);

    response = await request('PUT', `/api/branches/${branchB.id}`, adminACookie, { name: 'Compromised' });
    assert.equal(response.status, 404, 'foreign-tenant branch updates must be hidden');

    response = await request('PUT', `/api/branches/${branchB.id}`, branchAdminCookie, { name: 'Compromised' });
    assert.equal(response.status, 403, 'branch-scoped permissions must default-deny resource IDs without proven scope');

    const gradeB = await prisma.grade.create({
      data: {
        tenantId: tenantB.id,
        name: 'Class 8 Foreign',
        admissionFee: 2500,
        monthlyFee: 3000,
      },
    });
    response = await request('GET', `/api/grades/${gradeB.id}`, adminACookie);
    assert.equal(response.status, 404);
    response = await request('PUT', `/api/grades/${gradeB.id}`, adminACookie, { monthlyFee: 1 });
    assert.equal(response.status, 404);
    response = await request('DELETE', `/api/grades/${gradeB.id}`, adminACookie);
    assert.equal(response.status, 404);

    response = await request('POST', '/api/grades', adminACookie, {
      name: 'Class 10 Integration',
      sortOrder: 10,
      monthlyFee: 4500,
      admissionFee: 3500,
      billingMode: 'GRADE',
    });
    assert.equal(response.status, 201);
    const gradeAId = response.body.grade.id;
    assert.equal(response.body.grade.tenantId, tenantA.id);

    response = await request('PUT', '/api/finances/config', branchAdminCookie, {
      vatRate: 13,
      gracePeriod: 15,
      pettyCashCap: 20000,
      refundPolicy: 'NO_REFUND',
      lateFeeEnabled: false,
      lateFeeGraceDays: 0,
      appointmentWindowHours: 24,
      maintenanceEscalationDays: 3,
      performanceWeights: {
        attendance: 30, updateCompliance: 25, feedback: 20, leaveCompliance: 15, taskCompletion: 10,
      },
    });
    assert.equal(response.status, 403, 'only Tenant Admin may change institution policy');

    response = await request('PUT', '/api/finances/config', adminACookie, {
      vatRate: 13,
      gracePeriod: 20,
      pettyCashCap: 30000,
      refundPolicy: 'PRO_RATA',
      lateFeeEnabled: true,
      lateFeeMode: 'FLAT',
      lateFeeValue: 100,
      lateFeeGraceDays: 5,
      appointmentWindowHours: 24,
      maintenanceEscalationDays: 3,
      leavePolicy: { casualDays: 12 },
      performanceWeights: {
        attendance: 30, updateCompliance: 25, feedback: 20, leaveCompliance: 15, taskCompletion: 10,
      },
    });
    assert.equal(response.status, 200);
    assert.equal(await prisma.tenantPolicyVersion.count({ where: { tenantId: tenantA.id } }), 1);
    assert.equal(await prisma.tenantPolicyVersion.count({ where: { tenantId: tenantB.id } }), 0);

    response = await request('POST', '/api/users/admissions', adminACookie, {
      branchId: branchA.id,
      gradeId: gradeAId,
      student: {
        firstName: 'Student', lastName: 'Integration',
        email: 'student@integration.tms.local', phone: '9800000001',
      },
      parent: {
        firstName: 'Parent', lastName: 'Integration',
        email: 'parent@integration.tms.local', phone: '9800000002',
      },
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.admission.status, 'PENDING_PAYMENT');
    const admissionStudentId = response.body.admission.studentId;

    response = await request(
      'POST',
      `/api/users/admissions/${admissionStudentId}/issue-logins`,
      adminACookie,
      {},
    );
    assert.equal(response.status, 409, 'credentials must remain blocked before admission payment');

    const foreignAdmission = await request('POST', '/api/users/admissions', adminACookie, {
      branchId: branchB.id,
      gradeId: gradeB.id,
      student: {
        firstName: 'Foreign', lastName: 'Student',
        email: 'foreign-student@integration.tms.local', phone: '9800000003',
      },
      parent: {
        firstName: 'Foreign', lastName: 'Parent',
        email: 'foreign-parent@integration.tms.local', phone: '9800000004',
      },
    });
    assert.equal(foreignAdmission.status, 404, 'foreign tenant admission resources must be hidden');

    const admissionInvoice = await prisma.invoice.findFirstOrThrow({
      where: { tenantId: tenantA.id, studentId: admissionStudentId, invoiceType: 'ADMISSION' },
    });
    response = await request(
      'POST',
      `/api/finances/invoices/${admissionInvoice.id}/pay`,
      accountantCookie,
      { transactionId: 'CASH-INTEGRATION-001' },
    );
    assert.equal(response.status, 200, 'assigned Accountant may record the admission payment');
    assert.equal(
      (await prisma.student.findUniqueOrThrow({ where: { id: admissionStudentId } })).admissionStatus,
      'READY_FOR_LOGIN',
    );
    response = await request(
      'POST',
      `/api/finances/invoices/${admissionInvoice.id}/pay`,
      accountantCookie,
      { transactionId: 'DUPLICATE' },
    );
    assert.equal(response.status, 400, 'an invoice cannot be paid twice');
    const concurrentCredentialIssues = await Promise.all([
      request('POST', `/api/users/admissions/${admissionStudentId}/issue-logins`, adminACookie, {}),
      request('POST', `/api/users/admissions/${admissionStudentId}/issue-logins`, adminACookie, {}),
    ]);
    assert.deepEqual(
      concurrentCredentialIssues.map((result) => result.status).sort(),
      [200, 409],
      'admission credentials must be issued exactly once',
    );
    const credentialIssue = concurrentCredentialIssues.find((result) => result.status === 200)!;
    const studentCredentials = credentialIssue.body.student;
    const parentCredentials = credentialIssue.body.parent;
    await (prisma as any).rateLimit.deleteMany();
    const [studentCookie, parentCookie] = await Promise.all([
      signIn(studentCredentials.email, studentCredentials.temporaryPassword),
      signIn(parentCredentials.email, parentCredentials.temporaryPassword),
    ]);

    response = await request('GET', '/api/branches', studentCookie);
    assert.equal(response.status, 403, 'Students must not enumerate branch-management metadata');
    response = await request('GET', '/api/branches', parentCookie);
    assert.equal(response.status, 403, 'Parents must not enumerate branch-management metadata');
    response = await request('GET', '/api/finances/overview', studentCookie);
    assert.equal(response.status, 403, 'Students must not receive institution-wide finance totals');
    response = await request('GET', '/api/finances/overview', parentCookie);
    assert.equal(response.status, 403, 'Parents must not receive institution-wide finance totals');

    const activatedStudent = await prisma.student.findUniqueOrThrow({
      where: { id: admissionStudentId },
      include: { user: true, studentParents: { include: { parent: { include: { user: true } } } } },
    });
    assert.equal(activatedStudent.admissionStatus, 'ACTIVE');
    assert.equal(activatedStudent.user.status, 'ACTIVE');
    assert.equal(activatedStudent.studentParents[0].parent.user.status, 'ACTIVE');

    response = await request('POST', '/api/cron/trigger', branchAdminCookie, {
      taskName: 'monthly-due-verification',
    });
    assert.equal(response.status, 403);
    response = await request('POST', '/api/cron/trigger', adminBCookie, {
      taskName: 'monthly-due-verification',
    });
    assert.equal(response.status, 200);
    const tenantAInvoiceAfterForeignCron = await prisma.invoice.findUniqueOrThrow({
      where: { id: admissionInvoice.id },
    });
    assert.equal(tenantAInvoiceAfterForeignCron.status, 'PAID',
      'another tenant cron invocation must not mutate this tenant');

    const foreignStudentUser = await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        email: 'foreign-domain-student@integration.tms.local',
        name: 'Foreign Domain Student',
        firstName: 'Foreign',
        lastName: 'Student',
        phone: '9800000010',
        passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
        status: 'ACTIVE',
      },
    });
    const foreignStudent = await prisma.student.create({
      data: {
        userId: foreignStudentUser.id,
        gradeId: gradeB.id,
        admissionDate: new Date(),
        emergencyContact: '9800000011',
        admissionStatus: 'ACTIVE',
      },
    });
    const [courseA, courseB] = await Promise.all([
      prisma.course.create({
        data: {
          tenantId: tenantA.id,
          branchId: branchA.id,
          gradeId: gradeAId,
          name: 'Tenant A Mathematics',
          type: 'REGULAR',
          feeStructure: { monthlyBase: 1000 },
        },
      }),
      prisma.course.create({
        data: {
          tenantId: tenantB.id,
          branchId: branchB.id,
          gradeId: gradeB.id,
          name: 'Tenant B Mathematics',
          type: 'REGULAR',
          feeStructure: { monthlyBase: 1000 },
        },
      }),
    ]);

    response = await request('POST', '/api/courses/refund/request', adminACookie, {
      studentId: foreignStudent.id,
      courseId: courseB.id,
      reason: 'Cross-tenant attempt',
      refundAmount: 500,
    });
    assert.equal(response.status, 404, 'refund requests must reject foreign student/course IDs');

    response = await request('POST', '/api/courses/refund/request', adminACookie, {
      studentId: admissionStudentId,
      courseId: courseA.id,
      reason: 'Course cancellation',
      refundAmount: 1000,
    });
    assert.equal(response.status, 201);
    const refundId = response.body.refund.id;
    assert.equal(response.body.refund.policySnapshot.refundPolicy, 'PRO_RATA');

    response = await request('POST', `/api/courses/refund/approve/${refundId}`, adminBCookie, {
      action: 'APPROVE',
      deductionAmount: 100,
    });
    assert.equal(response.status, 404, 'foreign Tenant Admin cannot approve another tenant refund');

    const concurrentRefundApprovals = await Promise.all([
      request('POST', `/api/courses/refund/approve/${refundId}`, adminACookie, {
        action: 'APPROVE', deductionAmount: 100,
      }),
      request('POST', `/api/courses/refund/approve/${refundId}`, adminACookie, {
        action: 'APPROVE', deductionAmount: 100,
      }),
    ]);
    assert.deepEqual(
      concurrentRefundApprovals.map((result) => result.status).sort(),
      [200, 409],
      'refund approval must be an atomic one-time transition',
    );
    response = await request('POST', `/api/courses/refund/settle/${refundId}`, adminACookie, {
      reference: 'BANK-REFUND-001',
      remarks: 'Settled outside TMS',
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.refund.status, 'MANUALLY_REFUNDED');
    response = await request('POST', `/api/courses/refund/settle/${refundId}`, adminACookie, {
      reference: 'BANK-REFUND-DUPLICATE',
    });
    assert.equal(response.status, 409);

    const adminPettyCash = await request('POST', '/api/finances/petty-cash/request', adminACookie, {
      branchId: branchA.id,
      amount: 500,
      purpose: 'Administrator-owned request hidden from Accountant workspace',
    });
    assert.equal(adminPettyCash.status, 201);
    response = await request('POST', '/api/finances/petty-cash/request', accountantCookie, {
      branchId: branchA.id,
      amount: 30000,
      purpose: 'Request above the remaining monthly cap',
    });
    assert.equal(response.status, 201, 'excess requests must be allowed for escalation');
    response = await request('POST', '/api/finances/petty-cash/request', accountantCookie, {
      branchId: branchA.id,
      amount: 1500,
      purpose: 'Classroom supplies',
    });
    assert.equal(response.status, 201);
    const pettyCashId = response.body.pettyCash.id;
    response = await request('GET', '/api/finances/accountant-workspace', accountantCookie);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.branches.map((branch: any) => branch.id), [branchA.id], 'Accountant workspace must expose only assigned branches');
    assert(response.body.pettyCash.some((item: any) => item.id === pettyCashId), 'Accountant workspace must include the caller\'s request');
    assert(!response.body.pettyCash.some((item: any) => item.id === adminPettyCash.body.pettyCash.id), 'Accountant workspace must hide another requester\'s petty cash');
    assert(response.body.invoices.every((invoice: any) => invoice.branchId === branchA.id), 'Accountant invoices must stay within assigned branches');
    response = await request('GET', '/api/finances/overview', accountantCookie);
    assert.equal(response.status, 200, 'Accountant must be able to load the shared fee overview');
    response = await request('GET', '/api/finances/students', accountantCookie);
    assert.equal(response.status, 200, 'Accountant must be able to load the shared fee student list');
    assert(response.body.students.every((student: any) => student.branchId === branchA.id), 'Shared fee page must remain branch-scoped for Accountants');
    response = await request('GET', '/api/finances/pl', accountantCookie);
    assert.equal(response.status, 403, 'Accountants must not receive institution-wide P&L data');
    response = await request('GET', '/api/finances/ledger/export', accountantCookie);
    assert.equal(response.status, 403, 'Accountants must not export the institution-wide ledger');
    response = await request('GET', '/api/finances/petty-cash', accountantCookie);
    assert.equal(response.status, 200);
    assert(response.body.every((item: any) => item.accountantId === accountantA.id), 'Accountant petty-cash list must contain only owned records');
    response = await request('POST', `/api/finances/petty-cash/approve-l1/${pettyCashId}`, branchAdminCookie, {
      remarks: 'Verified',
    });
    assert.equal(response.status, 200);
    response = await request('POST', `/api/finances/petty-cash/approve-l2/${pettyCashId}`, adminBCookie, {
      remarks: 'Cross-tenant attempt',
    });
    assert.equal(response.status, 403);
    response = await request('POST', `/api/finances/petty-cash/approve-l2/${pettyCashId}`, adminACookie, {
      remarks: 'Released manually',
    });
    assert.equal(response.status, 403, 'within-allowance branch release must not be released twice');
    response = await request('POST', `/api/finances/petty-cash/upload-receipt/${pettyCashId}`, adminACookie, {
      receiptProofUrl: 'https://example.invalid/admin-cannot-upload.jpg',
    });
    assert.equal(response.status, 403);
    response = await request('POST', `/api/finances/petty-cash/upload-receipt/${pettyCashId}`, accountantCookie, {
      receiptProofUrl: 'https://example.invalid/receipt.jpg',
    });
    assert.equal(response.status, 200);
    response = await request('POST', `/api/finances/petty-cash/close/${pettyCashId}`, adminBCookie, {});
    assert.equal(response.status, 404);
    response = await request('POST', `/api/finances/petty-cash/close/${pettyCashId}`, adminACookie, {});
    assert.equal(response.status, 200);

    response = await request('POST', '/api/finances/petty-cash/request', accountantCookie, {
      branchId: branchA.id,
      amount: 900,
      purpose: 'Request that needs revision',
    });
    assert.equal(response.status, 201);
    const revisionPettyCashId = response.body.pettyCash.id;
    response = await request('POST', `/api/finances/petty-cash/decide/${revisionPettyCashId}`, adminACookie, {
      action: 'REVISION',
      remarks: 'Clarify the required supplies.',
    });
    assert.equal(response.status, 200);
    response = await request('PUT', `/api/finances/petty-cash/${revisionPettyCashId}`, branchAdminCookie, {
      amount: 850,
      purpose: 'Unauthorized revision',
    });
    assert.equal(response.status, 409, 'only the requesting Accountant may resubmit a revision');
    response = await request('PUT', `/api/finances/petty-cash/${revisionPettyCashId}`, accountantCookie, {
      amount: 850,
      purpose: 'Revised classroom supply request',
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.pettyCash.amount, '850');
    assert.equal(response.body.pettyCash.approvalChain.at(-1).action, 'RESUBMITTED');

    const staffUser = await createTenantAdmin(
      tenantA.id,
      'staff-a@integration.tms.local',
      'Teacher',
      branchA.id,
      ['mark_geo_attendance'],
    );
    const teacherCookie = await signIn(staffUser.email);
    const staffRecord = await prisma.staffRecord.create({
      data: {
        userId: staffUser.id,
        joiningDate: new Date('2026-01-01'),
        designation: 'Teacher',
        contractType: 'FIXED',
        salaryStructure: { baseMonthlySalary: 40000 },
      },
    });
    response = await request('POST', '/api/hr/payroll/calculate', branchAdminCookie, {
      month: 6,
      year: 2026,
    });
    assert.equal(response.status, 403, 'Branch Admin cannot calculate tenant-wide payroll');
    response = await request('GET', '/api/hr/payroll', branchAdminCookie);
    assert.equal(response.status, 403, 'Branch Admin cannot view tenant-wide payroll');
    response = await request('POST', '/api/hr/payroll/preview', adminACookie, { month: 6, year: 2026 });
    assert.equal(response.status, 200, 'Tenant Admin can preview payroll without writing records');
    assert(response.body.payrolls.some((item: any) => item.staffRecordId === staffRecord.id));
    assert.equal(await prisma.payroll.count({ where: { tenantId: tenantA.id, month: 6, year: 2026 } }), 0);
    response = await request('POST', '/api/hr/payroll/calculate', adminACookie, {
      month: 6,
      year: 2026,
      unexpected: true,
    });
    assert.equal(response.status, 400, 'payroll calculation rejects unknown input fields');
    response = await request('POST', '/api/hr/payroll/calculate', adminACookie, {
      month: 6,
      year: 2026,
    });
    assert.equal(response.status, 201);
    assert(response.body.payrolls.some((item: any) => item.staffRecordId === staffRecord.id));
    assert(response.body.payrolls.every((item: any) => item.branchId === branchA.id), 'Payroll must persist the staff branch at creation time');
    response = await request('POST', '/api/hr/payroll/calculate', adminACookie, { month: 6, year: 2026 });
    assert.equal(response.status, 409, 'duplicate payroll periods are rejected');
    response = await request('GET', '/api/hr/payroll?month=6&year=2026&status=PENDING&search=staff-a', adminACookie);
    assert.equal(response.status, 200, 'payroll supports period, status, and staff search filters');
    assert(response.body.payrolls.every((item: any) => item.month === 6 && item.year === 2026 && item.status === 'PENDING'));
    assert(response.body.payrolls.some((item: any) => item.staffRecordId === staffRecord.id));
    assert(response.body.summary.staffCount >= response.body.payrolls.length);
    assert(response.body.summary.netPayable >= 40000);
    response = await request('GET', '/api/hr/payroll?month=13&year=2026', adminACookie);
    assert.equal(response.status, 400, 'payroll rejects invalid period filters');
    const payroll = await prisma.payroll.create({
      data: {
        tenantId: tenantA.id,
        branchId: branchA.id,
        staffRecordId: staffRecord.id,
        month: 7,
        year: 2026,
        payslipNumber: `PS-202607-${staffRecord.id.slice(0, 8)}`,
        baseSalary: 40000,
        attendanceDeductions: 0,
        bonuses: 0,
        netPayable: 40000,
        status: 'PENDING',
        calculationBreakdown: { baseSalary: 40000, bonuses: 0, deductions: 0, netPayable: 40000 },
      },
    });
    response = await request('POST', `/api/hr/payroll/approve/${payroll.id}`, adminBCookie, {});
    assert.equal(response.status, 404);
    response = await request('POST', `/api/hr/payroll/approve/${payroll.id}`, branchAdminCookie, {});
    assert.equal(response.status, 403);
    response = await request('POST', `/api/hr/payroll/reconcile/${payroll.id}`, adminACookie, {
      reference: 'PREMATURE',
    });
    assert.equal(response.status, 409);
    response = await request('POST', `/api/hr/payroll/approve/${payroll.id}`, adminACookie, {});
    assert.equal(response.status, 200);
    response = await request('POST', `/api/hr/payroll/approve/${payroll.id}`, adminACookie, {});
    assert.equal(response.status, 409);
    response = await request('POST', `/api/hr/payroll/reconcile/${payroll.id}`, adminACookie, {
      reference: 'BANK-SALARY-001',
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.payroll.status, 'MANUALLY_PAID');
    assert.equal(response.body.payroll.settlementReference, 'BANK-SALARY-001');
    const bulkPayroll = await prisma.payroll.create({ data: {
      tenantId: tenantA.id, branchId: branchA.id, staffRecordId: staffRecord.id, month: 8, year: 2026,
      payslipNumber: `PS-202608-${staffRecord.id.slice(0, 8)}`, baseSalary: 40000,
      attendanceDeductions: 10.01, bonuses: 20.02, netPayable: 40010.01,
      calculationBreakdown: { baseSalary: 40000, bonuses: 20.02, deductions: 10.01, netPayable: 40010.01 },
      adjustmentRemarks: 'Integration adjustment', status: 'PENDING',
    } });
    response = await request('POST', '/api/hr/payroll/approve-bulk', adminBCookie, { ids: [bulkPayroll.id] });
    assert.equal(response.status, 404, 'bulk approval hides foreign-tenant payroll identifiers');
    response = await request('POST', '/api/hr/payroll/approve-bulk', adminACookie, { ids: [bulkPayroll.id] });
    assert.equal(response.status, 200);
    response = await request('POST', '/api/hr/payroll/reconcile-bulk', adminACookie, { entries: [{ id: bulkPayroll.id, reference: 'BANK-BULK-001', paymentEvidence: 'bank-statement-row-1' }] });
    assert.equal(response.status, 200);
    const settledBulk = await prisma.payroll.findUniqueOrThrow({ where: { id: bulkPayroll.id } });
    assert.equal(settledBulk.status, 'MANUALLY_PAID');
    assert.equal(settledBulk.paymentEvidence, 'bank-statement-row-1');
    assert(settledBulk.settlementDate);

    // Courses, classes, enrollment, billing controls, timetable, and CRUD.
    response = await request('POST', '/api/courses/classes', adminACookie, {
      courseId: courseA.id,
      name: 'Class 10 Mathematics A',
      schedule: [{ day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()], start: '09:00', end: '10:00' }],
    });
    assert.equal(response.status, 201);
    const classAId = response.body.class.id;
    response = await request('POST', '/api/courses/classes', adminACookie, {
      courseId: courseB.id,
      name: 'Foreign class attempt',
      schedule: [],
    });
    assert.equal(response.status, 404);
    response = await request('PUT', `/api/courses/classes/${classAId}`, adminACookie, {
      name: 'Class 10 Mathematics Updated',
      teacherId: staffUser.id,
    });
    assert.equal(response.status, 200);
    response = await request('GET', '/api/courses', adminACookie);
    assert.equal(response.status, 200);
    assert(response.body.courses.every((course: any) => course.branchId !== branchB.id));
    response = await request('GET', '/api/courses/classes', adminACookie);
    assert.equal(response.status, 200);
    assert(response.body.classes.some((klass: any) => klass.id === classAId));
    response = await request('GET', `/api/courses/classes/${classAId}`, adminACookie);
    assert.equal(response.status, 200);
    const foreignClassId = await prisma.class.create({
      data: { courseId: courseB.id, branchId: branchB.id, name: 'Foreign Class', schedule: [] },
    }).then((klass) => klass.id);
    response = await request('GET', `/api/courses/classes/${foreignClassId}`, adminACookie);
    assert.equal(response.status, 404);

    response = await request('POST', '/api/courses/enroll', adminACookie, {
      studentId: admissionStudentId,
      courseId: courseA.id,
      classId: classAId,
    });
    assert.equal(response.status, 201);
    const enrollmentAId = response.body.enrollment.id;
    response = await request('POST', '/api/courses/enroll', adminACookie, {
      studentId: admissionStudentId,
      courseId: courseA.id,
      classId: classAId,
    });
    assert.equal(response.status, 409);
    response = await request('POST', '/api/courses/classes', adminACookie, {
      courseId: courseA.id,
      name: 'Class 10 Mathematics Conflict',
      schedule: [{ day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()], start: '09:30', end: '10:30' }],
    });
    assert.equal(response.status, 201);
    const conflictingClassId = response.body.class.id;
    response = await request('POST', '/api/courses/enroll', adminACookie, {
      studentId: admissionStudentId,
      courseId: courseA.id,
      classId: conflictingClassId,
    });
    assert.equal(response.status, 409, 'students cannot be enrolled into overlapping active classes');
    assert.match(response.body.error, /Student conflict:/);
    assert(Array.isArray(response.body.conflicts));
    assert.equal(await prisma.enrollment.count({ where: { studentId: admissionStudentId, classId: conflictingClassId } }), 0);
    response = await request('POST', '/api/courses/billing/block', adminACookie, {
      studentId: foreignStudent.id,
      courseId: courseB.id,
    });
    assert.equal(response.status, 404);
    response = await request('POST', '/api/courses/billing/block', adminACookie, {
      studentId: admissionStudentId,
      courseId: courseA.id,
    });
    assert.equal(response.status, 200);
    response = await request('POST', '/api/courses/billing/override', adminACookie, {
      studentId: admissionStudentId,
      courseId: courseA.id,
      reason: 'Verified manual override',
    });
    assert.equal(response.status, 200);
    response = await request('GET', `/api/courses/timetable/student/${admissionStudentId}`, adminACookie);
    assert.equal(response.status, 200);
    assert(response.body.timetable.some((item: any) => item.classId === classAId));
    response = await request('GET', `/api/courses/timetable/teacher/${staffUser.id}`, adminACookie);
    assert.equal(response.status, 200);

    // Resource-by-ID isolation: same tenant but another branch must be forbidden,
    // while foreign-tenant identifiers remain hidden.
    const branchA2 = await prisma.branch.create({
      data: {
        tenantId: tenantA.id, name: 'Tenant A Other Branch', address: 'Bhaktapur',
        latitude: 27.671, longitude: 85.4298,
      },
    });
    const teacherA2 = await createTenantAdmin(
      tenantA.id, 'teacher-a2@integration.tms.local', 'Teacher', branchA2.id, ['mark_geo_attendance'],
    );
    const studentUserA2 = await createTenantAdmin(
      tenantA.id, 'student-a2@integration.tms.local', 'Student', branchA2.id, [],
    );
    const studentA2 = await prisma.student.create({
      data: {
        userId: studentUserA2.id, gradeId: gradeAId, admissionDate: new Date(),
        emergencyContact: '9800000012', admissionStatus: 'ACTIVE',
      },
    });
    const courseA2 = await prisma.course.create({
      data: {
        tenantId: tenantA.id, branchId: branchA2.id, gradeId: gradeAId,
        name: 'Other Branch Mathematics', type: 'REGULAR', feeStructure: { monthlyBase: 1100 },
      },
    });
    const classA2 = await prisma.class.create({
      data: {
        courseId: courseA2.id, branchId: branchA2.id, teacherId: teacherA2.id,
        name: 'Other Branch Class', schedule: [],
      },
    });
    const enrollmentA2 = await prisma.enrollment.create({
      data: {
        studentId: studentA2.id, courseId: courseA2.id, classId: classA2.id,
        status: 'ACTIVE', admissionDate: new Date(),
      },
    });
    const sessionA2 = await prisma.teacherSession.create({
      data: { teacherId: teacherA2.id, classId: classA2.id, date: new Date() },
    });
    const invoiceA2 = await prisma.invoice.create({
      data: {
        tenantId: tenantA.id, branchId: branchA2.id, studentId: studentA2.id, amount: 1100, netPayable: 1100,
        billingCycleStart: new Date(), billingCycleEnd: new Date(), dueDate: new Date(),
        invoiceType: 'TUITION', panNumberSnapshot: tenantA.panNumber,
      },
    });
    response = await request('GET', `/api/courses/classes/${classA2.id}`, branchAdminCookie);
    assert.equal(response.status, 403, 'branch admins must not read classes in another branch');
    response = await request('PUT', `/api/courses/classes/${classA2.id}`, branchAdminCookie, { name: 'IDOR' });
    assert.equal(response.status, 403, 'branch admins must not update classes in another branch');
    response = await request('DELETE', `/api/courses/classes/${classA2.id}`, branchAdminCookie);
    assert.equal(response.status, 403, 'branch admins must not delete classes in another branch');
    response = await request('PUT', `/api/courses/${courseA2.id}`, branchAdminCookie, { description: 'IDOR' });
    assert.equal(response.status, 403, 'branch admins must not update courses in another branch');
    response = await request('DELETE', `/api/courses/${courseA2.id}`, branchAdminCookie);
    assert.equal(response.status, 403, 'branch admins must not delete courses in another branch');
    response = await request('DELETE', `/api/courses/enrollments/${enrollmentA2.id}`, branchAdminCookie);
    assert.equal(response.status, 403, 'branch admins must not drop another branch enrollment');
    response = await request('GET', `/api/courses/timetable/student/${studentA2.id}`, branchAdminCookie);
    assert.equal(response.status, 403, 'branch admins must not read another branch student timetable');
    response = await request('GET', `/api/courses/timetable/teacher/${teacherA2.id}`, branchAdminCookie);
    assert.equal(response.status, 403, 'branch admins must not read another branch teacher timetable');
    response = await request('GET', `/api/branch-admin/dashboard?branchId=${branchA.id}`, branchAdminCookie);
    assert.equal(response.status, 200, 'assigned Branch Admin must receive a live branch dashboard');
    assert.equal(response.body.selectedBranch.id, branchA.id);
    assert(response.body.pettyCash.every((item: any) => item.status === 'PENDING'), 'dashboard approval queue must contain only pending requests');
    response = await request('GET', `/api/branch-admin/dashboard?branchId=${branchA2.id}`, branchAdminCookie);
    assert.equal(response.status, 403, 'Branch Admin dashboard must reject an unassigned branch');
    response = await request('GET', `/api/finances/students/${studentA2.id}/invoices`, branchAdminCookie);
    assert.equal(response.status, 404, 'another branch student invoice list must be hidden');
    response = await request('GET', `/api/finances/students/${studentA2.id}/invoices`, accountantCookie);
    assert.equal(response.status, 404, 'Accountants must not read another branch student invoice list');
    response = await request('GET', `/api/finances/nepalpay-qr/${invoiceA2.id}`, branchAdminCookie);
    assert.equal(response.status, 404, 'another branch invoice QR must be hidden');
    response = await request('GET', `/api/finances/nepalpay-qr/${invoiceA2.id}`, accountantCookie);
    assert.equal(response.status, 404, 'Accountants must not read another branch invoice QR');
    const transferredStudentRole = await prisma.userRole.findFirstOrThrow({ where: { userId: studentUserA2.id } });
    await prisma.userRole.update({ where: { id: transferredStudentRole.id }, data: { branchId: branchA.id } });
    response = await request('GET', `/api/finances/students/${studentA2.id}/invoices`, accountantCookie);
    assert.equal(response.status, 200, 'Accountant may open a student after transfer into the assigned branch');
    assert(!response.body.invoices.some((invoice: any) => invoice.id === invoiceA2.id), 'A transferred student must not expose the previous branch invoice');
    response = await request('GET', `/api/finances/nepalpay-qr/${invoiceA2.id}`, accountantCookie);
    assert.equal(response.status, 404, 'A transferred student must not expose the previous branch invoice QR');
    response = await request('POST', `/api/finances/invoices/${invoiceA2.id}/pay`, accountantCookie, { transactionId: 'CROSS-BRANCH-DENIED' });
    assert.equal(response.status, 403, 'A transferred student must not let the new branch collect an old branch invoice');
    response = await request('POST', `/api/teacher/session/${sessionA2.id}/update`, teacherCookie, {
      updateContent: 'IDOR attempt',
    });
    assert.equal(response.status, 404, 'teachers must not update another teacher session');
    response = await request('GET', `/api/courses/timetable/student/${foreignStudent.id}`, adminACookie);
    assert.equal(response.status, 404, 'foreign-tenant student timetables must be hidden');
    response = await request('PUT', `/api/courses/classes/${foreignClassId}`, adminACookie, { name: 'IDOR' });
    assert.equal(response.status, 404, 'foreign-tenant class updates must be hidden');
    response = await request('PUT', `/api/courses/${courseB.id}`, adminACookie, { description: 'IDOR' });
    assert.equal(response.status, 404, 'foreign-tenant course updates must be hidden');
    response = await request('GET', `/api/finances/students/${foreignStudent.id}/invoices`, adminACookie);
    assert.equal(response.status, 404, 'foreign-tenant invoice lists must be hidden');

    // Homework ID routes enforce tenant ownership plus teacher/student/parent relationships.
    response = await request('POST', '/api/homework', teacherCookie, {
      classId: classAId,
      subject: 'Mathematics',
      title: 'Authorization exercise',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
    });
    assert.equal(response.status, 201);
    const homeworkId = response.body.homework.id;
    response = await request('POST', '/api/homework', teacherCookie, {
      classId: foreignClassId,
      subject: 'Mathematics',
      title: 'Foreign tenant attempt',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
    });
    assert.equal(response.status, 404);
    const concurrentHomeworkSubmissions = await Promise.all([
      request('POST', '/api/homework/submit', studentCookie, {
        homeworkId, studentId: admissionStudentId, submissionUrl: 'https://example.invalid/submission.pdf',
      }),
      request('POST', '/api/homework/submit', studentCookie, {
        homeworkId, studentId: admissionStudentId, submissionUrl: 'https://example.invalid/submission.pdf',
      }),
    ]);
    assert.deepEqual(
      concurrentHomeworkSubmissions.map((result) => result.status).sort(),
      [201, 409],
      'a student may submit each homework exactly once',
    );
    const homeworkSubmission = concurrentHomeworkSubmissions.find((result) => result.status === 201)!;
    const submissionId = homeworkSubmission.body.submission.id;
    response = await request('POST', '/api/homework/submit', studentCookie, {
      homeworkId, studentId: studentA2.id,
    });
    assert.equal(response.status, 404, 'students cannot submit on behalf of another student');
    response = await request('POST', `/api/homework/grade/${submissionId}`, adminACookie, {
      grade: 'A',
    });
    assert.equal(response.status, 404, 'only the assigned teacher may grade a submission');
    const concurrentHomeworkGrades = await Promise.all([
      request('POST', `/api/homework/grade/${submissionId}`, teacherCookie, {
        grade: 'A', remarks: 'Verified',
      }),
      request('POST', `/api/homework/grade/${submissionId}`, teacherCookie, {
        grade: 'B', remarks: 'Concurrent stale grade',
      }),
    ]);
    assert.deepEqual(
      concurrentHomeworkGrades.map((result) => result.status).sort(),
      [200, 409],
      'homework grading must be an atomic one-time transition',
    );
    response = await request('GET', `/api/homework/${classAId}`, parentCookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.homework[0].submissions[0].studentId, admissionStudentId);
    response = await request('GET', `/api/homework/${classA2.id}`, branchAdminCookie);
    assert.equal(response.status, 403, 'branch admins cannot read another branch homework');
    response = await request('GET', `/api/homework/${foreignClassId}`, adminACookie);
    assert.equal(response.status, 404, 'foreign-tenant homework must be hidden');

    response = await request('POST', '/api/courses/bulk', adminACookie, {
      branchId: branchA.id,
      items: [
        { name: 'Bulk Science', gradeId: gradeAId, monthlyBase: 1200 },
        { name: '', gradeId: gradeAId, monthlyBase: 500 },
      ],
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.created, 1);
    response = await request('POST', '/api/courses', adminACookie, {
      branchId: branchA.id,
      gradeId: gradeAId,
      name: 'Music Integration',
      type: 'MUSIC',
      feeStructure: { monthlyBase: 2000 },
      isTaxExempt: true,
    });
    assert.equal(response.status, 201);
    const specialCourseId = response.body.course.id;
    response = await request('POST', '/api/courses/classes', adminACookie, {
      courseId: specialCourseId,
      name: 'Music Class',
      schedule: [],
    });
    assert.equal(response.status, 201);
    const specialClassId = response.body.class.id;
    response = await request('POST', '/api/courses/enroll/special', adminACookie, {
      studentId: foreignStudent.id,
      courseId: courseB.id,
      classId: specialClassId,
      type: 'MUSIC',
    });
    assert.equal(response.status, 404);
    response = await request('POST', '/api/courses/enroll/special', adminACookie, {
      studentId: admissionStudentId,
      courseId: specialCourseId,
      classId: specialClassId,
      type: 'MUSIC',
      customFeeSettings: { installmentsCount: 2, amountPerInstallment: 1000 },
    });
    assert.equal(response.status, 201);
    const specialEnrollmentId = response.body.enrollment.id;
    response = await request('PUT', `/api/courses/${specialCourseId}`, adminACookie, {
      description: 'Updated specialized course',
      feeStructure: { monthlyBase: 2100 },
    });
    assert.equal(response.status, 200);
    response = await request('DELETE', `/api/courses/${courseB.id}`, adminACookie);
    assert.equal(response.status, 404);
    response = await request('DELETE', `/api/courses/enrollments/${specialEnrollmentId}`, adminACookie);
    assert.equal(response.status, 200);
    response = await request('DELETE', `/api/courses/classes/${specialClassId}`, adminACookie);
    assert.equal(response.status, 200);
    response = await request('DELETE', `/api/courses/${specialCourseId}`, adminACookie);
    assert.equal(response.status, 200);

    // Teacher and student attendance flows.
    const teacherSession = await prisma.teacherSession.findFirstOrThrow({
      where: { teacherId: staffUser.id, classId: classAId },
    });
    response = await request('POST', '/api/attendance/student', teacherCookie, {
      classId: classAId,
      sessionId: teacherSession.id,
      date: teacherSession.date.toISOString(),
      students: [{ studentId: admissionStudentId, status: 'PRESENT' }],
    });
    assert.equal(response.status, 201);
    response = await request('POST', '/api/attendance/session/update', teacherCookie, {
      classId: classAId,
      date: teacherSession.date.toISOString(),
      updateContent: 'Completed algebra lesson.',
    });
    assert.equal(response.status, 200);
    response = await request('POST', '/api/attendance/session/update', teacherCookie, {
      classId: classAId,
      date: teacherSession.date.toISOString(),
      updateContent: 'Duplicate lesson update.',
    });
    assert.equal(response.status, 409, 'daily session confirmation must be one-time');
    const geoPayload = {
      branchId: branchA.id,
      latitude: branchA.latitude,
      longitude: branchA.longitude,
      gpsAccuracy: 5,
    };
    response = await request('POST', '/api/attendance/in', teacherCookie, geoPayload);
    assert.equal(response.status, 200);
    response = await request('POST', '/api/attendance/out', teacherCookie, geoPayload);
    assert.equal(response.status, 200);
    response = await request('POST', '/api/attendance/in', teacherCookie, {
      ...geoPayload,
      branchId: branchB.id,
    });
    assert([403, 404].includes(response.status));

    // Leave workflow, including L1/L2 and cross-tenant branch rejection.
    response = await request('POST', '/api/leaves/request', teacherCookie, {
      leaveType: 'LONG_SICK',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      reason: 'Medical recovery',
      branchId: branchA.id,
    });
    assert.equal(response.status, 201);
    const longLeaveId = response.body.leave.id;
    response = await request('POST', `/api/leaves/approve/${longLeaveId}`, adminACookie, {
      action: 'APPROVE',
    });
    assert.equal(response.status, 403);
    response = await request('POST', `/api/leaves/approve/${longLeaveId}`, branchAdminCookie, {
      action: 'APPROVE',
    });
    assert.equal(response.status, 200);
    response = await request('POST', `/api/leaves/approve/${longLeaveId}`, adminACookie, {
      action: 'APPROVE',
    });
    assert.equal(response.status, 200);
    response = await request('POST', '/api/leaves/request', adminACookie, {
      leaveType: 'SICK',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
      reason: 'Foreign branch attempt',
      branchId: branchB.id,
    });
    assert.equal(response.status, 404);
    response = await request('POST', '/api/leaves/emergency-out', adminACookie, {
      studentId: admissionStudentId,
      branchId: branchA.id,
      reason: 'Guardian pickup',
    });
    assert.equal(response.status, 201);
    response = await request('POST', '/api/leaves/emergency-out', adminACookie, {
      studentId: foreignStudent.id,
      branchId: branchB.id,
      reason: 'Cross tenant attempt',
    });
    assert.equal(response.status, 404);

    // Certificate templates, issuance, foreign IDs, and public verification.
    response = await request('POST', '/api/certificates/templates', branchAdminCookie, {
      name: 'Forbidden Template',
      type: 'COMPLETION',
      layoutConfig: {},
    });
    assert.equal(response.status, 403);
    response = await request('POST', '/api/certificates/templates', adminACookie, {
      name: 'Completion Template',
      type: 'COMPLETION',
      layoutConfig: { title: 'Certificate of Completion' },
    });
    assert.equal(response.status, 201);
    const certificateTemplateId = response.body.template.id;
    response = await request('POST', '/api/certificates/issue', adminACookie, {
      studentId: foreignStudent.id,
      templateId: certificateTemplateId,
      branchId: branchA.id,
    });
    assert.equal(response.status, 404);
    response = await request('POST', '/api/certificates/issue', adminACookie, {
      studentId: admissionStudentId,
      templateId: certificateTemplateId,
      branchId: branchA.id,
    });
    assert.equal(response.status, 201);
    const certificateId = response.body.certificate.certificateId;
    response = await request('GET', `/api/certificates/verify/${certificateId}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.isValid, true);
    response = await request('GET', '/api/certificates/verify/DOES-NOT-EXIST');
    assert.equal(response.status, 404);

    // Persisted broadcasts are tenant-scoped and staff performance reports do
    // not disclose staff outside the caller's institution.
    response = await request('POST', '/api/communication/broadcast', branchAdminCookie, {
      title: 'Forbidden broadcast',
      message: 'Only tenant administrators may publish this.',
    });
    assert.equal(response.status, 403);
    response = await request('POST', '/api/communication/broadcast', adminACookie, {
      title: 'Term opening',
      message: 'Classes resume on Sunday.',
      audienceRoles: ['Parent', 'Teacher'],
    });
    assert.equal(response.status, 201);
    response = await request('GET', '/api/communication/broadcasts', adminBCookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.broadcasts.length, 0, 'foreign-tenant broadcasts must not be visible');

    const branchAdminStaff = await prisma.staffRecord.upsert({
      where: { userId: branchAdminA.id },
      update: {},
      create: {
        userId: branchAdminA.id,
        joiningDate: new Date('2026-01-01T00:00:00.000Z'),
        designation: 'Branch Admin',
        contractType: 'FIXED',
        salaryStructure: {},
      },
    });
    await prisma.staffPerformanceScore.upsert({
      where: { staffRecordId: branchAdminStaff.id },
      update: { overallScore: 92 },
      create: { staffRecordId: branchAdminStaff.id, overallScore: 92 },
    });
    response = await request('GET', '/api/performance/staff/scores', adminACookie);
    assert.equal(response.status, 200);
    assert(response.body.scores.some((score: any) => score.staffRecordId === branchAdminStaff.id && score.score.overall === 92));
    response = await request('GET', '/api/performance/staff/scores', adminBCookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.scores.some((score: any) => score.staffRecordId === branchAdminStaff.id), false);

    // Resource logging and maintenance task ownership.
    const janitorA = await createTenantAdmin(
      tenantA.id,
      'janitor-a@integration.tms.local',
      'Janitor',
      branchA.id,
      ['view_tasks'],
    );
    response = await request('POST', '/api/resources/log', adminACookie, {
      branchId: branchB.id,
      classroomId: 'ROOM-X',
      itemsCondition: { board: 'DAMAGED' },
      actionRequired: true,
      remarks: 'Cross tenant',
    });
    assert.equal(response.status, 404);
    response = await request('POST', '/api/resources/log', adminACookie, {
      branchId: branchA.id,
      classroomId: 'ROOM-101',
      itemsCondition: { board: 'DAMAGED' },
      actionRequired: true,
      remarks: 'Repair required',
    });
    assert.equal(response.status, 201);
    const maintenanceTaskId = response.body.maintenanceTask.id;
    assert.equal(response.body.maintenanceTask.assignedStaffId, janitorA.id);
    response = await request('GET', `/api/resources/tasks?branchId=${encodeURIComponent(branchB.id)}`, adminACookie);
    assert.equal(response.status, 404);
    response = await request('GET', `/api/resources/tasks?branchId=${encodeURIComponent(branchA.id)}`, adminACookie);
    assert.equal(response.status, 200);
    response = await request('POST', `/api/resources/tasks/complete/${maintenanceTaskId}`, adminBCookie, {});
    assert.equal(response.status, 404);
    response = await request('POST', `/api/resources/tasks/complete/${maintenanceTaskId}`, adminACookie, {});
    assert.equal(response.status, 200);
    response = await request('POST', `/api/resources/tasks/complete/${maintenanceTaskId}`, adminACookie, {});
    assert.equal(response.status, 409);

    // Academic and payment calendars.
    response = await request('POST', '/api/academic-events', adminACookie, {
      title: 'Foreign Branch Event',
      eventType: 'EVENT',
      startDate: '2026-08-10',
      endDate: '2026-08-10',
      branchId: branchB.id,
    });
    assert.equal(response.status, 404);
    response = await request('POST', '/api/academic-events', adminACookie, {
      title: 'Institution Holiday',
      eventType: 'HOLIDAY',
      startDate: '2026-08-10',
      endDate: '2026-08-10',
    });
    assert.equal(response.status, 201);
    response = await request('POST', '/api/academic-events', branchAdminCookie, {
      title: 'Branch Exam',
      eventType: 'EXAM',
      startDate: '2026-08-12',
      endDate: '2026-08-12',
      branchId: branchA.id,
    });
    assert.equal(response.status, 201);
    response = await request('GET', `/api/academic-events?branchId=${encodeURIComponent(branchA.id)}`, adminACookie);
    assert.equal(response.status, 200);
    assert(response.body.events.every((event: any) => event.tenantId === tenantA.id));
    response = await request('GET', `/api/academic-events/payments?studentId=${encodeURIComponent(admissionStudentId)}`, adminACookie);
    assert.equal(response.status, 200);
    assert(response.body.paymentEvents.every((event: any) => event.studentId === admissionStudentId));

    // HR documents, alerts, clearance, settlement, and account deactivation.
    response = await request('POST', '/api/hr/documents', adminACookie, {
      staffRecordId: staffRecord.id,
      documentType: 'CONTRACT',
      fileUrl: 'https://example.invalid/contract.pdf',
      expiryDate: new Date(Date.now() + 10 * 86400000).toISOString(),
    });
    assert.equal(response.status, 201);
    response = await request('POST', '/api/hr/documents', branchAdminCookie, {
      staffRecordId: staffRecord.id,
      documentType: 'CERTIFICATION',
      fileUrl: 'https://example.invalid/certification.pdf',
    });
    assert.equal(response.status, 201, 'assigned Branch Admin may manage documents for branch staff');
    response = await request('POST', '/api/hr/documents', adminACookie, {
      staffRecordId: staffRecord.id,
      documentType: 'EXECUTABLE',
      fileUrl: 'http://example.invalid/unsafe.exe',
    });
    assert.equal(response.status, 400, 'staff documents reject unsupported types and non-HTTPS URLs');
    response = await request('POST', '/api/hr/documents', adminBCookie, {
      staffRecordId: staffRecord.id,
      documentType: 'CONTRACT',
      fileUrl: 'https://example.invalid/foreign.pdf',
    });
    assert.equal(response.status, 404);
    response = await request('GET', '/api/hr/documents/alerts', adminACookie);
    assert.equal(response.status, 200);
    assert(response.body.expiringDocs.some((doc: any) => doc.staffRecordId === staffRecord.id));
    response = await request('POST', '/api/hr/exit/initiate', adminACookie, {
      staffRecordId: staffRecord.id,
      resignationDate: '2026-08-15',
      unexpected: true,
    });
    assert.equal(response.status, 400, 'exit initiation rejects unknown input fields');
    response = await request('POST', '/api/hr/exit/initiate', adminACookie, {
      staffRecordId: staffRecord.id,
      resignationDate: '2026-08-15',
      reason: 'Contract complete',
      noticePeriodDays: 30,
    });
    assert.equal(response.status, 201);
    const exitId = response.body.exit.id;
    response = await request('POST', `/api/hr/exit/settle/${exitId}`, adminACookie, {});
    assert.equal(response.status, 409);
    const checklist = response.body?.exit?.clearanceChecklist ?? [
      'Return of Tuition Keys & Access Card',
      'Handover of Physical Textbooks & Curriculums',
      'Finalization of Class Grading Marks',
    ];
    const checklistItems = Array.isArray(checklist) && typeof checklist[0] === 'object'
      ? checklist.map((item: any) => item.item)
      : checklist;
    response = await request('POST', `/api/hr/exit/clear/${exitId}`, adminACookie, {
      checklistItem: checklistItems[0],
    });
    assert.equal(response.status, 403, 'Tenant Admin cannot self-approve Branch Admin clearance');
    for (const checklistItem of checklistItems) {
      response = await request('POST', `/api/hr/exit/clear/${exitId}`, branchAdminCookie, { checklistItem });
      assert.equal(response.status, 200);
    }
    response = await request('POST', `/api/hr/exit/clear/${exitId}`, branchAdminCookie, {
      checklistItem: checklistItems[0],
    });
    assert.equal(response.status, 409, 'a completed clearance item cannot be signed twice');
    response = await request('POST', `/api/hr/exit/settle/${exitId}`, adminBCookie, {});
    assert.equal(response.status, 404);
    response = await request('POST', `/api/hr/exit/settle/${exitId}`, adminACookie, {});
    assert.equal(response.status, 200);
    response = await request('POST', `/api/hr/exit/settle/${exitId}`, adminACookie, {});
    assert.equal(response.status, 409, 'staff exit settlement must be one-time');
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: staffUser.id } })).status, 'INACTIVE');

    // User directory, profiles, analytics, provisioning, bulk import, update, and soft delete.
    response = await request('GET', '/api/users', adminACookie);
    assert.equal(response.status, 200);
    assert(response.body.users.every((user: any) => user.tenantId === undefined || user.tenantId === tenantA.id));
    response = await request('GET', `/api/users/${activatedStudent.user.id}/profile`, adminACookie);
    assert.equal(response.status, 200);
    response = await request('GET', `/api/users/${activatedStudent.user.id}/analytics`, adminACookie);
    assert.equal(response.status, 200);
    response = await request('GET', `/api/users/${foreignStudentUser.id}/profile`, adminACookie);
    assert.equal(response.status, 404);
    response = await request('POST', '/api/users/branch-admin', adminACookie, {
      branchId: branchB.id,
      firstName: 'Foreign',
      lastName: 'Manager',
      email: 'foreign-manager-attempt@integration.tms.local',
      phone: '9800000020',
    });
    assert.equal(response.status, 404);
    response = await request('POST', '/api/users/branch-admin', adminACookie, {
      branchId: branchA.id,
      firstName: 'Second',
      lastName: 'Manager',
      email: 'second-manager@integration.tms.local',
      phone: '9800000021',
    });
    assert.equal(response.status, 201);
    response = await request('POST', '/api/users', adminACookie, {
      branchId: branchA.id,
      role: 'Teacher',
      firstName: 'Missing',
      lastName: 'Salary',
      email: 'missing-salary@integration.tms.local',
      phone: '9800000098',
      contractType: 'FIXED',
    });
    assert.equal(response.status, 400, 'staff creation requires compensation');
    response = await request('POST', '/api/users', adminACookie, {
      branchId: branchA.id,
      role: 'Receptionist',
      firstName: 'Reception',
      lastName: 'User',
      email: 'reception-created@integration.tms.local',
      phone: '9800000022',
      contractType: 'FIXED',
      baseMonthlySalary: 28000,
    });
    assert.equal(response.status, 201);
    const createdUserId = response.body.user.id;
    const createdStaff = await prisma.staffRecord.findUniqueOrThrow({ where: { userId: createdUserId } });
    assert.deepEqual(createdStaff.salaryStructure, { baseMonthlySalary: 28000 });
    response = await request('PUT', `/api/users/${createdUserId}`, adminACookie, {
      contractType: 'HOUR_RATE',
      hourlyRate: 550,
    });
    assert.equal(response.status, 200, 'existing staff compensation can be repaired or changed');
    assert.deepEqual((await prisma.staffRecord.findUniqueOrThrow({ where: { userId: createdUserId } })).salaryStructure, { hourlyRate: 550 });
    response = await request('POST', '/api/users', adminACookie, {
      branchId: branchB.id,
      role: 'Receptionist',
      firstName: 'Foreign',
      lastName: 'User',
      email: 'foreign-created@integration.tms.local',
      phone: '9800000023',
      contractType: 'FIXED',
      baseMonthlySalary: 28000,
    });
    assert.equal(response.status, 404);
    response = await request('POST', '/api/users/bulk-students', adminACookie, {
      students: [{
        firstName: 'Bulk',
        lastName: 'Student',
        email: 'bulk-student@integration.tms.local',
        phone: '9800000024',
        branchName: branchA.name,
        grade: 'Class 10 Integration',
      }],
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.createdCount, 1);
    response = await request('PUT', `/api/users/${createdUserId}`, adminACookie, {
      firstName: 'Updated Reception',
      status: 'SUSPENDED',
    });
    assert.equal(response.status, 200);
    response = await request('PUT', `/api/users/${foreignStudentUser.id}`, adminACookie, {
      firstName: 'Compromised',
    });
    assert.equal(response.status, 404);
    response = await request('DELETE', `/api/users/${createdUserId}`, adminACookie, {});
    assert.equal(response.status, 200);
    response = await request('DELETE', `/api/users/${createdUserId}`, adminACookie, {});
    assert.equal(response.status, 409, 'user deactivation must be a one-time transition');
    response = await request('DELETE', `/api/users/${adminA.id}`, adminACookie, {});
    assert.equal(response.status, 400);

    // Finance reporting endpoints must remain tenant-scoped.
    for (const route of [
      '/api/finances/overview',
      '/api/finances/students',
      `/api/finances/students/${admissionStudentId}/invoices`,
      '/api/finances/pl',
      '/api/finances/ledger/export',
      '/api/hr/payroll',
    ]) {
      response = await request('GET', route, adminACookie);
      assert.equal(response.status, 200, `reporting endpoint failed: ${route}`);
    }

    console.log('Tenant Admin integration tests passed.');
  } finally {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
    await prisma.$disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
