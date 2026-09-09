# Backend audit — 8 September 2026

**Overall: 6.3/10, provisional, up from 5.5/10. Production readiness is not established.**

Scope: source review and local backend regression checks at commit `b554d11`. This is a follow-up to the [5.5/10 phase-one assessment](phase-1-security-report.md) and [original audit](backend-qa-audit-2026-09-07.md), not an independent penetration test. Scores are engineering judgments, not test coverage percentages. This audit changes documentation only.

## Product decision: SMS first

Implementation follow-up: [trusted security mobile](api/security-mobile.md) now has
nullable destination-bound verification state, password-plus-SMS verification of
the saved number, and verification on successful dual-code number changes.
Existing numbers remain unverified. Password reset and Better Auth login OTP now
resolve this trusted mobile and use the SMS adapter; no authentication code is
logged. Reset codes and tokens bind to the account, tenant, verified destination
and credential snapshot. Local regressions and builds pass; migrations and live
SMS remain rollout checks. The historical score below is unchanged.

Per the current product direction, use SMS for notifications and security-code delivery. Email notification delivery and email-provider integration are deferred. Email remains the login identifier.

Preserve the confirmed payment permissions: tenant admins manage any branch in their tenant; branch admins only read their own branch; other roles have no settings access. QR changes must continue to require server-side verification.

## Scorecard

The same six equally weighted dimensions as the previous assessment give 38/60, rounded to 6.3/10.

| Dimension | Previous | Current | Evidence and limits |
|---|---:|---:|---|
| Architecture and maintainability | 6 | 6 | Useful services and transport abstractions exist; large route modules and duplicate delivery paths persist. |
| Security and isolation | 6 | 6 | Existing isolation regressions pass; verified contact and QR controls help, but OTP logging and a conditional role-hierarchy gap remain. |
| Business-rule correctness | 4 | 7 | Billing due dates, enrollment reconciliation and attendance gates improved; notification and cron promises remain incomplete. |
| Data integrity and concurrency | 5 | 7 | Approval serialization, maintenance transactions and admission queue recovery have regressions; QR verification and settings writes remain separate. |
| Automated QA | 6 | 7 | More negative-path and concurrency scenarios pass; CI omits newer suites and real PostgreSQL verification is pending. |
| Operational readiness | 5 | 5 | Real SMS transport exists, but mocks, incomplete jobs, recovery gaps and unverified deployment behavior prevent an increase. |

## Findings, in priority order

### BA-01 — High: authentication codes are logged instead of delivered

Implementation follow-up: authentication delivery now resolves the verified
security mobile and calls the configured SMS adapter. Plaintext OTP logging was
removed. Password reset keeps a generic account response, stores no usable code
after failed delivery, and invalidates the flow when the mobile or credential
changes. Login OTP uses the same delivery function, with missing configuration
rejected before Better Auth. The installed plugin handles provider callback errors
internally and may return its generic send response after provider rejection; no
code can be used in that condition. Live failure behavior remains a staging check.

Historical finding:

Evidence: [delivery.ts](../services/api/src/utils/delivery.ts), [auth configuration](../services/api/src/utils/auth.ts), and [auth routes](../services/api/src/routes/auth.ts).

`sendVerificationCode` always logs the destination and plaintext code. Only the in-memory test capture is conditional on `SMS_PROVIDER=MOCK`; the console output is not. Password reset and two-factor OTP call this helper using email. Setting AAKASH in production does not route these calls through SMS.

Impact: users cannot reliably complete these flows, and anyone with access to those logs can see usable codes. This is source-confirmed; no production logs were inspected.

Required fix: resolve the account's verified security mobile, send through the SMS adapter, remove production code logging, and return controlled delivery failures. Test expiry, attempt limits, replay, unavailable provider, unknown-account responses and recipient binding. Do not solve this by adding an email provider.

### BA-02 — High for launch readiness: notification success does not mean SMS was sent

Evidence: [notifications.ts](../services/api/src/utils/notifications.ts), [appointments.ts](../services/api/src/routes/appointments.ts), [leaves.ts](../services/api/src/routes/leaves.ts), [finances.ts](../services/api/src/routes/finances.ts), and [cron.ts](../services/api/src/routes/cron.ts).

