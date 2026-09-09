# Tuition Management System (TMS) — Progress & Detailed Task List

> **Master Progress Tracker & Functional Specification Verification**  
> **Repository:** `d:\lochan\Projects\TMS`  
> **Roles Documented:** 01 to 09 (Super Admin, Tenant Admin, Branch Admin, Teacher, Accountant, Receptionist, Janitor/Cleaner, Student, Parent/Guardian)  
> **Phases Covered:** Phase 1 (Core Foundation), Phase 2 (Academic & Operations), Phase 3 (ERP & Finance), Phase 4 (Enterprise Scaling & AI)  
> **Last Verified:** August 13, 2026
> **Mobile verification:** August 13, 2026 — source review plus `flutter analyze` and `flutter test` in `apps/mobile`.

---

## 📊 Overall Progress Summary

| Target Area / Specification | Completion | Status | Key Focus |
|---|---|---|---|
| **Role 01: Super Admin** | 85% | 🟡 In-Progress | Cross-tenant support banner & platform usage billing |
| **Role 02: Tenant Admin** | 90% | 🟢 Operational | HR weight validation, P&L reporting & master certificates |
| **Role 03: Branch Admin** | 90% | 🟢 Operational | Emergency departures, fee overrides & maintenance logs |
| **Role 04: Teacher** | 85% | 🟢 Operational | Geo-attendance radius, mandatory updates & score entry |
| **Role 05: Accountant** | 80% | 🟡 In-Progress | 2-level petty cash approval & double-entry ledger |
| **Role 06: Receptionist** | 80% | 🟢 Operational | Front desk check-in, appointments & privacy boundaries |
| **Role 07: Janitor / Cleaner**| 75% | 🟡 In-Progress | Auto-assigned maintenance tasks & overdue escalations |
| **Role 08: Student** | 85% | 🟢 Operational | Timetable, results analytics, digital ID & Nepal Pay QR |
| **Role 09: Parent / Guardian** | 85% | 🟢 Operational | Child switcher, teacher messaging & advance leave |
| **Mobile application release readiness** | **15%** | 🔴 Blocked / foundation only | UI exists for Teacher, Student, and Parent, but compilation, production data, session, offline, and release work remain |
| **Phase 1: Core Foundation** | 100% | ✅ Completed | Monorepo, auth, multi-tenant RBAC & basic dashboards |
| **Phase 2: Academic & Ops** | 70% | 🟡 Active | Homework, grade analytics, real-time chat & certificates |
| **Phase 3: ERP & Finance** | 20% | ⏳ Planned | Payroll calculation, double-entry ledger & petty cash L2 |
| **Phase 4: Scaling & AI** | 10% | ⏳ Planned | AI financial forecasting & social media auto-publish |

---

## 📱 Mobile App — Verified Update, Phases & Task List

**Scope:** `apps/mobile` Flutter application (Teacher, Student, and Parent first; Android and iOS).
**Planning baseline:** `documents/phases-docs/MOBILE_APP_DEVELOPMENT_TASKLIST.md`.
**Important:** the role and platform percentages above describe the broader system, including web/API work. They must not be read as eviden.ce that matching Flutter journeys are production-ready.

### Verified current state

- Flutter foundation is present: Flutter/Riverpod/GoRouter/Dio, shared theme/widgets, auth screens, adaptive helpers, and partial Teacher, Student, and Parent portals.
- The initial compilation blockers and analyzer findings have been repaired: `dart format .`, `flutter analyze`, and `flutter test` all pass (**12 tests**, verified 2026-08-13). This is a code-quality gate only; the app is not yet release-ready.
- The API client uses a hard-coded Android-emulator HTTP URL and an in-memory cookie jar. It has no release environment configuration or secure persistent session decision.
- Several screens use `MockPortalData`, `student_demo_data.dart`, or `MockAuthService`; routes only cover Teacher, Student, and Parent; offline storage/sync, push notifications, file flows, integration tests, and release tooling are absent.
- The Flutter README remains the starter template. Existing unit/model tests are useful beginnings but do not verify production role journeys.

### Delivery phases

| Phase | Outcome | Main tasks | Estimate* |
| --- | --- | --- | --- |
| **M0 — Stabilize** | A clean, testable Flutter baseline | Fix compilation and broken adaptive components; restore login/router/model references; run formatter, analyzer, and existing tests; document the actual supported platforms. | 3–5 working days |
| **M1 — Production foundation** | Secure staging-connected app shell | MOB-001–008: role matrix, `--dart-define` environments, Better Auth completion, secure session policy, route/RBAC guards, typed network/error layer, CI and release checklist. | 2 weeks |
| **M2 — Student journeys** | API-backed Student MVP | MOB-101–104: timetable, academic records, attendance, invoices/payment return, certificates, digital ID, calendar, and notification inbox; remove production fixture data. | 2–3 weeks |
| **M3 — Parent and Teacher journeys** | API-backed Parent/Teacher MVP | MOB-105–109: authorized child switcher, child-scoped finance/academics, leave/appointments/messages where APIs exist, teacher scheduling, server-validated geo-attendance, daily updates, roster, homework, scores, and leave. | 3 weeks |
| **M4 — Mobile capabilities** | Reliable cross-device experience | MOB-007 (offline implementation), MOB-110, MOB-201–206: sync/conflicts, push, files, adaptive audit, accessibility/localization, performance, privacy-safe observability. | 2–3 weeks |
| **M5 — Release verification** | Signed, supportable release candidate | MOB-301–306: unit/widget/integration/security/device tests, staging UAT, Android/iOS signing, store assets, phased rollout, rollback/support runbook. | 2 weeks |

