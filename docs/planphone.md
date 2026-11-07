# Plan: student logins linked to the parent's phone number

Status: **implemented on branch `feature/phone-linked-logins`, not yet deployed** · Created 2026-11-07 · Updated 2026-11-07 · Owner: backend + web + mobile

### Progress (2026-11-07)

- Phases 0–7 are coded. API typecheck, web typecheck and build, and 35 of 36 API test suites pass. The new `test:phone-link` suite passes. `test:attendance` already fails on `main` and is unrelated.
- **Not run locally:** `flutter analyze` and `flutter test`, because the Flutter SDK is not installed on this machine. CI runs both on push.
- **Still to do:** the staging checks in Phase 0, the Phase 8 rollout, and the tests marked open in Phase 7.
- Changes from the plan as written:
  - `LOGIN_EMAIL_DOMAIN` is optional and defaults to `login.<WEB_ORIGIN host>`, so existing deployments keep starting.
  - The phone normaliser moved to `src/utils/phone.ts`, and `sms.ts` re-exports it.
  - The admission API accepts `existingParentUserId` when the admin picks a parent after a 409.
  - The parent reset screen is in the portal (web: Profile → Linked students; mobile: home screen card). The public forgot-password page redirects signed-in users, so it could not be used.


## Goal

School students often have no email and no phone, and some parents have no
email either. Every student and parent should still get their own login, and a
student without a phone should be tied to the parent's phone number.

Decisions (agreed):

1. **Generated login emails for students and parents.** If no email is entered,
   the system creates `firstname.lastname@<login-domain>`. This works the same
   way for students and parents. The password stays random, as it is today.
2. **Student phone is optional.** If the student has a number, it is used for
   that student. If not, the admin ticks **"Use parent's number as primary"**,
   and the student is then linked to the parent's phone.
3. **Passwords stay.** Anyone can reset a password with a one-time code sent to
   the linked phone: the student's own phone, or the parent's when the box is
   ticked.
4. **Student and parent keep separate logins.** When the admission payment is
   recorded, the server sends each login to its phone. With the box ticked,
   both SMS go to the parent's number.

Out of scope: passwordless phone login, an account picker, and Meta-style
account switching.

## How it works after the change

```
Admission saved ──► student user  email: given, or generated (ram.sharma@<login-domain>)
                │                 phone: student's own number
                │                        OR box ticked → usesGuardianPhone = true (no phone stored)
                └─► parent user   email: given, or generated (hari.sharma@<login-domain>)
                                  phone: required (always the parent's own number)
                     linked via StudentParent (isPrimary = true)

Payment recorded ──► server generates both passwords
                 ├─► Student SMS → student's phone, or parent's phone if box ticked
                 └─► Parent SMS  → parent's phone
                 └─► each account turns ACTIVE when its SMS is sent

Forgot password ──► code goes to the account's linked phone
                    (box ticked → primary parent's verified phone; the SMS names the account)
```

When the box is ticked, the student stores no phone of their own. The server
looks up the primary parent's phone each time, so when the parent changes their
number, every linked child follows automatically.

---

## Phase 0: prerequisites (do first)

Phone-based reset adds a way in, so the brute-force protection found broken in
the backend audit must work first.

- [x] Set `app.set('trust proxy', 1)` in `services/api/src/server.ts`. The API sits behind one Traefik hop.
- [x] Set Better Auth `advanced.ipAddress.ipAddressHeaders` to `['x-real-ip']` in `services/api/src/utils/auth.ts`.
- [ ] On staging, send 7 wrong passwords and confirm the 6th returns **429**.
- [ ] Confirm today's bug: admit a student with no phone, record payment, and check that the student stays `INACTIVE`. The STUDENT delivery is sent to an empty phone. Record the result here: ______

## Phase 1: data model

File: `services/api/prisma/schema.prisma`, plus one new migration.

- [x] `User.loginEmailGenerated Boolean @default(false)`. When true, the email is a login ID only, and no mail is ever sent to it. This applies to students and parents alike.
- [x] `Student.usesGuardianPhone Boolean @default(false)`. This is the "Use parent's number as primary" box.
- [x] `StudentParent.isPrimary Boolean @default(false)`. This picks the guardian whose phone is used when `usesGuardianPhone` is true.
- [x] Add a partial unique index so a student has at most one primary guardian, using raw SQL in the migration: `CREATE UNIQUE INDEX ... ON "StudentParent"("studentId") WHERE "isPrimary"`.
- [x] Backfill:
  - [x] Set `isPrimary = true` on the only parent link of every existing student.
  - [x] Set `usesGuardianPhone = true` for existing students whose `phone` is empty.
