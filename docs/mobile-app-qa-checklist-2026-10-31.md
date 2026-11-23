# TMS Mobile App QA Checklist

**Prepared:** 2026-10-31  
**Scope:** Flutter mobile application in `apps/mobile`  
**Audience:** Mobile developer and QA tester  
**Status:** QA execution checklist and release-readiness report; manual device execution is still required.

## 1. QA objective

Verify that the mobile app is safe, usable, role-correct, resilient to poor connectivity, and ready for release on supported Android and iOS devices. A feature is considered passed only when the happy path and loading, empty, offline, permission-denied, validation, server-error, and retry states have been checked where applicable.

This report is intentionally mobile-focused. Web QA will be reported separately.

## 2. Current implementation scope

The current mobile app includes:

- Authentication, remembered accounts, password reset/change, 2FA, MPIN, account switching, and session-expiry handling.
- Student: home, academics, timetable, attendance, fees/payments, calendar, digital ID, certificates, leave, and notifications.
- Parent: home, child switching, academics, attendance, fees/payments, calendar, timetable, leave, messages, appointments, and account security.
- Teacher: dashboard, timetable, attendance/geolocation, daily updates, leave, class details, learning screens, messages, meetings, notifications, and calendar.
- Janitor: task list, task details, and task completion.
- Tenant Admin and Branch Admin operational dashboards.
- Notice board, local persistence, offline mutation queue, sync conflict handling, Firebase push notifications, location, camera/gallery-related flows, and QR/payment-related UI.

## 3. Known scope gaps to verify before release

These are not automatic defects; the developer must either implement them, document them as intentionally out of scope, or ensure the UI clearly routes the user to the web portal:

- Platform Admin mobile workspace is not available.
- Tenant Admin and Branch Admin do not have complete mobile administration, finance, payroll, admissions, timetable, results, resources, certificates, or calendar-management workflows.
- Accountant and Receptionist are web-only/unsupported mobile roles.
- Teacher has incomplete dedicated syllabus, homework, results, employment-profile, salary-slip, and full daily-update-history workflows.
- Student homework, syllabus, and results are combined under Academics rather than exposed as separate routes.
- Parent has incomplete or aggregate-only dedicated certificates, leave history, linked-student profile, alternative-time proposal, and some calendar/timetable workflows.
- Some repositories document server-side limitations for certificate lists, invoice details/receipts, leave data, pagination, notifications, and parent-scoped downloads. These must show an explicit error or unavailable state, never fake successful data.
- Nepal Pay QR UI contains a documented placeholder payload and must not be treated as a production payment success path.

## 4. Test setup and evidence

### Required test accounts

Prepare isolated staging accounts for:

- Student with populated, empty, overdue, and paid fee data.
- Parent with one child and multiple children.
- Teacher with classes, attendance permission, leave history, and no-class state.
- Janitor with pending, in-progress, completed, and empty task states.
- Branch Admin and Tenant Admin with data in multiple branches.
- Unsupported Accountant/Receptionist role.
- Locked, expired-password, 2FA-enabled, and invalid-login accounts.

Never put real passwords, tokens, phone numbers, or personally identifiable information into screenshots, test fixtures, commits, or issue descriptions.

### Device and OS matrix

Execute at minimum:

| Class | Android | iOS | Checks |
|---|---|---|---|
| Small phone | Android 10+; 360x640 or equivalent | iPhone SE-sized device | Overflow, keyboard, touch targets |
| Standard phone | Android 13+; 390x844 or equivalent | iPhone 13/14-sized device | Primary release smoke |
| Large phone | Android 14+ | iPhone 15 Pro Max-sized device | Scaling and long content |
| Tablet/large layout | Android tablet | iPad if supported | Adaptive layout and navigation |
| Accessibility | Android TalkBack | iOS VoiceOver | Labels, focus order, semantics |

Also test light/dark mode where supported, system font scaling at 100%, 130%, and 200%, portrait/landscape, and low battery/power-saving mode.

### Evidence to capture

For every failed case record:

1. Test ID, build number, device/OS, account role, and environment.
2. Exact steps and test data.
3. Expected result and actual result.
4. Screenshot or screen recording with sensitive data redacted.
5. API request/correlation ID and timestamp when relevant.
6. Severity, reproducibility, and a linked issue.

## 5. Release-blocking smoke checklist

All items below must pass on one current Android device and one current iOS device before release.

- [ ] App installs, launches, and reaches the correct initial screen without crash.
- [ ] Login succeeds with valid credentials and rejects invalid credentials without leaking account existence.
- [ ] 2FA flow accepts a valid code, rejects invalid/expired codes, supports resend cooldown, and handles cancellation.
- [ ] Authenticated users cannot open another role’s routes by deep link or back-stack navigation.
- [ ] Logout clears the active session and protected screens cannot be reopened with Back.
- [ ] Session expiry/401 redirects to login and does not leave stale private data visible.
- [ ] Each supported role reaches its correct home screen and navigation items.
- [ ] A representative list/detail screen loads, refreshes, and renders loading, empty, error, and retry states.
- [ ] A permitted mutation succeeds once, does not duplicate on retry, and displays a clear result.
- [ ] Offline launch and offline read behavior match the product promise.
- [ ] An offline mutation is queued, visibly marked, replayed after reconnection, and does not overwrite newer server data silently.
- [ ] Push notification permission, receipt, tap-to-open, and logged-out behavior are correct.
- [ ] App survives background/foreground, rotation where supported, and process restart without corrupting auth or local data.
- [ ] No release-blocking crash, data leak, broken navigation, or unhandled destructive action remains.

## 6. Detailed functional checklist

### A. Installation, startup, and lifecycle

- [ ] Fresh install starts cleanly on every target OS.
- [ ] Upgrade from the previous build preserves only intended data and migrations complete.
- [ ] Cold start, warm start, background for 1 minute, and background for 30 minutes behave correctly.
- [ ] Force-close and relaunch do not show another user’s cached data.
- [ ] OS back, Android system back, swipe-back, and close gestures behave consistently.
- [ ] No screen is clipped by a notch, safe area, keyboard, or navigation bar.
- [ ] Deep links to public, protected, invalid, and unsupported routes resolve safely.

### B. Authentication and account security

- [ ] Required-field, email-format, password, and server validation messages are clear and accessible.
- [ ] Valid login stores the correct session and routes by role.
- [ ] Invalid login, locked account, network failure, timeout, and server error are distinguishable and recoverable.
- [ ] Forgot-password request, reset-token expiry, invalid token, password policy, and successful reset work.
- [ ] Change-password requires the expected current password and invalidates sessions if the API contract requires it.
- [ ] Change mobile/email verifies the new value and handles duplicate/unverified values.
- [ ] 2FA valid, invalid, expired, resend, duplicate-submit, and offline cases work.
- [ ] Remembered credentials and saved accounts never expose plaintext passwords or tokens.
- [ ] Add, switch, remove, and sign out a device account; verify the active account’s tenant/role/data changes together.
- [ ] MPIN setup, validation, wrong attempts, reset, logout, and app restart behave securely.
- [ ] Logout from every supported role clears local user-scoped data and queued mutations as designed.
- [ ] 401/403 responses never render protected data and provide a clear recovery route.

### C. Role authorization and navigation

- [ ] Student can access only `/student/` routes.
- [ ] Parent can access only `/parent/` routes and only linked children.
- [ ] Teacher can access only `/teacher/` routes and only assigned classes/data.
- [ ] Janitor can access only janitor routes and assigned task data.
- [ ] Branch Admin and Tenant Admin cannot cross tenant/branch boundaries.
- [ ] Unsupported roles receive an explicit unsupported-mobile screen, not a blank screen or unauthorized data.
- [ ] Direct route entry, stale back-stack entries, saved-account switching, and role changes all re-run authorization.
- [ ] Navigation labels, active state, back behavior, and notification badges are correct.

### D. Student workflows

