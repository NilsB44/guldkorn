import type { Page } from '@playwright/test'

/** Creates JPEG test photos inside the browser (no fixture files needed). */
export async function makePhotos(page: Page, count: number) {
  const encoded = await page.evaluate(async (n) => {
    const out: string[] = []
    for (let i = 0; i < n; i++) {
      const c = document.createElement('canvas')
      c.width = i % 2 ? 600 : 800
      c.height = i % 2 ? 800 : 600
      const ctx = c.getContext('2d')!
      ctx.fillStyle = `hsl(${i * 60}, 70%, 60%)`
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.fillStyle = 'white'
      ctx.font = 'bold 120px sans-serif'
      ctx.fillText(String(i + 1), 300, 350)
      out.push(c.toDataURL('image/jpeg', 0.8).split(',')[1])
    }
    return out
  }, count)
  return encoded.map((b64, i) => ({ name: `IMG_${1000 + i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') }))
}

/** Detailed "real-looking" photos: a scene, a blurry copy of the same scene, and a different scene. */
export async function makeSimilarPhotos(page: Page) {
  const encoded = await page.evaluate(async () => {
    const draw = (hue: number, blur: boolean) => {
      const c = document.createElement('canvas')
      c.width = 800
      c.height = 600
      const ctx = c.getContext('2d')!
      const g = ctx.createLinearGradient(0, 0, 800, 600)
      g.addColorStop(0, `hsl(${hue}, 60%, 70%)`)
      g.addColorStop(1, `hsl(${hue + 40}, 50%, 35%)`)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 800, 600)
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = i % 2 ? '#fff' : '#222'
        ctx.beginPath()
        ctx.arc((i * 97) % 800, (i * 53) % 600, 12 + (i % 5) * 6, 0, Math.PI * 2)
        ctx.fill()
      }
      if (!blur) return c
      // Blur by shrinking and enlarging again (works in every browser).
      const small = document.createElement('canvas')
      small.width = 80
      small.height = 60
      small.getContext('2d')!.drawImage(c, 0, 0, 80, 60)
      const out = document.createElement('canvas')
      out.width = 800
      out.height = 600
      out.getContext('2d')!.drawImage(small, 0, 0, 800, 600)
      return out
    }
    return [draw(30, true), draw(30, false), draw(220, false)].map((c) => c.toDataURL('image/jpeg', 0.9).split(',')[1])
  })
  return encoded.map((b64, i) => ({ name: `DUP_${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') }))
}