\*Estimates assume one experienced Flutter engineer, a stable staging API with named backend support, and timely product decisions. Testing begins in M0 and continues throughout; M5 is the final dedicated hardening period.

### Immediate task list (next 5 working days)

- [x] **M0.1 — Repair the build:** corrected `core/adaptive/widgets` imports and invalid widget APIs; restored missing symbols/constructors; removed invalid `const` usage. Verified with `flutter test` (12 passing, 2026-08-13).
- [x] **M0.2 — Establish a green local quality gate:** `dart format .`, `flutter analyze`, and `flutter test` pass locally (12 tests, verified 2026-08-13). CI automation remains part of M1 / MOB-008.
- [x] **M0.3 — Complete the auth-path audit:** migrated forgot-password, OTP verification, password reset, 2FA verification, and 2FA resend to `AuthService` / `AuthNotifier`; removed `MockAuthService`. `flutter analyze` and `flutter test` pass (12 tests, verified 2026-08-13). Backend/staging end-to-end authentication remains a separate M1 acceptance test.
- [ ] **M0.4 — Create the environment contract (in progress):** added `--dart-define=API_BASE_URL=<url>` configuration. Debug defaults to the Android emulator endpoint; non-debug builds reject missing/non-HTTPS endpoints. Android permits clear-text traffic only for debug builds. Android SDK 36, platform/build tools, licenses, and JDK 17 are configured for Flutter (verified 2026-08-13). Remaining owner decisions: staging/production API URLs, Android/iOS bundle identifiers, supported OS matrix, and release-signing custody. The initial APK build is fetching required NDK dependencies.
- [ ] **M0.5 — Agree the initial role scope:** release Teacher, Student, and Parent first; explicitly choose web-only or a constrained experience for the remaining roles.
- [ ] **M0.6 — Publish mobile operating documentation:** replace the Flutter starter README and add mobile API-contract and device-test sections to the relevant docs.

### Time to proceed

With the assumptions above, a credible **Teacher/Student/Parent MVP is 7–8 weeks** (M0–M3, with continuous tests). A **release-ready Android and iOS app is 10–12 weeks** (M0–M5). Add **2–4 weeks** if offline-first sync, push notifications, file uploads, or additional staff roles must ship in the first release, or if required APIs/contracts are not ready.

### Completion gates

- Do not mark a mobile workflow complete because a screen renders; it is complete only when it uses authorized server data, handles loading/empty/error/offline states, passes its tests, and has been verified on a target device.
- Do not claim offline-first, push notification, payment confirmation, or secure session persistence until the related mobile dependencies, implementation, and integration tests exist.
- Update this section and `MOBILE_APP_DEVELOPMENT_TASKLIST.md` after each phase with test output, known gaps, and the next owner.

---

## 👤 PART 1: Role-Based Progress & Task Lists (01 to 09)

---

### 🔹 Role 01: Super Admin — Detailed Specification & Tasks
**Scope:** Platform Level — Oversees every tenant (institution) running on TMS.  
**Specification Reference:** `documents/01_Super_Admin.pdf`

- [x] **Task 1.1: Multi-Tenant Provisioning & Onboarding Wizard**
  - [x] Sub-task 1.1.1: Provision unique `tenant_id` and isolated PostgreSQL schema upon tenant creation.
  - [x] Sub-task 1.1.2: Enforce mandatory Tenant Name, PAN/VAT Number, and Primary Contact Email.
  - [x] Sub-task 1.1.3: Enforce strict uniqueness validation on PAN/VAT numbers across all tenants (reject duplicate PAN/VAT with HTTP 400).
  - [x] Sub-task 1.1.4: Implement tenant go-live onboarding checklist tracking (first branch, tenant admin login, fee policy setup, first student).
  - **Verification:** Run `npm run test` in `services/api` checking `POST /api/v1/onboarding/tenants`. Verify database constraint `tenant_pan_vat_key` throws duplicate error.

