# Mobile App Local Setup Guide

**Audience:** Developer setting up the Flutter mobile app on a laptop  
**App:** `apps/mobile`  
**Backend:** local Docker API at `http://localhost:3001` or staging API

This guide gets a developer from a fresh clone to a running mobile app with the
correct API URL, login/session cookies, and basic verification commands.

## 1. Prerequisites

Install these first:

- Git
- Flutter SDK 3.x with Dart 3.x
- Android Studio
- Android SDK Platform Tools
- Android emulator, or a physical Android device with USB debugging enabled
- Docker Desktop, if running the local backend
- Node.js and npm, if provisioning local accounts or running backend tools

Check the tools:

```powershell
git --version
flutter --version
dart --version
adb version
docker --version
docker compose version
node --version
npm --version
```

If `flutter` is not recognized on Windows, add Flutter to `PATH`.

Example:

```powershell
$env:Path += ";C:\Users\<you>\Downloads\flutter_windows_3.x-stable\flutter\bin"
flutter --version
```

For a permanent fix, add this folder to **Environment Variables > Path**:

```text
C:\Users\<you>\Downloads\flutter_windows_3.x-stable\flutter\bin
```

## 2. Clone and enter the repo

```powershell
git clone https://github.com/lucazsoft/tution-Management-System.git
Set-Location .\tution-Management-System
```

The mobile app lives here:

```powershell
Set-Location .\apps\mobile
```

## 3. Verify Flutter health

Run:

```powershell
flutter doctor -v
```

Fix any red items before continuing. Common fixes:

- Install Android Studio if Android toolchain is missing.
- Open Android Studio once and install the Android SDK.
- Accept Android licenses:

```powershell
flutter doctor --android-licenses
```

- Install a JDK if Android builds cannot find Java. Android Studio normally provides one.

## 4. Start the backend

The mobile app needs a running API. The easiest local setup is Docker Compose
from the repository root.

```powershell
Set-Location C:\Users\<you>\Downloads\tution-Management-System
Copy-Item .\.env.docker.example .\.env.docker
```

Edit `.env.docker` and set local secrets/passwords. At minimum:

```env
POSTGRES_DB=tms
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<local-password>
POSTGRES_PORT=5432

API_PORT=3001
WEB_PORT=5173
BETTER_AUTH_SECRET=<random-secret>
BETTER_AUTH_URL=http://localhost:3001
WEB_ORIGIN=http://localhost:5173

PLATFORM_ADMIN_ENABLED=true
SMS_PROVIDER=MOCK
CONNECTIPS_ENABLED=false
```

Generate a local secret:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Start the stack:

```powershell
docker compose --env-file .env.docker up --build -d
docker compose --env-file .env.docker ps -a
```

Check the API:

```powershell
Invoke-RestMethod http://localhost:3001/api/health
```

Expected: a successful health response.

## 5. Install Flutter dependencies

From `apps/mobile`:

```powershell
Set-Location C:\Users\<you>\Downloads\tution-Management-System\apps\mobile
flutter pub get
```

## 6. Choose the correct API URL

The app reads the backend URL from:

```text
--dart-define=API_BASE_URL=<url>
```

Use the correct URL for the target:

| Target | API URL |
|---|---|
| Android emulator | `http://10.0.2.2:3001` |
| Flutter web | `http://localhost:3001` |
| iOS simulator | `http://localhost:3001` |
| Physical Android device | `http://<your-laptop-LAN-IP>:3001` |
| Staging | `https://api.staging.sanskardipshikshalaya.com.np` |
| Production build | `https://api.tms.sanskardipshikshalaya.com.np` |

Why Android emulator uses `10.0.2.2`:

```text
localhost inside the Android emulator means the emulator itself.
10.0.2.2 points back to the host laptop.
```

Find your laptop LAN IP for physical devices:

```powershell
ipconfig
```

Use the IPv4 address from the Wi-Fi/Ethernet adapter, for example:

```text
http://192.168.1.23:3001
```

The phone and laptop must be on the same network. Windows Firewall may need to
allow inbound connections to port `3001`.

## 7. Run on Android emulator

List devices:

```powershell
flutter devices
```

Start an emulator from Android Studio, then run:

```powershell
flutter run -d <device_id> --dart-define=API_BASE_URL=http://10.0.2.2:3001
```

If only one emulator is running:

```powershell
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3001
```

## 8. Run on physical Android device

Enable developer options and USB debugging on the phone.

