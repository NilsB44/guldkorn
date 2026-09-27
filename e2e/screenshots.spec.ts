import { test } from '@playwright/test'

// `npm run screenshots` → saves iPhone-sized screenshots of the main screens to ./screenshots
// (handy to review design changes without a phone). Skipped in the normal test run.
test.skip(!process.env.SCREENSHOTS, 'only with SCREENSHOTS=1')

test('screenshots', async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: `screenshots/${info.project.name}-${name}.png`, fullPage: true })

  await page.goto('/')
  await shot('1-home-empty')

  await page.goto('/?dev')
  await page.getByRole('button', { name: 'Inställningar' }).click()
  await page.getByPlaceholder(/Visas som/).fill('Älskling')
  await shot('5-settings')
  await page.getByRole('button', { name: 'Fyll med testbilder' }).click()
  await page.getByText('Testdata tillagd').waitFor({ timeout: 30_000 })

  await page.getByRole('button', { name: 'Hem' }).click()
  await page.getByText('guldkorn totalt').waitFor()
  await page.waitForTimeout(300)
  await shot('2-home')

  await page.getByRole('button', { name: 'Album', exact: true }).click()
  await page.waitForTimeout(300)
  await shot('3-albums')

  await page.getByRole('button', { name: /Hösten|Sommaren|Vintern|Våren/ }).first().click()
  await page.waitForTimeout(300)
  await shot('4-album')

  await page.getByRole('button', { name: 'Fotobok' }).click()
  await page.waitForTimeout(300)
  await shot('6-book')

  await page.goto('/?dev&round')
  await page.getByRole('button', { name: /Gör ett extra urval|Starta urvalet/ }).click()
  await shot('7-round-start')
  const files = await page.evaluate(async () => {
    const out: string[] = []
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('canvas')
      c.width = 900
      c.height = 1200
      const ctx = c.getContext('2d')!
      ctx.fillStyle = `hsl(${30 + i * 50}, 60%, 65%)`
      ctx.fillRect(0, 0, 900, 1200)
      out.push(c.toDataURL('image/jpeg', 0.8).split(',')[1])
    }
    return out
  })
  await page.getByTestId('file-input').setInputFiles(files.map((b, i) => ({ name: `s${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b, 'base64') })))
  await page.getByRole('button', { name: 'Behåll' }).click()
  await shot('8-swipe')
})
