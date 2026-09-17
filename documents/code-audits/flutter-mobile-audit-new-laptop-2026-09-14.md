# Flutter Mobile Audit - 14 September 2026

**Overall mark: 7.1/10.** The Flutter mobile app has a good foundation for role-based portals, secure cookie-backed API access, offline-first storage, and tested core utilities. Flutter is installed at `C:\Users\acer\Downloads\flutter_windows_3.47.4-stable\flutter`, and the unit/widget test suite passes. It is **not ready for Android device testing yet** because the Android SDK is missing. It is also not release-ready while demo credentials and mock auth paths are compiled into the normal login flow.

Scope: source review of `apps/mobile`, new-laptop test readiness check, Flutter doctor/analyzer/test verification, and platform config review. This is not a physical-device QA pass because Android SDK/emulator tooling is not installed.

## Verification Attempted

| Check | Result |
|---|---|
| `flutter --version` | Passed using the SDK path directly. Flutter 3.47.4 stable, Dart 3.13.3. Flutter/Dart are not on `PATH`. |
| `flutter doctor` | Ran. Flutter installed; Windows desktop tooling OK; Android SDK missing; Chrome missing; Flutter/Dart not on `PATH`. |
| `flutter pub get` | Downloaded dependencies but exited with Windows Developer Mode/symlink warning. |
| `flutter analyze` | Ran. Found 14 issues: 2 warnings and 12 info-level lint/deprecation items. |
| `flutter test` | Passed: 169 tests. |
| Source review | Completed for auth, routing, networking, offline storage, Android/iOS config and representative portal code. |

## Scorecard

| Area | Mark | Notes |
|---|---:|---|
| New-laptop test readiness | 6/10 | Flutter works via full SDK path and tests pass. Remaining blockers: add Flutter to `PATH`, enable Developer Mode for plugin symlinks, install Android SDK, and configure Chrome if web testing is needed. |
| Architecture and maintainability | 7/10 | Feature-first structure is clear: `core`, `shared`, and role portals. Riverpod, go_router, Dio, Drift and view models are used coherently. |
| Auth and session security | 6/10 | Better Auth cookies are centralized and release HTTPS is enforced, but demo login credentials and mock 2FA are present in the normal app path. |
| Network resilience | 8/10 | Dio client has timeouts, request IDs, safe GET-only retry, typed API errors, cancellation utilities, cookie persistence and 401 session invalidation. |
| Offline-first/data safety | 7/10 | Drift queue/cache are per-user scoped, wipe on logout/401 is designed, idempotency keys exist, and server-wins conflict handling is documented/tested by source. Storage is not encrypted. |
| Platform readiness | 5/10 | Android/iOS projects exist, but Android still uses `com.example.tms_mobile`, release signs with debug keys, and iOS has no location permission usage strings despite geolocation dependency. |
| Automated QA coverage | 8/10 | The test folder is broad, including auth/provider, sync, network conventions, student/parent/teacher/admin portals and offline wipe. Local `flutter test` passed 169 tests. |

## Strengths

- `ApiClient` enforces an absolute API URL and rejects non-HTTPS API URLs outside debug builds.
- Session handling is centralized through Dio and Better Auth cookies rather than client-managed bearer tokens.
- 401 responses clear local auth and trigger router redirection back to login.
- Request IDs, safe retry policy, cancellation helpers and typed API exceptions show good mobile networking maturity.
- `AppDatabase`, `SyncQueueService` and `OfflineEntityCache` scope offline rows by `ownerUserId` and provide user-specific wipe behavior.
- The router prevents logged-in users from browsing another role portal by deep link before server authorization runs.
- Tests exist for important mobile surfaces: offline wipe, sync queue/transport, auth provider, role code mapping, network conventions and multiple portal screens.

## Findings

### MOB-AUD-01 - High: Android device test toolchain is missing on the new laptop

Flutter itself exists and runs from:

```powershell
C:\Users\acer\Downloads\flutter_windows_3.47.4-stable\flutter\bin\flutter.bat
```

`flutter doctor` reports that the Android SDK is missing. It also reports Flutter/Dart are not on `PATH`, Chrome is missing, and `flutter pub get` asks for Windows Developer Mode because plugin builds require symlink support.

Impact: unit/widget tests can run, but Android emulator testing, APK builds and phone testing cannot start yet.

Recommendation: add Flutter to `PATH`, enable Developer Mode, install Android Studio/SDK/platform tools, then run:

```powershell
cd apps/mobile
flutter doctor
flutter pub get
flutter analyze
flutter test
flutter devices
flutter run -d <device_id> --dart-define=API_BASE_URL=http://10.0.2.2:3001
```

### MOB-AUD-02 - High: Demo credentials and mock auth are compiled into the normal login path

