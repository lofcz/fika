import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(() => {
    const original = FileReader.prototype.readAsDataURL
    window.pendingReads = {}
    FileReader.prototype.readAsDataURL = function(file) {
      window.pendingReads[file.name] = () => new Promise(resolve => {
        this.addEventListener('load', () => setTimeout(resolve, 0), { once: true })
        original.call(this, file)
      })
    }
  })
  const sources = {}
  const choose = async color => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="${color}"/></svg>`
    sources[color] = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
    await page.locator('[class*="pattern-image"]').locator('..').locator('input[type=file]').setInputFiles({
      name: `${color}.svg`, mimeType: 'image/svg+xml', buffer: Buffer.from(svg),
    })
  }
  const finish = color => page.evaluate(color => window.pendingReads[`${color}.svg`](), color)
  const failures = []
  for (const mode of ['navigation', 'selection', 'older-first', 'newer-first']) {
    await page.evaluate(() => {
      const slides = window.__FIKA_SLIDES__.getState()
      const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="gray"/></svg>')
      slides.setSlides([0, 1].map(i => ({ id: `image-${i}`, elements: [0, 1].map(j => ({id:`shape-${i}-${j}`,type:'shape',left:100+j*300,top:100,width:200,height:100,rotate:0,viewBox:[200,100],path:'M0 0H200V100H0Z',fill:'#ffffff',pattern:src,fixedRatio:false})) })))
      slides.updateSlideIndex(0)
      const main = window.__FIKA_MAIN__.getState()
      main.setActiveElementIdList(['shape-0-0'])
      main.setToolbarState('elStyle')
      main.setEditorareaFocus(true)
      window.pendingReads = {}
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    await choose('red')
    if (mode === 'navigation' || mode === 'selection') {
      await page.keyboard.press(mode === 'navigation' ? 'PageDown' : 'Tab')
      if (mode === 'navigation') assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slideIndex), 1)
      else assert.deepEqual(await page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList), ['shape-0-1'])
      await finish('red')
    } else {
      await choose('blue')
      for (const color of mode === 'older-first' ? ['red', 'blue'] : ['blue', 'red']) await finish(color)
    }
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    console.log(mode, { originalRed: after[0].elements[0].pattern === sources.red, originalBlue: after[0].elements[0].pattern === sources.blue })
    try {
      assert.equal(after[0].elements[0].pattern, sources[mode === 'navigation' || mode === 'selection' ? 'red' : 'blue'], `${mode}: the latest requested image reaches the original shape`)
      assert.deepEqual(after[1], before[1], 'The other slide remains unchanged')
      assert.deepEqual(after[0].elements[1], before[0].elements[1], 'The other shape remains unchanged')
      if (mode === 'selection') {
        const preview = await page.locator('[class*="pattern-image"] [class*="content"]').evaluate(el => el.style.backgroundImage)
        assert.ok(preview.includes(before[0].elements[1].pattern), 'The sidebar still previews the selected shape')
      }
      console.log(`PASS ${mode}`)
    } catch (error) { failures.push(error.message) }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
