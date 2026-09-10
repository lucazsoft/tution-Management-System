# Account and profile rollout — final section report

Date: 2026-09-10
Scope: personal account pages, account dropdowns, navigation, password changes, and mobile verification status.

## Outcome

Tenant Admin, Branch Admin, Accountant, Teacher, Parent, and Student now use the same account-page content and the same top-right account dropdown. The dropdown follows the Accountant design: user identity, My account, Security, and Sign out.

Personal account and security links have been removed from these six roles’ sidebars. Institution settings and operational navigation remain. Tenant Admin’s configured sidebar has 23 links, down from 25.

This unifies personal account access; it does not replace every student, employee, or family record screen.

## Role-by-role status

| Role | My account | Security | Shared dropdown | Edit own name | Verify/change mobile | Institution controls |
| --- | --- | --- | --- | --- | --- | --- |
| Tenant Admin | `/tenant/account` | `/tenant/security` | Yes | Yes | Yes, through protected SMS flow | Yes |
| Branch Admin | `/branch/account` | `/branch/security` | Yes | Yes | Not enabled | No |
| Accountant | `/staff/account` | `/staff/security` | Yes | Yes | Not enabled | No |
| Teacher | `/teacher/account` | `/teacher/security` | Yes | Yes | Not enabled | No |
| Parent | `/parent/account` | `/parent/security` | Yes | Yes | Not enabled | No |
| Student | `/student/account` | `/student/security` | Yes | Yes | Not enabled | No |

Capabilities are returned by the API for the signed-in user. The table describes each role in isolation; a user with a tenant-wide Tenant Admin assignment may receive that assignment’s capabilities.

Accountant retains its PageShell workspace. The other five roles use DashboardShell. Both shells now render AccountMenu, so the personal menu has one implementation despite differences in the surrounding workspace.

## Shared experience

### Account dropdown

- Avatar or initials, user name, and role.
- My account and Security links point to the current role’s routes.
- Sign out invokes the existing authentication logout handler.
- Trigger is a real button with expanded state and an accessible label.
- Links and buttons support normal keyboard navigation.
- Escape closes the dropdown and returns focus to the trigger.
- Outside pointer interaction and focus leaving the component close it.
- Navigation closes the dropdown.
- Layout adapts to narrow screens and uses theme variables for light/dark mode.

### My account page

- Personal details: name, institution, actual role assignments, and branch labels.
- Name editing uses the signed-in account endpoint.
- Login email and its recorded verification state.
- Security mobile and its recorded verification state.
- Two-step sign-in status, displayed separately from mobile verification.
- Password settings link.
- Tenant Admin-only mobile controls and institution-setting shortcuts.

A missing phone is explained as missing contact information. A saved phone is not automatically considered verified.

## Security behavior

| Area | Implemented protection |
| --- | --- |
| Account identity | API reads and updates use the session user ID and institution ID. |
| Profile updates | Strict field allowlist accepts first and last name; rejects injected IDs, roles, email, phone, and verification fields. |
| Name validation | Names are trimmed and validated on the server. |
| Administrative access | Existing API role restrictions remain; hiding menu items is not the authorization mechanism. |
| Mobile trust | Verification belongs to the exact verified destination and cannot transfer to a different saved phone. |
| Payment SMS | Successful confirmation records mobile verification; code binding includes user, institution, branch, action, settings, and destination. |
| Mobile changes | Tenant Admin flow requires current password, applicable SMS codes, expiration and attempt checks, and revokes sessions after completion. |
| Password changes | Existing authentication service verifies the current password. The UI now sends `revokeOtherSessions: true`. |
| Password feedback | Form reference is saved before the asynchronous request; success clears fields without the former false reset error. |
| CI | Account-profile ownership tests now run alongside existing account-contact and authentication SMS tests. |

Password fields are disabled while submitting and include password-manager autocomplete hints and a maximum length matching the configured authentication limit.

## Validation evidence

Completed during this work:

- TypeScript checks and targeted lint passed.
- Account-profile tests passed across all six roles: ownership, role/branch metadata, capability restrictions, name validation, and forbidden fields.
- Account-contact and authentication SMS tests passed for destination binding, wrong codes, expiry, replay, recovery behavior, and session revocation paths.
- Payment verification tests passed for binding, attempt limits, expiry, and concurrent replay protection.
- Password browser regression passed for form clearing, success feedback, and the session-revocation request payload.
- Shared dropdown browser checks passed for all six roles at 375, 768, and 1280px widths.
- Dropdown checks covered account/security destinations, Escape focus return, outside dismissal, and horizontal overflow.
- Final dropdown screenshots were visually reviewed in light and dark themes.

