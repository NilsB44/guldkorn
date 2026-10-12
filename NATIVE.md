# Guldkorn as a native app (iPhone + Android)

The web app can only see photos she picks in the system picker; that's an iOS/Android rule for websites.
The **native app** is the same code wrapped with [Capacitor](https://capacitorjs.com), and it can ask
**"Allow access to all photos?"**. After that, every round fetches the period's photos automatically,
including GPS positions and iPhone burst information.

```
src/ (React app) ──npm run build──▶ dist/ ──npx cap sync──▶ ios/  (Xcode project)
                                                         └─▶ android/ (Gradle project)
plugins/photo-library/   our own native plugin: PhotoKit (Swift) + MediaStore (Java)
```

| | Web / PWA | Native app |
|---|---|---|
| Getting photos | She selects them in the picker | Automatic: all photos from the period |
| Location | Usually stripped by the browser | From the photo library |
| Reminders | Web push via `push-server/` | Local notifications (no server) |
| Duplicates / best-photo suggestion | ✓ | ✓ (+ iPhone burst groups) |
| Install | Link → "Lägg till på hemskärmen" | TestFlight (iPhone) / APK (Android) |

Everything stays on the phone in both versions.

## Android (free, test on your own phone)

Every push to GitHub builds an APK: **Actions → "Native apps" → latest run → Artifacts → guldkorn-android**
(unzip it to get `app-debug.apk`). Or build locally:

```powershell
npm run native:sync
cd android; .\gradlew assembleDebug    # → android\app\build\outputs\apk\debug\app-debug.apk
```

Install: send the APK to your phone, open it, and allow "install unknown apps" for the app you opened it with.
All builds share one debug key (`android/app/debug.keystore`), so a new APK installs over the old one and keeps the data.

Local builds need JDK 21 and the Android SDK (`JAVA_HOME`, `ANDROID_HOME`). On this PC they're in
`%LOCALAPPDATA%\jdk\jdk-21…` and `%LOCALAPPDATA%\Android\Sdk`.

## iPhone (needs an Apple Developer account)

Apple only lets you install your own app on someone else's iPhone through TestFlight (or the App Store),
and that requires the **Apple Developer Program (99 USD/year)**. No Mac is needed: GitHub's Mac machines build
the app (`.github/workflows/native.yml` already compiles it on every push).

1. Join at https://developer.apple.com/programs/ (approval can take a day or two).
2. https://appstoreconnect.apple.com → **Apps → +** → New App: platform iOS, name *Guldkorn* (or any unique
   name), bundle id **io.github.nilsb44.guldkorn** (register it first under Certificates, IDs & Profiles → Identifiers if it's not in the list).
3. App Store Connect → **Users and Access → Integrations → App Store Connect API** → generate a key with role **Admin**.
   Download the `.p8` file (only possible once) and note the *Key ID* and *Issuer ID*.
4. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   `APPLE_TEAM_ID`, `APPSTORE_API_KEY_ID`, `APPSTORE_API_ISSUER_ID`, `APPSTORE_API_KEY_P8` (paste the whole .p8 file).
5. GitHub → **Actions → "iOS → TestFlight" → Run workflow**. About 15 minutes later the build appears in App Store Connect → TestFlight.
6. TestFlight → **Internal testing** → add her Apple ID email as a tester (internal testers need no Apple review).
   She installs the **TestFlight** app from the App Store, accepts the invite, and taps Install.

TestFlight builds expire after 90 days. Run the workflow again to send her a fresh build (her data stays).

### Moving her data from the web app to the native app
They're separate apps with separate storage. In the web app: Inställningar → **Säkerhetskopia → Skapa kopia → Spara**
(e.g. to Filer). In the native app: Inställningar → **Återställ** and pick that file. Then turn off reminders in the
web app so she doesn't get two.

## Changing native code
- Plugin API: `plugins/photo-library/index.d.ts`. Implementations: `ios/Sources/PhotoLibraryPlugin/PhotoLibraryPlugin.swift`
  and `android/src/main/java/se/guldkorn/photolibrary/PhotoLibraryPlugin.java`.
- After changing web code or plugins: `npm run native:sync`.
- iOS permission text: `ios/App/App/Info.plist` → `NSPhotoLibraryUsageDescription`.
- Icons/splash: edit `public/icon.svg`, then `npm run native:assets`.
- iOS compile errors show up as annotations on the "Native apps" run in GitHub Actions.
