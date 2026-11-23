# TMS notification readiness patch, version 2

Prepared locally on 22 November 2026. Review draft, not a production release.

Base: `lucazsoft/tution-Management-System`, main commit `9f45b470a22f4c94850dc138efa8a5159587d804`.
Local branch: `fix/notification-readiness-local`.
Source: https://github.com/lucazsoft/tution-Management-System

## Release status

**Not ready to deploy without review and staging checks.** The initial version 2 record describes local preparation before console setup and native validation. See `notification-validation-2026-11-22.md` for the later Firebase registrations, public configuration, Flutter checks and remaining build/release limits. Main publication triggers production deployment; it is not a review-only action. The deployed state, staging isolation and rollback must be reconciled before release. This document records technical readiness, not permission to act.

This is the second cumulative local implementation pass. It supersedes the first patch and its guides. Apply the cumulative patch only to the stated clean base, not on top of version 1. It fixes specific defects and adds a web receiving foundation. It does not prove that every workflow reaches every platform, and it does not migrate or delete existing inbox records.

## Changes prepared

### Delivery results and routing

- Missing Firebase configuration or device tokens returns `success: false`, `sent: 0`, `skipped: true`, rather than reporting success.
- Maintenance checks the returned send result. Payroll logs provider-accepted, failed and skipped counts, not the intended recipient count as delivered. Anomaly alerts do not count a skipped send as delivered.
- Provider exception text is not logged by the Firebase sender, to avoid copying sensitive provider details or tokens into logs.
- Generic `messaging/invalid-argument` is no longer enough to delete a token. That error can concern the message payload rather than the token.
- Appointment payloads use `deepLink`. Parent-teacher messages include a role-specific deep link and generic alert body.
- Flutter also accepts an older `destination` payload only when it is a safe app-relative path.
- The older leave sender supports explicit `PUSH_PROVIDER=FIREBASE`, with tenant scope supplied by the server. Missing tenant scope fails closed. The webhook adapter is retained for compatibility.

### Web reception and inbox

- The shared hard-coded sample bell is removed. Authenticated routes get a real account inbox reading `/api/notifications`, with actual counts, mark-read, mark-all-read, refresh, error and empty states.
- The common browser inbox now shows account event history and current student/selected-child portal alerts in separate source groups. It uses the existing authorized portal APIs, not a broad historical portal-row query. Source-qualified IDs and original read endpoints preserve both stores. Read updates refresh both common and portal views; partial failures are shown.
- Browser FCM uses the Firebase JavaScript SDK, a separately bundled messaging worker, authenticated token registration and same-origin click destinations.
- Browser permissions are requested only after an explicit Enable action. Local opt-in is account-specific. No automatic permission prompt is added.
- Browser token operations are serialized, and explicit sign-out attempts to unregister/delete the device token while the authenticated session is available. Inbox refresh follows foreground push, reconnection and returning to a visible tab, not background polling.
- The browser worker is served without long-lived immutable caching. Missing worker requests return 404 rather than the SPA HTML fallback.
- Browser notification overrides are prepared with generic text. Provider/device display behaviour still needs staging verification.

### Second-pass native and workflow preparation

- Correction to the first guide: the old student ViewModel intended to prefer account events, but its default repository lacked Dio and therefore did not actually enter that path. Version 2 explicitly supplies the authenticated client in production construction. Injected portal-only fixtures are still supported.
- Student native rows now retain both account event history and current portal alerts with separate source IDs/read endpoints. Read-sync failures remain visible across refresh rather than being described as saved remotely. These transient local overrides are not an offline persistent queue.
- The student home badge is prepared to combine account events and portal alerts, and refresh after returning from the inbox. Parent/student live portal refresh is prepared for foreground pushes, not calendar pushes alone. Parent/teacher read failures no longer intentionally disappear or escape as unhandled request errors.
- Native setup/registration operations are serialized and fenced by a session epoch. Prepared guards suppress local display, opens and token refresh after logout/session expiry; queued logout can revoke a registration that completed late. Targeted Dart race tests are included but have not run.
- These native source changes are not a passed build, analyzer, test or visual check. Failed server unregistration, token revocation and OS-delivered background messages still need controlled device/account-switch tests. A local presentation gate is not proof that the provider token was revoked.
- Maintenance and payroll now attempt inbox records for the same existing assigned staff/active tenant-admin recipients before push. Maintenance reports `notificationPersisted` separately; payroll logs stored/failed inbox counts. The shared persistence helper remains fail-open. Provider acceptance and persistence are independent, and neither proves device display.
- Payroll/maintenance payloads carry separate mobile and React destinations. The common worker build selects React routes, while the Flutter-web worker bundler selects Flutter routes. Unit mocks cover both selections, data-only routing, no duplicate display for notification payloads and same-origin checks.