- [x] **Task 1.2: Cross-Tenant Support & Audit Login**
  - [x] Sub-task 1.2.1: Create audited support login mechanism allowing Super Admin to inspect specific tenant data.
  - [x] Sub-task 1.2.2: Render persistent top warning banner in Web UI during support session (`"Support Session — Acting inside [Tenant Name]"`).
  - [x] Sub-task 1.2.3: Write immutable support audit log entry capturing actor (Super Admin ID), target tenant, timestamp, and accessed resource.
  - [x] Sub-task 1.2.4: Expose support session logs to Tenant Admins in their institution's audit history.
  - **Verification:** Log in as Super Admin, initiate support session for tenant, check `apps/web/src/components/patterns/DashboardShell.tsx` for persistent warning banner, and query `GET /api/v1/users/audit-logs`.

- [ ] **Task 1.3: Platform Policy Defaults & Seed Management**
  - [x] Sub-task 1.3.1: Seed global defaults for new tenants (geo-grace period: 15 min, petty cash cap: NPR 50,000, booking notice: 24 hrs).
  - [ ] Sub-task 1.3.2: Expose UI panel for Super Admin to modify global platform default seed values.
  - [ ] Sub-task 1.3.3: Provide automated policy inheritance mechanism for newly onboarded branches.
  - **Verification:** Create a new tenant via API and verify default configuration rows populated in `tenant_settings` table.

- [ ] **Task 1.4: Platform Usage Billing & Subscription Management**
  - [ ] Sub-task 1.4.1: Track active branch/student count per tenant for platform usage billing.
  - [ ] Sub-task 1.4.2: Generate monthly platform subscription invoices for institution owners.
  - [ ] Sub-task 1.4.3: Implement tenant suspension toggle for overdue platform usage accounts.
  - **Verification:** Execute `services/api/src/routes/onboarding.ts` subscription calculation test suite.

- [x] **Task 1.5: Cross-Tenant Data Isolation & Platform Health Monitoring**
  - [x] Sub-task 1.5.1: Verify row-level isolation where tenant queries strictly include `WHERE tenant_id = req.tenantId`.
  - [x] Sub-task 1.5.2: Build Super Admin platform health dashboard showing total active tenants, branches, system uptime, and API error rates.
  - [x] Sub-task 1.5.3: Ensure Super Admin cannot view sensitive tenant business records (student fees, grade details) outside logged support sessions.
  - **Verification:** Attempt cross-tenant API query without support token and verify HTTP 403 Forbidden response.

---

### 🔹 Role 02: Tenant Admin — Detailed Specification & Tasks
**Scope:** Institution Level — One institution, one PAN/VAT, all branches under it.  
**Specification Reference:** `documents/02_Tenant_Admin.pdf`

- [x] **Task 2.1: Institution & Branch Setup Governance**
  - [x] Sub-task 2.1.1: Create branches with custom geofences, resource lists, and policy defaults.
  - [x] Sub-task 2.1.2: Assign staff accounts strictly to defined RBAC roles (Branch Admin, Teacher, Accountant, Receptionist, Janitor).
  - [x] Sub-task 2.1.3: Block staff creation attempts with zero role or zero branch assignment.
  - **Verification:** Verify `apps/web/src/pages/TenantBranches.tsx` blocks branch creation without geofence coordinates.

- [x] **Task 2.2: Fee & Refund Policy Configuration**
  - [x] Sub-task 2.2.1: Define fee structures (monthly recurring, one-time, installment, term-based).
  - [x] Sub-task 2.2.2: Configure tenant-wide discount types (flat amount, percentage, sibling discount, scholarship).
  - [x] Sub-task 2.2.3: Configure refund policy (pro-rata, fixed deduction, no-refund) and lock historical policy snapshot per settled invoice.
  - [x] Sub-task 2.2.4: Embed institution PAN/VAT number on all generated invoice PDFs and web views.
  - **Verification:** Inspect generated PDF invoice from `services/api/src/routes/finances.ts` for PAN/VAT header display.

- [x] **Task 2.3: Tenant-Wide Operational Thresholds**
  - [x] Sub-task 2.3.1: Configure branch geo-attendance grace period minutes.
  - [x] Sub-task 2.3.2: Set monthly petty cash limit per branch.
  - [x] Sub-task 2.3.3: Define leave approval workflow and minimum appointment booking notice hours.
  - [x] Sub-task 2.3.4: Set escalation threshold days for unresolved classroom maintenance tasks.
  - **Verification:** Update threshold settings in `apps/web/src/pages/TenantAdminDashboard.tsx` and check `services/api/prisma/schema.prisma` values.

- [ ] **Task 2.4: Financial Reporting & AI Forecasting**
  - [x] Sub-task 2.4.1: Render monthly consolidated and per-branch Profit & Loss (P&L) statements.
  - [ ] Sub-task 2.4.2: Implement double-entry ledger CSV/PDF export for external accounting.
  - [ ] Sub-task 2.4.3: Integrate AI-driven fee revenue estimation vs actuals comparison.
  - [x] Sub-task 2.4.4: Trigger automated expense anomaly alerts on salary or expenditure spikes.
  - **Verification:** Execute `GET /api/v1/finances/pnl` and check mathematical balance of income vs expense totals.