- [x] Config: add `LOGIN_EMAIL_DOMAIN` to `.env.example`, `compose.yml` and `runtime-config.ts`. Validate it as a bare hostname, required in production.
  - Use a subdomain you control, for example `login.sanskardipshikshalaya.com.np`. Generated addresses then can never belong to a real stranger's mailbox. They do not need to receive mail.

## Phase 2: generate login emails (students and parents)

File: `services/api/src/services/admission-service.ts`.

- [x] Add `generateLoginEmail(tx, firstName, lastName)`, one generator used for both roles:
  - Lowercase the names and transliterate to ASCII. Keep only `a-z0-9` and join the parts with `.`. Fall back to `user` if nothing is left.
  - Check `User.email` for a clash, then try `ram.sharma`, `ram.sharma2`, `ram.sharma3` and so on.
  - Run it inside the admission transaction and retry on `P2002`, because two admissions can race for the same name.
- [x] Make `email` optional in `validateIdentityFields` for **both** student and parent.
- [x] Student phone rule (server side, in `POST /admissions` and in bulk admission):
  - [x] The student phone is given: save it, and set `usesGuardianPhone = false`.
  - [x] The phone is empty and `useGuardianPhone: true` is sent: save no phone, and set `usesGuardianPhone = true`.
  - [x] The phone is empty and the box is not ticked: reply **400** "Enter the student's phone number or tick 'Use parent's number as primary'."
  - [x] Both a phone and the box are given: reply 400 and ask for one or the other.
- [x] **Parent phone stays required**, because it is the delivery and recovery number for the parent and possibly the child.
- [x] In `createAdmissionRecords`, use the generated email for any missing email (student or parent), and set `loginEmailGenerated: true` on that user.
- [x] Bulk admission (`services/api/src/routes/users.ts`):
  - [x] The student `email` column becomes optional (around line 1681).
  - [x] Remove the "primary parent email is required" check (around line 1779). A missing parent email is generated.
  - [x] Add a `useParentPhone` column (`yes`/`no`) with the same phone rule as above.
- [x] Add `loginEmailGenerated` to every place that sends email: Better Auth email hooks, notifications and receipts. Skip users where it is true.

## Phase 3: link siblings to an existing parent

File: `services/api/src/routes/users.ts`, `POST /admissions` (around line 293), and `admission-service.ts`.

Today a second child with the same parent email is rejected with a 409.

- [x] Before creating the parent, look for an existing **Parent** user in the same tenant:
  1. By email, only when a real email was entered. Generated emails never match anything.
  2. Otherwise, by normalised phone (`normaliseAakashPhoneNumber`). This becomes the main way siblings are matched now that parent emails can be blank.
  - [x] Found: link the new student to that parent (`StudentParent`, `isPrimary = true`). Do not create a new parent, and do not reset the existing parent's password.
  - [x] Found, but the account is not a Parent (staff, student, another tenant): keep the 409.
  - [x] More than one Parent has this phone (old duplicates): reply 409 and ask the admin to choose the parent account. Never guess.
- [x] Remove the parent email from `findConflictingAccount` when it matches an existing Parent user.
- [x] Return `linkedExistingParent: true` so the admission screen can show "Linked to existing parent account".

## Phase 4: credential SMS goes to the right phone

File: `services/api/src/services/admission-delivery.ts`, `prepareAdmissionDeliveries`.

- [x] Add `deliveryPhoneFor(recipient, student, primaryParentUser)`:
  - PARENT: the parent's `phone`.
  - STUDENT with `usesGuardianPhone = true`: the **primary parent's phone**.
  - STUDENT with `usesGuardianPhone = false`: the student's own `phone`.
- [x] Replace `student.studentParents[0]` with the parent where `isPrimary` is true.
- [x] Wording, so the reader knows which login each SMS is:
  - Student SMS: `TMS: Admission approved for <Student name>. Student login ID: <email>. Temporary password: <pw>`
  - Parent SMS: `TMS: Parent login for <Parent name>. Login ID: <email>. Temporary password: <pw>`
- [x] Linked sibling (Phase 3): if the parent is already `ACTIVE` from an earlier child, skip the PARENT message. The parent already has a login. Only the new student's SMS is sent.
  - [x] Update `finalizeAdmissionDeliveries`, which currently requires both STUDENT and PARENT to be `SENT` for *this* student. It should count an already-active linked parent as delivered.
- [x] Keep the existing encrypted-payload and retry logic unchanged.
- [x] `POST /admissions/:studentId/issue-logins` (resend) uses the same phone resolution.

## Phase 5: password reset and two-step codes through the linked phone

Files: `services/api/src/utils/security-mobile.ts`, `utils/delivery.ts`, `routes/auth.ts`.

- [x] Add `async resolveSecurityMobile(user)`:
  1. A Student with `usesGuardianPhone = true` uses the primary parent's `trustedSecurityMobile(parentUser)`. This works only when that parent's status is `ACTIVE` and their number is **verified**.
  2. Anyone else uses their own `trustedSecurityMobile(user)`, as today. That covers parents, staff, and students who have their own number.
  3. Otherwise `null`, and the user gets the existing "Verify your security mobile or use platform-supported recovery" message.
