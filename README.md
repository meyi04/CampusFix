# CampusFix

CampusFix is a mobile-first Ionic Vue application for reporting and tracking facility maintenance at Mindoro State University. The web app and Android app share one Vue 3/TypeScript codebase. Firebase Authentication and Firestore provide the core services; Storage and Cloud Functions are optional for legacy photos and server-triggered features.

## Implemented functionality

- Student/faculty/maintenance registration, sign-in, password reset, profile viewing, and protected Firestore-role-aware routes.
- Facility report submission with managed campus building/category choices, optional rooms and location, validated photo attachments, upload progress, and duplicate-submit protection.
- Real-time report lists, report details, comments, status timelines, maintenance assignments, before/after work photos, resolution notes, and reporter reopening of resolved reports.
- Maintenance workflow: Assigned → In Progress → Pending Verification; administrators review, approve, reject, request clarification, assign work, verify, resolve, close, and prioritize.
- Administrator views for live analytics, CSV export, campus directory management, account status and role management, announcements, and audit logs.
- Firestore in-app notifications and optional Android push-notification registration. Push delivery depends on the Firebase/Android setup below.
- Firestore and Storage least-privilege rules, composite indexes, Firebase emulators, and focused workflow/rules tests.

Dashboards and analytics use Firestore data. Report lists and analytics intentionally show a bounded latest-results window (25 items per report-list page; 100 in dashboard/analytics snapshots), rather than presenting partial data as a lifetime total.

## Requirements

- Node.js 22 (Vite 8 and the Cloud Functions runtime target Node 22).
- npm.
- A Firebase project for live authentication and database operations.
- Java 21 and Android Studio for Android builds.
- Firebase CLI for deployment and emulator commands.

## Install and run the web app

From the project root:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open the URL printed by Vite. Stop and restart the development server after changing `.env.local`.

The Android platform project is already present in `android/`. If it is absent in a fresh checkout, create it with `npx cap add android`.

To build an Android APK, install Android Studio with SDK Platform 36 and Build-Tools 36.0.0, configure Firebase in `.env.local`, then run:

```powershell
npm run android:apk
```

The installable debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Transfer it to the phone, allow installation from that source when prompted, and open the APK. Debug APKs are for direct testing/distribution; publishing through Google Play requires a release build signed with your own protected upload key.

### Build and host the web app

Firebase web configuration is embedded in the app at build time. Before building for Firebase Hosting, provide the real `VITE_FIREBASE_*` values from the Firebase Console in `.env.local` (or configure them as environment variables in your CI build), then build and deploy:

```powershell
npm run build
firebase deploy --only hosting --project YOUR_FIREBASE_PROJECT_ID
```

Do not deploy a `dist` folder built before Firebase configuration was available. In GitHub Actions or another CI provider, add the Firebase values to that provider's build environment; a developer's ignored `.env.local` file is not automatically available to the hosted build. After changing any `VITE_*` values, rebuild and redeploy.

### Install from a browser

CampusFix is a Progressive Web App and must be served from HTTPS (Firebase Hosting already provides HTTPS). On Android, open the hosted site in Chrome and choose **Install app** from the app header or browser menu. On desktop Chrome or Edge, use the install icon in the address bar or the browser menu. On iPhone/iPad, open the site in Safari, tap **Share**, then **Add to Home Screen**. The app shell and static assets can load offline; authentication, reports, and other live Firebase data still require an internet connection.

## Firebase setup

1. Create a Firebase project and register a **Web app** in Firebase Console.
2. Enable **Email/Password** in Authentication.
3. Create a Firestore database. Report and maintenance photos are stored in Firestore, so Firebase Storage is not required for new uploads.
4. Copy the web app's Firebase configuration into `.env.local`. The values in `.env.example` are placeholders, not working credentials. Firebase client configuration is intended for the client; Firestore authorization is enforced by the rules.
5. Optionally set `VITE_ALLOWED_EMAIL_DOMAIN` to the exact institutional email domain. Leave it blank to disable the client-side domain restriction.
6. Sign in to the Firebase CLI and select the project:

   ```powershell
   firebase login
   firebase use --add
   ```