- [x] **Task 2.5: HR Oversight & Staff Exit Clearance**
  - [x] Sub-task 2.5.1: Validate staff performance score component weights sum to exactly 100% before saving.
  - [x] Sub-task 2.5.2: Finalize staff exit clearance checklist and auto-calculate pro-rated final settlement.
  - [x] Sub-task 2.5.3: Handle Level 2 final approval for staff Long Sick Leave requests.
  - [x] Sub-task 2.5.4: Surface 30-day document/contract expiry notifications for all institution staff.
  - **Verification:** Attempt submitting HR score weightings totaling 95% in `services/api/src/routes/hr.ts` and verify HTTP 400 validation error.

- [x] **Task 2.6: Master Certificates, Institution Calendar & Social Media Governance**
  - [x] Sub-task 2.6.1: Build master certificate template editor locking field structure and branding layout.
  - [x] Sub-task 2.6.2: Publish institution-wide calendar events pushed read-only to all branch schedules.
  - [x] Sub-task 2.6.3: Review, approve, or reject social media post drafts submitted by Branch Admins.
  - **Verification:** Attempt editing a Tenant Admin calendar event as a Branch Admin and verify button disabled with tooltip.

---

### 🔹 Role 03: Branch Admin — Detailed Specification & Tasks
**Scope:** Branch / Center Level — Day-to-day running of one physical center.  
**Specification Reference:** `documents/03_Branch_Admin.pdf`

- [x] **Task 3.1: Staff Leave & Approval Workflow**
  - [x] Sub-task 3.1.1: Process Level 1 final approval/rejection for casual leave and early-out requests (mandating rejection reason).
  - [x] Sub-task 3.1.2: Process Level 1 approval for Long Sick Leave and forward to Tenant Admin.
  - [x] Sub-task 3.1.3: Review Level 1 petty cash requests raised by branch Accountant.
  - **Verification:** Test submitting empty rejection message on leave request in `apps/web/src/pages/BranchAdminDashboard.tsx` and verify form block.

- [x] **Task 3.2: Student Emergency Departures & Dues Overrides**
  - [x] Sub-task 3.2.1: Log student emergency departure (time, reason, collector details) with instant parent push notification.
  - [x] Sub-task 3.2.2: Grant temporary scoped access override (e.g., 1-day exam access) for fee-blocked students with mandatory logged reason.
  - [x] Sub-task 3.2.3: Append administrative remarks to student records with configurable parent visibility.
  - **Verification:** Trigger fee override for blocked student in `services/api/src/routes/users.ts` and check `fee_status_history` audit trail.

- [x] **Task 3.3: Personalized (1:1 & Small Group) Classes**
  - [x] Sub-task 3.3.1: Configure personalized 1:1 or small-group sessions with custom teacher, schedule, and session pricing.
  - [x] Sub-task 3.3.2: Maintain separate attendance and homework streams for personalized classes.
  - **Verification:** Navigate to `apps/web/src/pages/AcademicCourses.tsx` and verify personalized class creation flow.

- [x] **Task 3.4: Resource Log & Maintenance Task Management**
  - [x] Sub-task 3.4.1: Auto-assign maintenance task to Janitor/Cleaner when classroom resource log is marked "Action Required".
  - [x] Sub-task 3.4.2: Reassign maintenance tasks to alternate staff when primary cleaner is unavailable.
  - [x] Sub-task 3.4.3: Highlight escalated maintenance tasks exceeding threshold days on Branch Admin dashboard.
  - **Verification:** Change resource log status to "Action Required" in `services/api/src/routes/resources.ts` and check task creation in `maintenance_tasks` table.

- [x] **Task 3.5: Branch Calendar, Certificate Issuance & Social Media Drafting**
  - [x] Sub-task 3.5.1: Layer branch-specific calendar events alongside read-only tenant events.
  - [x] Sub-task 3.5.2: Issue completion/achievement certificates applying branch details onto master template.
  - [x] Sub-task 3.5.3: Draft social media posts and submit to Tenant Admin approval queue.
  - **Verification:** Draft social post in `apps/web/src/pages/StaffReceptionPage.tsx` and verify status changes to `PENDING_APPROVAL`.

---

### 🔹 Role 04: Teacher — Detailed Specification & Tasks
**Scope:** Class Level — Assigned classes, sessions, and students (Mobile-First).  
**Specification Reference:** `documents/04_Teacher.pdf`

- [x] **Task 4.1: Geo-Attendance & Auto-Departure System**
  - [x] Sub-task 4.1.1: Capture GPS location on "Mark IN" and validate against assigned branch geofence radius (20m default).
  - [x] Sub-task 4.1.2: Log "Unscheduled Presence" when inside radius with no scheduled class.
  - [x] Sub-task 4.1.3: Block "Mark IN" outright when outside geofence radius.
  - [x] Sub-task 4.1.4: Handle grace period for brief movements outside geofence.
  - [x] Sub-task 4.1.5: Trigger auto-departure alert to Branch Admin if outside radius beyond grace period without Mark OUT.
  - [x] Sub-task 4.1.6: Log raw history of all IN, OUT, AUTO-OUT, and RE-IN stamps.
  - **Verification:** Execute Flutter test in `apps/mobile/test/unit_test.dart` simulating GPS coordinates inside vs outside branch radius.

