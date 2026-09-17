# Mobile Mock/Demo Data Inventory

**Date:** 2026-09-15
**Scope:** `apps/mobile` production data sources and first web-to-mobile API sync slice

## Summary

The mobile production route boundary is already Teacher, Parent, and Student
only. A production-code scan found no current imports of the named mock/demo
data files from reachable mobile features. Those files remain in `lib`, but
they are currently dead or unreachable from the native router.

The first web-to-mobile sync slice should be **Student timetable/home** because
the Flutter side already reads `GET /api/users/me/student-portal`, the backend
already derives `todaySessions` and `weeklySessions` from enrolled classes, and
Branch/Tenant Admin timetable or class changes should be visible through the
same shared database without push infrastructure.

## Production Mock/Demo Files

| File | Current production status | Action |
| --- | --- | --- |
| `apps/mobile/lib/features/auth/data/mock_auth_service.dart` | No production imports found. Auth screens now use `AuthService`. | Keep temporarily or delete in cleanup after legacy tests/docs are reconciled. |
| `apps/mobile/lib/features/student/data/student_demo_data.dart` | No production imports found. Student home/timetable/academics/fees/id/calendar/notifications use repositories over `ApiClient`. | Delete later after confirming no screenshots/story fixtures need it. |
| `apps/mobile/lib/shared/data/mock_portal_data.dart` | No production imports found. Old shared model fixture only. | Delete later with old shared demo model cleanup. |
| `apps/mobile/lib/features/janitor/data/janitor_demo_data.dart` | No production imports found, and Janitor is now unsupported in native routing. | Delete with unreachable Janitor feature cleanup. |
| `apps/mobile/lib/core/network/web_credentials_adapter_stub.dart` | Platform conditional stub, not demo data. | Keep. |

## Unreachable Native Role Folders

These folders still exist under `apps/mobile/lib/features`, but their native
route groups are no longer registered:

- `branch_manager`
- `janitor`
- `tenant_admin`
- `admin`

They should not be deleted in the first sync slice because some tests still
target them and the role-scope report explicitly deferred source deletion.
Recommended cleanup is a separate reviewed change: remove or archive the
unreachable feature source, then remove the corresponding stale tests.

## API-Backed Mobile Surfaces Found

| Mobile surface | Primary repository | Current API source |
| --- | --- | --- |
| Student home | `StudentPortalRepository` | `GET /api/users/me/student-portal` |
| Student timetable | `StudentPortalRepository` | `GET /api/users/me/student-portal`; fallback `GET /api/courses/timetable/student/:studentId` |
| Student academics/attendance | `StudentAcademicsRepository` | `GET /api/users/me/student-portal`; class homework fallback |
| Student fees/certificates/id/calendar/notifications | Dedicated student repositories | Mostly `GET /api/users/me/student-portal`, with known TODO endpoints |
| Parent portal | `ParentPortalRepository` | `GET /api/parent/portal`, `GET /api/performance/student/:studentId`, connectIPS endpoints |
| Teacher portal | `TeacherPortalRepository` | `GET /api/teacher/workspace`, attendance, leave, daily update endpoints |

## First Sync Slice: Student Timetable/Home

### Why This Slice

- It verifies the core web/PWA to mobile rule without requiring Firebase push.
- The backend `GET /api/users/me/student-portal` already returns
  `todaySessions` and `weeklySessions`.
- Mobile home and timetable already consume that payload.
- A class/timetable admin mutation should be visible after refresh because web
  and mobile read/write the same database.

### Mutation To Read Contract

| Web/admin action | Backend mutation area | Mobile read path | Expected mobile effect |
| --- | --- | --- | --- |
| Create/update class schedule | `services/api/src/routes/courses.ts` class/course routes | `GET /api/users/me/student-portal` | Updated `todaySessions`/`weeklySessions` after refresh |
| Move/enroll student in class | `services/api/src/routes/courses.ts` enrollment/class routes | `GET /api/users/me/student-portal` | Added/removed sessions for that student only |
| Assign/change teacher | `services/api/src/routes/courses.ts` class teacher fields | `GET /api/users/me/student-portal` | Session teacher label updates |
| Branch-scoped admin changes another branch | branch scope checks in courses/users routes | Same read path | No data leakage to unrelated student |

### Begin Tasks

1. Add regression tests that production mobile code does not import known
   mock/demo data sources.
2. Add/extend backend integration coverage:
   - sign in as Branch Admin,
   - change an enrolled class schedule,
   - sign in as affected Student,
   - assert `GET /api/users/me/student-portal` includes the new schedule,
   - assert another branch/student does not see it.
3. Add/extend mobile repository tests for `StudentPortalRepository`:
   - parses updated `weeklySessions`,
   - refresh replaces old timetable values,
   - fallback endpoint is used only when portal weekly sessions are empty.
4. Run the focused Flutter tests and backend route/integration tests.

## Guardrail Added

`apps/mobile/test/core/data/production_data_boundary_test.dart` fails if
production mobile files start importing or referencing:

- `mock_auth_service.dart`
- `student_demo_data.dart`
- `janitor_demo_data.dart`
- `mock_portal_data.dart`

This keeps the mobile implementation API-backed while old files are still
waiting for cleanup.
