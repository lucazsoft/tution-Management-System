# Local verification record, version 2

22 November 2026, initial version 2 checkpoint. This records the earlier local preparation, not a production or device-delivery test. Later Firebase setup and native checks are recorded in `notification-validation-2026-11-22.md`; the not-performed list below describes this earlier checkpoint, not the latest state.

## Passed

- Clean dependency installation with package lifecycle scripts disabled. Existing dependency lock entries were preserved; new web Firebase and local browser-test dependencies were added. No existing package version update is intended.
- Local Prisma client generation and shared TypeScript type build. No database migration or database query against a production service was made.
- API TypeScript check with no emit.
- React/web TypeScript check.
- Production web build, including a separately bundled `firebase-messaging-sw.js`. The build reports an entrypoint-size warning, so performance still needs release review.
- Eight inspected server/mock suites using disabled providers, an explicitly non-production dummy database URL and a Node outbound-network guard:
  - Firebase push service, including missing config/device skips, tenant scope, opt-in and permanent-token error classification.
  - Calendar recipient scopes, audiences, role priority and fail-open delivery.
  - Notification device ownership, authentication, list/read/read-all scope and mocked persistence.
  - Runtime configuration, including explicit Firebase requirements.
  - Financial anomaly fail-open handling and skipped-send regression.
  - Legacy provider routing, disabled defaults and tenant-scoped Firebase delegation.
  - Leave routing/state-machine regressions.
  - Existing phase-three workflow doubles, including maintenance inbox persistence despite push failure and honest fail-open status if inbox storage fails. Its admission SMS checks use a separate mocked queue; no SMS was sent.
- Local production-bundle inbox test with synthetic account/API responses:
  - 320px, 390px and 1280px layouts fit the viewport.
  - Account-scoped list and actual unread count shown.
  - Mark-one-read and mark-all-read call the expected mocked endpoints and update counts.
  - Keyboard Escape closes the panel and returns focus to its trigger.
  - Empty and API-error states render.
  - No automatic browser permission request.
  - Browser enabling is unavailable when deployment config is empty.
  - Source-group regression with equal raw IDs kept distinct, original portal-read routing, refreshing portal counts after common-inbox reads, partial source failure, parent child switching and rejection of a mismatched child response.
  - Worker-source unit mocks for React versus Flutter-web routes, data-only routing, avoiding duplicate display for notification payloads, generic browser body and same-origin checks.
  - All external browser requests were blocked. Existing Google font stylesheet attempts were blocked, so screenshots show fallback text/icons in the surrounding pre-existing app. All account data is synthetic.
- Pure browser-push lifecycle tests with injected SDK/API doubles passed: explicit account-specific opt-in, no token in local preference storage, disable persisting across automatic setup, stale-session cancellation and serialized in-flight logout revocation. These are not real SDK/provider lifecycle tests.
- Actual screenshot pixels inspected at 320px, 390px and 1280px, plus the student and parent source-group panels at 390px. Verification covers the new inbox panel, not every existing app page.
- Standalone Flutter-web worker builder bundled successfully using fake public configuration. A second fixture with a server-private-key field was rejected before bundling. No real key was supplied or generated.
- Patch application dry-run passed against a clean copy of the base commit.
- iOS plist/entitlement XML parsed locally. This is syntax validation, not an Apple signing or device check.

## Reproducing local checks

From the repository root, after installing dependencies and generating the Prisma/shared type outputs:

```sh
node scripts/test-notifications-local.mjs
```

For the web mock UI test, first build the web workspace, then:

```sh
npm run test:notifications:mock --workspace web
```

A local Chrome executable is required. The harness defaults to `/usr/bin/google-chrome`; set `CHROME_PATH` if needed. It starts its own temporary local server, mocks API responses, blocks external requests and closes the browser/server afterwards. It does not use saved accounts or production data.

## Not performed

- No real Firebase registration, provider request, notification send or SMS send.
- No Firebase/Apple/Coolify configuration or deployment inspection/change.
- No Android/iOS app build, Flutter analyzer, Flutter test execution or native screenshot inspection. Those toolchains were not available here. A separate tree-sitter grammar parse found no syntax errors in the 13 changed Dart files, but it does not check Dart types, Flutter APIs, behavior or pixels. Student source/read tests and native lifecycle/race tests are prepared but not claimed to have passed.
- No actual APNs/FCM, browser-permission, push-token rotation, service-worker lifecycle or notification-click test against a provider/device.
- No staging database migration, integration test or complete workflow parity test.
- The visible remote branch heads were read. Main was newest by the recorded committer timestamps, but no branch was bound to Bigyan's current work. Unpushed work and the running deployment remain unverified.
- At the end of local preparation, no remote branch push, pull request or commit had been sent to a remote. Later publication is limited to a new isolated review branch; it does not pass any native/device check or authorize a merge, pull request or deployment.

This version supersedes the first verification/readiness text, especially its incorrect student default-wiring description. The separate readiness guide and retry design list the remaining native, retry, policy and platform work. None of these local passes establishes all-platform production readiness.
