import { expect, test } from '@playwright/test'
import { makePhotos, makeSimilarPhotos } from './photos'

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
  await expect(page.getByRole('heading', { name: /Nästa urval/ })).toBeVisible()
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

test('direct mode skips swiping', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Inställningar' }).click()
  await page.getByRole('button', { name: 'Direkt (snabbt)' }).click()
  await expect(page.getByText(/Välj dina favoriter direkt/)).toBeVisible()
  await page.getByRole('button', { name: 'Hem' }).click()
  await page.getByRole('button', { name: 'Starta urvalet' }).click()
  await page.getByTestId('file-input').setInputFiles(await makePhotos(page, 3))
  await expect(page.getByRole('heading', { name: 'Dina guldkorn' })).toBeVisible()
  await page.getByRole('button', { name: 'Spara 3 guldkorn' }).click()
  await expect(page.getByRole('heading', { name: '3 nya guldkorn!' })).toBeVisible({ timeout: 20_000 })
})

test('similar photos are grouped and the sharpest is suggested', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Starta urvalet' }).click()
  await page.getByTestId('file-input').setInputFiles(await makeSimilarPhotos(page))

  await expect(page.getByRole('heading', { name: 'Välj den bästa' })).toBeVisible({ timeout: 20_000 })
  const strip = page.getByTestId('duplicate-strip').getByRole('button')
  await expect(strip).toHaveCount(2)
  // The sharp photo (2nd) is pre-selected as the suggestion.
  await expect(strip.nth(1).locator('.bg-keep')).toBeVisible()
  await expect(strip.nth(0).locator('.bg-keep')).toHaveCount(0)

  await page.getByRole('button', { name: /Klar · behåller 1/ }).click()
  // Blurry one dropped → 2 photos left to swipe, with time-of-day metadata on the card.
  await expect(page.getByText('1 av 2')).toBeVisible()
  await expect(page.getByTestId('photo-meta')).toContainText(/morgon|förmiddag|eftermiddag|kväll|natt/)
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
