# Notification validation update, 22 November 2026

Status at 22:35 Asia/Kathmandu. This updates the earlier version 2 local verification record. It is not a production release or proof of notification delivery.

## New checks completed

- Original mobile lockfile resolves with `flutter pub get --enforce-lockfile` using Flutter 3.47.0 and Dart 3.13.0. No mobile dependency version changes were retained.
- Flutter analyzer errors-only mode passes. It reports 24 warnings/information items, not a warning-free result.
- All 289 existing Flutter tests pass, including the notification source/read and session-race tests.
- Android arm64 Dart/assets compilation passes with explicit Firebase client options and a deliberately non-live API URL. This is a debug Flutter bundle, not an APK, install-ready app, signing check or device test.
- Eight network-blocked server/mock suites pass again. No production database, real push recipient or SMS service was used.
- React production build and messaging-worker build pass with the verified public web configuration. An entrypoint-size warning remains.
- Browser lifecycle/worker mocks and synthetic inbox/source-group regressions pass again. Fresh 320px and 390px images were inspected; external font requests are blocked in the browser harness.
- Separate synthetic Flutter widget renders were checked at 320px and 390px with cached app fonts and Material icons. The 320px check found a squeezed-out heading. Compact screens now use a tooltip-labeled mark-all-read icon; wider screens retain the text action. Both layouts were rendered and inspected again after the fix.
- The Flutter-web messaging worker bundles using the verified public web values. Full Flutter-web application compilation did not finish in the available execution window and is not a passed check.

## Firebase setup

Existing project: `lucazsoft-c56b7`, sender/project number `894974421798`.

- Android identity remains `com.tms.tmsmobile`, registered app `1:894974421798:android:a3bbee680b4b795f44efe7`.
- iOS identity remains `com.tms.tmsMobile`, registered app `1:894974421798:ios:619ae93d54379cd444efe7`.
- Added `TMS Web`, registered app `1:894974421798:web:ec5474b560d90af244efe7`.
- Created the approved Firebase-managed VAPID web-push pair. Only its public value was collected. The private half was not revealed or exported.
- Public Android and web build values are kept outside committed source. The local compile configuration uses a non-live API placeholder, not a configured staging or production release.
- Firebase Hosting was not enabled. The Spark plan was not changed. No service-account key, Apple key, signing key, access-role change or billing enrollment was made.
- No iOS APNs credential is configured. Apple setup remains a separate incomplete dependency for iOS remote push.

Source-of-truth console pages:

- https://console.firebase.google.com/u/2/project/lucazsoft-c56b7/settings/general/android:com.tms.tmsmobile
- https://console.firebase.google.com/u/2/project/lucazsoft-c56b7/settings/general/web:NjBlZGY5MmQtYTk4Ny00OGIxLWIyODgtZDBhOWUyMTlkZDFk
- https://console.firebase.google.com/u/2/project/lucazsoft-c56b7/settings/cloudmessaging/web:NjBlZGY5MmQtYTk4Ny00OGIxLWIyODgtZDBhOWUyMTlkZDFk

## Build and release limits

Full Android APK packaging is not verified. A disposable unsigned copy was used to avoid generating signing keys or changing the real Gradle signing configuration. Cold Gradle runs exceeded execution windows or lost their daemon in the memory-limited build environment. A smaller-heap configuration could evaluate the project, but that is not an application-package build. No such temporary Gradle changes were copied into this patch.

Current repository main and the isolated remote review branch were last checked at `9f45b470a22f4c94850dc138efa8a5159587d804`. The prepared source changes have not been committed/pushed remotely. Main push triggers production deployment, including independently enabled deployment automation outside this patch. Publishing to main is therefore a production release, not a harmless review step.

Before a release, establish the exact deployed revision and environment mapping; verify staging data isolation and suppression of real notification/SMS providers; inspect actual migration/deployment commands; and prepare a tested, schema-compatible rollback path. A previous successful code deployment alone does not establish that database rollback is safe.

Remaining acceptance includes real controlled-device foreground/background/closed-app receipt, notification taps, permission changes, token refresh, logout/account switching, source/read consistency and tenant/role targeting. Test accounts/devices and any real sends must be explicitly scoped first. Provider acceptance is not device display. Durable outbox/retry remains a design, not an implemented dispatcher.

No production merge, deployment, real notification/SMS send or spending was performed for this validation update.