### Configuration and native preparation

- Compose forwards the server Firebase and legacy webhook configuration into the API container. Public browser build settings have separate build arguments and names.
- Firebase delivery is now explicitly gated by `PUSH_PROVIDER=FIREBASE`. Merely setting credentials does not enable alerts. **This is a behaviour change to review before deployment.**
- Flutter bootstrap requires complete explicit client build options on Android, iOS and web. A native config file alone is no longer treated as a configured fallback. This avoids relying on the repository's missing Google Services Gradle setup.
- Flutter web does not initialize the native local-notification presenter. It uses an in-app banner for foreground updates and the messaging worker for background alerts.
- iOS push entitlements and background modes are prepared. Debug uses development APNs; Profile/Release use production APNs. Existing bundle IDs and signing-team selection are unchanged.
- A separate local bundler can create the messaging worker for a Flutter web build from a public client settings file. It rejects server-secret field names.

## Configuration separation

Do not paste service-account JSON, private keys, signing secrets or device tokens into messages or source files. Provision server secrets through the existing secure deployment process only after approval.

| Scope | Settings | Notes |
| --- | --- | --- |
| API runtime | `PUSH_PROVIDER`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Private key belongs only on the server. Set `PUSH_PROVIDER=FIREBASE` only after review. Escaped newline sequences are supported. |
| React web build | `TMS_FIREBASE_API_KEY`, `TMS_FIREBASE_APP_ID`, `TMS_FIREBASE_PROJECT_ID`, `TMS_FIREBASE_MESSAGING_SENDER_ID`, `TMS_FIREBASE_AUTH_DOMAIN`, `TMS_FIREBASE_WEB_VAPID_KEY` | Public Firebase WEB app configuration and public VAPID key. Rebuild the web image after changing these. Never use the service-account private key. |
| Flutter build | `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_PROJECT_ID`, `FIREBASE_MESSAGING_SENDER_ID` | Register the exact platform app identity. The Android/iOS/web app IDs differ even when they share one Firebase project. `API_BASE_URL` remains required for release. |
| Flutter web additions | `FIREBASE_WEB_VAPID_KEY`, optional `FIREBASE_AUTH_DOMAIN` | Worker configuration must match this web build. HTTPS and supported browser/device conditions apply. |
| iOS outside source | APNs authentication key, provisioning profile and enabled Push Notifications capability | Requires the correct Apple/Firebase accounts. No key or signing account was created or changed. |

Existing identities are retained: Android `com.tms.tmsmobile`, iOS `com.tms.tmsMobile`. Do not rename them to work around configuration errors.

The legacy `WEBHOOK` provider remains a separate integration. Setting it does not supply a Firebase project or implement a gateway. Prefer an explicit reviewed routing plan, not mixed settings copied from the old guide.

For Flutter web, prepare a PUBLIC JSON file with that web app's Dart-define values, then build the worker locally:

```sh
node scripts/build-flutter-push-worker.mjs /path/to/public-web-client-config.json
```

The generated worker is intentionally ignored by git. It must be bundled into the corresponding Flutter web release. The command rejects server-secret field names. This is a build step, not a send or deployment step.

## Verification completed

