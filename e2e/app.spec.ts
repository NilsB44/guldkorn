import { expect, test, type Page } from '@playwright/test'

/** Creates JPEG test photos inside the browser (no fixture files needed). */
async function makePhotos(page: Page, count: number) {
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

test.beforeEach(async ({ page }) => {
  // Privacy guard: the app must never contact any other server.
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && !['blob:', 'data:'].includes(url.protocol)) {
      throw new Error(`Unexpected external request: ${req.url()}`)
    }
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[browser error] ${msg.text()}`)
  })
})

test('full weekly round → album → photo book PDF', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Välj dina första guldkorn' })).toBeVisible()

  await page.getByRole('button', { name: 'Starta urvalet' }).click()
  await expect(page.getByText('Välj bilder', { exact: true })).toBeVisible()

  await page.getByTestId('file-input').setInputFiles(await makePhotos(page, 5))
  await expect(page.getByTestId('swipe-card')).toBeVisible()

  // Keep 3, skip 1, undo, skip 2
  await page.getByRole('button', { name: 'Behåll' }).click()
  await page.getByRole('button', { name: 'Behåll' }).click()
  await page.getByRole('button', { name: 'Hoppa över' }).click()
  await page.getByRole('button', { name: 'Ångra' }).click()
  await page.getByRole('button', { name: 'Behåll' }).click()
  await page.getByRole('button', { name: 'Hoppa över' }).click()
  await page.getByRole('button', { name: 'Hoppa över' }).click()

  await expect(page.getByRole('heading', { name: 'Dina guldkorn' })).toBeVisible()
  await page.getByRole('button', { name: 'Spara 3 guldkorn' }).click()
  await expect(page.getByRole('heading', { name: '3 nya guldkorn!' })).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: 'Se albumet' }).click()
  await expect(page.getByText('3 guldkorn')).toBeVisible()

  // Photo book
  await page.getByRole('button', { name: 'Fotobok' }).click()
  await expect(page.getByText('Omslag')).toBeVisible()
  await page.getByRole('button', { name: 'Skapa PDF' }).click()
  await expect(page.getByRole('button', { name: /Spara PDF/ })).toBeVisible({ timeout: 30_000 })

  // Home now shows progress and the round is no longer due.
  // (New URL: going to the same URL is a reload, which keeps the current view.)
  await page.goto('/?reopen')
  await expect(page.getByRole('heading', { name: /Nästa urval om 7 dagar/ })).toBeVisible()
  await expect(page.getByText('guldkorn totalt')).toBeVisible()
})

test('same photos are not saved twice', async ({ page }) => {
  await page.goto('/')
  const photos = await makePhotos(page, 2)
  for (const expected of ['swipe', 'notice']) {
    await page.getByRole('button', { name: /Starta urvalet|Gör ett extra urval/ }).click()
    await page.getByTestId('file-input').setInputFiles(photos)
    if (expected === 'swipe') {
      await page.getByRole('button', { name: 'Behåll' }).click()
      await page.getByRole('button', { name: 'Behåll' }).click()
      await page.getByRole('button', { name: 'Spara 2 guldkorn' }).click()
      await page.getByRole('button', { name: 'Till startsidan' }).click()
    } else {
      await expect(page.getByText('2 bilder var redan sparade')).toBeVisible()
    }
  }
})

test('settings persist', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Inställningar' }).click()
  await page.getByPlaceholder(/Visas som/).fill('Älskling')
  await page.getByRole('button', { name: 'Varannan' }).click()
  await expect(page.getByText('Urval varannan vecka')).toBeVisible() // saved
  await page.reload()
  await page.getByRole('button', { name: 'Hem' }).click()
  await expect(page.getByRole('heading', { name: 'Hej Älskling' })).toBeVisible()
  await expect(page.getByText('Urval varannan vecka')).toBeVisible()
})
