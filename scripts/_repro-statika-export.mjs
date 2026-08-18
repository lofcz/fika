/**
 * Repro: export of the SS Letecka "Statika1_2" deck (dead blob: srcs + Lato).
 * Loads the real production deck via the dev store bridge, clicks the real
 * export button, and samples the progress bar. Pass --no-lato to swap every
 * Lato reference to Arial (isolates the font-embed path as the hang).
 *
 *   node scripts/_repro-statika-export.mjs [--no-lato]
 */
import { chromium } from 'playwright'

const DEV_URL = 'http://127.0.0.1:5173/'
const NO_LATO = process.argv.includes('--no-lato')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const consoleErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', err => consoleErrors.push(`pageerror: ${err}`))

  await page.goto(DEV_URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForFunction(() => !!window.__FIKA_SLIDES__, { timeout: 30000 })
  await sleep(500)

  const loaded = await page.evaluate(async noLato => {
    let text = await (await fetch('/_e2e-statika.json')).text()
    if (noLato) text = text.replaceAll('Lato', 'Arial')
    const deck = JSON.parse(text)
    const store = window.__FIKA_SLIDES__.getState()
    store.setSlides(deck.slides, deck.theme, { clone: false })
    if (deck.title) store.setTitle(deck.title)
    if (deck.width) store.setViewportSize(deck.width)
    return { slides: store.slides.length, noLato }
  }, NO_LATO)
  console.log('deck loaded', JSON.stringify(loaded))
  await sleep(800)

  await page.click('[data-editor-tool="export"]')
  await page.waitForSelector('[data-export-format="pptx"]', { timeout: 10000 })

  const download = page.waitForEvent('download', { timeout: 90000 }).catch(() => null)
  await page.click('[data-export-format="pptx"]')

  const samples = []
  let finished = false
  for (let i = 0; i < 30; i++) {
    await sleep(2000)
    const value = await page.evaluate(() => {
      const bar = document.querySelector('[role="progressbar"]')
      return bar ? bar.getAttribute('aria-valuenow') : null
    })
    samples.push(value)
    const dl = await Promise.race([download, sleep(1).then(() => 'pending')])
    if (dl !== 'pending') { finished = true; break }
  }
  console.log('progress samples (every 2s)', JSON.stringify(samples))

  const dl = finished ? await download : null
  console.log('download', dl ? dl.suggestedFilename() : 'NONE (hang or failure)')
  console.log('consoleErrors', JSON.stringify(consoleErrors.slice(0, 12), null, 1))
} finally {
  await browser.close()
}
