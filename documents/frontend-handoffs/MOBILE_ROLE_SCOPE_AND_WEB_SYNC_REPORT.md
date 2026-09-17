# Mobile Role Scope and Web Sync Report

**Date:** 2026-09-15  
**Scope:** Flutter mobile role access, web/PWA handoff, shared data, and push notifications

## Decision

The native mobile app supports these three roles:

- Teacher
- Parent
- Student

Tenant Admin, Branch Admin, Janitor, and other operational or administrative
roles use the web portal or its installable PWA. This keeps native development
focused on the people who need frequent, time-sensitive updates and daily
on-the-go workflows. Management work remains available in a browser and can
still be used on a phone when a PC is unavailable.

This is a user-interface boundary only. Web and mobile must continue to use the
same backend, database, authentication rules, tenant scope, and branch scope.
Removing an admin role from native navigation must not create a separate data
source or delay changes made through the web portal.

## Why These Three Roles

| Role | Native mobile reason |
| --- | --- |
| Teacher | Daily timetable, geo attendance, class attendance, leave, and daily updates require frequent access while moving between classes. |
| Parent | Attendance, fees, results, notices, appointments, and urgent student events need timely alerts. |
| Student | Timetable, homework/academic updates, attendance, fees, certificates, and school notices are checked frequently. |

Administrative and operational roles primarily perform data entry,
configuration, reporting, approval, and oversight. Those workflows are better
suited to the larger web workspace. The responsive web portal/PWA is the mobile
fallback for those users.

## What Was Removed From Mobile

The Flutter router no longer registers these native route groups:

- `/tenant/*`
- `/branch/*`
- `/janitor/*`

Their screen imports and route builders were removed from
`apps/mobile/lib/core/router/app_router.dart`. The existing feature source files
have not been deleted yet; they are unreachable from the application router and
can be removed later in a separately reviewed cleanup after confirming that no
shared code or tests depend on them.

The authenticated role mapping now sends `TENANT_ADMIN`, `BRANCH_ADMIN`, and
`JANITOR` to `/unsupported-role`. The route guard also prevents these users from
opening teacher, parent, or student routes through a deep link.

The handoff screen displays:

> Use the web portal for this role.

It explains that the native app is intended for Parent, Student, and Teacher
accounts and provides a sign-out action. Authentication is intentionally still
allowed so the app can identify the user's role and show the correct handoff.

## How Web and Mobile Stay Linked

The web portal and Flutter app are clients of the same API. They should never
synchronize directly with each other.

```text
Branch/Tenant Admin on Web or PWA
                |
                | authenticated API mutation
                v
        Shared API and Database
          |          |          |
          v          v          v
       Teacher     Parent     Student
       mobile      mobile      mobile
          \          |          /
           API refresh + notification event
```

For example, when a Branch Admin changes a timetable, attendance status, fee,
result, announcement, leave decision, or student record:

1. The web portal saves the change through the server API.
2. The server validates the authenticated user's tenant and branch access.
3. The server commits the change to the shared database.
4. Teacher, Parent, and Student mobile screens load the updated server data on
   initial load, pull-to-refresh, or their next refresh cycle.
5. For time-sensitive event types, the server creates a notification event and
   sends it to the affected users after the database transaction succeeds.
6. Opening the notification takes the mobile user to the relevant screen, which
   reads the authoritative record from the API.

The notification is a prompt, not the source of truth. If delivery is delayed
or a device is offline, the saved database change must still appear when the app
refreshes.

## Current Readiness

| Capability | Current state | Required action |
| --- | --- | --- |
| Shared web/mobile backend | Present | Keep all clients on the same environment-specific `API_BASE_URL`. |
| Session and role scope | Present | Continue deriving user, tenant, and branch authority from the verified server session. |
| Teacher/Parent/Student API data | Present for existing portal surfaces | Ensure every admin mutation invalidates or updates the data returned by the corresponding mobile endpoint. |
| In-app notification feeds | Partial | Student and Parent portal payloads include notifications, but read state and coverage are incomplete. |
| Production device push | Not ready | Replace the server mock, register device tokens, and add native push handling to Flutter. |
| Real-time foreground updates | Not present as a general mechanism | Use targeted refresh-on-resume first; add SSE/WebSocket only where immediate live updates are genuinely required. |

