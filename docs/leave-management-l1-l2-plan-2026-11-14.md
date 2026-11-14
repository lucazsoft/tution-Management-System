# Leave Management (L1 / L2) — Current State & Plan

Date: 2026-11-14 · Branch inspected: `test/geolocation-attendance` (leave code is identical on `main`)

## 1. What the tenant admin sees today

| URL | What renders | Why |
|---|---|---|
| `/tenant/leave-management` | "Workspace — feature wiring will follow" placeholder | **No route exists.** Falls through to `/tenant/*` → `RoleWorkspacePlaceholder` (`apps/web/src/router/index.tsx:309`). The dashboard KPI card and the alert both link here (`apps/web/src/pages/TenantAdminDashboard.tsx:58`, `:194`). |
| `/tenant/leave-requests` | "Leave Requests (Level 2)" page (`TenantLeaveRequestsPage`, `apps/web/src/pages/TenantOperationsPages.tsx:558`) | Page exists, but it only lists `LONG_SICK` leaves that a Branch Admin has already approved at L1. Every other leave is hidden, so the page is almost always empty. |

The dashboard count and the L2 page also disagree. The KPI counts **every `PENDING` leave in the tenant** (`services/api/src/routes/tenant-admin.ts:31`), which includes students' and teachers' leaves still waiting at branch level. The L2 page shows only `LONG_SICK` + `APPROVED_LEVEL1`. So an admin can see "5 awaiting approval", click through, and find nothing they can act on.

## 2. How the workflow works today (backend)

`services/api/src/routes/leaves.ts`

- **Submit** `POST /api/leaves/request`: the type is one of `CASUAL | SICK | LONG_SICK | EARLY_OUT`. The request is checked for overlaps and past dates, and the tenant `leavePolicy` is snapshotted into `policySnapshot`. **Nothing in the snapshot is ever used.**
- **Decide** `POST /api/leaves/approve/:id`: this route has fixed, type-based routing:
  - `LONG_SICK`: Branch Admin L1 (`PENDING → APPROVED_LEVEL1`), then Tenant Admin L2 (`→ APPROVED_LEVEL2`).
  - Every other type: the Branch Admin decision is final (`PENDING → APPROVED_LEVEL2`). The Tenant Admin is explicitly *not* allowed to act.
- **Queue** `GET /api/leaves?level=L1|L2`: L2 is hard-filtered to `leaveType = LONG_SICK`.
- There is **no rule based on number of days.** A 15-day `CASUAL` leave is approved by the Branch Admin alone. A 1-day `LONG_SICK` needs two approvals.
- `Tenant.leavePolicy` (JSON) is stored and versioned through Control Center, but there is no UI to edit it and no code that reads it.
- The `approve_leave_l1` / `approve_leave_l2` permissions exist in `services/api/src/utils/roles.ts`. L2 checks `isTenantAdmin()` and ignores `approve_leave_l2`.

## 3. Bugs found along the way (independent of the new feature)

| # | Severity | Issue | Location |
|---|---|---|---|
| B1 | High | Dashboard links to a non-existent route (the screenshot). | `TenantAdminDashboard.tsx:58,194` |
| B2 | High | **`APPROVED_LEVEL1` is treated as "approved"** in payroll and teacher stats. A Long Sick leave approved only by the Branch Admin (and possibly rejected later at L2) already reduces absence or deductions. | `services/api/src/services/payroll-automation.ts:19`, `services/api/src/routes/teacher.ts:94,189` |
| B3 | Medium | The dashboard "pending leave" count doesn't match what the tenant admin can act on. | `tenant-admin.ts:31` |
| B4 | Medium | The teacher's `approvedLeaveDays` is a **count of leave rows**, not days (a 5-day leave counts as 1). | `teacher.ts:94,113` |
| B5 | Medium | The Branch Admin web quick-action approves or rejects with hard-coded remarks ("Rejected by Branch Admin.") and gives no real reason. | `BranchAdminWorkspace.tsx:1967` |
| B6 | Medium | **Student and parent leave requests have no web approval queue.** The branch web feed filters to Teacher leaves only (`branch-admin.ts:115`), and the old `LeaveRequestsView` is dead code (`BranchAdminWorkspace.tsx:1774`). Only the mobile branch app sees them via `?level=L1`. | — |
| B7 | Medium | **Stuck requests:** if a branch has no Branch Admin, `PENDING` leaves can never be decided. The Tenant Admin is blocked from acting on them. | `leaves.ts:259` |
| B8 | Low | The decision notification reads "Your request has been approved_level1." (raw enum). No notification goes to Tenant Admins when something is forwarded to L2. | `leaves.ts:277-292` |
| B9 | Low | The "start date in the past" check uses the server's local midnight, not Nepal time. | `leaves.ts:92-95` |
| B10 | Low (separate) | Emergency-out SMS goes to a hard-coded placeholder number `98510XXXXX`. | `leaves.ts:349` |