- [x] **Task 4.2: Mandatory Daily Class Update**
  - [x] Sub-task 4.2.1: Mark session as `"Present — Update Pending"` upon Mark OUT.
  - [x] Sub-task 4.2.2: Require daily class update submission (topics covered, issues, homework) to finalize session confirmation.
  - [x] Sub-task 4.2.3: Send automated push reminder to teacher for pending updates at 5:00 PM.
  - **Verification:** Mark OUT in `apps/mobile/lib/features/teacher/screens/teacher_home_screen.dart` and verify update status state.

- [x] **Task 4.3: Roster Attendance & Blocked Student Prevention**
  - [x] Sub-task 4.3.1: Render class roster for marking student present/absent.
  - [x] Sub-task 4.3.2: Disable attendance radio button for fee-blocked students.
  - [x] Sub-task 4.3.3: Pre-fill "Absent (Excused)" for students with approved advance leave.
  - **Verification:** Open roster in `apps/web/src/pages/TeacherPortal.tsx` for a blocked student and verify checkbox disabled.

- [x] **Task 4.4: Homework & Exam Score Entry**
  - [x] Sub-task 4.4.1: Create and distribute homework assignments to class roster.
  - [x] Sub-task 4.4.2: Record exam and test scores feeding directly into student analytics and class averages.
  - **Verification:** Post exam marks via `POST /api/v1/grades` and verify real-time class average updates.

- [x] **Task 4.5: Teacher Leave, Scores & Multi-Branch Support**
  - [x] Sub-task 4.5.1: Request casual/sick leave and monitor personal leave balance.
  - [x] Sub-task 4.5.2: Display private teacher performance metrics (attendance rate, update compliance, feedback).
  - [x] Sub-task 4.5.3: Dynamically validate geofence against multi-branch schedules based on active time slot.
  - **Verification:** Check `apps/mobile/lib/features/teacher/screens/teacher_leave_screen.dart` leave balance display.

---

### 🔹 Role 05: Accountant — Detailed Specification & Tasks
**Scope:** Finance — Billing records and petty cash for the branch/institution.  
**Specification Reference:** `documents/05_Accountant.pdf`

- [x] **Task 5.1: Petty Cash Request Workflow**
  - [x] Sub-task 5.1.1: Submit petty cash request with mandatory remaining monthly cap validation.
  - [x] Sub-task 5.1.2: Reject requests exceeding remaining monthly budget client-side and server-side.
  - [x] Sub-task 5.1.3: Disable self-approval actions for Accountant's own petty cash requests.
  - [x] Sub-task 5.1.4: Support editing and resubmission of "Revision Requested" applications.
  - **Verification:** Submit petty cash request exceeding monthly limit in `services/api/src/routes/finances.ts` and verify HTTP 400 rejection.

- [ ] **Task 5.2: Expenditure Receipt Verification & Closure**
  - [x] Sub-task 5.2.1: Transition approved requests to "Awaiting Receipt" status upon fund release.
  - [ ] Sub-task 5.2.2: Upload proof of spend receipt document against petty cash entry.
  - [ ] Sub-task 5.2.3: Require Branch Admin or Tenant Admin manual verification to close petty cash record.
  - **Verification:** Upload receipt image to `POST /api/v1/finances/petty-cash/:id/receipt` and verify status `AWAITING_VERIFICATION`.

- [x] **Task 5.3: Billing, Invoicing & Manual Payment Confirmations**
  - [x] Sub-task 5.3.1: Generate itemized billing records per student per billing cycle.
  - [x] Sub-task 5.3.2: Apply discounts (flat, %, sibling, scholarship) within Tenant Admin policy boundaries.
  - [x] Sub-task 5.3.3: Provide manual "Confirm Payment Received" override with mandatory bank reference number for failed Nepal Pay webhooks.
  - **Verification:** Execute payment override in `apps/web/src/pages/StaffFinancePage.tsx` with transaction reference and verify audit log.

- [ ] **Task 5.4: Double-Entry Ledger & Financial Reporting**
  - [ ] Sub-task 5.4.1: Render double-entry ledger view of branch transactions.
  - [ ] Sub-task 5.4.2: Export double-entry transaction history in CSV and PDF formats.
  - **Verification:** Call `GET /api/v1/finances/ledger/export?format=csv` and verify CSV column structure.

---

### 🔹 Role 06: Receptionist — Detailed Specification & Tasks
**Scope:** Front Desk — Walk-in visitors, check-ins, and front desk contact point.  
**Specification Reference:** `documents/06_Receptionist.pdf`

- [x] **Task 6.1: Student Walk-In Check-In**
  - [x] Sub-task 6.1.1: Search student directory and check in walk-in arrivals on daily branch roster.
  - [x] Sub-task 6.1.2: Maintain separate visitor/check-in log independent of classroom attendance.
  - **Verification:** Perform student lookup in `apps/web/src/pages/StaffReceptionPage.tsx` and complete check-in.

