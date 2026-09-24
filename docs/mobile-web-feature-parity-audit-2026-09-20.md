# Mobile/web feature parity audit — 2026-09-20

Source of truth compared: `apps/web/src/components/patterns/dashboardNavigation.ts`, web router routes, and `apps/mobile/lib/core/router/app_router.dart`.

## Current mobile coverage

- Authentication, password reset/change, two-factor verification, remembered login, secure multi-account switching, and MPIN management.
- Student home, academics aggregate, timetable, attendance, fees/payment, calendar, digital ID, certificates, and notifications.
- Parent home, academics/performance aggregate, attendance, fees/payment, messages, appointments, child switching, profile, and account security.
- Teacher dashboard, timetable, geo attendance, daily updates, leave, class and attendance views.
- Janitor task list/details and completion.
- Tenant and Branch Admin operational summary dashboards.

## Web workflows still missing dedicated mobile parity

| Role | Missing or incomplete dedicated mobile workflows |
|---|---|
| Platform Admin | Tenant creation/list and platform security |
| Tenant Admin | Branch CRUD, people, admissions, complete student/teacher/course/grade/timetable/results administration, payment settings, billing/payments, payroll, petty cash, P&L, leave queue, resources, HR, certificate administration, institution calendar administration, and control center |
| Branch Admin | Staff/admissions/student/teacher administration, syllabus, timetable administration, academic attendance administration, classes, homework/results publishing, payment settings, billing/payment approvals, petty cash, resources, certificate issuance, announcements, full calendar administration, and complete appointment/message operations |
| Teacher | Full calendar, syllabus tracker, homework publishing, results publishing, employment profile, salary slips, and complete daily-update history |
| Student | Dedicated homework, syllabus, and results routes are combined under mobile Academics rather than matching every web route independently |
| Parent | Dedicated timetable, leave request/history, certificates, calendar, linked-students profile, and alternative-time proposal UI remain incomplete or are reachable only through aggregate screens; messages and appointment request/accept/reject are implemented |
| Accountant | Finance workspace is web-only |
| Receptionist | Front-desk workspace is web-only |

## Release rule

Do not describe Android as fully web-feature-equivalent until every row above has a real role-authorized mobile route, uses the same API contract as web, and has loading, empty, offline, denied, error, and success coverage. Disabled placeholders do not count as parity.
