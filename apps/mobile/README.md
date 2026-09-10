# TMS Mobile (Flutter)

Role portals for Teacher, Student, Parent, Branch Admin, Tenant Admin, Janitor.
Auth is Better Auth session cookies — no tokens or tenant/branch IDs from the client.

## Environment builds

The API base URL is compile-time config (`--dart-define=API_BASE_URL`).
Release builds refuse to run without an HTTPS URL.

| Target | Command |
|---|---|
| Local (Android emulator) | `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3001` |
| Staging | `flutter build apk --dart-define=API_BASE_URL=https://api.staging.sanskardipshikshalaya.com.np` |
| Production | `flutter build apk --dart-define=API_BASE_URL=https://api.tms.sanskardipshikshalaya.com.np` |

iOS simulator uses `http://localhost:3001`; physical devices need the machine LAN IP.

## Checks

`flutter analyze` (0 errors enforced), `flutter test` (26 tests).
CI runs both on every push to main/develop/staging/mobile-app.

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
