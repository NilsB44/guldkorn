# Guldkorn — notes for Claude

Private photo-selection PWA, built as a gift for an iPhone user. The developer tests on Android and Windows.
UI copy is **Swedish**. Code and comments are English.

## Commands
- `npm run dev`: dev server (also on LAN for phone testing)
- `npm test`: Vitest unit tests (`src/**/*.test.ts`, pure logic only)
- `npm run test:e2e`: Playwright against the production build; projects `iphone` (WebKit) and `android` (Chromium)
- `npm run screenshots`: iPhone screenshots of all screens into `./screenshots` (look at them after UI changes)
- `npm run build`: `tsc -b` + Vite build
- Windows/PowerShell: if `node`/`npm` aren't found, refresh PATH:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`

Run `npm test` and `npm run test:e2e` before committing.

## Hard rules
- **Privacy:** no network requests to other hosts: no CDNs, web fonts, analytics or APIs. The CSP in
  `vite.config.ts` enforces this, and the e2e test fails on any external request. Add libraries via npm only.
- **Store images as ArrayBuffer, never Blob,** in IndexedDB. WebKit sometimes fails to store Blobs.
  Use `jpegBlob()` from `db.ts` to turn stored bytes back into a Blob.
- **No `confirm()`/`alert()`.** Use `ConfirmButton` (two taps) from `components/ui.tsx`.
- **`navigator.share` must run directly from a tap.** Prepare files first, then show a "Spara" button
  (pattern used in AlbumDetail, BookView, Settings).
- Don't use `crypto.randomUUID` (needs https; LAN testing is http). Use `newId()`.
- Don't write to the DB inside `useLiveQuery` callbacks.
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