## 4. Proposed design

### 4.1 Policy-driven routing by days and type

Use the existing versioned `Tenant.leavePolicy` JSON. No new settings table is needed.

```jsonc
{
  "dayCounting": "WORKING_DAYS",          // or "CALENDAR_DAYS"; working days skip Saturdays + academic-calendar holidays
  "l2Rules": {
    "staffDaysOver": 3,                   // staff leave > 3 days → needs Tenant Admin L2
    "studentDaysOver": 7,                 // student leave > 7 days → needs L2 (null = never)
    "alwaysL2Types": ["LONG_SICK"]        // keeps today's behaviour
  },
  "l1Approver": { "staff": "BRANCH_ADMIN", "student": "BRANCH_ADMIN" },  // later: "CLASS_TEACHER"
  "escalateToTenantAfterHours": 48,       // fixes stuck queues (B7); null = off
  "minNoticeDays": { "CASUAL": 1 },       // optional
  "annualQuota": { "CASUAL": 12, "SICK": 12 } // optional, phase 3
}
```

**Routing is computed once at submission and stored on the row.** Changing the policy later does not reroute requests already in flight. This matches how petty-cash and other policies are versioned.

### 4.2 Schema changes (one migration)

```prisma
model Leave {
  // existing fields …
  days          Int            // computed per policy at submit
  requiredLevel Int  @default(1) // 1 or 2, computed at submit
  decisions     LeaveDecision[]
}

model LeaveDecision {           // audit trail, one row per action
  id        String   @id @default(uuid())
  leaveId   String
  leave     Leave    @relation(fields: [leaveId], references: [id])
  level     Int      // 1 | 2
  action    String   // APPROVE | REJECT | ESCALATE | CANCEL
  actorId   String
  remarks   String?
  createdAt DateTime @default(now())
}

enum LeaveStatus { PENDING APPROVED_LEVEL1 APPROVED_LEVEL2 REJECTED CANCELLED }  // + CANCELLED
```

Backfill: `days = inclusive calendar days`, `requiredLevel = leaveType == LONG_SICK ? 2 : 1`. This keeps existing data valid.

**Status meaning after the change:** `APPROVED_LEVEL2` means **final approved** (as today). `APPROVED_LEVEL1` only means "awaiting L2". Payroll, attendance and stats must count **only `APPROVED_LEVEL2`** (fixes B2).

### 4.3 API

| Endpoint | Change |
|---|---|
| `POST /leaves/request` | Compute `days` and `requiredLevel` from the policy. Return them so the UI can show "This needs 2 approvals". |
| `POST /leaves/approve/:id` | Generic state machine: L1 approve → `requiredLevel == 1 ? APPROVED_LEVEL2 : APPROVED_LEVEL1`. L2 is allowed only for `approve_leave_l2` holders on `APPROVED_LEVEL1`. Tenant Admin can also act at L1 when the request is escalated or the branch has no L1 approver. Write a `LeaveDecision` row inside a transaction. |
| `POST /leaves/:id/cancel` | New. The requester withdraws while `PENDING` or `APPROVED_LEVEL1`. |
| `GET /leaves` | Add filters `scope=mine-to-act|all`, `branchId`, `status`, `type`, `from`/`to`, `subject=staff|student`, plus pagination. Return `days`, `requiredLevel`, `decisions[]`. |
| `GET /leaves/summary` | New. Counts for the dashboard: `awaitingMe`, `pendingAtBranches`, `outToday`. |
| Cron | Escalate `PENDING` requests older than `escalateToTenantAfterHours` and notify the Tenant Admin. |

### 4.4 Tenant Admin UI: `/tenant/leave-management` (canonical)

- Redirect `/tenant/leave-requests → /tenant/leave-management` and update the nav, so old links keep working.
- **Tabs:**
  1. **Awaiting my approval:** L2 queue plus escalated L1 items. Shows the L1 approver's name and remarks, the day count, and the staff member's leave already taken this year. Approving requires no remarks; rejecting requires a reason.
  2. **All requests:** institution-wide table with filters (branch, staff/student, type, status, date range) and a timeline drawer showing each `LeaveDecision`.
  3. **Who's out:** today and this week, by branch (useful for substitutions).
  4. **Policy:** an editor for §4.1 (thresholds, day counting, escalation hours), saved through the existing Control Center versioning endpoint.
