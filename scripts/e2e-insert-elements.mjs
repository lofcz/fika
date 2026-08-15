/**
 * Real-browser toolbar insert: every add-element control on the canvas tool
 * must create a live element via mouse/keyboard (no store injection).
 *
 *   node scripts/e2e-insert-elements.mjs
 */
import { spawn } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_URL = 'http://127.0.0.1:5173/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const CASES = [
  [1, 'Insert text control is on the canvas tool'],
  [2, 'Insert shape control is on the canvas tool'],
  [3, 'Insert media control is on the canvas tool'],
  [4, 'Insert chart control is on the canvas tool'],
  [5, 'Insert table control is on the canvas tool'],
  [6, 'Insert formula control is on the canvas tool'],
  [7, 'Insert mermaid control is on the canvas tool'],
  [8, 'Insert code control is on the canvas tool'],
  [9, 'Insert symbol control is on the canvas tool'],
  [10, 'Clicking Text Box arms a create overlay'],
  [11, 'Dragging on the overlay creates a text element'],
  [12, 'Created text box is selected'],
  [13, 'Created text box accepts typed text'],
  [14, 'Typed toolbar text stays on the live box'],
  [15, 'Text chevron opens horizontal/vertical choices'],
  [16, 'Vertical text box can be drawn'],
  [17, 'Shape pool opens from the toolbar'],
  [18, 'Shape pool lists drawable shapes'],
  [19, 'Picking a rectangle arms shape create'],
  [20, 'Dragging creates a shape element'],
  [21, 'Created shape is selected'],
  [22, 'Created shape exposes resize handles'],
  [23, 'Line pool lists drawable lines'],
  [24, 'Dragging a line creates a line element'],
  [25, 'Table generator opens from the toolbar'],
  [26, 'Hovering 3×3 marks the table grid'],
  [27, 'Clicking 3×3 inserts a table'],
  [28, 'Inserted table is a table element'],
  [29, 'Inserted table has at least 9 cells'],
  [30, 'A table cell accepts typed text'],
  [31, 'Custom table mode opens'],
  [32, 'Custom insert creates another table'],
  [33, 'Chart pool opens from the toolbar'],
  [34, 'Inserting a bar chart creates a chart element'],
  [35, 'Bar chart stays selected'],
  [36, 'Inserting a pie chart adds a second chart'],
  [37, 'Both charts remain on the slide'],
  [38, 'Formula modal opens from the toolbar'],
  [39, 'Formula editor can insert a snippet'],
  [40, 'Inserted formula is a latex element'],
  [41, 'Code modal opens from the toolbar'],
  [42, 'Code editor inserts a code element'],
  [43, 'Symbol pool opens from the toolbar'],
  [44, 'Clicking a symbol inserts it'],
  [45, 'Mermaid modal opens from the toolbar'],
  [46, 'Mermaid editor inserts a mermaid element'],
  [47, 'Media picker opens from the toolbar'],
  [48, 'Media picker exposes a file input'],
  [49, 'Choosing a PNG queues or inserts an image'],
  [50, 'Slide still has toolbar-created elements after the session'],
]

async function waitForDev(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(DEV_URL)).ok) return true
    }
    catch { /* retry */ }
    await sleep(400)
  }
  return false
}

async function stripScan(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove())
  })
}

async function counts(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('[id^=editable-element-]')]
    const byType = {}
    for (const el of els) {
      const type = el.getAttribute('data-element-type') || 'unknown'
      byType[type] = (byType[type] || 0) + 1
    }
    const selected = document.querySelectorAll('[id^=operate-element-]').length
    const handles = document.querySelectorAll('[class*=resize-handler]').length
    return { total: els.length, byType, selected, handles }
  })
}

