# TMS durable push delivery design

22 November 2026. Proposed follow-on implementation, not installed or enabled.

Repository: https://github.com/lucazsoft/tution-Management-System
Base: 9f45b470a22f4c94850dc138efa8a5159587d804

## Current boundary

The cumulative local notification patch fixes specific result/routing/configuration defects, prepares receiving clients and adds best-effort inbox records for the existing maintenance/payroll recipients. It does not add a general push outbox or retry worker. No migration, background process, provider call or deployment was performed.

A provider accepting a message does not prove that a device displayed it. Reliable dispatch and consistent authenticated inbox records are separate outcomes.

## Source findings

- services/api/src/services/push-notification.ts aggregates Firebase multicast results and returns success/sent/failed/skipped. Its provider interface does not return a durable per-device attempt result. A later exception can obscure partial acceptance in an earlier batch.
- DevicePushToken associates a token with a tenant, user and platform. Registration can rebind a token to the currently authenticated account. Retrying an old captured token without checking its current owner could reach the wrong person on a shared device.
- Notification is the account-event inbox. PortalNotification is a separate current-summary/read-state store. Neither is a delivery-attempt ledger. Entity IDs alone cannot identify events because one appointment or leave can have multiple valid state changes.
- services/api/src/services/notification-records.ts intentionally catches persistence errors so a notification annotation cannot undo the business operation. This is best effort, not a durable-intent guarantee.
- resources.ts commits resource-log/task changes before its notification work. The prepared patch reports inbox persistence independently from provider acceptance. A crash between those steps can still lose the annotation.
- cron.ts salary reminders find the existing active tenant-admin audience. The prepared patch stores records for exactly those users and reports persistence/acceptance separately. Repeating a trigger can still create another logical reminder.
- calendar-event-notifications.ts resolves recipients from current tenant/branch/class/audience scope and then creates records/sends. Its existing scope logic should be reused, not replaced with an all-users query.
- admission-delivery.ts already uses an expiring lease and fenced completion for a different, encrypted admission-login SMS workflow. It documents the accepted-before-crash resend window. Reuse the concurrency ideas, not its credentials, recipient rules, payloads or queue.

## Proposed records

Introduce these through a reviewed, additive migration. Existing inbox IDs and readAt values stay unchanged.

1. NotificationIntent: tenantId, a stable event key, event type/version, entity reference, createdAt, expiresAt, minimal generic alert text and role-specific mobile/web destinations. A unique tenant/event-key constraint makes producer retries idempotent.
2. NotificationIntentRecipient: intentId, tenantId, userId, frozen role/destination and authorization scope reference. Unique intent/user. This is the audience selected by the original authorized operation, not everyone who later gains a related role.
3. PushDeviceDelivery: recipient intent, current DevicePushToken record/generation reference, status, attemptCount, nextAttemptAt, leaseToken, leaseUntil, acceptedAt, providerMessageId and a sanitized error code. Unique intent/device-generation. Tokens and private message bodies must not be copied into ordinary logs.
4. NotificationAttempt: append-only attempt timing/outcome needed for debugging. Keep retention bounded and restrict access by tenant/operations role. No service-account secrets, login credentials or student/family details in this ledger.

Suggested states: PENDING, LEASED, ACCEPTED, RETRY_WAIT, PERMANENT_FAILURE, EXPIRED and CANCELLED. Distinguish blocked provider configuration and no registered device as explicit reasons, not delivery successes. Do not add a device-display receipt state unless an authenticated client acknowledgement is actually implemented.

## Event identity and producer integration

Use a persisted operation or transition identity. Examples include a maintenance-task creation ID, a calendar publication version, an appointment transition ID and a scheduled/manual payroll reminder operation ID. A second legitimate event on the same entity gets a new version. A retried request for the same operation keeps its original key.

For future durable-intent paths, write the business mutation, minimal intent and frozen recipient rows in one database transaction, then dispatch outside the transaction. Provider failures must never roll back business data. Do not perform a provider network call while holding database locks.

There is a real compatibility boundary here: the existing fail-open annotation helper permits business success when the notification insert fails. That cannot also guarantee that every committed change has durable intent. The recommended new durable path treats a failed atomic intent write as a failed database transaction, with no partial business commit. This is a producer contract change requiring code review and staged fault tests, not a change silently included in the current patch. If a workflow must retain its old fail-open write contract, label that workflow best effort, emit a sanitized intent-write-failure signal and add source reconciliation where the persisted source event makes it possible. Do not call that fallback lossless.

Portal summaries are not the source for replaying historical event alerts. Do not migrate, delete, merge or replay historical portal rows as part of introducing the outbox. No retrospective push backfill by default.

## Worker and crash recovery

