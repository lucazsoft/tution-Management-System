# Admin to Mobile Integration Matrix

Date: 2026-09-15

## Purpose

This matrix maps the web/admin actions that mutate backend data to the mobile API reads that should reflect those changes for Teacher, Parent, and Student users.

The sync model is simple:

- Admin, branch admin, accountant, and web staff write data through backend API routes.
- Mobile users do not sync with the web frontend directly.
- Mobile reads the same backend database through role-scoped API routes.
- Tenant and branch boundaries must be enforced by the backend, not trusted from the mobile client.
- Push notifications can be added later; the first requirement is correct API refresh behavior.

## Current Verified Slice

| Slice | Web/Admin write | Mobile read | Status |
| --- | --- | --- | --- |
| Student timetable after class schedule update | `PUT /api/courses/classes/:classId` | `GET /api/users/me/student-portal` | Verified by Docker-backed integration test |

Verification already completed:

- Branch/admin updates a class schedule.
- Student portal immediately reflects the changed start and end time.
- Foreign-branch class data is not exposed to the student portal.
- Backend integration suite passed with Docker Postgres.

## Integration Matrix

| Area | Admin/Web Mutation Source | Main Backend Writes | Mobile Read Surface | Mobile Roles | Sync Status |
| --- | --- | --- | --- | --- | --- |
| Courses, classes, timetable | Tenant Admin / Branch Admin creates or updates course, class, schedule, enrollment, teacher assignment | `Course`, `Class`, `Enrollment`, `TeacherSession`, timetable/version records | `GET /api/users/me/student-portal`, `GET /api/parent/portal`, `GET /api/teacher/workspace` | Student, Parent, Teacher | Timetable update verified. Enrollment move/drop still needs coverage. |
| Student attendance | Teacher or web staff submits class/session attendance | Student attendance records, session status | Student portal attendance summary, parent portal child attendance, teacher workspace | Student, Parent, Teacher | Good next sync slice. Needs web-to-mobile integration test. |
| Teacher attendance/session update | Teacher check-in/out and daily session update | Teacher attendance records, `TeacherSession.dailyUpdateSubmitted`, session status | `GET /api/teacher/workspace` | Teacher | Route boundary reviewed. Wrong teacher/session now returns not found; duplicate update returns conflict. |
| Fees, invoices, payments | Admin/accountant generates invoices, records payment, blocks or overrides fee access | `Invoice`, payment records, access override/billing state | Student fee cards, parent child fee view, ConnectIPS initiation/status | Student, Parent | Backend flows exist. Mobile refresh and paid/blocked state need test coverage. |
| Homework | Teacher creates homework; update/delete lifecycle not implemented | Homework and submission records | Student homework list, teacher workspace; parent child homework feed not exposed yet | Student, Parent, Teacher | Partial: student create sync verified. Parent homework and assignment update/delete require backend + mobile work. |
| Results/performance | Teacher/admin enters marks, shares result, publishes performance | Result/score/performance records | Student result view, parent performance view | Student, Parent | Parent performance route exists; end-to-end publish-to-mobile test pending. |
| Academic calendar/events | Admin creates academic events, holidays, notices | Academic event records | Student calendar, parent calendar/alerts, teacher schedule context | Student, Parent, Teacher | Needs inventory of exact event read DTOs. |
| Notices/broadcasts | Admin sends branch/class/role broadcast | Notification/message/broadcast records | Mobile notifications/announcements | Student, Parent, Teacher | Needs decision: polling first or push notification later. |
| Leaves | Teacher/student/parent leave requests, admin approval | Leave request records and approval status | Teacher leave status, parent/student attendance context or alerts | Student, Parent, Teacher | Needs route-by-route role mapping. |
| Appointments | Parent/admin appointment creation and status changes | Appointment records | Parent appointments, possibly teacher/admin web schedule | Parent, Teacher | Needs mobile endpoint confirmation. |
| Certificates | Admin issues certificates/templates | Certificate/template records | Student certificate list/download, parent child certificate access | Student, Parent | Needs issuance-to-mobile test. |
| Admissions and account provisioning | Admin admits student, activates account, issues logins | User, student, parent, role, enrollment, invoice records | Mobile login and first portal load | Student, Parent | Activation path verified indirectly during integration repair. Needs dedicated mobile login readiness test. |