These routes instantiate mock senders directly. Payment receipts and overdue reminders include the placeholder recipient `98510XXXXX`. Some cron actions, including petty-cash reset and contract-expiry alerts, only log success. A production guard against selecting the MOCK provider cannot prevent hardcoded mock constructors.

The [Aakash adapter](../services/api/src/utils/sms.ts) is a useful foundation, with number normalization, timeout handling and masked recipient logging. Its existence does not prove all notification routes use it.

Required fix: route all application SMS through one adapter and persist notification intent, recipient, attempts and outcome. Reuse the admission outbox approach where appropriate. Resolve actual tenant-scoped recipients. Distinguish queued, provider-accepted, failed and delivery-confirmed states where supported. Unimplemented jobs must report that state rather than success. Test retries and duplicate suppression without sending real SMS.

### BA-03 — High, conditional: branch scope can override target role hierarchy

Implementation follow-up: `loadManageableUser` now loads target role names and
rejects branch-admin mutations when any target assignment is Branch Admin,
Tenant Admin or Super Admin, regardless of branch or additional ordinary roles.
Existing tenant and branch checks remain in place; tenant-admin behavior is
unchanged. A regression reproduced an unauthorized update (200 before the fix)
and now covers PUT/DELETE denial without writes, ordinary-role positive controls,
foreign branch/tenant rejection and tenant-admin management of branch admins.
The suite is included in CI as `test:user-management-access`. These are mocked
route tests, not database-backed concurrency verification. Last-active-admin
protection is separate work and is not implemented by this targeted change.

Historical finding:

Evidence: `loadManageableUser` and PUT/DELETE handlers in [users.ts](../services/api/src/routes/users.ts), starting around line 1768.

A branch admin may manage a target if any target role belongs to a managed branch. The helper does not reject targets with a higher role. The special tenant-admin protection applies to phone changes, while status changes and deactivation use the broader check.

Precondition: a tenant admin also has a role assignment in the caller's branch. Under that condition, source inspection indicates the branch admin can suspend or deactivate that higher-role user. This is not a claim that every tenant admin account is vulnerable; a database-backed reproduction remains pending.

Required fix: enforce target-role hierarchy before any mutation, including multi-role accounts, and protect the last active tenant administrator. Add positive controls for ordinary branch-managed users and negative tests for higher-role targets.

### BA-04 — Medium: QR verification and the settings mutation are separate writes

Evidence: [finances.ts](../services/api/src/routes/finances.ts), lines 134–136 and 177–179; [payment-settings-verification.ts](../services/api/src/services/payment-settings-verification.ts).

The code is consumed before the settings save/reset. A database failure in the subsequent mutation leaves the settings unchanged but the code unusable. Code consumption itself is atomic and replay-tested; the gap is the combined operation. The settings record also lacks a dedicated durable change history identifying the actor.

Required fix: transact the verification claim, settings mutation and audit event together. Record actor, tenant, branch, action and relevant change metadata without storing OTPs in audit logs. Verify rollback and retry behavior against PostgreSQL.

### BA-05 — Medium: verified contact change is not complete account recovery

Implementation follow-up: [platform-supported mobile recovery](api/mobile-recovery.md)
now provides operator-issued, audited approval, a fixed replacement destination,
token-plus-SMS completion, transactional session/challenge revocation and durable
security notices. A public web completion screen is available at `/recover-mobile`.
Local regressions cover failure and replay paths; migrations, actual support
operations, scheduled notice retries and staging SMS/DB verification remain rollout
requirements. SMS password reset/login delivery and native mobile UI remain pending.

Historical finding:

Evidence: [account-contact.ts](../services/api/src/routes/account-contact.ts) and [schema.prisma](../services/api/prisma/schema.prisma).

The implemented change flow checks the password, verifies codes sent to old and new mobiles, limits attempts, invalidates payment challenges and revokes sessions. These are meaningful improvements. A missing/invalid old mobile instead requires assisted recovery; this route does not implement that recovery workflow. The schema does not establish a `phoneVerifiedAt` state, so an existing saved number must not automatically be treated as verified.

Required fix: define an audited assisted-recovery flow for loss of the old number, bootstrap verification for existing accounts, and post-change SMS alerts. Recovery must not be a general people-management phone edit that bypasses security checks. Keep email recovery deferred under the current channel decision.

### BA-06 — Medium: CI does not enforce the newest security regressions

