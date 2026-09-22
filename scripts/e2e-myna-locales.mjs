import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const base = process.env.FIKA_TEST_URL || 'http://127.0.0.1:5178'
const locales = [
  { id: 'en', title: 'Untitled design', download: 'Download', name: 'English' },
  { id: 'cs', title: 'Návrh bez názvu', download: 'Stáhnout', name: 'Čeština' },
  { id: 'sk', title: 'Návrh bez názvu', download: 'Stiahnuť', name: 'Slovenčina' },
  { id: 'pl', title: 'Projekt bez nazwy', download: 'Pobierz', name: 'Polski' },
]
const errors = []
try {
  for (const locale of locales) {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/?mode=myna&locale=${locale.id}`, { waitUntil: 'networkidle' })
    await page.locator('[data-myna-workspace]').waitFor()
    await page.getByRole('button', { name: locale.download, exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().title), locale.title)
    // The starter's editable content and template labels must be in the initial UI language.
    const contents = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements.filter(e => e.type === 'text').map(e => e.content).join(''))
    if (locale.id !== 'en') assert.ok(!contents.includes('THE CREATIVE EDIT'))
    await page.close()
  }
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/?mode=myna&locale=en`, { waitUntil: 'networkidle' })
  await page.locator('[data-myna-workspace]').waitFor()
  const before = await page.evaluate(() => JSON.stringify(window.__FIKA_SLIDES__.getState().slides))
  for (const locale of locales.slice(1)) {
    await page.locator('button').filter({ has: page.locator('[class*=locale-code]') }).click()
    await page.getByText(locale.name, { exact: true }).click()
    await page.getByRole('button', { name: locale.download, exact: true }).waitFor()
    assert.equal(await page.evaluate(() => JSON.stringify(window.__FIKA_SLIDES__.getState().slides)), before)
    assert.equal(new URL(page.url()).searchParams.get('locale'), locale.id)
  }
  assert.deepEqual(errors, [])
  console.log('Myna locale startup and live language switching passed (en, cs, sk, pl).')
} finally { await browser.close() }