Check that ADB sees it:

```powershell
adb devices
flutter devices
```

Run with the laptop LAN IP:

```powershell
flutter run -d <device_id> --dart-define=API_BASE_URL=http://<your-laptop-LAN-IP>:3001
```

Example:

```powershell
flutter run -d R58N123ABC --dart-define=API_BASE_URL=http://192.168.1.23:3001
```

If login/API calls fail on a physical phone:

```powershell
Invoke-RestMethod http://localhost:3001/api/health
Invoke-RestMethod http://<your-laptop-LAN-IP>:3001/api/health
```

The second command must work from another device/browser on the same network.

## 9. Run on Flutter web for quick UI testing

```powershell
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3001
```

Flutter web is useful for quick screen checks, but GPS/location behavior can
differ from native mobile.

## 10. Login/test accounts

The mobile app uses Better Auth session cookies. Do not add tokens manually.

Use the local provisioning guide to create accounts:

```text
documents/frontend-handoffs/DEVELOPER_LOCAL_SETUP_AND_ACCOUNT_PROVISIONING.md
```

For teacher testing, create or use a Teacher account assigned to a branch and
class. Teacher mobile workflows expect backend data for:

- assigned branch
- teacher class assignment
- class roster
- timetable/session data
- attendance permission through clock-in

If login succeeds but teacher screens are empty, the user probably has no
teacher assignment/class roster in the local database.

## 11. Required checks before handing off

From `apps/mobile`:

```powershell
flutter analyze --no-fatal-warnings --no-fatal-infos
flutter test
```

Focused teacher workflow test:

```powershell
flutter test test\teacher_portal_test.dart
```

If CI uses a different Flutter version, also run:

```powershell
flutter --version
```

and compare it with the CI logs.

## 12. Common failures and fixes

### `flutter` is not recognized

Flutter is not on `PATH`.

Fix:

```powershell
$env:Path += ";C:\path\to\flutter\bin"
flutter --version
```

Then add `flutter\bin` permanently in Windows Environment Variables.

### Android SDK or licenses missing

Run:

```powershell
flutter doctor -v
flutter doctor --android-licenses
```

Open Android Studio and install:

- Android SDK Platform
- Android SDK Platform Tools
- Android SDK Build Tools
- Android Emulator

### No devices found

For emulator:

```powershell
flutter emulators
flutter emulators --launch <emulator_id>
flutter devices
```

For physical phone:

```powershell
adb kill-server
adb start-server
adb devices
```

Accept the USB debugging prompt on the phone.

### App cannot reach local API on Android emulator

Use:

```powershell
--dart-define=API_BASE_URL=http://10.0.2.2:3001
```

Do not use `localhost` for Android emulator.

### App cannot reach local API on physical phone

Use the laptop LAN IP:

```powershell
--dart-define=API_BASE_URL=http://192.168.x.x:3001
```

Also check:

- phone and laptop are on the same Wi-Fi
- VPN is disabled or configured correctly
- Windows Firewall allows port `3001`
- Docker API container is running

### Release build fails with HTTP API URL

Release builds require HTTPS. Use staging or production:

```powershell
flutter build apk --release --dart-define=API_BASE_URL=https://api.staging.sanskardipshikshalaya.com.np
```

Local HTTP URLs are for debug/dev only.

### Login works on web but not mobile

Check:

- `API_BASE_URL` is correct for the device type.
- API health works from that device/network.
- The backend `BETTER_AUTH_URL` and cookie setup match the local API origin.
- You are not mixing staging credentials with a local API.

### Teacher attendance save fails

Expected backend rules:

- teacher must be clocked in first
- class must be assigned to that teacher
- student must belong to the class roster
- fee-blocked students cannot be marked present
- backend may convert approved leave to excused

Clock in from the teacher Attendance/Today flow, refresh, then save class
attendance again.

### Geolocation does not work

For Android emulator:

- allow location permission in the app
- set a mock emulator location from Android Studio
- use native Android run, not only Flutter web

For physical phone:

- enable device location
- grant app location permission
- stand within the configured branch geofence

## 13. Useful daily commands

Backend:

```powershell
docker compose --env-file .env.docker up --build -d
docker compose --env-file .env.docker logs -f api
docker compose --env-file .env.docker down
```

Mobile:

```powershell
Set-Location apps\mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3001
flutter analyze --no-fatal-warnings --no-fatal-infos
flutter test
```

Clean rebuild:

```powershell
flutter clean
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3001
```