Evidence: [CI workflow](../.github/workflows/ci.yml).

The API gate runs builds, schema validation, access checks and phase-one through phase-three tests. It does not run phase-four payment verification, account-contact, account-profile or the standalone attendance suite, and does not provision PostgreSQL for integration testing.

Required fix: add deterministic suites to CI with explicit test-only configuration. Add disposable PostgreSQL integration checks for isolation, transaction rollback, concurrent verification and outbox claims. Do not run the existing force-reset integration setup against a shared database.

### BA-07 — Medium, source-inferred: environment loading order can break startup

Evidence: [server.ts](../services/api/src/server.ts), lines 1–2. The account-contact router is imported before `dotenv/config`; its dependency chain imports authentication, which validates configuration during module initialization.

A launch relying exclusively on `.env` can therefore validate configuration before dotenv loads it. Pre-injected environment variables avoid this condition. This startup path was not executed in this audit; the standalone attendance command separately demonstrated the import-time configuration requirement.

Required fix: load environment configuration before application imports and add a startup smoke check with an isolated fixture environment.

## Progress against the original audit

| Original findings | Current assessment |
|---|---|
| QA-01, QA-02, QA-04, QA-10: exposure, tenant ownership, participants, certificates | Targeted phase-one regressions pass. |
| QA-03, QA-05, QA-06: overdue dates, attendance gate, remaining debt | Phase-two regressions pass. |
| QA-07: callback tenant context and credential delivery | Callback and admission-delivery recovery regressions pass; live provider behavior remains unverified. |
| QA-09, QA-11: approval concurrency and maintenance atomicity | Phase-three regressions pass with mocked persistence. |
| QA-08: mock notifications and incomplete automation | Still open; expanded in BA-02. |
| QA-12: default quality gate gaps | Partially improved; newer suites and database integration remain absent. |

“Pass” here means the targeted local regression scope, not exhaustive closure of every related route or production behavior.

## Verification performed for this audit

| Command in `@tms/api` workspace | Result |
|---|---|
| `build` | Passed TypeScript compilation. |
| `test:phase-one-security` | Passed 11 regression scenarios. |
| `test:phase-two-billing` | Passed billing, attendance-gate and callback scenarios. |
| `test:phase-three-workflows` | Passed approval, maintenance and durable admission-delivery scenarios. |
| `test:phase-four-branch-payment` | Passed service, permission and verification suites, including replay and payload binding. |
| `test:account-contact` | Passed password, dual-code, tenant binding, session revocation and replay scenarios. |
| `test:account-profile` | Passed ownership, protected-field and validation scenarios. |
| `test:runtime-config` | Passed. |
| `test:route-auth` | Passed static authentication audit across 36 route files. |
| `test:sms` | Passed phone normalization assertions only; this is not a provider delivery test. |
| `test:attendance` | First run failed at initialization because auth environment was missing. Rerun with synthetic test auth URLs/secret and MOCK SMS passed branch-assignment checks for IN/OUT. |

Commands use `npm.cmd run <command> --workspace @tms/api`. Most behavioral tests use mocked persistence and direct route/service invocation. Suites labeled “API integration” do not by themselves establish real HTTP and PostgreSQL integration. No real messages were sent.

Not performed: live gateway tests, database integration, dependency vulnerability audit, deployed penetration testing, load testing, backup restoration, migration rollout or staging/mobile end-to-end verification. The score must not be interpreted as assurance in those areas.

## Recommended implementation order

1. **Close the immediate security gaps:** remove OTP logging, implement verified-mobile SMS delivery for authentication, enforce role hierarchy, and correct startup import order. Acceptance: negative-path tests pass and authentication codes never appear in production logs.
2. **Complete the SMS notification flow:** replace direct mocks/placeholders, persist retryable delivery, make cron results truthful, and implement assisted mobile recovery. Acceptance: actual recipient resolution and provider failures are covered; a controlled staging SMS completes with recorded provider outcome.
3. **Prove data integrity and release behavior:** transact QR verification with its mutation/audit event, expand CI, run isolated PostgreSQL concurrency/rollback checks and exercise deployment readiness and restore procedures. Acceptance: reproducible CI and staging evidence supports the next score revision.

The backend has moved beyond the earlier 5.5/10 state, but completing the SMS and recovery paths is more valuable now than adding another settings screen or an email integration.