7. Deploy the Firestore rules and indexes:

   ```powershell
   firebase deploy --only firestore:rules,firestore:indexes --project YOUR_FIREBASE_PROJECT_ID
   ```

   Account registration and role changes use Firestore directly and do not require Cloud Functions or the Blaze plan. Optional Cloud Functions for server-triggered notifications and push features require billing to be enabled.

   The Firestore composite indexes are required for report lists and other filtered views. If the app shows “The query requires an index,” deploy the indexes to the same project used by `.env.local`:

   ```powershell
   firebase deploy --only firestore:indexes --project YOUR_FIREBASE_PROJECT_ID
   ```

   Wait for the index build to finish in Firebase Console before retrying the query.

### Initial administrator and staff roles

Registration can create a student, faculty, or maintenance Firebase Authentication account and its matching `users/{uid}` Firestore profile. Maintenance registration is open. The Firestore profile role is the source of authorization, so registration and admin role changes do not need custom claims or Cloud Functions. Firestore rules allow only an active administrator to change another account's role, and the change is recorded in the audit log. Users cannot edit their own profile or remove their account.

For the first administrator, register an account normally. In Firebase Console, open Firestore Database, find `users/{uid}` for that account, and set its `role` field to `admin` and `active` to `true`. Find the UID in Authentication > Users. Deploy `firestore.rules` first; after setting the role, sign out and back in. Once the first administrator is active, manage later roles from the app's Users page. Do not allow users to update their own role in the rules.

If a user is changed to a different role while signed in, have them sign out and back in to reload their permissions.

After signing in as an administrator, use **Add standard campus options** in **Campus directory** to add Admin Building, Educ Building, IABE, ASTEER, Student Center, Gymnasium, Auditorium, Canteen, CAS Building, Entrep Building, Tourism Building, Agriculture and ENI Sci as campus buildings and report categories, along with a general “Building” category. You can also manage buildings and categories individually. Add rooms/areas when useful. Report submission requires these live directory records; an empty directory is shown as an unavailable selection rather than silently replaced with demo data.

### Firestore collections

- `users/{uid}` — profile, role, and active flag. Firestore rules use this protected profile role for authorization.
- `reports/{reportId}` — report details, location, workflow status, assignment, and resolution data. Existing Storage URLs in `imageUrls` remain displayable for older reports.
- `reportPhotos/{chunkId}` — private report and maintenance photo data, split into ordered chunks smaller than Firestore's 1 MiB document limit. New report creation writes the report, photo chunks, history, and notification atomically. To stay within Firestore transaction limits, combined report attachments are limited to 6 MB; each maintenance photo is limited to 5 MB.
- `reportHistory/{historyId}` — append-only status/action history with actor and server timestamp.
- `reportComments/{commentId}` — report-scoped comments.
- `notifications/{notificationId}` — recipient-scoped in-app updates.
- `buildings/{buildingId}`, `rooms/{roomId}`, `facilityCategories/{categoryId}` — administrator-managed campus directory.
- `announcements/{announcementId}` — campus facility announcements.
- `auditLogs/{logId}` — append-only privileged-change history.
- `users/{uid}/devices/{deviceId}` — the user's own FCM registration token for an Android device.

Assignments are stored on the report (`assignedToUid`, `assignedToName`, and timestamps); no separate assignment collection is required for the current workflow.

### Security notes

`firestore.rules` enforces report visibility, photo access, Firestore-backed role permissions, workflow transitions, account/profile fields, atomic append-only history, notification ownership, and audited administrative writes. Photo chunks are readable only by the report owner, assigned maintenance worker, or administrator. Firestore photo storage increases database storage and read usage compared with Firebase Storage. Deploy the rules before inviting users. Do not use permissive test rules in production.