`AuthService.signIn` checks `MockAuthService.demoUsers` before calling the backend. `LoginScreen` renders demo account chips and displays the demo 2FA code.

Impact: a release build can authenticate as local mock users without backend validation if a demo email is entered. Even if server data is unavailable afterward, this is a serious release-control problem.

Recommendation: guard all demo auth and demo UI behind a compile-time debug/demo flag, for example `bool.fromEnvironment('ENABLE_DEMO_AUTH')`, and force it off by default in release. Add a test that release config does not expose demo accounts.

### MOB-AUD-03 - High: Android release is still using debug signing and example package id

`android/app/build.gradle.kts` has `applicationId = "com.example.tms_mobile"` and release uses `signingConfigs.getByName("debug")`.

Impact: you cannot produce a trustworthy release APK/AAB for external testing or Play Console distribution. Package identity will also need changing before production.

Recommendation: set the real application id, add proper release signing via environment/keystore properties, and keep debug signing only for debug builds.

### MOB-AUD-04 - Medium: iOS geolocation permission strings are missing

The app depends on `geolocator` and has geo attendance screens, but `ios/Runner/Info.plist` does not include location usage descriptions.

Impact: iOS builds using geolocation can be rejected or crash/deny permission prompts incorrectly.

Recommendation: add `NSLocationWhenInUseUsageDescription` and any other needed location keys before iOS device testing.

### MOB-AUD-05 - Medium: Offline cache is scoped but not encrypted

The offline layer correctly avoids credentials by design, but Drift stores entity payload JSON and queued mutation bodies in local SQLite without encryption.

Impact: if cached payloads contain student, parent, finance or attendance data, device compromise or backups may expose sensitive school records.

Recommendation: classify which entities are allowed offline, avoid caching high-risk finance/identity payloads, and consider encrypted storage for production.

### MOB-AUD-06 - Medium: Stored user profile can restore UI before server session proof

`AuthService.restoreSession` returns the locally stored user JSON before checking `/api/auth/get-session`.

Impact: after cookie expiry, app relaunch may briefly mark the user authenticated until an API call returns 401. Server authorization remains authoritative, but the local UI state can be stale.

Recommendation: prefer server session restore when online; if offline, mark the session as offline/stale and restrict sensitive actions until the server confirms.

### MOB-AUD-07 - Low/Medium: Analyzer has a small amount of cleanup

`flutter analyze` reports 14 issues: unused `actions` in `lib/core/navigation/app_shell.dart`, unused `_showQr` in `lib/features/student/screens/student_fees_screen.dart`, several const/style items, and one deprecated `withOpacity` use.

Impact: no test failure, but CI may fail if warnings are treated as fatal later.

Recommendation: clean these before mobile QA so the analyzer is quiet.

### MOB-AUD-08 - Medium: Several mobile screens are ahead of backend APIs

Source comments identify TODO API gaps for notifications read state, student certificate list/detail, invoice detail/receipt, janitor task transition, branch approvals, teacher leave APIs and tenant lists.

Impact: device testing will find partial workflows that render but cannot complete server-backed actions.

Recommendation: make a test matrix that labels each screen as live, read-only, mocked, local-only or blocked-by-backend before QA starts.

## Device Test Readiness

Before testing on a phone or emulator, complete this checklist:

1. Add `C:\Users\acer\Downloads\flutter_windows_3.47.4-stable\flutter\bin` to `PATH`.
2. Enable Windows Developer Mode so Flutter plugins can create symlinks.
3. Install Android Studio/SDK/platform tools and verify `flutter doctor` is clean enough for Android.
4. Run `flutter pub get`, `flutter analyze`, and `flutter test` in `apps/mobile`.
5. Start the backend locally or point to staging with `--dart-define=API_BASE_URL=...`.
6. Remove or flag-gate demo auth/UI before any release-mode test.
7. Fix Android package id and release signing before APK/AAB handoff.
8. Add iOS location permission strings before iOS testing.
9. Prepare role accounts for Teacher, Student, Parent, Branch Admin, Tenant Admin and Janitor.
10. Test logout/401 offline wipe, 2FA, password reset, geo attendance, payment instructions, certificates and offline queue replay.

## Final Marking

- **Can run unit/widget tests on this laptop right now:** 8/10, using the full Flutter SDK path.
- **Can run Android device/emulator tests right now:** 3/10, because Android SDK is missing.
- **Codebase readiness for controlled debug testing after Android setup:** 7.5/10.
- **Release readiness:** 5.5/10 until demo auth, signing, app id, iOS permissions and verified test results are fixed.
- **Overall mobile mark:** 7.1/10.

The mobile app has good bones. The next win is not adding more screens; it is making the laptop Android-capable, removing demo auth from release paths, and proving the current flows on a real emulator/device against the backend.
