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
  const finish = async color => {
    await page.evaluate(color => window.pendingReads[`${color}.svg`](), color)
  }
  const failures = []
  for (const mode of ['self-locked', 'parent-locked', 'unlocked']) {
    await page.evaluate(() => {
      const slides = window.__FIKA_SLIDES__.getState()
      const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="gray"/></svg>')
      slides.setSlides([{ id:'lock-slide', elements:[
        {id:'parent',type:'shape',left:50,top:50,width:400,height:250,rotate:0,viewBox:[400,250],path:'M0 0H400V250H0Z',fill:'#ffffff',fixedRatio:false,frame:{clipContent:true}},
        {id:'image',type:'shape',parentFrameId:'parent',left:100,top:100,width:200,height:100,rotate:0,viewBox:[200,100],path:'M0 0H200V100H0Z',fill:'#ffffff',pattern:src,fixedRatio:false},
      ]}])
      slides.updateSlideIndex(0)
      const main = window.__FIKA_MAIN__.getState()
      main.setActiveElementIdList(['image'])
      main.setToolbarState('elStyle')
      main.setEditorareaFocus(true)
      window.pendingReads = {}
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
    await choose('red')
    if (mode !== 'unlocked') {
      await page.evaluate(mode => window.__FIKA_SLIDES__.getState().updateElement({
        id: mode === 'self-locked' ? 'image' : 'parent', props: { lock: true },
      }), mode)
    }
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
    await finish('red')
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
    console.log(mode, { replaced: after[1].pattern === sources.red })
    try {
      if (mode === 'unlocked') assert.equal(after[1].pattern, sources.red, 'Unlocked images can still be replaced')
      else assert.deepEqual(after, before, 'Locks applied during loading prevent replacement')
      console.log(`PASS ${mode}`)
    } catch (error) { failures.push(error.message) }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