- [x] **Task 6.2: Visitor Appointments & Status Lookup**
  - [x] Sub-task 6.2.1: View daily appointment schedule (visitor name, host teacher/admin, time slot, status).
  - [x] Sub-task 6.2.2: Enforce read-only restriction (blocking Receptionist from editing or approving appointments).
  - **Verification:** Confirm edit/delete buttons are absent from appointment list in `StaffReceptionPage.tsx`.

- [x] **Task 6.3: Data Boundary & Privacy Enforcement**
  - [x] Sub-task 6.3.1: Restrict Receptionist access from viewing student fee amounts, invoices, or payment histories.
  - [x] Sub-task 6.3.2: Restrict Receptionist access from viewing staff HR records, salaries, or performance scores.
  - [x] Sub-task 6.3.3: Restrict Receptionist access from viewing student test scores or academic grades.
  - **Verification:** Attempt calling `/api/v1/finances` or `/api/v1/hr` with Receptionist JWT token and verify HTTP 403 response.

---

### 🔹 Role 07: Janitor / Cleaner — Detailed Specification & Tasks
**Scope:** Maintenance — Classroom and facility upkeep, resource log task execution.  
**Specification Reference:** `documents/07_Janitor_Cleaner.pdf`

- [x] **Task 7.1: Maintenance Task Routing & List View**
  - [x] Sub-task 7.1.1: Auto-assign maintenance tasks routed from classroom resource log entries marked "Action Required".
  - [x] Sub-task 7.1.2: Display simplified mobile/web task list (classroom location, issue description, due status).
  - **Verification:** Open `apps/web/src/pages/StaffTasksPage.tsx` as Janitor user and check assigned task list.

- [x] **Task 7.2: One-Tap Task Completion & Escalation**
  - [x] Sub-task 7.2.1: Execute "Mark Done" action auto-recording completion timestamp and staff identity.
  - [x] Sub-task 7.2.2: Highlight overdue indicator for tasks exceeding escalation threshold.
  - [x] Sub-task 7.2.3: Restrict Janitor account from accessing student, fee, or staff HR modules.
  - **Verification:** Tap "Mark Done" on task in `StaffTasksPage.tsx` and verify task status changes to `COMPLETED`.

---

### 🔹 Role 08: Student — Detailed Specification & Tasks
**Scope:** Student Mobile App & Portal — Enrolled courses, academics, and digital ID.  
**Specification Reference:** `documents/08_Student.pdf`

- [x] **Task 8.1: Unified Timetable & Homework Tracker**
  - [x] Sub-task 8.1.1: Render merged daily/weekly timetable across regular, music, and personalized classes.
  - [x] Sub-task 8.1.2: Display pending homework assignments with subject badges and due dates.
  - **Verification:** Open `apps/mobile/lib/features/student/screens/student_id_screen.dart` and timetable tabs.

- [x] **Task 8.2: Real-time Grade Analytics & Performance Insights**
  - [x] Sub-task 8.2.1: Display newly entered test scores immediately upon teacher submission.
  - [x] Sub-task 8.2.2: Render performance trend lines (improving/declining) and class average comparisons.
  - [x] Sub-task 8.2.3: Show auto-derived strong and weak subject highlights.
  - **Verification:** Check grade analytics graphs in `apps/web/src/pages/AcademicGrades.tsx`.

- [x] **Task 8.3: Digital Student ID & Attendance History**
  - [x] Sub-task 8.3.1: Generate digital student ID card with photo, ID number, branch name, and grade.
  - [x] Sub-task 8.3.2: Display session-by-session attendance history (Present, Absent, Excused).
  - [x] Sub-task 8.3.3: Surface prominent "Blocked" banner detailing outstanding dues when fee-blocked.
  - **Verification:** View student digital ID in Flutter app `apps/mobile/lib/features/student/screens/student_id_screen.dart`.

- [x] **Task 8.4: Nepal Pay Billing & Certificate Downloads**
  - [x] Sub-task 8.4.1: Render payment calendar with color-coded due dates (upcoming, due, overdue).
  - [x] Sub-task 8.4.2: Generate dynamic Nepal Pay QR code for current invoice payment.
  - [x] Sub-task 8.4.3: Provide lifetime download access for issued PDF certificates.
  - **Verification:** Click Nepal Pay QR modal in `apps/web/src/pages/ParentStudentPortal.tsx` and verify QR payload.

---

### 🔹 Role 09: Parent / Guardian — Detailed Specification & Tasks
**Scope:** Parent Portal — Linked children, supervisory view, leave, and appointments.  
**Specification Reference:** `documents/09_Parent_Guardian.pdf`