- [x] Use it in `resetBinding()` (`routes/auth.ts`) and `sendVerificationCode()` (`utils/delivery.ts`). For guardian-linked students, the reset binding `identifier` includes the parent's user id and phone. A parent changing their number then invalidates any pending student reset.
- [x] SMS text names the account: `TMS: 123456 is the password reset code for Ram Sharma (student login). Expires in 5 minutes.`
- [x] Rate limit per phone, not only per email: add `forgot-phone:<hash(phone)>` at 10 per 15 min in `/forgot-password`. Siblings share one number, so it could otherwise receive too many codes.
- [x] Phone verification:
  - [x] **Parents** verify their number through the existing flow (`routes/account-contact.ts` and the two-step setup). Until the parent verifies, reset is unavailable for them and for their guardian-linked children, and the admin uses "Resend logins".
  - [x] **Students with their own phone** verify it themselves through the same flow on first login.
- [x] Generated-email users reset with their login ID (from the SMS) on the existing forgot-password screen. The code still goes to the phone, never to the generated address.

## Phase 6: web and mobile UI

Web (`apps/web`), admission form:
- [x] Student email: optional, with the hint "Leave blank to generate a login ID."
- [x] Student phone: optional, with a checkbox **"Use parent's number as primary"** directly under it.
  - Ticking the box clears and disables the student phone field.
  - Saving with no phone and the box unticked shows the same error as the server (Phase 2).
- [x] Parent email: optional, with the same "generate a login ID" hint. Parent phone stays required.
- [x] After saving: show both login IDs (generated or entered), where each SMS will go, and "Linked to existing parent" when relevant.
- [x] Bulk admission template: student and parent email columns are optional, and there is a new `useParentPhone` column.
- [x] Student profile (admin): show and edit the "Use parent's number" setting. When the admin unticks it, they must enter a student phone.

Web, parent portal:
- [x] Each child card shows the child's **login ID** and a **"Send password reset to my phone"** button, for children with `usesGuardianPhone`. It calls the Phase 5 flow for that child.
- [x] Profile pages show a generated email as "Login ID", not as a contact email.

Mobile (`apps/mobile`):
- [x] Login screen hint: "Use the login ID sent to you by SMS."
- [x] Parent child cards: show the login ID and the reset button, same as web.

## Phase 7: tests

Add these to `services/api/package.json` as `test:phone-link` so `scripts/run-tests.js` picks them up.

- [x] Email generator: ASCII transliteration, a name that strips to nothing, collision suffixes, a concurrent clash with `P2002` retry, and a student and parent with the same name getting different emails.
- [ ] Admission with no student email: generated email, and `loginEmailGenerated = true`.
- [ ] Admission with no parent email: generated email for the parent too.
- [x] Student phone rule: own phone works, the ticked box works, neither gives 400, both give 400.
- [x] Sibling admission matched by parent phone (generated parent email): one parent, two `StudentParent` rows, and no 409.
- [x] A phone matching two Parent users gives a 409. A parent email that belongs to staff still gives a 409.
- [x] Delivery: with the box ticked, the STUDENT SMS goes to the parent phone. With the student's own phone, it goes to the student. The sibling admission sends only the student SMS.
- [x] Reset:
  - [x] A guardian-linked student's code goes to the verified parent phone.
  - [x] An unverified parent phone gives no code.
  - [ ] A parent number change invalidates a pending student reset.
  - [x] A student with their own verified phone gets the code on their own phone.
- [ ] Per-phone rate limit returns 429 after 10 requests.
- [ ] No email is sent to a `loginEmailGenerated` address.

## Phase 8: rollout

- [ ] Run the migration and backfill on **staging** first (see `docs/DEPLOYMENT_WORKFLOW.md`). Verified on a local Postgres 16 on 2026-11-07: columns, backfill and the one-primary index all behave.
- [ ] Set `LOGIN_EMAIL_DOMAIN` in Coolify for staging and production.
- [ ] Test on staging end to end with real SMS:
  - [ ] Admit a student with the box ticked and no emails at all.
  - [ ] Admit a student who has their own phone.
  - [ ] Admit a sibling who shares the first parent.
  - [ ] Reset the password of a guardian-linked student.
- [ ] Existing data: list siblings who have **duplicate parent accounts** (same normalised phone, several Parent users). Merging them is a separate, manual admin task, not part of this change.
- [ ] Promote to `main` and verify production.

## Open questions

- [ ] When a guardian-linked student later gets their own phone, can the student switch it over by verifying the number, or only an admin from the student profile (Phase 6)? Proposed: admin only, at first.
