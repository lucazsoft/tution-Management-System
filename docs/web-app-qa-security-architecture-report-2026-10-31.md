# TMS Web QA, Security, and Codebase Architecture Report

**Prepared:** 2026-10-31  
**Scope:** React/TypeScript web application in `apps/web`, plus directly related API/authentication controls in `services/api`  
**Audience:** Development, QA, security, and product teams  
**Assessment type:** Static QA and architecture review; authenticated runtime UAT and penetration testing remain required  
**Status:** Release-readiness report

## 1. Executive summary

The web application is broad and feature-rich, with substantial role coverage, reusable UI patterns, typed frontend code, server-side authentication, tenant-aware API routing, and a meaningful automated smoke-test collection. The codebase is **managed rather than abandoned**, but it is also **partly fragmented**: authentication, browser session state, authorization, and feature implementation have grown through multiple generations of patterns.

The most important conclusion is:

> No confirmed exploitable vulnerability was identified in the bounded security review. However, the current architecture has elevated regression and authorization-drift risk because equivalent responsibilities are implemented in multiple places.

Release confidence should therefore be described as **conditional**, not as a security certification. Before production sign-off, the team still needs successful build/lint/test results, authenticated browser execution, tenant/branch isolation tests, provider UAT, dependency review, and deployment-header verification.

## 2. What is working well

### Product and functional coverage

- Student and Parent portals have broad live-data coverage across academics, attendance, timetable, fees, appointments/messages, notifications, certificates, and calendars.
- Teacher, Tenant Admin, Branch Admin, Janitor, Accountant/unsupported-role, and setup flows are represented in the web application.
- Existing tests cover multiple role smoke paths, payments, account settings, calendar behavior, tenant payments, certificates, and regression cases.
- The frontend includes loading, empty, error, retry, responsive, and dark-theme patterns in many areas.

### Engineering controls

- React and TypeScript provide a reasonable typed component foundation.
- Webpack uses content-hashed production assets, code splitting, and clean output.
- API requests use `credentials: 'include'`, consistent with cookie-based sessions.
- The API has explicit authentication middleware, tenant middleware, body-size limits, rate-limit/security-monitoring code, and route-level integration tests.
- The repository documents manual acceptance requirements for session handling, unauthenticated access, cross-branch authorization, IDOR attempts, role escalation, and credential leakage.
- The earlier Parent/Student QA report records remediation of several material defects, including notification persistence, provider adapters, history truncation, and authenticated smoke-test behavior.

## 3. QA findings and release gates

### QA-WEB-001 — Build and lint must be re-run as release gates

**Severity:** P0 if failing  
**Status:** Current result must be recorded before release  

The previous web QA report documented a production build and lint failure caused by unresolved merge-conflict markers in `TeacherPortal.tsx`. That report also states that remediation was implemented, but this assessment did not assume the remediation is still clean. The developer must run the current commands and attach their results.

Acceptance criteria:

- `npm run build` succeeds from `apps/web`.
- `npm run lint` succeeds according to the project’s CI warning policy.
- No conflict markers remain in `apps/web/src` or generated source inputs.
- The production bundle loads directly at nested routes and refreshes without a 404.

### QA-WEB-002 — Authenticated smoke coverage is required

**Severity:** P1  
**Status:** Required before sign-off  

The repository has browser smoke scripts, but a test that cannot obtain valid staging credentials must fail clearly rather than become a false positive. Run the authenticated Student, Parent, Teacher/Admin, account settings, payment, notification, and security smoke paths with disposable staging accounts.

Acceptance criteria:

- Credentials are provided through environment variables or a secure CI secret store.
- Tests cover login, 2FA where enabled, session restoration, logout, session expiry, and unauthorized route access.
- Screenshots, console errors, network failures, and final URLs are retained for failures.
- No password or session cookie is printed in test output.

### QA-WEB-003 — Tenant, branch, and account isolation

**Severity:** P0/P1  
**Status:** Release blocker if any case fails  

Execute the documented authorization tests with at least two tenants, two branches, two parents, and two students. Test direct URL navigation, manually modified IDs, stale browser tabs, child switching, API replay, and notification/payment links.

Acceptance criteria:

- A user cannot read or mutate another tenant’s data.
- Branch Admin access is limited to assigned branches.
- Parent access is limited to linked children.
- Student and teacher records cannot be substituted by changing route or request identifiers.
- Unauthorized requests return safe `401`/`403` responses without leaking record existence.