Client-side route checks improve navigation only; they are not the authorization boundary. Firestore rules are authoritative for roles and data access. Optional Cloud Functions are used for server-triggered notifications and push delivery.

### Emulator setup and tests

Install the Firebase CLI, then start the Authentication, Firestore, Storage, and Functions emulators in one terminal:

```powershell
firebase emulators:start --project demo-campusfix-rules-test --only auth,firestore,storage,functions
```

Set these values in `.env.local` for a web app running on the same machine:

```dotenv
VITE_USE_FIREBASE_EMULATORS=true
VITE_FIREBASE_EMULATOR_HOST=127.0.0.1
```

For an Android emulator, use `VITE_FIREBASE_EMULATOR_HOST=10.0.2.2`. Restart Vite after changing emulator settings.

In another terminal, run:

```powershell
npm run test:unit -- --run
npm run test:rules:emulator
```

Or run the Firestore and Storage rules suites with automatically managed emulators:

```powershell
npm run test:rules
```

The rules tests use a `demo-` project ID and seeded emulator-only accounts/data. They do not access a production Firebase project.

## Build and deploy the web app

```powershell
npm run build
npm run preview
```

The production bundle is written to `dist`, matching Capacitor's `webDir`. Configure `.env.local` before the production build so the Firebase web configuration is embedded in the bundle.

To deploy Firebase Hosting after selecting the project:

```powershell
firebase deploy --only hosting
```

## Android development and APKs

The configured Capacitor app ID matches the existing Android application ID (`io.ionic.starter`). If the app ID is changed later, update the Android `namespace`/`applicationId` consistently before syncing.

```powershell
npm install
npm run build
npx cap sync android
npx cap open android
```

To install/run on a connected device or emulator:

```powershell
npx cap run android
```

To build a **debug APK** from PowerShell:

```powershell
Set-Location android
.\gradlew.bat assembleDebug
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk` if Gradle completes successfully. For a signed release APK, open the Android project in Android Studio and choose **Build → Generate Signed Bundle / APK → APK**. Keep the keystore and passwords outside source control.

If adding Android to a project where the platform is not present:

```powershell
npx cap add android
npx cap sync android
```

## Android push notifications

Push delivery is **not considered configured merely because the app has the plugin or displays the setup button**. To enable it:

1. Add the Android app with the exact package ID to Firebase Console and place the downloaded `google-services.json` at `android/app/google-services.json` (this file is ignored by Git).
2. Confirm the Google Services Gradle plugin is enabled for that Android app, then run `npx cap sync android`.
3. Deploy the Cloud Functions and Firestore/Storage rules. Cloud Functions and FCM generally require a Firebase Blaze billing plan; review current Firebase pricing and quotas.
4. Build and install the Android app, sign in, and use **Profile → Set up push** to grant notification permission and register the device token.
5. Send a test notification from a real report update and verify delivery on the target device.

Firestore listeners provide in-app notifications independently of push. This project does not claim web push support; the Capacitor registration flow targets Android. Push behavior has not been verified against a live Firebase project until the configuration and device test above are completed.

## Project layout

```text
src/
  components/       shared app shell/navigation
  firebase/         Firebase client and emulator connection
  models/           domain entity types
  router/           auth and role route guards
  services/         auth, reports, campus directory, notifications, push
  stores/           Pinia authentication/session state
  views/             auth, reporting, maintenance, and admin pages
  theme/             MinSU green Ionic theme
functions/
  src/               role provisioning, notification fan-out, FCM delivery
firestore.rules
storage.rules
firestore.indexes.json
```

## Validation

`npm run build` type-checks and produces the web production bundle. Unit tests cover workflow permissions and CSV escaping; Firestore and Storage rules tests run against the Firebase Emulator Suite. A Firebase deployment, live authentication, live image upload, and Android APK build require the project-specific setup described above and are not implied by a successful local web build.
#   C a m p u s F i x  
 