- The dashboard KPI uses `awaitingMe`, with `pendingAtBranches` as a secondary line (fixes B3).

### 4.5 Other surfaces

- **Branch Admin web:** add a real remarks field (B5), and show student and parent leaves too (B6). Mark the requests that will go on to the Tenant Admin ("Approve & forward to L2").
- **Teacher, student and parent submit forms:** show a live hint ("4 working days → needs Branch + Tenant approval"). Remove "Long sick leave — two approvals" from the label once the rule is policy-driven.
- **Mobile:** the branch app already calls `?level=L1`. Add the L2 queue to the tenant-admin mobile home (it only shows the count today).
- **Notifications:** use readable text ("approved by Branch Admin, awaiting final approval"), and notify Tenant Admins when a request is forwarded or escalated (B8).

## 5. Delivery plan

| Phase | Scope | Size |
|---|---|---|
| **P1: Make it live today** | Add a `/tenant/leave-management` route (render the existing L2 page) and redirect `leave-requests`. Make the dashboard count match the L2 queue. Fix B2 (count only `APPROVED_LEVEL2`) and B4 (days, not rows). Add a real remarks field for the Branch Admin (B5). Make notification text readable. | ~½ day |
| **P2: Day-based L1/L2** | Migration + backfill, policy schema + validation, routing at submit, generic approve state machine + `LeaveDecision` audit, Tenant Admin fallback/escalation (B7), cancel endpoint, policy editor UI, submit-form hint. API integration tests for every route (type × days × role). | ~2–3 days |
| **P3: Full management page** | All-requests table with filters, "Who's out", decision timeline, student leaves in the branch web queue (B6), mobile tenant L2 queue, optional annual quotas/balances. | ~2–3 days |

Tests to add (P2): routing matrix (`staff 3d CASUAL → L1 only`, `staff 4d CASUAL → L2`, `1d LONG_SICK → L2`, `student 8d → L2`); a Tenant Admin denied at L1 unless escalated; a Branch Admin denied at L2; a concurrent double-approve returns 409; payroll ignores `APPROVED_LEVEL1`; a policy change does not reroute in-flight requests.

## 6. Decisions (product owner, 2026-11-14)

1. **L2 threshold:** staff leave of **more than 3 working days** needs Tenant Admin approval. Long Sick always needs it.
2. **Day counting:** count the days the person would normally mark IN. These are the weekdays on the teacher's timetable (respecting each class's effective dates), excluding Saturdays and academic-calendar `HOLIDAY` events for the branch. Staff with no timetable count every day except Saturdays and holidays.
3. **Students:** the Branch Admin's decision is always final. Student leave never goes to L2 and does not escalate.
4. **Escalation:** a staff request with no branch decision after **48 hours** becomes actionable by the Tenant Admin, and that decision is final.
5. **Quotas/balances:** deferred until the rest is complete.

## 7. Implementation status (P1 + P2 built on `test/geolocation-attendance`, 2026-11-14)

- **Schema:** migration `20261114120000_leave_day_based_approvals` adds the `days`, `requiredLevel`, `subjectType`, `escalatesAt`, `escalationNotifiedAt` and `requestedById` columns, the `CANCELLED` status, and the `LeaveDecision` audit table. Existing rows are backfilled so they keep their original route.
- **Routing:** `services/api/src/services/leave-routing.ts`. Defaults can be overridden through `Tenant.leavePolicy` keys `staffL2DaysOver`, `alwaysL2Types` and `escalateAfterHours`. Routing is snapshotted on each request at submission.
- **API:** `GET /leaves` gained `scope`/filters and returns `days`, `requiredLevel`, `escalated`, `canAct` and `decisions[]`. Approval is now a generic state machine with the 48h escalation. Added `POST /leaves/:id/cancel` and the cron task `leave-escalation`, which sends a one-time alert to Tenant Admins. Escalation itself is time-based and does not depend on the cron running.
- **Bugs fixed:** B1–B9. B10 (hard-coded SMS number) is still open.
- **Web:** `/tenant/leave-management` is live; `/tenant/leave-requests` redirects to it. The branch `/branch/leave-requests` uses the same workspace, now including student leave and real remarks. The teacher portal shows the day count, the approval path, the rejection reason and a Cancel button.
- **Tests:** `npm run test:leaves` covers the routing matrix and the approve/escalate/cancel state machine.
- **Still open (P3):** the "Who's out" calendar view, a policy editor UI, the L2 queue in the mobile tenant-admin app, and quotas.
