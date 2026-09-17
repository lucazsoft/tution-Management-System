# Teacher Web Backend Readiness Report

Date: 2026-09-14  
Scope: Teacher role backend, existing React web teacher portal, and current Flutter role-based teacher mobile app.

## Executive Summary

The teacher backend is mostly ready for a production-style teacher web/PWA portal and is already being used by the React teacher portal. The strongest part of the system is the consolidated `GET /api/teacher/workspace` endpoint, which gives the teacher dashboard, timetable, assigned classes, rosters, attendance stamps, pending session updates, syllabi, homework, results, leave history, profile data, and payroll data from one authenticated teacher-scoped payload.

Current readiness:

- Backend teacher logic: 8 / 10
- Web teacher portal readiness: 8 / 10
- Flutter teacher mobile readiness: 6.8 / 10
- Cross-platform teacher role readiness: 7.3 / 10

The recommended direction is sound: keep Teacher, Parent, and Student as mobile-first roles, while admin and operations roles can remain PWA/web-first. For teacher specifically, the web portal is the best current source of truth. The mobile app should not copy the web sidebar exactly; it should port the web logic into a four-tab teacher app: Today, Attendance, Classes, More.

## Current Teacher Backend

Primary backend route:

- `GET /api/teacher/workspace`
- `GET /api/teacher/dashboard`, redirecting to workspace
- `POST /api/teacher/class/:classId/attendance`
- `POST /api/teacher/session/:sessionId/update`
- `POST /api/teacher/syllabus`
- `PATCH /api/teacher/syllabus/:syllabusId`
- `POST /api/teacher/syllabus/:syllabusId/log`
- `POST /api/teacher/syllabus/:syllabusId/topic-log`
- `POST /api/teacher/syllabus/:syllabusId/topics`
- `PATCH /api/teacher/syllabus/:syllabusId/topics/:topicId`
- `DELETE /api/teacher/syllabus/:syllabusId/topics/:topicId`
- `POST /api/teacher/results`
- `POST /api/teacher/results/share`
- `DELETE /api/teacher/results/:resultId`

Supporting teacher routes:

- `POST /api/attendance/in`
- `POST /api/attendance/out`
- `POST /api/leaves/request`
- `POST /api/homework`

The backend mounts the teacher router at `/api/teacher`, so the route structure is clean and already separated by role.

## Backend Logic Assessment

### Authentication And Scope

The teacher backend derives identity from `authMiddleware` and the authenticated session. The important security property is that teacher reads and writes are scoped by:

- authenticated user id
- tenant id
- class teacher assignment
- active class state
- course tenant ownership

This is the correct foundation for role-based access. A teacher should not send a teacher id from the client. The client may send class ids, session ids, syllabus ids, or result ids, but the backend re-checks ownership before mutating records.

Readiness: Strong.

Remaining QA needed:

- Teacher A cannot fetch or mutate Teacher B's class by changing `classId`.
- Teacher A cannot submit daily updates for Teacher B's `sessionId`.
- Teacher A cannot publish/delete result drafts owned by another teacher.
- Teacher A cannot update syllabus/topic ids outside their assigned class.

### Workspace Endpoint

`GET /api/teacher/workspace` is the strongest backend feature. It returns:

- teacher profile summary
- assigned branches
- attendance statistics
- current checked-in state
- recent attendance stamps
- today's sessions
- pending daily updates
- assigned classes
- class rosters
- class attendance history
- syllabi with chapters, topics, and logs
- homework
- result scores
- open result definitions
- leave requests
- payrolls

This makes the web and mobile clients much easier to build because most teacher screens can hydrate from one request.

Readiness: Strong.

Risk:

- The payload may grow large for teachers with many classes, students, syllabi, logs, homework, results, and payrolls. For MVP this is acceptable. Later, split into lazy endpoints such as `/api/teacher/classes/:id`, `/api/teacher/results`, `/api/teacher/payrolls`, and `/api/teacher/syllabus`.

### Teacher Geo Attendance

Teacher geo attendance is backed by `/api/attendance/in` and `/api/attendance/out`. The client sends branch id and GPS values, but the server remains authoritative. This is the correct design.

Current logic supports:

- assigned branch validation
- geofence validation
- GPS accuracy checks
- IN / OUT stamp creation
- checked-in state in workspace
- daily update restrictions around attendance flow

Readiness: Good.

Risk:

- Browser PWA location permission can fail more often than native mobile GPS. The web portal needs strong denied, timeout, inaccurate, and unsupported states.
- Mobile should surface branch radius, last stamp, and retry instructions clearly.