The backend class currently named `MockPushNotificationService` only logs push
requests in memory. It does not deliver notifications to Android or iOS devices.
The Flutter package list also does not currently include Firebase Messaging.
Therefore, a notification feed shown after an API refresh must not be described
as production push notification support.

## Push Notification Implementation Plan

### 1. Define Notification Events

Create a typed event catalogue with recipient rules and deep-link destinations.
At minimum, cover:

- Timetable/class changes: affected teachers and students; parents when useful.
- Student attendance saved or corrected: affected parent and student.
- Emergency departure or urgent branch notice: affected parent immediately.
- Fees and payment status: affected parent and student.
- Results, homework, certificate, and academic notices: affected student and
  parent as appropriate.
- Leave and appointment decisions: the requester and affected participant.

Each event should contain a stable event ID, tenant ID, branch ID, recipient user
ID, category, title, body, destination, entity ID, created time, and read time.

### 2. Persist Notifications and Device Registrations

Add database-backed notification and device-registration records. Device tokens
must be associated with an authenticated user and installation, support token
rotation, and be revoked on logout or invalid-token feedback. Tenant and branch
IDs must be determined and validated by the server, not trusted from arbitrary
client input.

### 3. Deliver After Successful Commits

Replace direct calls to the mock sender with a provider abstraction backed by
Firebase Cloud Messaging for Android and Apple delivery through FCM/APNs for
iOS. Enqueue delivery only after the business transaction commits. Use an
outbox/job worker with retries and idempotency so a temporary provider failure
does not roll back the admin's saved change or produce duplicate alerts.

### 4. Add Flutter Push Support

Add Firebase Core and Firebase Messaging, platform configuration, permission
prompts, token registration/refresh, foreground presentation, background tap
handling, and authenticated deep-link validation. A push destination must still
pass the existing role guard before navigation.

On app launch and resume, refresh notification counts and the current role's
high-value summary data. This closes the gap when a push is missed or disabled.

### 5. Make Read State Shared

Add API endpoints to list notifications and mark one or all as read. Read state
should be stored on the server so it stays consistent across web, PWA, and
multiple phones. The current local-only read state must be treated as temporary.

### 6. Test End to End

Required tests include:

- Unsupported mobile roles always reach `/unsupported-role`.
- Deep links cannot cross role boundaries.
- A branch-scoped admin change is visible only to the affected users.
- A committed change creates one idempotent notification event.
- A failed push delivery is retried without undoing the saved change.
- Token rotation, logout revocation, and invalid tokens are handled safely.
- Notification taps route to the correct Teacher, Parent, or Student screen.
- Refresh-on-resume shows current data even when push permission is denied.

## Recommended Delivery Order

1. Keep the completed native routing restriction and web/PWA handoff.
2. Audit admin mutation endpoints against Teacher, Parent, and Student read
   endpoints to confirm shared-data visibility and cache behavior.
3. Add persistent notification records, recipient rules, and mark-read APIs.
4. Implement the production push provider and delivery worker.
5. Add Flutter device registration, push handling, and deep links.
6. Run role-scope, multi-client synchronization, and device push tests in
   staging before production rollout.

## Acceptance Criteria

- Only Teacher, Parent, and Student have native mobile workspaces.
- Unsupported authenticated roles see the web portal message and cannot enter a
  supported role's routes.
- Web/PWA and native clients use the same deployed API and database.
- A Branch Admin change appears in the correct mobile API response immediately
  after the server transaction commits.
- Time-sensitive changes create durable, retryable notifications for only the
  affected users.
- Users with push disabled still receive the latest state after app refresh or
  resume.
- Tenant and branch isolation is enforced by the server for reads, writes,
  notification creation, and device delivery.

