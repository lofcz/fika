import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const failures = []
  for (const scenario of ['initial', 'focused', 'pending']) {
    const initial = scenario === 'initial'
    await page.evaluate(initial => {
      window.__FIKA_MAIN__.setState({ readOnly: initial })
      const store = window.__FIKA_SLIDES__.getState()
      store.setSlides([{ id: `remark-readonly-${initial}`, elements: [], remark: '<p>Original notes</p>' }])
      store.updateSlideIndex(0)
    }, initial)
    const editor = page.locator('.remark .ProseMirror')
    await editor.waitFor()
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    if (initial) await editor.focus()
    else await editor.click()
    if (scenario === 'pending') {
      await page.keyboard.press('Control+a')
      await page.keyboard.insertText('Accepted draft')
      before[0].remark = await editor.innerHTML()
    }
    if (!initial) await page.evaluate(() => window.__FIKA_MAIN__.setState({ readOnly: true }))
    await page.waitForTimeout(100)
    await page.keyboard.insertText(' Forbidden')
    await page.waitForTimeout(700)
    const editable = await editor.getAttribute('contenteditable')
    const visible = await editor.textContent()
    console.log({ scenario, editable, visible })
    try {
      assert.equal(editable, 'false')
      assert.equal(visible, scenario === 'pending' ? 'Accepted draft' : 'Original notes')
      assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), before)
      assert.equal(await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor), scenario === 'pending' ? 1 : 0)
    } catch (error) { failures.push(error.message) }
    await page.evaluate(() => window.__FIKA_MAIN__.setState({ readOnly: false }))
    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.insertText('Allowed notes')
    await page.waitForTimeout(700)
    assert.equal(await editor.textContent(), 'Allowed notes')
    assert.match(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].remark), /Allowed notes/)
    await page.evaluate(() => document.activeElement?.blur())
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
  console.log('PASS speaker notes honor initial and changing read-only state')
} finally { await browser.close() }