See `notification-local-verification.md` for the exact local checks and their limits. Type checking, compilation and mock tests are not device delivery tests.

## Remaining release work

1. **Reconcile current code.** Compare this patch with Bigyan's branch and the actual deployed commit/build configuration before merging anything.
2. **Inbox consistency verification.** The two existing stores deliberately remain distinct. Version 2 prepares source-aware lists/reads without a destructive migration. One entity may have several legitimate event-history rows and a current portal summary; counts represent these records, not deduplicated business entities. Browser source/child-scope mocks pass. Native counts, rendering and cross-device read behavior still require validation. Latest account lists are bounded to 50 rows; this is not a full-history browsing UI.
3. **Workflow coverage.** Maintenance/payroll best-effort persistence is now prepared for the existing recipients. Other handlers can still be inbox-only or use separate legacy channels. An event-by-event staging matrix is required before claiming complete parity. Stored channel labels are not delivery evidence; no recipient or SMS policy was expanded.
4. **Durable delivery.** The Firebase path still lacks a general persistent outbox/retry ledger. Process crashes, transient failures and offline-device behaviour need controlled tests and a reviewed retry/idempotency design. The admission-SMS outbox is a different feature. The accompanying `notification-retry-design.md` specifies a proposed general design, including per-device results, lease fencing, idempotency and crash windows. No general outbox schema or dispatcher is implemented here. Changing best-effort annotations into atomic durable intent is an explicit producer-contract change for a follow-on implementation.
5. **Role/platform destinations.** Calendar, notices, messages and appointments have useful routes, but not every role has every screen on native mobile. Do not invent native desktop support or silently redirect sensitive admin events to unrelated screens.
6. **Native verification.** Flutter/Dart tools and an Apple build/signing environment were not available for this preparation. Dart/native changes have not been analyzed, built or run. Device permission, APNs-token timing, notification taps on cold start and platform signing must be checked.
7. **Delivery semantics.** `sent` in the current Firebase result means accepted by the provider, not shown on a device. Some backward-compatible field names still use delivered terminology. Do not treat them as receipts.
8. **Notification privacy and policy.** Existing recipients and channel choices are retained. New audiences, channels, historical replay or more private lock-screen text need their own reviewed scope. They are not assumed by this patch. Native/background privacy and session-expiry behavior need device validation.
9. **Native desktop.** Windows/macOS/Linux targets are not implemented push targets in this bootstrap. Desktop browser notifications are a separate capability and remain subject to browser support.

## Staging acceptance plan, not executed

Use synthetic data, explicitly selected test accounts/devices and an isolated staging deployment. Do not use student/family contact details or enable chargeable SMS as a side effect.

For calendar, notice, message, appointment, leave and selected operational events, verify:

- Correct tenant, branch/class, linked family and role recipients; exclude unrelated accounts and the author when policy requires it.
- One stable account event per operation, distinct current portal alerts, expected per-source counts and consistent server-backed reads on web and mobile.
- Provider-accepted, failed and skipped results reported separately; no success from missing configuration or zero devices.
- Foreground, background and closed-app receipt; correct tap destination after authentication.
- Denied/revoked permission, missing Google Play Services where relevant, network loss, token rotation/expiry and provider rejection.
- Logout and account switching do not leave the wrong account subscribed on a shared device.
- Repeating/retrying an operation does not duplicate alerts; a failure does not undo the business change.
- Generic browser lock-screen text, authenticated access to details and no tokens/private keys in logs.

A successful mock or compile does not pass these acceptance checks.

## Sources

- Repository inspected and patched locally: https://github.com/lucazsoft/tution-Management-System
- Flutter FCM setup: https://firebase.google.com/docs/cloud-messaging/flutter/client
- Browser FCM setup: https://firebase.google.com/docs/cloud-messaging/js/client
- Flutter receive/service-worker guidance: https://github.com/firebase/flutterfire/blob/master/docs/cloud-messaging/receive.md
- Server credential setup: https://firebase.google.com/docs/admin/setup?authuser=0
