import 'dotenv/config';
import accountContactRouter from './routes/account-contact';
import mobileRecoveryRouter from './routes/mobile-recovery';
import { authenticationSmsConfigured } from './utils/delivery';
import crypto from 'crypto';
import express, { Response } from 'express';
import cors from 'cors';
import { tenantMiddleware, TenantRequest } from './middleware/tenant';
import onboardingRouter from './routes/onboarding';
import coursesRouter from './routes/courses';
import attendanceRouter from './routes/attendance';
import homeworkRouter from './routes/homework';
import academicEventsRouter from './routes/academic-events';
import personalizedClassesRouter from './routes/personalized-classes';
import performanceRouter from './routes/performance';
import hrRouter from './routes/hr';
import certificatesRouter from './routes/certificates';
import financesRouter from './routes/finances';
import staticRouter from './routes/static';
import authRouter from './routes/auth';
import branchesRouter from './routes/branches';
import usersRouter from './routes/users';
import teacherRouter from './routes/teacher';
import gradesRouter from './routes/grades';
import leavesRouter from './routes/leaves';
import communicationRouter from './routes/communication';
import appointmentsRouter from './routes/appointments';
import resourcesRouter from './routes/resources';
import cronRouter from './routes/cron';
import parentRouter from './routes/parent';
import receptionRouter from './routes/reception';
import branchAdminRouter from './routes/branch-admin';
import tenantAdminRouter from './routes/tenant-admin';

import { toNodeHandler } from 'better-auth/node';
import { auth } from './utils/auth';
import { validateRuntimeConfig } from './utils/runtime-config';
import { monitorCredentialSignIn } from './middleware/auth-security-monitor';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const runtimeConfig = validateRuntimeConfig();
const parseLegacyAuthJson = express.json({ limit: '16kb' });
const legacyAuthPaths = new Set([
  '/forgot-password',
  '/verify-reset-otp',
  '/reset-password',
]);

// Browser-facing API responses never need scripts, frames, or a referrer. The
// web app is served separately by nginx, so this restrictive policy does not
// interfere with its bundled assets.
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  if (req.path.startsWith('/api/')) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    res.setHeader('Cache-Control', 'no-store');

    const sendJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 500) {
        return sendJson({ error: 'Internal Server Error', requestId });
      }
      return sendJson(body);
    }) as Response['json'];
  }

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
});

// Enable CORS and parsing of JSON payloads
app.use(cors({
  origin: runtimeConfig.webOrigin,
  credentials: true,
}));

// Health check endpoint (no tenant required)
app.get('/api/health', (req: TenantRequest, res: Response) => {
  return res.json({
    status: 'UP',
    timestamp: new Date(),
    tenantContext: req.tenantId || 'NONE',
  });
});

// Serve static login UI without tenant isolation
app.use('/login', staticRouter);

// The existing password-reset flow is owned by our legacy router. Parse JSON
// only for these three endpoints so Better Auth still receives its own raw
// requests and body parsing remains correct.
app.use('/api/auth', (req, res, next) => {
  if (legacyAuthPaths.has(req.path)) return parseLegacyAuthJson(req, res, next);
  return next();
}, authRouter);

// Better Auth must receive the request before express.json() so its body
// parser and cookie/session handling remain intact.
app.use('/api/auth/two-factor/send-otp', (_req, res, next) => authenticationSmsConfigured()
  ? next()
  : res.status(503).json({ error: 'SMS authentication is temporarily unavailable.' }));
app.all('/api/auth/*', monitorCredentialSignIn, toNodeHandler(auth));

app.use('/api/finances/manual-payment', express.json({ limit: '2mb' }));
app.use('/api/finances/branches', express.json({ limit: '2mb' }));
app.use(express.json({ limit: '256kb' }));

// Global tenant middleware; authenticated scope comes from the verified session.
app.use(tenantMiddleware);

// Bind domain routers
// Tenant provisioning is a development operator surface only. It is not
// mounted in the single-institution production deployment.
if (process.env.PLATFORM_ADMIN_ENABLED === 'true') {
  app.use('/api/onboarding', onboardingRouter);
}
app.use('/api/branches', branchesRouter);
app.use('/api/account/contact', accountContactRouter);
app.use('/api/account/recovery', mobileRecoveryRouter);
app.use('/api/users', usersRouter);
app.use('/api/teacher', teacherRouter);
app.use('/api/grades', gradesRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/homework', homeworkRouter);
app.use('/api/academic-events', academicEventsRouter);
app.use('/api/classes/personalized', personalizedClassesRouter);
app.use('/api/performance', performanceRouter);
app.use('/api/hr', hrRouter);
app.use('/api/certificates', certificatesRouter);
app.use('/api/finances', financesRouter);
app.use('/api/leaves', leavesRouter);
app.use('/api/communication', communicationRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/cron', cronRouter);
app.use('/api/parent', parentRouter);
app.use('/api/reception', receptionRouter);
app.use('/api/branch-admin', branchAdminRouter);
app.use('/api/tenant-admin', tenantAdminRouter);

// Integration-only probe for the central error boundary. It is never mounted
// in local development or production.
if (process.env.NODE_ENV === 'test') {
  app.get('/api/_test/throw', () => {
    throw new Error('test-only internal detail');
  });
}

// Centralized error handling middleware
app.use((err: any, req: TenantRequest, res: Response, next: express.NextFunction) => {
  const requestId = res.locals.requestId || crypto.randomUUID();
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({ error: 'Request payload is too large.', requestId });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON request body.', requestId });
  }
  console.error(JSON.stringify({
    event: 'API_UNEXPECTED_ERROR',
    requestId,
    method: req.method,
    path: req.originalUrl,
    error: err instanceof Error ? err.message : String(err),
  }));
  return res.status(500).json({
    error: 'Internal Server Error',
    requestId,
  });
});

// Start listening only if executed directly
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[TMS Server] Running at http://localhost:${PORT}`);
  });
}

export default app;
