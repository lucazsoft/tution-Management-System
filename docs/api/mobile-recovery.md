# Platform-supported mobile recovery

This flow replaces an inaccessible security mobile for an active tenant admin.
Platform support performs identity review; neither a branch admin nor another
tenant admin can issue approval through the application. No email is sent.

## Support workflow

1. Open an identity-review ticket through the institution's established platform
   support channel. Independently verify the applicant's authority using existing
   institution ownership records and an established contact method. Possession of
   a new phone, knowledge of a login email, or a claimed role is insufficient.
   Do not ask for passwords or SMS codes. Record the evidence and decision in the
   access-controlled support system, not in API logs or this database.
2. An authorized deployment-host operator runs the following from `services/api`
   after review, with the intended database configuration:

   ```powershell
   npm.cmd run recovery:mobile -- approve <tenantId> <userId> <newPhone> <reviewTicket> IDENTITY_REVIEW_COMPLETED
   ```

   The command records the OS hostname/username as reviewer and the ticket as the
   review reference. It checks tenant-admin eligibility, binds the exact replacement
   number and account/credential snapshot, and revokes previous unused grants.
   Access to the host and database credentials is the approval boundary; the
   acknowledgement argument records intent and is not an authentication factor.
   Do not expose the command through an HTTP endpoint or run it as shared CI.
3. The command emits a random 256-bit recovery token once. Deliver it through the
   identity-verified support interaction. Do not put it in a URL, application log,
   or ticket transcript. The database stores only its hash. Host terminal/session
   recording can capture this deliberate output; use an authorized private session.
4. The applicant opens `/recover-mobile`, enters the token, and requests a code.
   SMS goes only to the support-approved replacement number. The applicant enters
   that SMS code to finish. Tokens expire after 24 hours; SMS codes after 5 minutes.
5. Completion records the verified destination, signs out all sessions, invalidates
   pending reset/payment/contact challenges and Better Auth 2FA session bindings,
   and queues alerts to both valid old and new numbers. The password is unchanged.

The runtime platform-admin flag is not needed for this workflow and must not be
enabled merely for recovery. That flag also exposes tenant provisioning.

## API contract

Both endpoints use `Cache-Control: no-store` and are deliberately public to support
locked-out applicants. Authentication is the support-issued token plus the SMS
code; there is no public email lookup or grant-creation endpoint.

| Endpoint | Body | Result |
|---|---|---|
| `POST /api/account/recovery/send` | `{ "token": "…" }` | Masked approved destination and `expiresIn: 300` |
| `POST /api/account/recovery/confirm` | `{ "token": "…", "code": "123456" }` | `{ "success": true, "signInRequired": true }` |

Extra destination/account fields are rejected. Each grant permits five sends,
a one-minute resend cooldown and five failed code attempts across resends. Persistent
IP and token limits additionally bound API attempts. Failed provider delivery never
activates a code or updates the mobile. Grants become unusable if the account or
credential changes after review, expires, loses tenant-admin eligibility or is disabled.
Support must review and issue a new grant in those cases.

The completion transaction locks the user before rechecking the grant, claims the
code atomically, updates the number, invalidates other credentials and writes alert
intent. Failed writes roll back completion. Recovery records retain approval,
review-reference, destination and completion/revocation timestamps for investigation.
There is no automated identity-review decision.

## Security alert delivery

An immediate attempt is made for that recovery's queued notices. Operators should
schedule this bounded retry command using the normal job runner:

```powershell
npm.cmd run recovery:mobile -- retry-notices
```

Each run handles at most 50 pending notices. A two-minute lease prevents ordinary
overlapping sends; expired leases recover from a worker crash. `acceptedAt` means
provider acceptance, not handset delivery. Delivery is at least once: a crash after
provider acceptance but before recording it can produce a duplicate alert. No OTPs
or recovery tokens are included in queued notice messages. Protect these records
as personal data and apply the institution's retention policy.

## Validation and rollout limits

- Apply `20260908120000_security_mobile` and then `20260908150000_mobile_recovery`
  through the deployment migration process before deploying the new endpoints.
- Configure AAKASH credentials and establish the actual support channel and private
  operator access. Do not treat UI instructions as a staffed support service.
- `test:mobile-recovery` exercises fixed destinations, expiry, cooldown, failed
  delivery, lockout, replay, changed credentials/account, role/tenant eligibility,
  transaction rollback simulation and queued alert retry. It runs in CI.
- PostgreSQL locking/migration integration and live SMS delivery have not been run.
  Local service tests use mocked persistence and transport.
- Web completion is implemented. Native mobile recovery UI is not added here.
  The web recovery page can be used without an existing session.
- SMS password reset/login OTP delivery remains separate work. Recovering a mobile
  does not currently complete password recovery for someone who also forgot their
  password. Email remains the login identifier; this flow adds no email delivery.
