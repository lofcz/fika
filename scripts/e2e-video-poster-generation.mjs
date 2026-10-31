import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const recording = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 160; canvas.height = 90
    const ctx = canvas.getContext('2d')
    const stream = canvas.captureStream(15)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks = []
    recorder.ondataavailable = event => chunks.push(event.data)
    const done = new Promise(resolve => { recorder.onstop = resolve })
    recorder.start()
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 160, 90)
      ctx.fillStyle = '#0000ff'; ctx.fillRect(80, 0, 80, 90)
      await new Promise(resolve => setTimeout(resolve, 80))
    }
    recorder.stop()
    await done
    stream.getTracks().forEach(track => track.stop())
    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }))
    })
  })
  const failures = []
  for (const mode of ['selection', 'navigation']) {
    let release
    const gate = new Promise(resolve => { release = resolve })
    const url = `http://127.0.0.1:5173/poster-test-${mode}.webm`
    await page.route(url, async route => {
      await gate
      await route.fulfill({ status: 200, contentType: 'video/webm', body: Buffer.from(recording, 'base64') })
    })
    await page.evaluate(url => {
      const slides = window.__FIKA_SLIDES__.getState()
      const poster = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="gray"/></svg>')
      slides.setSlides([0, 1].map(i => ({ id: `poster-${i}`, elements: [0, 1].map(j => ({
        id: `video-${i}-${j}`, type: 'video', left: 100 + j * 300, top: 100, width: 200, height: 100, rotate: 0, src: url, poster, autoplay: false,
      })) })))
      slides.updateSlideIndex(0)
      const main = window.__FIKA_MAIN__.getState()
      main.setActiveElementIdList(['video-0-0'])
      main.setEditorareaFocus(true)
    }, url)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    await page.getByRole('button', { name: 'Generate preview automatically', exact: true }).click()
    await page.waitForFunction(() => !!document.querySelector('video[style*="-9999px"]'))
    await page.evaluate(() => {
      const original = HTMLMediaElement.prototype.load
      window.finishedPosterProbes = 0
      HTMLMediaElement.prototype.load = function() {
        if (this.style.left === '-9999px' && !this.hasAttribute('src')) setTimeout(() => window.finishedPosterProbes++, 0)
        return original.call(this)
      }
    })
    await page.evaluate(() => { document.activeElement?.blur(); window.__FIKA_MAIN__.getState().setEditorareaFocus(true) })
    await page.keyboard.press(mode === 'selection' ? 'Tab' : 'PageDown')
    if (mode === 'selection') assert.deepEqual(await page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList), ['video-0-1'])
    else assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slideIndex), 1)
    if (mode === 'selection') {
      const ready = await page.getByRole('button', { name: 'Generate preview automatically', exact: true }).count()
      console.log({ readyForOtherVideo: ready })
      try { assert.equal(ready, 1, 'Selecting another video does not inherit the first video loading state') }
      catch (error) { failures.push(error.message) }
      await page.keyboard.press('Shift+Tab')
      assert.deepEqual(await page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList), ['video-0-0'])
      assert.equal(await page.getByRole('button', { name: 'Creating preview…', exact: true }).isDisabled(), true, 'Returning to the original video shows its pending job')
      await page.keyboard.press('Tab')
    }
    release()
    await page.waitForFunction(() => window.finishedPosterProbes > 0, undefined, { timeout: 20000 })
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    console.log(mode, after.map(slide => slide.elements.map(el => ({ id: el.id, generated: el.poster.startsWith('data:image/jpeg') }))))
    try {
      assert.ok(after[0].elements[0].poster.startsWith('data:image/jpeg'), 'Generated poster stays on the original video')
      assert.deepEqual(after[0].elements[1], before[0].elements[1], 'Selecting another video cannot redirect generation')
      assert.deepEqual(after[1], before[1], 'Navigation cannot redirect generation')
    } catch (error) { failures.push(error.message) }
    await page.unroute(url)
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