Browser checks used mocked API responses. They verify frontend behavior, not production SMS delivery or a live multi-device session revocation. Backend regression tests also use mocked persistence. This report is not a production penetration-test certification.

## Remaining differences and work

1. **Mobile self-service for other roles:** verification and number changes remain Tenant Admin-only. Extending them requires a separate security change, including handling users without a personal number.
2. **Two-step setup:** account pages display status but do not provide an enable/disable setup flow.
3. **Email verification:** status is displayed; this rollout does not introduce an email verification or email-change workflow.
4. **Teacher’s old profile:** `/teacher/profile` still exists with employment, attendance, and performance information. Its My Profile label can still be confused with My account.
5. **Parent’s old profile:** `/parent/profile` still exists with contact and linked-student information. Renaming it and removing duplicated personal details remains proposed work.
6. **Administrative profile drawers:** UserProfileDrawer and student record views have not been rebuilt around the shared account card. They serve selected-person administrative workflows rather than signed-in personal settings.
7. **Unsaved name edits:** browser unload protection exists; internal navigation does not yet provide an unsaved-change confirmation.
8. **Repeatable dropdown tests:** `apps/web/tests/account-menu.js` now covers all nine shell roles. Run `npm run test:account-menu --workspace=web`; it starts its own development server on port 5192. The CI workflow runs this suite after the web build. Tests mock authentication and API responses; they do not validate production authorization or sign-out session deletion.

## Other roles outside this rollout

Super Admin, Receptionist, and Janitor were not included in the six-role personal-account rollout. DashboardShell now uses the shared menu for them as well, offering their existing security destination and sign-out action, but no new My account route. Their existing security sidebar links remain. These three roles are now included in the nine-role browser regression suite, including security destinations and the absence of an unsupported My account link. Their backend feature access is outside this menu test scope.

## Implementation map

- `apps/web/src/components/patterns/AccountMenu.tsx` — shared dropdown behavior.
- `apps/web/src/components/patterns/accountMenu.css` — shared dropdown styling.
- `apps/web/src/components/patterns/DashboardShell.tsx` — dashboard integration.
- `apps/web/src/components/patterns/PageShell.tsx` — Accountant integration.
- `apps/web/src/components/patterns/dashboardNavigation.ts` — role navigation.
- `apps/web/src/components/patterns/accountantNavigation.ts` — Accountant navigation.
- `apps/web/src/pages/AccountPage.tsx` — shared personal details and security status.
- `apps/web/src/components/AccountLayout.tsx` — shared page, section, and status components.
- `apps/web/src/pages/AccountantAccountPage.tsx` — Accountant shell wrapper.
- `apps/web/src/router/index.tsx` — role-guarded routes.
- `apps/web/src/components/ChangePasswordForm.tsx` — password UI.
- `services/api/src/routes/users.ts` — own-account API and capabilities.
- `services/api/src/routes/account-contact.ts` — protected mobile workflow.
- `apps/web/tests/account-password.js` — repeatable password browser regression.
- `.github/workflows/ci.yml` — account-profile test coverage.

## Delivery status

The account rollout and password fixes were pushed with history through `9f02cb2`.

The shared dropdown/sidebar cleanup is committed locally as `5b6adc8` and has not been pushed in this session. The dropdown and follow-up test/report work remain local pending a push. Remote state was not refreshed for this report, and deployment success was not checked.

This Markdown report accompanies the local follow-up regression coverage. Temporary browser profiles, test scripts, and screenshots remain local.

## Recommended next steps

1. Push the shared dropdown commit and this report, then verify the deployed menu for each role.
2. Rename and simplify the older Teacher and Parent profile screens to remove duplicate personal-account entry points.
3. Monitor the newly added shared-menu browser regression in CI.
4. Implement non-Tenant Admin mobile self-service and two-step setup as separately tested security work.


## Follow-up validation � account dropdown

The repository now contains a nine-role TestCafe suite checking:

- Correct My account visibility and role-specific Security destinations.
- Sign-out control presence (actual session deletion is not tested here).
- Tab navigation, Escape dismissal, and focus return.
- Navigation closes the dropdown.
- Outside pointer dismissal.
- Dropdown bounds and page overflow at 375, 768, and 1280px.
- Menu availability when unrelated workspace API calls return errors.

The test command owns its development server and disables its websocket error overlay, avoiding the earlier test-proxy interference. No application errors are globally suppressed.