### QA-WEB-004 — Provider and payment UAT

**Severity:** P1  
**Status:** Required before production payments or messaging  

The previous report identified deployment requirements for Prisma migration, Aakash SMS, production push webhook, seeded credentials, and provider delivery UAT. These are operational release gates, not just documentation tasks.

Test:

- Payment initiation, redirect, cancel, timeout, gateway rejection, duplicate click, callback/reconciliation, and receipt state.
- SMS send, provider failure, retry, rate limit, and redaction.
- Push delivery in foreground, background, and terminated states.
- Notification read state across browsers and devices.

## 4. Security review result

### Confirmed findings

No confirmed exploitable vulnerability was identified in the bounded static security review of the web and directly related API surfaces.

This is not a penetration-test result. It does not prove that the deployed environment, dependencies, provider configuration, headers, cookies, database permissions, or all API routes are secure.

### Security risk areas requiring continued testing

1. **Authentication split:** Better Auth and legacy reset/auth compatibility code coexist. Recovery, session invalidation, cookie policy, and rate-limit behavior must remain equivalent across both paths.
2. **Authorization split:** Permissions are enforced through several mechanisms (`hasPermission`, branch-specific checks, admin predicates, and route-local logic). A new route can accidentally omit one layer.
3. **Browser storage compatibility:** The frontend still uses session/local storage for user cache, tenant compatibility values, UI preferences, setup drafts, and payment correlation. These values must never be treated as authoritative identity or authorization.
4. **Payment and notification deep links:** Every identifier from a URL, callback, notification, or browser storage must be re-authorized server-side.
5. **Sensitive error/log handling:** Confirm production logs, browser console output, error tracking, and test artifacts redact cookies, passwords, reset tokens, payment details, phone numbers, and student/parent data.
6. **Deployment controls:** Verify HTTPS, secure/httpOnly/sameSite cookie attributes, strict CORS origin allow-listing, CSP, frame protections, referrer policy, content-type sniffing protection, and rate limits in the deployed environment.
7. **Dependency and supply-chain risk:** Run the package-manager audit process and review transitive changes before release. A clean application review does not cover compromised or vulnerable dependencies.

## 5. Architecture and maintainability assessment

### Overall rating: Managed with fragmentation risk

The application has recognizable structure and active engineering controls:

- `apps/web/src` is organized into pages, components, context, features, services, and auth areas.
- Shared page-shell/dashboard patterns and API client helpers reduce some duplication.
- Backend routes and middleware are separated into named modules with route tests.
- Documentation and prior QA reports show an attempt to track defects and release gates.

The main weakness is not uncontrolled spaghetti code; it is **duplicate ownership of important cross-cutting behavior**:

| Concern | Current pattern | Risk |
|---|---|---|
| Authentication | Better Auth plus legacy auth/reset compatibility | Different expiry, recovery, or invalidation behavior |
| Client session state | Auth context, API client cleanup, session/local storage compatibility | Stale identity or misleading UI after account changes |
| Authorization | Middleware helpers plus route-local checks and role predicates | Authorization drift and missed checks on new endpoints |
| Feature delivery | Large portal/page components alongside reusable patterns | Higher regression cost and difficult review boundaries |
| Test execution | Many individual scripts rather than one obvious web QA command | Coverage gaps and false confidence |
| Backend contracts | Some feature limitations documented as TODO/server gaps | UI may outpace API guarantees unless contracts are explicit |

### Recommended architectural cleanup

1. Define one canonical browser session contract and isolate legacy compatibility behind a small adapter with an explicit removal date.
2. Centralize authorization policies by resource and action, then make routes call those policies rather than composing ad hoc predicates.
3. Standardize API result/error handling and typed request schemas at route boundaries.
4. Split oversized portal pages into feature-level containers and presentational components where changes routinely conflict.
5. Add a single CI-facing web QA command that runs type-check/build, lint, unit tests, and selected authenticated smoke suites.
6. Maintain a feature matrix mapping each role/action to route, API endpoint, authorization policy, and automated test.
7. Add contract tests for payment, notifications, appointments, certificates, and child/tenant scoping.
8. Treat unsupported or server-missing workflows as explicit capability states, not placeholder success paths.