## Backend Boundary Rules

| Boundary | Rule |
| --- | --- |
| Tenant | Every admin write and mobile read must resolve under the authenticated tenant. |
| Branch | Branch admin writes are branch-scoped. Student/parent mobile reads should only expose the enrolled student's branch/class data. |
| Role | Native mobile supports Teacher, Parent, and Student only. Admin roles remain web/PWA. |
| Teacher ownership | Teacher mobile routes must require assigned teacher ownership, not just matching branch. |
| Parent ownership | Parent mobile routes must only expose linked children. |
| Student ownership | Student mobile routes must only expose the authenticated student's own portal data. |

## Recommended First Admin Integration Slice

Next slice: attendance sync from teacher/admin write to Student and Parent mobile reads.

Why this is the best next step:

- It is high-value for Parent and Student mobile.
- It exercises branch, class, teacher, student, and parent boundaries.
- It builds naturally on the already verified timetable/class setup.
- It is smaller than fees or results, but still proves the sync pattern.

Proposed test:

| Test ID | Scenario | Expected Result |
| --- | --- | --- |
| ADM-MOB-ATT-001 | Teacher submits class attendance for Branch A class | Student portal shows updated attendance for that student. |
| ADM-MOB-ATT-002 | Same update is read through linked parent portal | Parent portal shows only their linked child's attendance. |
| ADM-MOB-ATT-003 | Branch B student/parent attempts to observe Branch A attendance | No Branch A attendance data is exposed. |
| ADM-MOB-ATT-004 | Unauthorized or wrong teacher attempts attendance write | API rejects with not found/forbidden behavior. |

## API Sync Flow

The live sync path should be:

1. Web/admin frontend calls a backend mutation route.
2. Backend authenticates the session and resolves tenant/branch/user scope.
3. Route writes through Prisma to the shared database.
4. Mobile app calls its role-scoped read route.
5. Backend returns only data allowed for that mobile role.
6. Mobile Riverpod repository/view model refreshes the screen state.

There is no separate mobile database sync layer for this phase. The backend API is the source of truth.

## Local Backend Runtime Notes

Docker local backend currently runs the API and Postgres services together.

Typical local mobile API base URLs:

- Android emulator: `http://10.0.2.2:3001`
- iOS simulator or desktop/web local run: `http://localhost:3001`
- Physical device: use the host machine LAN IP, for example `http://192.168.x.x:3001`

Mobile should use the configured API base URL, keep the authenticated session/cookie/token, and call the role-specific portal routes.

## Test Backlog

| ID | Slice | Backend Integration | Mobile Repository/ViewModel |
| --- | --- | --- | --- |
| ADM-MOB-001 | Timetable class schedule update to student portal | Done | Pending focused mobile repository refresh test |
| ADM-MOB-002 | Enrollment create/move/drop to student and parent portal | Pending | Pending |
| ADM-MOB-003 | Attendance write to student and parent portal | Next | Pending |
| ADM-MOB-004 | Invoice payment/blocked/override state to mobile fees | Pending | Pending |
| ADM-MOB-005 | Homework create/update to student and parent mobile | Partial: `POST /api/homework` refreshes student portal; no homework update/delete endpoints and `/api/parent/portal` has no homework field | Partial: student repository parses portal/class homework; parent repository explicitly has no homework feed |
| ADM-MOB-006 | Result publish to student and parent mobile | Pending | Pending |
| ADM-MOB-007 | Academic event or broadcast to mobile notifications/calendar | Pending | Pending |
| ADM-MOB-008 | Leave request/approval to teacher or parent/student mobile | Pending | Pending |
| ADM-MOB-009 | Certificate issuance to student and parent mobile | Pending | Pending |

## Acceptance Criteria For Each Slice

Each admin-to-mobile sync slice should prove:

- The admin/web mutation route writes the expected records.
- The mobile read route returns updated data without using mock/demo data.
- Tenant and branch isolation are covered.
- Wrong-role and wrong-owner access are rejected.
- Mobile repository/view model can refresh and render the live DTO shape.
- Any remaining push notification gap is documented separately from API correctness.
