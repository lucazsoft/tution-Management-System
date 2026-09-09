# Authentication SMS

Email is the login identifier. Password-reset and two-factor login codes are sent
only to the account's trusted security mobile. TMS sends no authentication email.

## Password reset

`POST /api/auth/forgot-password` accepts a login email and returns the same success
shape for unknown, inactive, unverified and delivery-failed accounts. Eligible
accounts receive a six-digit SMS. The record binds the user, tenant, verified
destination, verification timestamp and current credential hash.

`POST /api/auth/verify-reset-otp` consumes the five-minute code and returns a random,
single-use reset token valid for 15 minutes. `POST /api/auth/reset-password` rechecks
the binding, changes the password transactionally, consumes the token, revokes
sessions and removes Better Auth verification bindings. Five code attempts are
allowed. Persistent request limits apply. Provider failure leaves no active code.

Accounts without a trusted mobile use `/recover-mobile` and platform-supported
recovery first. Mobile or password changes invalidate an outstanding reset flow.

## Login OTP

Better Auth's `/api/auth/two-factor/send-otp` resolves the pending user's verified
mobile through the same adapter. Missing SMS configuration returns 503. OTPs are
hashed, expire after five minutes and allow five attempts. The installed plugin
catches transport callback failures and can return a generic send response after a
provider rejection; it does not expose or accept a usable code in that state.

Web and mobile copy identifies SMS delivery. Mobile production calls now use Better
Auth's `/two-factor/send-otp` and `/two-factor/verify-otp` paths. Fixed `123456`
acceptance was removed; named local demo accounts retain their explicit mock flow.

## Validation and rollout

`test:auth-sms` covers trusted destinations, inactive/mismatched accounts, provider
failure, generic reset responses, wrong OTP, destination changes, password updates,
session revocation and replay. API and web builds pass. Flutter tooling is unavailable,
so mobile analysis/widget tests were not run. Apply the security-mobile migrations,
configure AAKASH, and perform controlled staging delivery tests. No real SMS was sent.
