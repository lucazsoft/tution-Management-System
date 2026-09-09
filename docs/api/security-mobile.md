# Trusted security mobile

Email remains the login identifier. Email notification delivery is deferred.

The backend now records `User.securityMobile` (normalized destination) and
`User.securityMobileVerifiedAt`. Both are nullable; the migration deliberately
leaves existing accounts unverified. Consumers must use `trustedSecurityMobile`
instead of checking a timestamp alone: the verified destination must still match
the account's current normalized phone. Neither field is a client-editable profile field.

## Tenant-admin API

All routes below require an authenticated tenant admin and use the session's tenant
and user identity. Base path: `/api/account/contact`.

- `GET /mobile`: returns `verified`, `verifiedAt`, masked `destination`, and
  `recoveryRequired` (true when the saved number is invalid/missing).
- `POST /mobile/start` with `{ "password": "…", "verifyExisting": true }`:
  sends one code to the saved number. Any client-supplied phone is ignored.
- `POST /mobile/confirm` with `{ "challengeId": "…", "currentCode": "123456" }`:
  verifies that saved number. Returns `signInRequired: true`; sessions are revoked.
- The existing change flow remains: start with password and a different `phone`,
  then confirm with both `currentCode` and `newCode`. Success verifies the new number.

Challenges expire after five minutes, allow five incorrect attempts, and are bound
to tenant, user, saved phone and credential hash. Starts are limited to five per
15 minutes per tenant/user. AAKASH must be configured; provider acceptance alone
does not mark a number verified. Successful confirmation consumes the challenge
and writes verified status transactionally, invalidates payment challenges and
revokes sessions. Concurrent phone edits prevent confirmation.

An inaccessible old number requires assisted recovery even if its format is valid.
Assisted recovery uses the separate [platform support flow](mobile-recovery.md). A lost password cannot
be used to bootstrap a new trusted destination through this flow.

## Rollout and remaining work

Apply `20260908120000_security_mobile` with the normal deployment migration process
before deploying this code. No database migration was applied during implementation.
No verification timestamps should be backfilled merely because a number exists.

This trust state is now used by SMS password reset and login OTP delivery. Email
remains the login identifier and is not a notification destination. Accounts without
a matching verified security mobile must use the platform-supported recovery flow.

Validation: `npm run test:account-contact --workspace=@tms/api` covers legacy
unverified state, bootstrap destination binding, dual-number changes, expiry,
replay, phone mismatch and invalid-number recovery status with mocked persistence
and SMS. PostgreSQL migration/transaction integration remains a rollout check.
