# ✨ Guldkorn

A small, private photo app: every week (or on any schedule) you pick your best photos,
they're collected into month / season / year albums, and an album can be exported as a
print-ready photo book PDF (or as plain images) for Önskefoto, CEWE, Photobox and similar services.

- **100 % local.** Photos are stored in the phone's browser storage (IndexedDB). No server, no accounts,
  no analytics. A strict Content-Security-Policy blocks all network traffic to other hosts, and GPS
  data is stripped when photos are saved.
- **Installable on iPhone** as a home-screen app (PWA). No App Store needed.
- **Gamified:** a weekly "urval" with swipe cards, a target number, a streak 🔥, confetti and milestones.

UI language: Swedish.

---

## Try it (on your PC and your Android phone)

Needs [Node.js](https://nodejs.org) (LTS).

```powershell
npm install          # first time only
npm run dev          # starts the app
```

- **PC:** open http://localhost:5173
- **Android phone on the same Wi-Fi:** open the `Network:` address that `npm run dev` prints
  (e.g. `http://192.168.1.23:5173`). Over plain http the share sheet and offline mode are off,
  but everything else works.
- **Quick test data:** Inställningar → *Utvecklare* → **Fyll med testbilder** (only visible in dev,
  or add `?dev` to the URL) adds 6 weeks of generated photos, so you can see albums, streaks and
  the photo book right away.
- Keyboard while swiping: `←` skip, `→` keep.

## Tests

```powershell
npm test             # unit tests (dates, streaks, album ranges, book layout, calendar)
npm run test:e2e     # full flow in WebKit/iPhone 15 + Chrome/Pixel 7 emulation
npm run screenshots  # iPhone-sized screenshots of every screen → ./screenshots
```

The end-to-end test also fails if the app makes **any** request to another server (privacy guard).
First time: `npx playwright install webkit chromium`.

WebKit is Safari's engine, so the `iphone` project is the closest you get to her phone without having it.
It's not a real iOS device, though. Try it once on any iPhone before you give it to her if you can.

## Publish (free, GitHub Pages)

1. Create an empty repo on GitHub (it can be public; photos are never in the repo or on the site, only the app code).
2. `git remote add origin https://github.com/<you>/guldkorn.git` and `git push -u origin main`
3. On GitHub: **Settings → Pages → Source: GitHub Actions**.
4. Every push to `main` runs the tests and deploys to `https://<you>.github.io/guldkorn/`.

Alternative: `npm run build` and drag the `dist` folder onto https://app.netlify.com/drop.

## Giving it to her 🎁

Open the link **in Safari** on her iPhone → **Dela** (share icon) → **Lägg till på hemskärmen**.
Then always open it from the home-screen icon. On iOS the home-screen app has its own storage,
separate from Safari tabs; the app shows a hint about this when it's opened in Safari.

Personalise first: set her name in `src/config.ts` (`recipientName`), or she can type it in Inställningar.

## Good to know (iPhone limitations & choices)

| Topic | How it works |
|---|---|
| Picking photos | The web can't browse the photo library by date on its own. She picks photos in the normal iOS picker (drag a finger to select many). The app reads each photo's EXIF date, sorts them, flags ones older than the period and skips photos she has already saved. |
| Reminders | Web push would need a server, so there's none. Inställningar → **Lägg till i kalendern** creates a recurring calendar event with an alarm, generated on the phone. The app also shows when the next round is due. |
| Storage | Home-screen apps aren't subject to Safari's 7-day cleanup, and the app asks for persistent storage. Photos are saved at ≤3000 px (≈300 dpi for a photo book page) as JPEG. |
| Backup | Everything lives only on the phone. Inställningar → **Säkerhetskopia** makes a .zip (photos + captions + albums) she can save to Filer/iCloud, and **Återställ** restores it. Suggest she does this now and then. |
| Photo book | Pick a format (21×21 square, A4 landscape/portrait) and a layout (auto or 1–4 photos per page). Tapping a photo in an album lets her add a caption, and captioned photos get their own page. The PDF is 300 dpi. Many print services also accept the plain images via **Exportera** → "Spara i Bilder". |

## Project layout

```
src/
  config.ts            ← name, defaults, image quality
  index.css            ← 🎨 theme: colours, fonts, radius (@theme block)
  db.ts                ← IndexedDB schema (Dexie)
  nav.ts               ← tiny history-based navigation
  components/          ← Home, Round (swipe flow), Albums, AlbumDetail, BookView, Settings, ui
  lib/                 ← dates/streaks, images (EXIF + resize), book layout, pdf, backup, calendar, share
e2e/                   ← Playwright tests
```

Restyling: change the colours in `src/index.css` and everything follows.
