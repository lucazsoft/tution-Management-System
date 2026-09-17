# Backend Audit - 14 September 2026

**Overall mark: 7.2/10.** The backend is meaningfully improved from the 8 September audit and is close to staging-ready, but it is not production-assured yet. The biggest remaining gaps are operational proof, notification delivery consistency, dependency hygiene, and database-backed integration/concurrency verification.

Scope: source review of `services/api`, local setup verification on the new laptop, and selected backend regression checks. This is not a penetration test, load test, live SMS test, payment-provider certification, or backup/restore drill.

## Verification Run

| Check | Result |
|---|---|
| `npm ci` | Passed after network approval. Reported 13 total repo vulnerabilities: 9 moderate, 4 high. |
| `npm audit --workspace @tms/api --omit=dev` | Passed: 0 production API vulnerabilities reported. |
| `npm run build --workspace @tms/types` | Passed. |
| `npm run prisma:generate --workspace @tms/api` | Initially blocked by missing Prisma Windows engine; passed after network approval. |
| `npm run build --workspace @tms/api` | Passed after shared types build and Prisma generation. |
| `npm run test:route-auth --workspace @tms/api` | Passed. Route authentication audit covered 40 route files. |
| `npm run test:runtime-config --workspace @tms/api` | Passed. |
| `npm run test:auth-sms --workspace @tms/api` | Passed. |
| `npm run test:phase-four-branch-payment --workspace @tms/api` | Passed. |

## Scorecard

| Area | Mark | Notes |
|---|---:|---|
| Architecture and maintainability | 7/10 | Express + Prisma layout is clear enough, with useful service boundaries for payments, storage, billing, auth and recovery. Some route files remain very large, especially finance/users/course workflows. |
| Security and tenant isolation | 8/10 | Stronger than the previous audit: tenant context is session-derived, route-auth audit exists, security headers are set, production mock SMS is rejected, and OTPs are destination-bound. Remaining risk comes from public callback surfaces and large manual authorization logic. |
| Business-rule correctness | 7/10 | Billing, admission login delivery, QR settings, attendance and account recovery have targeted regressions. More real workflow tests are still needed before launch confidence. |
| Data integrity and concurrency | 7/10 | There are transactions and optimistic state transitions in important areas. QR verification consumption and settings mutation are still separate route/service operations, so retry/rollback behavior deserves a PostgreSQL-backed test. |
| Automated QA | 7/10 | CI now includes many security/regression suites and the selected local suites passed. Gaps: no full database-backed CI service, no live provider tests, and TypeScript build depends on generated artifacts being prepared in order. |
| Operational readiness | 7/10 | Docker and compose are present, runtime config fails closed, migrations are wired, and health checks exist. New-laptop bootstrap required network/codegen repair; staging evidence for SMS, connectIPS/NepalPay, restore and monitoring is still missing. |

## Strengths

- `server.ts` applies request IDs, hardening headers, API cache prevention, body-size limits, CORS origin configuration, centralized error handling and production HSTS.
- `runtime-config.ts` fails startup when critical auth/payment/SMS configuration is missing or unsafe in production.
- `auth.ts` uses Better Auth with database-backed rate limits, disabled public signup, bounded password length, session expiry, and hashed OTP storage.
- `delivery.ts` now sends authentication OTPs to a trusted verified mobile and avoids production plaintext OTP logging.
- `tenant.ts` no longer trusts client-controlled tenant headers; tenant scope is derived from the authenticated session.
- `route-authentication.test.ts` provides a useful static guard against accidentally adding unauthenticated sensitive routes.
- Payment settings have server-side QR image validation, SMS-bound verification, branch/tenant isolation tests, and private object storage support.
- Docker build and compose include a migration step, health checks, required environment expansion and a non-root runtime user.

## Findings

### BA-NL-01 - High: New laptop setup was not immediately reproducible

The first API build failed because `tsc` was unavailable. `npm ci` then needed network access and Prisma codegen initially failed until the Windows Prisma engine was downloaded. After running `npm run build --workspace @tms/types` and `npm run prisma:generate --workspace @tms/api`, the API build passed.