- [ ] Home KPIs, profile, announcements, and refresh reflect the selected student.
- [ ] Academics handles populated, no-data, partial-data, and API-error states.
- [ ] Timetable handles today, another date, no classes, timezone/Nepali-date display, and long schedules.
- [ ] Attendance totals, date/filter state, empty data, and server errors are correct.
- [ ] Fees show invoice status, due dates, totals, payment action, duplicate-tap protection, cancel/failure/success, and receipt behavior.
- [ ] Digital ID renders correctly, handles missing photo/data, and does not expose another student’s ID.
- [ ] Certificates list/download/open/error behavior is honest when the server endpoint is unavailable.
- [ ] Calendar handles month/date navigation, events, Nepali date/time, and empty state.
- [ ] Leave request validation, submit, duplicate submit, status, cancellation (if supported), and offline behavior work.
- [ ] Notifications read/unread state, refresh, persistence, deep link, and empty state work.

### E. Parent workflows

- [ ] Home and child switcher update every child-scoped screen, not only the header.
- [ ] Child switching while a request is loading cannot mix results between children.
- [ ] Academics, timetable, attendance, fees, calendar, leave, messages, and appointments enforce parent scope.
- [ ] Fee payment supports cancel, failure, retry, duplicate prevention, and correct child/invoice identity.
- [ ] Messages handle send, validation, empty thread, retry, and ordering.
- [ ] Appointment request, accept/reject, alternative-time, cancellation, and stale-status behavior are verified or clearly marked unsupported.
- [ ] Parent account/security flows match the authentication checklist.

### F. Teacher workflows

- [ ] Dashboard and timetable show only assigned classes and correct dates.
- [ ] Geo-attendance checks permission denied, GPS disabled, inaccurate location, outside radius, retry, and successful marking.
- [ ] Attendance mutation prevents duplicate marking and reports server rejection.
- [ ] Class detail, daily update, leave, messages, meetings, notifications, calendar, and learning screens handle all state variants.
- [ ] Teacher cannot modify a class or student outside their authorization.
- [ ] Background/resume during geo-attendance does not falsely report success.

### G. Janitor, Branch Admin, and Tenant Admin

- [ ] Janitor task filters, details, status transition, duplicate completion, offline queueing, and server rejection work.
- [ ] Branch Admin dashboard shows correct branch only and read-only limitations are clear.
- [ ] Tenant Admin dashboard shows correct tenant scope and missing server-backed actions are explicit.
- [ ] Cross-branch and cross-tenant IDs in URLs, request bodies, cached records, and queued mutations are rejected.
- [ ] Unsupported administration actions do not show a success-shaped placeholder.

### H. Offline, sync, and local data

- [ ] Disable network before launch; app shows a useful offline state rather than an infinite spinner.
- [ ] Cached data is labeled with freshness/last-updated information where required.
- [ ] Read-only screens distinguish no data from no connection.
- [ ] Create/update actions queue exactly once with an idempotency key.
- [ ] Reconnection drains queued operations FIFO and reports retryable failures.
- [ ] 409/stale-version conflict uses server-wins behavior and tells the user their offline change was overwritten.
- [ ] App restart preserves queued operations; logout/account switch does not expose or replay another user’s queue.
- [ ] Repeated connectivity changes do not create duplicate submissions or concurrent drains.
- [ ] Clearing account data removes local cache, notifications, and queued operations for that user.
- [ ] Local database migration, full/low storage, and corrupted-cache recovery are tested.

### I. Notifications and permissions

- [ ] First-run notification permission request is timed and explained appropriately.
- [ ] Allow, deny, and later-enable notification settings are handled.
- [ ] Foreground, background, and terminated push delivery are verified.
- [ ] Tapping a notification opens the correct authorized screen.
- [ ] Notification for a different account/child is not shown after account switching.
- [ ] Duplicate notifications, invalid payloads, expired targets, and logged-out delivery are safe.
- [ ] Location permission allow, deny, deny-forever, settings recovery, GPS off, and approximate/inaccurate location are handled.
- [ ] Camera/photo permission allow, deny, cancel, unsupported format, and large-file behavior are handled where used.

### J. UI, accessibility, localization, and performance