- [x] **Task 9.1: Multi-Child Switcher & Scoped Dashboard**
  - [x] Sub-task 9.1.1: Render horizontal child switcher for parents with multiple enrolled children.
  - [x] Sub-task 9.1.2: Strictly isolate child data (timetable, attendance, invoices) per selected child tab.
  - **Verification:** Switch between Child A and Child B in `apps/mobile/lib/features/parent/screens/parent_attendance_screen.dart` and verify state update.

- [x] **Task 9.2: Teacher Messaging (Privacy-Scoped)**
  - [x] Sub-task 9.2.1: Restrict parent message target list strictly to teachers assigned to their child's classes.
  - [x] Sub-task 9.2.2: Maintain separate conversation threads per child when a teacher teaches multiple children of the same parent.
  - **Verification:** Open conversation view in `services/api/src/routes/communication.ts` and verify recipient filter.

- [x] **Task 9.3: Appointment Booking & Negotiation**
  - [x] Sub-task 9.3.1: Enforce minimum 24-hour advance notice check on appointment bookings.
  - [x] Sub-task 9.3.2: Support alternative time slot negotiation between parent and teacher/admin.
  - [x] Sub-task 9.3.3: Send SMS + Push notifications upon appointment status updates.
  - **Verification:** Attempt booking appointment 12 hours in advance in `services/api/src/routes/appointments.ts` and check HTTP 400 rejection.

- [x] **Task 9.4: Advance Leave Applications & Emergency Alerts**
  - [x] Sub-task 9.4.1: Submit advance student leave application auto-marking attendance as "Absent (Excused)" upon approval.
  - [x] Sub-task 9.4.2: Receive high-priority push + SMS alert when Branch Admin logs student emergency departure.
  - [x] Sub-task 9.4.3: View itemized invoices, Nepal Pay QR codes, and certificate downloads per child.
  - **Verification:** Submit parent leave request in `services/api/src/routes/leaves.ts` and verify auto-marking in attendance roster.

---

## 🚀 PART 2: Phased Project Master Task List

---

### 🟢 Phase 1: Core Foundation (100% Completed)
*Timeline: July 6 - July 20, 2026*

- [x] **Task P1.1: Monorepo Architecture & Backend Setup**
  - [x] Sub-task P1.1.1: Initialize monorepo structure (`apps/web`, `apps/mobile`, `services/api`, `packages/types`).
  - [x] Sub-task P1.1.2: Set up PostgreSQL database with Prisma ORM and multi-tenant schema isolation.
  - [x] Sub-task P1.1.3: Configure CI/CD pipelines and deployment targets.
  - **Verification:** Run `npm run build` across all workspaces in monorepo root.

- [x] **Task P1.2: Authentication & RBAC Engine**
  - [x] Sub-task P1.2.1: Build JWT authentication with role-aware login for all 9 user roles.
  - [x] Sub-task P1.2.2: Implement 2FA via SMS OTP for admin roles.
  - [x] Sub-task P1.2.3: Enforce account lockout after 5 failed login attempts.
  - **Verification:** Execute `services/api/src/routes/auth.ts` test suite.

- [x] **Task P1.3: Core Web & Mobile Portals**
  - [x] Sub-task P1.3.1: Build split-screen Web login and dashboard shells for 9 roles.
  - [x] Sub-task P1.3.2: Scaffold Flutter mobile app with bottom tab navigation and theme tokens.
  - **Verification:** Run `npm run dev` in `apps/web` and `flutter run` in `apps/mobile`.

---

### 🟡 Phase 2: Academic & Operations Engine (70% Active)
*Timeline: July 21 - August 4, 2026*

- [x] **Task P2.1: Homework & Grading Module**
  - [x] Sub-task P2.1.1: Build homework creation, distribution, and submission tracking APIs (`services/api/src/routes/homework.ts`).
  - [x] Sub-task P2.1.2: Implement exam/assignment score entry UI with subject averages (`apps/web/src/pages/AcademicGrades.tsx`).
  - **Verification:** Post homework assignment and verify instant delivery to student portal.

- [x] **Task P2.2: Teacher Daily Verification Gate**
  - [x] Sub-task P2.2.1: Enforce logout block for teachers with unsubmitted daily class updates.
  - [x] Sub-task P2.2.2: Send automated 5:00 PM update reminder notifications.
  - **Verification:** Attempt logging out in Flutter app with pending update and verify modal block.

- [ ] **Task P2.3: Real-Time Communication Hub**
  - [x] Sub-task P2.3.1: Build REST endpoints for threaded messaging (`services/api/src/routes/communication.ts`).
  - [ ] Sub-task P2.3.2: Upgrade messaging to real-time WebSockets / Socket.io engine.
  - [ ] Sub-task P2.3.3: Implement message reactions, quote replies, and file attachment sharing.
  - **Verification:** Send test message between parent and teacher and verify WebSocket payload delivery.

- [x] **Task P2.4: Certificates & Social Media Draft Queue**
  - [x] Sub-task P2.4.1: Implement template-based PDF certificate generator (`services/api/src/routes/certificates.ts`).
  - [x] Sub-task P2.4.2: Build social media post drafting and Tenant Admin approval queue (`services/api/src/routes/social.ts`).
  - **Verification:** Download generated PDF certificate and verify layout formatting.

