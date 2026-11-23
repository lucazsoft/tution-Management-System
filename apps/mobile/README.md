# TMS Mobile (Flutter)

Role portals for Teacher, Student, and Parent. Admin/operations roles use the
web portal/PWA.
Auth is Better Auth session cookies — no tokens or tenant/branch IDs from the client.

## Laptop setup

For a fresh laptop setup, emulator/device run commands, backend setup, and
common fixes, see:

`../../documents/frontend-handoffs/MOBILE_APP_LOCAL_SETUP_GUIDE.md`

## Environment builds

The API base URL is compile-time config (`--dart-define=API_BASE_URL`).
Release builds refuse to run without an HTTPS URL.

| Target | Command |
|---|---|
| Local (Android emulator) | `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3001` |
| Staging | `flutter build apk --dart-define=API_BASE_URL=https://api.staging.sanskardipshikshalaya.com.np` |
| Production | `flutter build apk --dart-define=API_BASE_URL=https://api.tms.sanskardipshikshalaya.com.np` |

iOS simulator uses `http://localhost:3001`; physical devices need the machine LAN IP.

## Notification build options

The local notification-readiness patch requires explicit Firebase client build
options. The API URL alone does not enable notifications. See
`../../docs/notification-readiness-local.md` for server/client separation,
public web worker generation, and the outstanding native/staging checks.
Do not use a service-account private key in any Flutter build.

Example: start from `firebase-client.example.json`, fill only that platform's
public Firebase app options, and pass it with `--dart-define-from-file`.
Empty example values intentionally leave push disabled. A real configuration
and a successful build are not proof of provider/device delivery. Keep real build values in an ignored local JSON file, for example `firebase-client.android.local.json` or `firebase-client.web.local.json`; do not mix platform app IDs. Set `API_BASE_URL` to the explicitly selected test/release environment, not a copied placeholder.

## Checks

`flutter analyze --no-fatal-warnings --no-fatal-infos` and `flutter test` pass for the current notification patch with Flutter 3.47.0 / Dart 3.13.0 and the original enforced lockfile: 289 tests, no analyzer errors, 24 warnings/info. See `../../docs/notification-validation-2026-11-22.md` for the exact scope and unverified APK/device/release checks.
CI runs analyzer/tests on pushes to main/develop/staging/mobile-app. Its floating stable SDK may resolve SDK-pinned dependencies differently; local verification did not retain those dependency updates.

## Release identity & signing

Production identity (do NOT change without a migration plan — both IDs are
locked once the app is published to a store):

| Platform | ID |
|---|---|
| Android `applicationId` / namespace | `com.tms.tmsmobile` |
| iOS bundle ID | `com.tms.tmsMobile` |

### Android release signing

The `release` build type signs with the `release` signing config when a
keystore is configured, otherwise it falls back to debug keys (with a Gradle
warning) so `flutter run --release` keeps working on dev machines. Store
builds MUST have a keystore configured.

1. Generate the release keystore once (custodian machine or CI secrets):
   `keytool -genkeypair -v -keystore release.keystore -alias tms-release -keyalg RSA -keysize 2048 -validity 10000`
2. Local dev option: `cp android/keystore.properties.example android/keystore.properties`
   and fill in the real passwords (file is gitignored — NEVER commit it).
3. CI/store option: export `TMS_KEYSTORE_FILE`, `TMS_KEYSTORE_PASSWORD`,
   `TMS_KEY_ALIAS`, `TMS_KEY_PASSWORD` (env vars take effect when
   `keystore.properties` is absent).

### iOS signing

Signing is Automatic; the Team is intentionally NOT hardcoded — the project
reads it from the `TMS_DEVELOPMENT_TEAM` environment variable (empty by
default, so simulator builds keep working). Set it locally or in CI, or pick
the team in Xcode. For App Store export, copy
`ios/ExportOptions.release.example.plist` to `ios/ExportOptions.release.plist`
(gitignored — NEVER commit it) and replace `YOUR_TEAM_ID`.

Location permission strings (`NSLocationWhenInUseUsageDescription`,
`NSLocationAlwaysAndWhenInUseUsageDescription` in `ios/Runner/Info.plist`)
cover geo-fenced attendance check-in/out — keep them accurate if the feature
changes, or App Store review will reject the binary.

### Custody

| Artifact | Owner | Storage |
|---|---|---|
| Android release keystore + passwords | Release manager (TBD — fill in name) | Hardware-backed custodian copy + CI secrets; NEVER in git |
| Apple Developer Team + distribution certs | Release manager (TBD — fill in name) | Apple Developer portal + CI secrets; only the Team ID placeholder lives in this repo |

NEVER commit: `*.jks`, `*.keystore`, `keystore.properties`, real passwords,
real Team IDs, `ExportOptions.release.plist`, or distribution certificates.
