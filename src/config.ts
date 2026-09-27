// ✏️ Quick personalisation. Colours and fonts live in src/index.css (@theme block).

export type AlbumSize = 'month' | 'season' | 'year'
export type PickMode = 'swipe' | 'direct'

export const config = {
  appName: 'Guldkorn',
  tagline: 'Samla veckans bästa bilder till album och fotoböcker',

  // Shown as "Hej <namn>" on the home screen. She can also change it in Inställningar.
  recipientName: '',

  // URL of the push-notification Worker (see push-server/README.md), e.g.
  // 'https://guldkorn-push.<your-account>.workers.dev'. Empty = push reminders hidden.
  pushServerUrl: '',

  // Defaults for a fresh install (all editable in Inställningar).
  defaults: {
    cadenceDays: 7, // how often a new "urval" is due
    picksPerRound: 10, // target number of photos to keep per round
    albumSize: 'season' as AlbumSize, // month | season | year
    reminderWeekday: 0, // 0 = söndag … 6 = lördag
    reminderTime: '19:00',
    pickMode: 'swipe' as PickMode, // swipe = pick a bunch, then swipe | direct = pick favourites straight away
  },

  // Days after the due date before a streak is considered broken.
  streakGraceDays: 2,

  // Stored image quality. 3000px long edge ≈ 300 dpi on a 25 cm photo book page.
  image: { maxEdge: 3000, quality: 0.9, thumbEdge: 480, thumbQuality: 0.8 },
}