---

### ⏳ Phase 3: ERP, Payroll & Advanced Financial Engine (20% Planned)
*Timeline: August 5 - August 19, 2026*

- [ ] **Task P3.1: Multi-Level Petty Cash & Double-Entry Accounting**
  - [x] Sub-task P3.1.1: Build Level 1 (Branch Admin) and Level 2 (Tenant Admin) approval logic (`services/api/src/routes/finances.ts`).
  - [ ] Sub-task P3.1.2: Build double-entry general ledger engine with automated debit/credit balancing.
  - [ ] Sub-task P3.1.3: Generate double-entry financial CSV/PDF exports for audit compliance.
  - **Verification:** Execute financial transaction and verify debit/credit equality in general ledger.

- [ ] **Task P3.2: Automated Payroll Processing**
  - [ ] Sub-task P3.2.1: Auto-calculate staff monthly salaries based on geo-attendance, approved leaves, and deductions.
  - [ ] Sub-task P3.2.2: Generate itemized payslip PDFs with Nepal tax/SSF deduction breakdowns.
  - **Verification:** Run monthly payroll cron `POST /api/v1/cron/payroll` and check payslip calculation accuracy.

- [ ] **Task P3.3: Pro-Rata Refund & Course Pricing Engine**
  - [ ] Sub-task P3.3.1: Implement pro-rata refund calculator snapshotting active tenant policy upon student withdrawal.
  - [ ] Sub-task P3.3.2: Configure short-term, long-term, and specialized music course billing engines.
  - **Verification:** Process student withdrawal on Day 10 of 30-day course and verify 66.6% refund calculation.

---

### ⏳ Phase 4: Enterprise Cloud Scaling, AI & Automation (10% Planned)
*Timeline: August 20 - September 3, 2026*

- [ ] **Task P4.1: AI Financial Estimation & Anomaly Alerts**
  - [ ] Sub-task P4.1.1: Implement revenue forecasting model predicting fee collections vs actuals.
  - [x] Sub-task P4.1.2: Trigger automated anomaly alerts on unexpected branch expenditure spikes.
  - **Verification:** `npm run test:financial-intelligence` verifies deterministic per-branch spike detection, authenticated tenant scope, cron dispatch through the existing push-notification abstraction, and fail-open delivery. Slack/email delivery is not configured in this repository.

- [ ] **Task P4.2: Automated Social Media Publishing**
  - [ ] Sub-task P4.2.1: Connect Meta (Facebook/Instagram), TikTok, and LinkedIn API webhooks.
  - [ ] Sub-task P4.2.2: Auto-publish approved social posts on configured schedule times.
  - **Verification:** Schedule post and verify automated broadcast to connected Meta test page.

---

## 🔍 Verification Matrix Summary

| Role / Phase | Primary API Route / File | Key Test Command | Expected Success Outcome |
|---|---|---|---|
| **Role 01: Super Admin** | `services/api/src/routes/onboarding.ts` | `npm test -- onboarding.test.ts` | Duplicate PAN/VAT returns HTTP 400 error |
| **Role 02: Tenant Admin** | `services/api/src/routes/hr.ts` | `npm test -- hr.test.ts` | Weights not summing to 100% rejected |
| **Role 03: Branch Admin** | `services/api/src/routes/users.ts` | `npm test -- users.test.ts` | Fee override logged with mandatory reason |
| **Role 04: Teacher** | `apps/mobile/test/unit_test.dart` | `flutter test` | Out-of-radius Mark IN blocked outright |
| **Role 05: Accountant** | `services/api/src/routes/finances.ts` | `npm test -- finances.test.ts` | Over-budget petty cash request blocked |
| **Role 06: Receptionist** | `apps/web/src/pages/StaffReceptionPage.tsx` | `npm run test:ui` | Fee/HR navigation hidden and blocked |
| **Role 07: Janitor** | `apps/web/src/pages/StaffTasksPage.tsx` | `npm run test:ui` | Mark Done records timestamp & user ID |
| **Role 08: Student** | `apps/web/src/pages/AcademicGrades.tsx` | `npm run test:ui` | Digital ID rendered with QR payload |
| **Role 09: Parent** | `services/api/src/routes/appointments.ts` | `npm test -- appointments.test.ts` | <24h appointment booking rejected |
| **Phase 1: Core** | `services/api/src/server.ts` | `npm run build` | Clean compilation across monorepo |
| **Phase 2: Academic** | `services/api/src/routes/homework.ts` | `npm test -- homework.test.ts` | Homework distributed to active roster |
| **Phase 3: ERP** | `services/api/src/routes/finances.ts` | `npm test -- ledger.test.ts` | General ledger debits equal credits |
| **Phase 4: AI & Scaling**| `services/api/src/routes/cron.ts` | `npm test -- cron.test.ts` | Automated cron executions succeed |