- [ ] No overflow, clipped text, invisible controls, or tap targets smaller than approximately 44x44 logical pixels.
- [ ] Loading indicators are bounded; every failed request has a retry or recovery path.
- [ ] Empty states explain what the user can do next.
- [ ] Error messages are actionable and do not expose stack traces, tokens, SQL, or internal URLs.
- [ ] Screen reader labels, focus order, semantic headings, and announcements work.
- [ ] Contrast is readable in light/dark themes and selected/disabled/error states.
- [ ] Keyboard does not cover focused inputs or submit controls.
- [ ] Rapid taps, repeated navigation, and rotating/foregrounding during requests do not crash or duplicate work.
- [ ] Long lists remain responsive; scrolling, refresh, and pagination do not visibly jank.
- [ ] Images, QR codes, fonts, and icons render on a clean device without network access where they are expected to be bundled.
- [ ] Dates, currency, timezone, Nepali date/calendar, and AM/PM formatting are consistent with product requirements.

## 7. API and security checks

- [ ] All protected requests use the expected authenticated session mechanism.
- [ ] Requests contain the correct tenant, branch, user, child, and idempotency context.
- [ ] Unauthorized, forbidden, not-found, validation, rate-limit, timeout, and 5xx responses map to safe UI states.
- [ ] TLS/certificate behavior is appropriate for the release environment.
- [ ] Logs and crash reports redact passwords, tokens, cookies, payment data, and personal data.
- [ ] Local storage, preferences, database, backups, screenshots, and notifications do not expose secrets or private records.
- [ ] Payment flows never display success until the server confirms the transaction.
- [ ] Deep links and notification payloads cannot bypass authorization.
- [ ] App does not ship development credentials, mock accounts, debug endpoints, or placeholder payment payloads.

## 8. Automation and developer verification

Run from the repository root or use the exact directory changes below:

```powershell
cd apps\mobile
flutter pub get
flutter analyze
flutter test
flutter test --coverage
```

Recommended additions before release:

- Integration tests for login/2FA/logout/session expiry.
- One complete Student flow and one complete Parent flow.
- One Teacher geolocation-permission flow.
- One offline queue/reconnect/conflict flow on a real device.
- Push notification delivery and notification deep-link tests on Android and iOS.
- Build validation:

```powershell
cd apps\mobile
flutter build apk --release
flutter build ios --release
```

The iOS build requires macOS/Xcode; run it on the appropriate CI runner if development is on Windows.

## 9. Validation performed while preparing this report

| Check | Result |
|---|---|
| Repository and mobile source/test inventory | Completed |
| Existing parity and testing documentation review | Completed |
| `cd apps\mobile; flutter analyze` | **Blocked:** `flutter` command is not installed or not on `PATH` in the current Windows environment |
| `cd apps\mobile; flutter test` | **Not run:** analyze could not start |
| Manual Android/iOS device QA | **Not run:** requires configured devices/build tooling |

The developer must attach the output of `flutter analyze`, `flutter test --coverage`, release builds, and the manual evidence matrix before declaring release readiness.

## 10. Defect severity and sign-off

| Severity | Definition | Release decision |
|---|---|---|
| P0 Critical | Crash on launch, auth bypass, cross-tenant data exposure, payment false success, irreversible data loss | Must fix; release blocked |
| P1 High | Core role workflow unusable, session/security failure, data corruption, offline replay duplication | Must fix or formally waive |
| P2 Medium | Important workflow has workaround, incorrect state, accessibility/device failure | Fix before production where practical |
| P3 Low | Cosmetic issue or low-impact copy/layout issue | Track and schedule |

### Sign-off

- [ ] Developer completed automated checks and attached results.
- [ ] QA completed the release-blocking smoke checklist on Android.
- [ ] QA completed the release-blocking smoke checklist on iOS.
- [ ] All P0/P1 defects are fixed and retested, or an owner-approved waiver exists.
- [ ] Known scope gaps are accepted by product and are not represented as working features.
- [ ] Release build, version, environment, and rollback plan are recorded.

**Developer:** ____________________  
**QA:** ____________________  
**Product owner:** ____________________  
**Build/version:** ____________________  
**Date:** ____________________
