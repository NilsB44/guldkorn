// Renders the source images for the native app icons and splash screens into ./assets,
// then run:  npx @capacitor/assets generate --ios --android (see "npm run native:assets").
import { mkdirSync, readFileSync } from 'node:fs'
import sharp from 'sharp'

const PAPER = '#faf7f2'
const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8')
// The artwork without the rounded background (iOS/Android add their own icon shape).
const art = svg.replace(/<rect width="512" height="512" rx="112" fill="#faf7f2"\/>/, '')
const out = (name) => new URL(`../assets/${name}`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')

mkdirSync(new URL('../assets/', import.meta.url), { recursive: true })

const artwork = (size) => sharp(Buffer.from(art)).resize(size, size).png().toBuffer()
const canvas = (size, transparent = false) =>
  sharp({ create: { width: size, height: size, channels: 4, background: transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : PAPER } })

// iOS icon: square, no transparency.
await canvas(1024).composite([{ input: await artwork(1024) }]).flatten({ background: PAPER }).png().toFile(out('icon-only.png'))
// Android adaptive icon: artwork inside the ~66% safe zone on a transparent layer + solid background.
await canvas(1024, true).composite([{ input: await artwork(680), gravity: 'center' }]).png().toFile(out('icon-foreground.png'))
await canvas(1024).png().toFile(out('icon-background.png'))
// Splash screens.
for (const name of ['splash.png', 'splash-dark.png']) {
  await canvas(2732).composite([{ input: await artwork(640), gravity: 'center' }]).png().toFile(out(name))
}
console.log('Native asset sources written to ./assets')