Impact: a new machine or CI runner can appear broken unless the onboarding order is followed exactly. This wastes handover time and can hide real code failures behind generated-artifact failures.

Recommendation: add a one-command backend bootstrap script such as `npm run setup:api` that runs install, shared type build, Prisma generation, and a smoke test. Document this in `README.md` and the developer handoff docs.

### BA-NL-02 - High: Full repo dependency audit reports high vulnerabilities

`npm ci` reported 13 vulnerabilities across the installed repo dependency graph, including 4 high. The production API-only audit passed with 0 vulnerabilities, so this is likely in web/dev/transitive tooling, but it still affects developer and CI environments.

Recommendation: run `npm audit` at repo root, classify each advisory, upgrade low-risk packages, and document any accepted dev-only findings with expiry dates.

### BA-NL-03 - Medium: QR verification and mutation are not fully atomic

`finances.ts` consumes the payment-settings SMS code, then calls the settings mutation/delete service. The verification claim itself is transactional, but the final settings write is not in the same transaction as the claim.

Impact: if the database fails after code consumption but before settings save/reset, the user may need to request another SMS. This is not a direct security bypass, but it is weak operational behavior around a sensitive finance setting.

Recommendation: combine verification consumption, settings mutation and audit event creation in one transaction. Add a PostgreSQL rollback test.

### BA-NL-04 - Medium: Notification delivery is still split between real adapters and mock utilities

Authentication SMS uses the safer delivery path, but `notifications.ts` still contains mock SMS and push classes that log message bodies. Some routes import mock notification utilities directly.

Impact: non-auth notifications can still report success without proving provider delivery. In production this can mislead operators about receipts, reminders and alerts.

Recommendation: route all notification intent through one persisted delivery service with provider status, retry state, recipient resolution and duplicate suppression.

### BA-NL-05 - Medium: Database-backed integration proof is incomplete

Most selected tests passed, but several important tests rely on mocked persistence/direct route invocation. The integration suite exists, yet it was not run in this audit because no local PostgreSQL test database was provisioned as part of the quick backend audit.

Impact: tenant isolation, transaction rollback, race conditions and migration behavior are not fully proven on a real PostgreSQL database from this run.

Recommendation: add a CI PostgreSQL service and run a minimal database integration pack for auth, tenant isolation, payments, QR verification rollback, admission delivery and concurrent workflow transitions.

### BA-NL-06 - Medium: Some routes still return internal error details

The global API error wrapper hides unexpected 500 details, but many route-local catch blocks return `details: error.message`.

Impact: Prisma constraint names, provider errors, or operational internals may leak through route-local handlers.

Recommendation: standardize route error responses behind a helper that logs the request ID internally and sends stable public errors externally.

## Launch Readiness Marking

- **Development on this new laptop:** 8/10 after dependency install and Prisma generation.
- **Staging readiness:** 7/10. Good enough for controlled staging with real environment variables, database, and provider sandboxes.
- **Production readiness:** 6.5/10. The backend should not be considered fully production-ready until live SMS/payment callbacks, DB integration tests, audit logging, vulnerability triage, restore checks and monitoring are proven.

## Priority Action Plan

1. Add a backend setup command and document the exact new-laptop bootstrap.
2. Triage the 13 root npm vulnerabilities and remove or accept them explicitly.
3. Add PostgreSQL-backed CI checks for tenant isolation and sensitive finance/recovery transactions.
4. Move QR verification plus settings save/reset into one transaction with an audit event.
5. Replace direct mock notification classes with a single persisted notification/outbox service.
6. Normalize route-local error handling so internal exception messages are not returned to clients.

## Final Assessment

The backend is in a respectable working state and has clearly moved beyond the older 6.3/10 audit. The security posture is no longer the main blocker; the next maturity step is proof: reproducible setup, real database tests, provider sandbox evidence, dependency cleanup and operational observability.