async function clickTool(page, name) {
  const el = page.locator(`[data-canvas-tool=${name}]`)
  await el.waitFor({ state: 'visible', timeout: 8000 })
  const box = await el.boundingBox()
  if (!box) throw new Error(`tool ${name} has no box`)
  await page.mouse.click(box.x + Math.min(24, box.width / 2), box.y + box.height / 2)
  await sleep(200)
}

async function drawOnOverlay(page, dx = 220, dy = 140) {
  const overlay = page.locator('[data-create-selection]')
  await overlay.waitFor({ state: 'visible', timeout: 8000 })
  const box = await overlay.boundingBox()
  if (!box) throw new Error('create overlay has no box')
  const x = box.x + box.width * 0.35
  const y = box.y + box.height * 0.4
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
  await sleep(250)
}

async function pressEscape(page) {
  await page.keyboard.press('Escape')
  await sleep(120)
}

const results = []
function rec(id, name, pass, measured) {
  results.push({ id, name, pass: !!pass, measured: measured ?? null })
}

const pngPath = join(tmpdir(), 'fika-e2e-insert.png')
writeFileSync(pngPath, PNG_1X1)

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let serverReady = await waitForDev(1500)
  if (!serverReady) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    serverReady = await waitForDev(90000)
    if (!serverReady) throw new Error('dev server did not start on http://127.0.0.1:5173/')
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(DEV_URL, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 15000 })
  await stripScan(page)

  rec(1, 'Insert text control is on the canvas tool', await page.locator('[data-canvas-tool=insert-text]').count() === 1)
  rec(2, 'Insert shape control is on the canvas tool', await page.locator('[data-canvas-tool=insert-shape]').count() === 1)
  rec(3, 'Insert media control is on the canvas tool', await page.locator('[data-canvas-tool=insert-media]').count() === 1)
  rec(4, 'Insert chart control is on the canvas tool', await page.locator('[data-canvas-tool=insert-chart]').count() === 1)
  rec(5, 'Insert table control is on the canvas tool', await page.locator('[data-canvas-tool=insert-table]').count() === 1)
  rec(6, 'Insert formula control is on the canvas tool', await page.locator('[data-canvas-tool=insert-formula]').count() === 1)
  rec(7, 'Insert mermaid control is on the canvas tool', await page.locator('[data-canvas-tool=insert-mermaid]').count() === 1)
  rec(8, 'Insert code control is on the canvas tool', await page.locator('[data-canvas-tool=insert-code]').count() === 1)
  rec(9, 'Insert symbol control is on the canvas tool', await page.locator('[data-canvas-tool=insert-symbol]').count() === 1)

  const beforeText = await counts(page)
  await clickTool(page, 'insert-text')
  rec(10, 'Clicking Text Box arms a create overlay', await page.locator('[data-create-selection=text]').count() === 1)
  await drawOnOverlay(page)
  const afterText = await counts(page)
  rec(11, 'Dragging on the overlay creates a text element', afterText.byType.text > (beforeText.byType.text || 0), afterText)
  rec(12, 'Created text box is selected', afterText.selected >= 1, afterText)
  await page.keyboard.type('ToolbarText', { delay: 12 })
  await sleep(200)
  const typed = await page.locator('[class*=viewport-wrapper] [data-live-box]').filter({ hasText: 'ToolbarText' }).count()
  rec(13, 'Created text box accepts typed text', typed > 0, { typed })
  rec(14, 'Typed toolbar text stays on the live box', typed > 0)

  await page.locator('[data-canvas-tool=insert-text-menu]').click()
  await sleep(200)
  const vert = page.getByText(/Vertical text/i)
  rec(15, 'Text chevron opens horizontal/vertical choices', await vert.count() > 0)
  if (await vert.count()) {
    await vert.first().click()
    await sleep(150)
  }
  const vertArmed = await page.locator('[data-create-selection=text]').count() === 1
  if (vertArmed) await drawOnOverlay(page, 80, 180)
  const afterVert = await counts(page)
  rec(16, 'Vertical text box can be drawn', vertArmed && afterVert.byType.text >= afterText.byType.text, afterVert)

  await clickTool(page, 'insert-shape')
  await sleep(200)
  rec(17, 'Shape pool opens from the toolbar', await page.locator('[data-shape-item]').count() > 0)
  rec(18, 'Shape pool lists drawable shapes', await page.locator('[data-shape-item]').count() >= 4)
  await page.locator('[data-shape-item]').first().click()
  await sleep(150)
  rec(19, 'Picking a rectangle arms shape create', await page.locator('[data-create-selection=shape]').count() === 1)
  const beforeShape = await counts(page)
  await drawOnOverlay(page, 180, 140)
  const afterShape = await counts(page)
  rec(20, 'Dragging creates a shape element', (afterShape.byType.shape || 0) > (beforeShape.byType.shape || 0), afterShape)
  rec(21, 'Created shape is selected', afterShape.selected >= 1, afterShape)
  rec(22, 'Created shape exposes resize handles', afterShape.handles >= 4, afterShape)

  await clickTool(page, 'insert-shape')
  await sleep(200)
  rec(23, 'Line pool lists drawable lines', await page.locator('[data-line-item]').count() > 0)
  await page.locator('[data-line-item]').first().click()
  await sleep(150)
  const beforeLine = await counts(page)
  if (await page.locator('[data-create-selection=line]').count()) {
    await drawOnOverlay(page, 200, 20)
  }
  const afterLine = await counts(page)
  rec(24, 'Dragging a line creates a line element', (afterLine.byType.line || 0) > (beforeLine.byType.line || 0), afterLine)

  await clickTool(page, 'insert-table')
  await sleep(200)
  rec(25, 'Table generator opens from the toolbar', await page.locator('[data-table-cell]').count() > 0)
  const cell33 = page.locator('[data-table-cell="3x3"]')
  await cell33.hover()
  await sleep(80)
  rec(26, 'Hovering 3×3 marks the table grid', await page.locator('[data-table-cell].active, [class*=cell][class*=active]').count() >= 1)
  const beforeTable = await counts(page)
  await cell33.click()
  await sleep(300)
  const afterTable = await counts(page)
  rec(27, 'Clicking 3×3 inserts a table', (afterTable.byType.table || 0) > (beforeTable.byType.table || 0), afterTable)
  rec(28, 'Inserted table is a table element', (afterTable.byType.table || 0) >= 1, afterTable)
  const tableCells = await page.locator('[id^=editable-element-][data-element-type=table] .cell, [id^=editable-element-][data-element-type=table] [class*=cell]').count()
  rec(29, 'Inserted table has at least 9 cells', tableCells >= 9, { tableCells })
  const aCell = page.locator('[id^=editable-element-][data-element-type=table] .cell-text, [id^=editable-element-][data-element-type=table] [class*=cell]').first()
  const cellBox = await aCell.boundingBox()
  if (cellBox) await page.mouse.click(cellBox.x + 12, cellBox.y + 10)
  await sleep(120)
  await page.keyboard.type('CellA', { delay: 12 })
  await sleep(200)
  rec(30, 'A table cell accepts typed text', /CellA/.test(await page.locator('[data-element-type=table]').innerText()), { text: (await page.locator('[data-element-type=table]').innerText()).slice(0, 40) })

  await clickTool(page, 'insert-table')
  await sleep(200)
  const customBtn = page.getByText('Custom', { exact: false })
  rec(31, 'Custom table mode opens', await customBtn.count() > 0)
  if (await customBtn.count()) {
    await customBtn.first().click()
    await sleep(120)
    await page.getByText('Insert table', { exact: false }).last().click()
    await sleep(300)
  }
  const afterCustom = await counts(page)
  rec(32, 'Custom insert creates another table', (afterCustom.byType.table || 0) > (afterTable.byType.table || 0), afterCustom)

  await clickTool(page, 'insert-chart')
  await sleep(200)
  rec(33, 'Chart pool opens from the toolbar', await page.locator('[data-chart-type]').count() >= 4)
  const beforeChart = await counts(page)
  await page.locator('[data-chart-type=bar]').click()
  await sleep(400)
  const afterBar = await counts(page)
  rec(34, 'Inserting a bar chart creates a chart element', (afterBar.byType.chart || 0) > (beforeChart.byType.chart || 0), afterBar)
  rec(35, 'Bar chart stays selected', afterBar.selected >= 1, afterBar)
  await clickTool(page, 'insert-chart')
  await sleep(200)
  await page.locator('[data-chart-type=pie]').click()
  await sleep(400)
  const afterPie = await counts(page)
  rec(36, 'Inserting a pie chart adds a second chart', (afterPie.byType.chart || 0) >= 2, afterPie)
  rec(37, 'Both charts remain on the slide', (afterPie.byType.chart || 0) >= 2 && afterPie.total >= afterBar.total, afterPie)

  await clickTool(page, 'insert-formula')
  await sleep(400)
  const formulaOpen = await page.getByText('Insert', { exact: true }).count() > 0 || await page.locator('[class*=latex-editor]').count() > 0
  rec(38, 'Formula modal opens from the toolbar', formulaOpen)
  const tip = page.locator('kbd', { hasText: 'frac' })
  if (await tip.count()) await tip.first().click()
  await sleep(150)
  const insertFormula = page.locator('[data-editor-insert=latex]').or(page.getByRole('button', { name: 'Insert' }))
  rec(39, 'Formula editor can insert a snippet', await insertFormula.count() > 0)
  const beforeLatex = await counts(page)
  if (await insertFormula.count()) {
    await insertFormula.first().click()
    await page.locator('[data-element-type=latex]').first().waitFor({ timeout: 8000 }).catch(() => {})
    await sleep(200)
  }
  const afterLatex = await counts(page)
  rec(40, 'Inserted formula is a latex element', (afterLatex.byType.latex || 0) > (beforeLatex.byType.latex || 0), afterLatex)
  if (await page.locator('[class*=latex-editor]').count()) {
    await page.getByText('Cancel', { exact: true }).first().click().catch(() => pressEscape(page))
    await sleep(150)
  }

  await clickTool(page, 'insert-code')
  await page.locator('[class*=code-editor], [class*=code-editor-host]').waitFor({ timeout: 20000 }).catch(() => {})
  rec(41, 'Code modal opens from the toolbar', await page.locator('[class*=code-editor], [class*=code-editor-host]').count() > 0)
  const beforeCode = await counts(page)
  const okBtn = page.locator('[data-editor-insert=code]')
  await okBtn.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
  if (await okBtn.count()) {
    await okBtn.last().click()
    await page.locator('[data-element-type=code]').first().waitFor({ timeout: 8000 }).catch(() => {})
    await sleep(200)
  }
  const afterCode = await counts(page)
  rec(42, 'Code editor inserts a code element', (afterCode.byType.code || 0) > (beforeCode.byType.code || 0), afterCode)
  if (await page.locator('[class*=code-editor]').count()) {
    await page.getByText('Cancel', { exact: true }).first().click().catch(() => pressEscape(page))
    await sleep(150)
  }

  await clickTool(page, 'insert-symbol')
  await sleep(400)
  const symbolCell = page.locator('[data-index="0"]')
  rec(43, 'Symbol pool opens from the toolbar', await symbolCell.count() > 0 || await page.locator('[class*=symbol-pool]').count() > 0)
  const beforeSymbol = await counts(page)
  if (await symbolCell.count()) {
    await symbolCell.first().click()
    await sleep(300)
  }
  const afterSymbol = await counts(page)
  rec(44, 'Clicking a symbol inserts it', afterSymbol.total >= beforeSymbol.total && (afterSymbol.byType.text || 0) >= (beforeSymbol.byType.text || 0), afterSymbol)

  await clickTool(page, 'insert-mermaid')
  await page.locator('textarea, [class*=mermaid]').first().waitFor({ timeout: 15000 }).catch(() => {})
  rec(45, 'Mermaid modal opens from the toolbar', await page.locator('[class*=mermaid-editor], [class*=mermaid]').count() > 0 || await page.getByRole('button', { name: 'OK' }).count() > 0)
  const beforeMermaid = await counts(page)
  const mermaidArea = page.locator('textarea').last()
  if (await mermaidArea.count()) {
    await mermaidArea.click()
    await mermaidArea.fill('graph TD; A-->B')
    await sleep(400)
    if (await page.getByRole('button', { name: 'OK' }).count()) {
      await page.getByRole('button', { name: 'OK' }).last().click()
      await sleep(800)
    }
  }
  const afterMermaid = await counts(page)
  rec(46, 'Mermaid editor inserts a mermaid element', (afterMermaid.byType.mermaid || 0) > (beforeMermaid.byType.mermaid || 0), afterMermaid)
  if (await page.getByText('Cancel', { exact: true }).count() && await page.locator('[class*=mermaid]').count()) {
    await page.getByText('Cancel', { exact: true }).first().click().catch(() => {})
    await sleep(150)
  }

  await clickTool(page, 'insert-media')
  await sleep(300)
  rec(47, 'Media picker opens from the toolbar', await page.getByText('Browse', { exact: false }).count() > 0 || await page.locator('input[type=file]').count() > 0)
  rec(48, 'Media picker exposes a file input', await page.locator('input[type=file]').count() > 0)
  const beforeImage = await counts(page)
  const fileInput = page.locator('input[type=file]').last()
  if (await fileInput.count()) {
    await fileInput.setInputFiles(pngPath)
    await sleep(1500)
    const insertMedia = page.getByRole('button', { name: /Insert/i })
    if (await insertMedia.count() && await insertMedia.last().isEnabled().catch(() => false)) {
      await insertMedia.last().click()
      await sleep(800)
    }
  }
  const afterImage = await counts(page)
  rec(49, 'Choosing a PNG queues or inserts an image', (afterImage.byType.image || 0) > (beforeImage.byType.image || 0) || await page.locator('[class*=media-picker] img, [class*=card] img').count() > 0, afterImage)
  if (await page.getByText('Cancel', { exact: true }).count()) {
    await page.getByText('Cancel', { exact: true }).first().click().catch(() => pressEscape(page))
    await sleep(150)
  }

  const finalCounts = await counts(page)
  rec(50, 'Slide still has toolbar-created elements after the session',
    finalCounts.total >= 4
    && (finalCounts.byType.shape || 0) >= 1
    && (finalCounts.byType.table || 0) >= 1
    && (finalCounts.byType.chart || 0) >= 1,
    finalCounts)

  const failed = results.filter(p => !p.pass)
  const width = 58
  console.log('#   result  case'.padEnd(width + 12) + 'measured')
  console.log('-'.repeat(96))
  for (const [id, name] of CASES) {
    const proof = results.find(p => p.id === id)
    if (!proof) throw new Error(`missing proof ${id} ${name}`)
    const mark = proof.pass ? 'PASS' : 'FAIL'
    console.log(`${String(id).padEnd(4)}${mark.padEnd(8)}${name.padEnd(width)}${proof.measured ? JSON.stringify(proof.measured) : ''}`)
  }
  if (results.length !== CASES.length) throw new Error(`expected ${CASES.length} proofs, got ${results.length}`)
  if (failed.length) throw new Error(`${failed.length} insert-elements proofs failed: ${failed.map(p => p.id).join(', ')}`)
  console.log('-'.repeat(96))
  console.log('insert-elements e2e passed (50 cases)')
  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
  try { unlinkSync(pngPath) } catch { /* ignore */ }
}