## 6. Web manual QA checklist

### Authentication and account management

- [ ] Valid login, invalid login, locked account, rate limit, timeout, and server error.
- [ ] 2FA setup, valid/invalid/expired OTP, resend cooldown, refresh, back navigation, and recovery.
- [ ] Session restoration after refresh and browser restart.
- [ ] Session expiry during navigation and during a mutation.
- [ ] Logout from every role, including multiple tabs.
- [ ] Password reset, change password, mobile/email change, and duplicate/unverified contact handling.
- [ ] Device/account switching never mixes tenant, role, child, or cached records.

### Authorization and role workflows

- [ ] Direct navigation to every protected route while signed out.
- [ ] Direct navigation to another role’s route while signed in.
- [ ] Tenant Admin versus Branch Admin permissions.
- [ ] Cross-tenant, cross-branch, cross-student, and cross-child IDOR attempts.
- [ ] Read, create, update, approve, reject, delete, export, and download actions for each role.
- [ ] Browser back/forward and stale tabs after permission or account changes.

### Core portals

- [ ] Student dashboard, timetable, homework, academics/results, attendance, certificates, fees, payments, notifications, calendar, ID, and leave.
- [ ] Parent dashboard, child switching, academics, timetable, attendance, fees/payments, messages, appointments, calendar, notifications, and linked-child scope.
- [ ] Teacher timetable, classes, attendance, geo/permission behavior, homework, results, leave, messages, meetings, notifications, and calendar.
- [ ] Branch/Tenant Admin admissions, people, billing, payments, payroll, petty cash, reports, resources, calendar, and approvals.
- [ ] Unsupported roles show an intentional capability message and cannot access protected data.

### Resilience and UI quality

- [ ] Loading, empty, no-permission, offline, timeout, 401, 403, 404, validation, 409, rate-limit, and 5xx states.
- [ ] Retry does not duplicate mutations.
- [ ] Refresh and pagination do not silently truncate or reorder records.
- [ ] Responsive layouts at 320px, 375px, 768px, 1024px, and wide desktop.
- [ ] Keyboard-only navigation, focus visibility, labels, contrast, zoom to 200%, and screen reader basics.
- [ ] Dark theme, browser refresh, deep links, print/download, and file upload/download.
- [ ] No uncaught console errors, broken network calls, blank screens, or infinite spinners.

## 7. Required developer validation commands

From the repository root:

```powershell
npm run build
```

For the web package:

```powershell
cd apps\web
npm run build
npm run lint
npm run test:student
npm run test:parent
npm run test:account-menu
npm run test:two-step-settings
```

Run the existing additional scripts where applicable:

```powershell
cd apps\web
npx testcafe chrome:headless tests\smoke.js
npx testcafe chrome:headless tests\teacher-smoke.js
npx testcafe chrome:headless tests\tenant-payments.js
npx testcafe chrome:headless tests\tenant-certificates.js
```

Use secure environment variables for credentials. Do not commit `.env` files or place real credentials in test fixtures.

## 8. Validation performed while preparing this report

| Check | Result |
|---|---|
| Static review of web source, tests, auth, API client, and related API middleware | Completed |
| Security review of bounded web/API surfaces | No confirmed exploitable vulnerability found |
| `npm run build` | **Blocked:** `tsc` is not available in the current environment |
| `npm run lint` from repository root | **Failed:** root command reaches `apps/web`, which has no `lint` script |
| Authenticated browser QA | **Not run:** requires configured browser dependencies and staging credentials |
| Provider UAT and deployment-header verification | **Not run:** requires target deployment environment |

## 9. Sign-off

- [ ] Build passes.
- [ ] Lint passes according to the agreed warning policy.
- [ ] Authenticated Student, Parent, Teacher, and Admin smoke suites pass.
- [ ] Tenant/branch/child/student authorization tests pass.
- [ ] Payment, SMS, push, and notification provider UAT passes.
- [ ] No P0/P1 defects remain without an approved waiver.
- [ ] Security headers, cookies, CORS, CSP, HTTPS, logs, and dependency checks are verified in the target deployment.
- [ ] Known feature gaps are documented and not presented as implemented.

**Developer:** ____________________  
**QA:** ____________________  
**Security reviewer:** ____________________  
**Product owner:** ____________________  
**Build/version:** ____________________  
**Date:** ____________________
