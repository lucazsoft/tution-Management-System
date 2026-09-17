# Teacher Mobile Panel Web-Parity Report

Date: 2026-09-14
Scope: `apps/web/src/pages/TeacherPortal.tsx`, `apps/web/src/features/teacher/teacherPortalTypes.ts`, `apps/web/src/services/api.ts`, `apps/mobile/lib/features/teacher`

## Executive Mark

Current teacher mobile panel: **6.4 / 10**

Reason: the mobile panel now has the right 4-tab direction and uses the live workspace endpoint, but it only exposes a thin slice of the mature web teacher portal. The backend contract is already rich enough; the missing work is mobile DTO coverage, workflow screens, and a managed information architecture.

Target after this plan: **8.8 / 10**

## Web Teacher Panel Source Of Truth

The web teacher portal has these views:

- Academic Calendar
- Teacher Dashboard
- My Timetable
- Geo Attendance
- Class Attendance
- Syllabus
- Daily Update Log
- Homework
- Results
- Employment & Attendance
- Leave Requests
- Salary Slips
- Security

All core data starts from `GET /api/teacher/workspace`. The web app then uses write endpoints for attendance, syllabus, topic logs, homework, results, and leave.

## Mobile Navigation Decision

Use **4 bottom tabs**:

- **Today**: dashboard cockpit, Nepal-time clock card, pending updates, today's timetable, quick actions.
- **Attendance**: teacher clock history, clock in/out, and student class attendance.
- **Classes**: assigned classes, rosters, timetable, class-specific homework/syllabus/results entry points.
- **More**: profile, leave, salary slips, calendar, security, lower-frequency tools.

Do not mirror the web sidebar as 12 mobile tabs. The web features should exist, but grouped into these four mobile buckets.

## Current Mobile State

Already present:

- `GET /api/teacher/workspace`
- Teacher home screen
- 4-tab mobile shell inside teacher home
- Timetable screen
- Leave screen
- Geo attendance screen
- Daily update dialog
- Basic class list
- Web cookie credential fix for Flutter web

Recently improved:

- Today dashboard has Nepal-time clock status.
- Clock action routes into backend-backed geo attendance.
- Dashboard stats parse `requiredDays`, `totalSessions`, `updateCompliance`, and `assignedClasses`.
- Quick actions added.

## Key Gaps

### 1. DTO Coverage

Mobile currently parses only a subset of the web `TeacherDashboard`.

Missing or incomplete:

- `classes[].students` as real roster objects, not just count
- `classes[].attendance`
- `classes[].syllabi`
- `classes[].homework`
- `results`
- `resultDefinitions`
- `profile.performance`
- `profile.salaryStructure`
- `payrolls`
- `teacher.email`, `joiningDate`, `contractType`
- `stamps[].gpsAccuracy`

### 2. Student Class Attendance

Web has:

- class picker
- roster list
- present/absent marking
- fee-blocked students disabled for present
- submit to `POST /api/teacher/class/:classId/attendance`

Mobile still mainly shows teacher geo attendance.

### 3. Syllabus And Daily Topic Logs

Web has:

- create/update syllabus
- chapters
- topics
- topic progress logs
- daily progress status: `IN_PROGRESS`, `COMPLETED`, `LEFT`

Mobile only has a simple daily update dialog.

### 4. Homework

Web has:

- create homework for one or more classes
- title, description, deadline, optional file/content URL
- existing homework list per class

Mobile has no teacher homework workflow yet.

### 5. Results

Web has:

- admin-created result definitions
- marks entry per student
- individual result sheet attachment
- save draft
- publish now
- delete draft

Mobile has no teacher results workflow yet.

### 6. Personal Area

Web has:

- employment details
- performance summary
- attendance stamp history
- leave requests
- salary slips
- security/change password

Mobile More tab only has a starter list.

## API Contract To Port Into Mobile

Existing web client routes:

- `GET /api/teacher/workspace`
- `POST /api/attendance/in`
- `POST /api/attendance/out`
- `POST /api/teacher/session/:sessionId/update`
- `POST /api/teacher/class/:classId/attendance`
- `POST /api/teacher/syllabus`
- `PATCH /api/teacher/syllabus/:syllabusId`
- `POST /api/teacher/syllabus/:syllabusId/log`
- `POST /api/teacher/syllabus/:syllabusId/topic-log`
- `POST /api/teacher/syllabus/:syllabusId/topics`
- `PATCH /api/teacher/syllabus/:syllabusId/topics/:topicId`
- `DELETE /api/teacher/syllabus/:syllabusId/topics/:topicId`
- `POST /api/homework`
- `POST /api/teacher/results`
- `POST /api/teacher/results/share`
- `DELETE /api/teacher/results/:resultId`
- `POST /api/leaves/request`

## Implementation Plan

### Phase 1: Stabilize Today

Goal: make the dashboard feel complete and reliable.

- Remove duplicated pending-update block in `TeacherHomeScreen`.
- Convert pending update `ListTile` to a custom mobile-safe card.
- After returning from geo attendance, refresh teacher workspace automatically.
- Make dashboard clock action label switch between `Clock in` and `Clock out`.
- Add live status text: last stamp type and Nepal-time stamp.
- Add tests for dashboard stats and quick actions.

### Phase 2: Class Attendance

Goal: make Attendance tab useful for daily teaching.

- Add `TeacherStudentRef` DTO.
- Add `TeacherClassAttendanceRecord` DTO.
- Add repository method `saveClassAttendance`.
- Build class picker and roster marking UI.
- Support `PRESENT` and `ABSENT`.
- Disable `PRESENT` for fee-blocked students.
- Refresh workspace after save.

### Phase 3: Classes Hub

Goal: make Classes tab the teacher’s class workspace.

- Class cards with subject, branch, schedule, student count.
- Class detail screen.
- Roster section.
- Homework list section.
- Syllabus progress preview.
- Result entry point.

### Phase 4: Daily Updates And Syllabus

Goal: replace the small dialog with a real teaching-log workflow.

- Dedicated daily update screen.
- Topic/chapter progress status controls.
- Notes field.
- Today’s pending session list.
- Submit session update and topic log.

### Phase 5: Homework

Goal: port web homework workflow.

- Homework list by class.
- Create homework form.
- Class multi-select or class preselection.
- Title, description, deadline.
- Optional file/content URL support later.

### Phase 6: Results

Goal: port result drafts and publishing.

- Result definition picker.
- Student marks table/list.
- Validate score, full marks, pass marks.
- Save draft.
- Publish now.
- Show saved results.

### Phase 7: More

Goal: make lower-frequency tools complete but not noisy.

- Profile details.
- Leave request and history.
- Salary slip list/detail.
- Calendar link.
- Change password.

## Recommended Next Build Step

Start with **Phase 1 cleanup + refresh behavior**, then immediately build **Phase 2 class attendance**.

That gives teachers the two most important daily workflows:

- clock in/out
- mark student attendance

These are more valuable than adding salary/results first.

## Risks

- Flutter web location permission may fail on some browser/privacy settings; the geo screen must show clear recovery states.
- The current seed/migration issue around `CanteenWallet` should be fixed, even though teacher login currently works.
- Mobile DTO expansion must remain tolerant of missing fields because demo seed data can be partial.
- Result sheet upload on web currently uses small base64 preview data; mobile should not copy that blindly for production file uploads.

## Final Recommendation

Use the web teacher portal as the product specification, but make the Flutter app a mobile-first 4-tab experience. The teacher should be able to open the app and answer:

- Am I clocked in?
- What do I teach today?
- What attendance must I mark?
- What updates/homework/results are pending?
- What personal/admin items need attention?

That is the bar for a top-notch teacher panel.