### Class Attendance

The backend class attendance endpoint is well designed for teacher workflows.

It enforces:

- only present-day attendance
- teacher must be clocked in before marking class attendance
- class must be assigned to the authenticated teacher
- records must belong to the selected class roster
- only `PRESENT` and `ABSENT` accepted from client
- approved student leave becomes `EXCUSED`
- fee-blocked students cannot be marked `PRESENT`
- existing records for the teacher/session are replaced atomically

Readiness: Strong.

Important mobile impact:

- Mobile must disable Present for fee-blocked students.
- Mobile must not allow past-date attendance unless backend later adds a permissioned correction workflow.
- After saving class attendance, mobile must refresh workspace.

### Syllabus And Topic Progress

The backend supports syllabus creation, syllabus update, chapter logging, topic logging, topic creation, topic rename, and topic delete with safety rules.

Good logic already exists:

- class ownership check
- class/subject uniqueness conflict
- chapter status updates
- topic status updates
- topic logs update chapter status
- topics with progress history cannot be deleted
- chapters with logs cannot be removed

Readiness: Good.

Risk:

- Mobile currently does not expose this workflow.
- The client must handle conflict responses clearly, especially duplicate syllabus and logged chapter/topic deletion.

### Daily Class Update

The backend supports mandatory daily update through `POST /api/teacher/session/:sessionId/update`.

It enforces:

- update content required
- session must belong to authenticated teacher
- session must belong to the tenant
- update can be submitted once
- successful update marks session `PRESENT_CONFIRMED`

Readiness: Good.

Gap:

- The functional spec mentions covered content, issues, observations, and homework notes. The current API accepts one `updateContent` string. This is workable for MVP but less structured than the spec.

Recommendation:

- Keep `updateContent` for now.
- Later migrate to structured fields: `covered`, `issues`, `observations`, `homeworkNotes`.

### Homework

Homework is handled outside the teacher router by `POST /api/homework`. The route validates that only the assigned teacher can create homework for the class. Workspace already returns recent homework per class.

Readiness: Good for MVP.

Risk:

- Current web upload behavior uses small base64-style preview data. For real production, move attachments to object storage and store file metadata/url.
- Mobile teacher app does not yet expose homework creation.

### Results

The backend supports a controlled results workflow:

- result definitions are created/opened by admin side
- teacher selects an open result definition assigned to their class
- subject/title must match the definition
- marks must belong to enrolled or grade-inherited students
- score must be numeric and within maximum
- pass marks must be valid
- individual result sheet URL is required for every student
- drafts are saved with `publishedAt = null`
- teacher can publish/share results
- teacher can delete only unpublished drafts owned by them

Readiness: Good.

Risks:

- Result sheet upload is not a full production file-upload pipeline yet.
- Mobile does not yet expose results.
- Requiring result sheets for every student may slow teachers unless the UX is very clear.

### Leave And Payroll

Teacher workspace embeds leave history and payroll rows. Leave creation goes through `/api/leaves/request`.

Readiness: Good for read/submission flows.

Mobile state:

- Leave screen exists.
- Payroll/salary slips are still web-only in practice.

## Web Teacher Portal Readiness

The React web teacher portal is already a mature implementation. It contains:

- Academic Calendar
- Dashboard
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

The web client already calls the teacher backend endpoints through `apps/web/src/services/api.ts`.

Readiness: Strong.

Strengths:

- Complete role surface.
- Uses one workspace endpoint for most screens.
- Teacher-scoped forms exist for attendance, syllabus, homework, results, leave, salary, and security.
- Good source of truth for mobile feature parity.

Concerns:

- Some UI text/rendering in checked files shows mojibake characters such as corrupted apostrophes/dashes. This should be cleaned before final release.
- Results and homework attachment strategy is not production-grade yet.
- Geo attendance in web/PWA depends on browser location support, so native mobile may be more reliable.

## Flutter Teacher Mobile Readiness

The mobile teacher app is now aligned with the right direction, but it is not yet feature-complete against the web portal.

Already implemented:

- Role-based teacher home screen
- Four-tab shell: Today, Attendance, Classes, More
- `GET /api/teacher/workspace`
- Teacher timetable screen
- Teacher leave screen
- Geo attendance screen
- Daily update dialog
- Class attendance save flow
- Basic roster parsing
- Fee-blocked Present disabled in UI
- Workspace refresh after geo attendance

Still incomplete:

- Syllabus tracker
- Topic progress logs
- Homework creation/list/detail
- Results draft/save/publish/delete
- Salary slips
- Rich profile/performance
- Calendar integration
- Structured daily update screen
- Class detail hub
- Full DTO coverage for web payload

Mobile readiness: Medium.

The important thing: mobile has the correct architecture direction. It should continue using the web teacher portal as the feature contract, but redesigned for mobile workflows.

## Mobile DTO Gaps

Current Flutter DTOs parse:

- teacher name/designation
- branches
- today classes
- pending updates
- classes
- students
- class attendance
- leaves
- stamps
- basic statistics
- checked-in state

Needed next:

- teacher email
- joining date
- contract type
- stamp id and GPS accuracy
- syllabi
- chapters
- topics
- topic logs
- homework
- result definitions
- results
- profile performance
- salary structure
- payrolls

Until these DTOs exist, the mobile UI cannot fully port the teacher web workflows.

## Recommended Teacher App Information Architecture

Keep four bottom tabs.

### Today

Purpose: daily cockpit.

Should include:

- Nepal-time clock card
- checked-in/out state
- last stamp
- today's timetable
- pending daily updates
- quick actions: attendance, class, homework, result

### Attendance

Purpose: all attendance tasks.

Should include:

- teacher IN/OUT stamp history
- open geo attendance
- class picker
- roster attendance
- fee-blocked state
- present/absent summary
- save attendance

### Classes

Purpose: class workspace.

Should include:

- assigned class cards
- class detail page
- roster
- timetable slots
- syllabus progress
- homework list
- results entry

### More

Purpose: less frequent teacher tools.

Should include:

- profile
- leave requests
- salary slips
- academic calendar
- security/change password

## Backend Readiness Checklist

Ready now:

- Authenticated teacher workspace
- Teacher-scoped assigned classes
- Teacher timetable via workspace
- Geo attendance
- Class attendance
- Daily session update
- Syllabus CRUD and progress logs
- Homework creation
- Result drafts/publishing
- Leave request
- Payroll read through workspace

Needs hardening:

- Route-level tests for all teacher ownership boundaries
- Payload size/performance testing for large teachers
- Production-grade file upload for homework/result sheets
- Structured daily update fields if required by product
- Dedicated paginated endpoints for heavy history screens
- Consistent error response shapes across teacher/supporting routes

## Priority Build Plan

### Phase 1: Finish Daily Teacher MVP

Goal: teacher can complete daily work from mobile.

- Polish Today tab.
- Ensure clock card clearly switches IN/OUT.
- Ensure workspace refresh after geo attendance and class attendance.
- Improve daily update from small dialog to dedicated screen.
- Add tests for workspace parsing and class attendance.

### Phase 2: Complete Attendance

Goal: attendance becomes production-usable.

- Show class attendance history for selected class.
- Show student leave/excused state after refresh.
- Add disabled and loading states.
- Add clear errors for not clocked in, fee-blocked, and wrong date.

### Phase 3: Classes Hub

Goal: teacher has a real class workspace.

- Add class detail screen.
- Add roster section.
- Add timetable slots.
- Add syllabus/homework/results entry points.

### Phase 4: Syllabus

Goal: port web syllabus workflow.

- Parse syllabi/chapters/topics/logs in mobile DTO.
- Build syllabus create/update UI.
- Build topic progress update UI.
- Handle duplicate/conflict states.

### Phase 5: Homework

Goal: teacher can assign homework from mobile.

- Parse homework from workspace.
- Add create homework form.
- Support title, description, deadline.
- Add attachment support only after object storage path is production-ready.

### Phase 6: Results

Goal: teacher can save and publish marks.

- Parse result definitions and saved results.
- Build result definition picker.
- Build marks entry list.
- Validate marks/pass marks client-side.
- Save draft and publish.
- Decide how result sheets are uploaded on mobile.

### Phase 7: Salary/Profile/Calendar

Goal: complete lower-frequency tools.

- Parse payrolls and salary structure.
- Add salary slip list/detail.
- Add rich profile.
- Link academic calendar.
- Keep security/change password.

## Final Recommendation

Use the current React teacher portal as the functional source of truth, and use the backend as-is for the next mobile sprint. The backend is ready enough to complete the teacher role-based app for daily teaching workflows: clock in/out, view timetable, mark class attendance, and submit daily updates.

For a release-quality teacher mobile app, finish class attendance polish first, then build Classes Hub, Syllabus, Homework, Results, and Salary in that order. The backend does not need a full rewrite. It needs focused hardening, more tests, and production file upload handling.