- Claim due rows atomically using a bounded database transaction, a unique lease token and an expiring lease. Use PostgreSQL row locking/skip-locked or a compare-and-swap claim with an ownership predicate.
- Resolve current token ownership immediately before sending. The tenant/user must still match the frozen authorized recipient, and access to the referenced resource must not have been revoked. Cancel a stale/rebound device job rather than following the token to another user.
- Do not automatically add newly linked guardians, newly assigned staff or new devices to old events. That would widen the original audience or replay old alerts. A separate reviewed replay action would need its own limits.
- Send outside the database transaction. Bound batch size to the provider's actual supported limit and persist every device result from each completed batch before proceeding.
- Complete or reschedule with tenant/id/lease-token fencing. A timed-out worker cannot overwrite the result of a newer claimant. Renew a lease only while it still belongs to that worker.
- An expired lease becomes reclaimable. An accepted-before-recording crash remains ambiguous because a database transaction cannot atomically include Firebase acceptance. Treat transport as at least once, not exactly once.
- Include notificationId/eventKey in the client data. Client refresh can be idempotent, but OS-rendered notification messages can still display twice after an ambiguous resend. Do not promise exactly-once display. Avoid replacing separate legitimate state changes with one entity-wide collapse key.

## Retry rules

Extend the provider result contract to return each device outcome with a safe error class. Retrying aggregate failed counts would resend to successful devices.

- ACCEPTED: store the provider message ID where returned; do not retry that device.
- Permanent unregistered/invalid registration token: retire only the exact token/generation and mark that job permanent. Do not treat every invalid-argument error as proof that the token is bad.
- Invalid payload: stop that intent/device job for diagnosis. Do not delete an otherwise valid device registration.
- Provider unavailable, quota/throttling or transport timeout: retry only the affected pending devices, honor provider retry guidance and use exponential backoff with jitter. A timeout after partial acceptance may duplicate a message; record that uncertainty.
- Invalid credentials, sender/project mismatch or disabled provider: pause affected dispatch, report a configuration blocker and avoid a hot retry loop. Never silently switch to SMS or another paid channel.
- No device: preserve the inbox event and report no-device. Do not claim push success or create an endless retry loop.
- Expired event: stop dispatch, preserving the inbox/history under the existing retention rules.

Bound attempts and event lifetime. A conservative staging fixture can use a maximum of five transient attempts with increasing delays and a 24-hour maximum life, but production event lifetimes need to match existing event semantics. An emergency, a calendar publication and a payroll reminder need not share the same expiry. These proposed fixture values are not enabled configuration or an approved product policy.

## API and client behavior

- Continue to derive tenant/user identity from the authenticated session, never caller-supplied identity fields.
- List/read/read-all remain inbox operations, not delivery receipts.
- Keep account events and current portal alerts in named groups with source-qualified client keys and their original read endpoints.
- Distinguish inbox stored, provider accepted, failed, skipped/no-device and retry pending in operational results. Preserve old response fields only with documented semantics.
- Native/web destination differences stay explicit. Unsupported native screens must not be invented. Open authenticated role home only where the existing workflow has no narrower native route.
- Use generic lock-screen text unless a verified category policy permits more detail. Fetch private content only after authentication and scope checks.

## Required tests before activation

Use synthetic tenants and a local/staging database, with providers replaced by deterministic doubles first.

- Concurrent producer requests create one intent for the same operation, but two real transitions on the same entity remain distinct.
- A failed business transaction creates neither intent nor delivery; a committed durable-path change has both its intended recipients and inbox linkage.
- Two workers cannot own the same active lease. Expired claims recover, and a stale lease cannot complete a newer claim.
- A partial batch success retries only failed devices. A later batch exception does not erase earlier accepted results.
- Permanent token failure retires only that registration, while bad payload/config errors do not delete good devices.
- Logout/token rebinding, tenant mismatch, removed guardian linkage and revoked staff access prevent a stale dispatch.
- Crash after acceptance but before acknowledgement is recorded as an ambiguous at-least-once window, with no claim of exactly-once display.
- Backoff, provider throttling, expiry, maximum attempts and configuration pause do not produce an unbounded loop.
- Adding the migration preserves existing notification IDs/read states and does not replay historical messages.
- Only after separate approval: isolated staging configuration, selected test devices, foreground/background/cold-start taps, provider-token rotation and real per-platform receipt.

## Activation sequence

Review the design and producer contracts, add schema/producer/worker changes in a separate local patch, and run the database fault/concurrency tests. Keep dispatch disabled while migrating and checking counts. Reconcile the actual deployed revision and the developer's working changes before any merge. Enable one selected synthetic workflow in isolated staging only with approval. Never enable SMS, replay old alerts or expand audiences as a side effect.

No production action is authorized or performed by this document.
