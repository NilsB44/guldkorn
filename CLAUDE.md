# Guldkorn — notes for Claude

Private photo-selection app, built as a gift for an iPhone user. It ships as a PWA (GitHub Pages) **and** as a
native Capacitor app (iOS via TestFlight, Android APK) from the same code; see NATIVE.md. The developer tests on Android and Windows.
UI copy is **Swedish**. Code and comments are English.

## Commands
- `npm run dev`: dev server (also on LAN for phone testing)
- `npm test`: Vitest unit tests (`src/**/*.test.ts`, pure logic only)
- `npm run test:e2e`: Playwright against the production build; projects `iphone` (WebKit) and `android` (Chromium)
- `npm run screenshots`: iPhone screenshots of all screens into `./screenshots` (look at them after UI changes)
- `npm run build`: `tsc -b` + Vite build
- `npm run native:sync`: build + copy into `ios/` and `android/`. `npm run native:assets`: regenerate native icons/splash
- Android APK locally: `cd android; ./gradlew assembleDebug` (needs JAVA_HOME = JDK 21, ANDROID_HOME). On this PC:
  `%LOCALAPPDATA%\jdk\jdk-21.0.12.1+1` and `%LOCALAPPDATA%\Android\Sdk`
- iOS can't be built on Windows. Push to a branch and check the "Native apps" GitHub Actions run. Swift errors appear as
  annotations, readable without login at `https://api.github.com/repos/NilsB44/guldkorn/check-runs/<job id>/annotations`
- Windows/PowerShell: if `node`/`npm` aren't found, refresh PATH:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`

Run `npm test` and `npm run test:e2e` before committing.

## Hard rules
- **Privacy:** no network requests to other hosts: no CDNs, web fonts, analytics or APIs. The one
  exception is the push Worker (`config.pushServerUrl`), which only ever receives the push subscription
  and reminder schedule and text, never photos or personal data. The CSP in `vite.config.ts` enforces this,
  and the e2e test fails on any external request. Add libraries via npm only.
- A web app can't read the iOS photo library directly; in the PWA, photos come only from `<input type="file">`.
  Full library access exists only in the native app (`plugins/photo-library`, used via `src/lib/native.ts`).
  Always branch on `isNative()`: web code paths must keep working.
- Import native-only Capacitor plugins dynamically (see `push.ts`, `share.ts`) so the web bundle stays lean.
- Location, place and camera are stored only in IndexedDB. Exported and backed-up JPEGs are re-encoded and carry no EXIF.
- Work on a branch and merge to `main` only when unit, e2e and native CI pass: `main` deploys straight to her web app.
- **Store images as ArrayBuffer, never Blob,** in IndexedDB. WebKit sometimes fails to store Blobs.
  Use `jpegBlob()` from `db.ts` to turn stored bytes back into a Blob.
- **No `confirm()`/`alert()`.** Use `ConfirmButton` (two taps) from `components/ui.tsx`.
- **`navigator.share` must run directly from a tap.** Prepare files first, then show a "Spara" button
  (pattern used in AlbumDetail, BookView, Settings).
- Don't use `crypto.randomUUID` (needs https; LAN testing is http). Use `newId()`.
- Don't write to the DB inside `useLiveQuery` callbacks.
- **Her photos must survive every update.** Never change or remove existing tables or indexes in `db.ts`
  in place. Add a new `this.version(n + 1).stores(...)` with an `.upgrade()` if data needs migrating.
  New optional fields don't need a version bump. Settings fall back to `defaultSettings` for missing keys.
- Keep the URL stable (GitHub user `NilsB44`, repo `guldkorn`). Her data belongs to the origin
  `nilsb44.github.io`, so a rename means her old data won't show up at the new address.
- Test on iPhone-sized viewports. Respect safe areas (`pt-safe`/`pb-safe`) and keep inputs ≥16px.

## Architecture
- Albums are **date ranges**: a photo belongs to every album whose range contains its `takenAt`.
  Automatic albums (`kind: month|season|year`) are created by `ensureAlbums()`. Custom albums have `kind: 'custom'`.
- A "round" (urval) covers the photos since the last round's `periodEnd`. The next round is due
  `cadenceDays` after that (`roundStatus` in `lib/dates.ts`). Streak logic is `computeStreak`.
- The photo book is `layoutBook()` → `BookPage[]`. The HTML preview (BookView) and the PDF (`lib/pdf.ts`,
  lazily imported jsPDF) render from the same layout.
- Theme tokens are in the `@theme` block of `src/index.css`. Personal defaults are in `src/config.ts`.
- Navigation: `nav.ts` (history.pushState, no router, so it works on static hosting under any base path).
- Deploy: `.github/workflows/deploy.yml` → GitHub Pages with `BASE_PATH=/<repo>/`.
  Live at https://nilsb44.github.io/guldkorn/
- Push: `src/lib/push.ts` (client), `public/push-sw.js` (service-worker push/click handlers, pulled in via
  workbox `importScripts`), `push-server/` (Cloudflare Worker + KV + 15-minute cron; `npm test` and
  `npm run deploy` inside that folder). The app computes `nextAt` (`reminderPayload`) and syncs it on open,
  after rounds and on settings changes (`usePushSync` in App.tsx). Due time snaps to the reminder weekday/time
  (`roundStatus(..., reminder)`).
- Round flow: picked files are auto-filtered to the current period (`inPeriod`), with older ones in `hiddenOlder`.
  `pickMode: 'direct'` skips swiping.
- Round sources: `src/lib/sources.ts` turns picked files or library photos into `Candidate`s; the flow afterwards is the same.
  Steps: pick → loading (place lookup + analysis) → duplicates → swipe/review → saving → done.
- Duplicates: `src/lib/similar.ts` (dHash + time window + burst id + average colour; flat images are never matched on hash;
  best = sharpness × exposure). Pure functions are unit-tested; `analyzePhoto` runs in the browser. UI: `components/Duplicates.tsx`.
- Places: `public/places.tsv` (GeoNames, CC BY 4.0, built by `scripts/build-places.mjs`), looked up offline in `src/lib/places.ts`.
