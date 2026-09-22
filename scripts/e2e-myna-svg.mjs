import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.setDefaultTimeout(30000)
const errors = []; page.on('pageerror', e => errors.push(e.message))
const base = process.env.FIKA_TEST_URL || 'http://127.0.0.1:5178'
async function downloadSvg(scope) {
  await page.getByRole('button', { name: 'Download', exact: true }).first().click()
  const modal = page.locator('.myna-download')
  await modal.locator('select').first().selectOption('svg')
  if (scope) await modal.locator('select').nth(1).selectOption(scope)
  if (scope === 'selected') await modal.getByRole('textbox').fill('2,1')
  const pending = page.waitForEvent('download')
  await modal.getByRole('button', { name: 'Download', exact: true }).click()
  const result = await pending
  assert.equal(await result.failure(), null)
  const bytes = await readFile(await result.path()); return { bytes, text: bytes.toString('utf8'), name: result.suggestedFilename() }
}
try {
  await page.goto(`${base}/?mode=myna&locale=en`, { waitUntil: 'networkidle' })
  await page.locator('[data-myna-workspace]').waitFor()
  const first = await downloadSvg()
  assert.match(first.name, /\.svg$/)
  assert.match(first.text, /<text /)
  assert.match(first.text, /<path /)
  assert.doesNotMatch(first.text, /<foreignObject/)
  const parsed = await page.evaluate(async svg => {
    const d = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; await image.decode()
    const c = document.createElement('canvas'); c.width = c.height = 1080; const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0)
    return { error: d.querySelector('parsererror')?.textContent, width: image.naturalWidth, text: d.querySelector('text')?.textContent, corner: [...ctx.getImageData(1, 1, 1, 1).data] }
  }, first.text)
  assert.equal(parsed.error, undefined); assert.equal(parsed.width, 1080); assert.ok(parsed.text); assert.equal(parsed.corner[3], 255)
  await mkdir('output/myna', { recursive: true })
  const preview = await browser.newPage({viewport:{width:1080,height:1080}})
  await preview.goto(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(first.text)}`)
  await preview.screenshot({ path: 'output/myna/svg-page.png' }); await preview.close()
  // Isolated geometry fixture exercises rich text, rotations, line caps, crops, merged table cells and SVG charts.
  await page.evaluate(() => {
    const s = window.__FIKA_SLIDES__.getState()
    const shape = { id: 'shape<&', type: 'shape', left: 40, top: 40, width: 200, height: 100, rotate: 30, viewBox: [200,100], path: 'M0 0H200V100H0Z', fill: '#ff0000', fixedRatio: false }
    const chart = { id: 'chart', type: 'chart', left: 350, top: 30, width: 350, height: 250, rotate: 0, chartType: 'column', data: { labels: ['A','B'], legends: ['Series'], series: [[2,4]] }, themeColors: ['#0000ff'] }
    const table = { id:'table',type:'table',left:30,top:350,width:400,height:180,rotate:0,colWidths:[.5,.5],cellMinHeight:90,outline:{width:1,color:'#000'},data:[[{id:'a',text:'A & B',colspan:2,rowspan:1},{id:'b',text:'',colspan:1,rowspan:1}],[{id:'c',text:'C',colspan:1,rowspan:1},{id:'d',text:'D',colspan:1,rowspan:1}]] }
    const text = { id: 'text',type:'text',left:40,top:600,width:500,height:150,rotate:0,defaultFontName:'Arial',defaultColor:'#000',content:'<p><strong>Hello &amp; SVG</strong> <em>world</em></p>', fixedHeight:true }
    s.setSlides([{ ...s.slides[0], elements:[shape,chart,{...chart,id:'chart2',top:780,height:200},table,text] }])
    window.__FIKA_MAIN__.getState().setActiveElementIdList(['shape<&'])
  })
  const second = await downloadSvg()
  await writeFile('output/myna/svg-fixture.svg', second.text)
  const checks = await page.evaluate(svg => { const d = new DOMParser().parseFromString(svg,'image/svg+xml'); return {error:d.querySelector('parsererror')?.textContent || false,texts:[...d.querySelectorAll('text')].map(e=>e.textContent).join(' '),chart:!!d.querySelector('[data-element-id="chart"] svg'),rects:d.querySelectorAll('rect').length, images:d.querySelectorAll('image').length} }, second.text)
  assert.equal(checks.error,false); assert.ok(checks.chart); assert.match(checks.texts,/A & B/); assert.match(checks.texts,/Hello & SVG/); assert.equal(checks.images,0)
  const selection = await downloadSvg('objects')
  const bounds = await page.evaluate(svg => { const d=new DOMParser().parseFromString(svg,'image/svg+xml'); return {width:+d.documentElement.getAttribute('width'),height:+d.documentElement.getAttribute('height'),count:d.querySelectorAll('[data-element-id]').length} },selection.text)
  assert.equal(bounds.count,1); assert.ok(Math.abs(bounds.width-223.2051)<.01); assert.ok(Math.abs(bounds.height-186.6025)<.01)
  await page.evaluate(() => {
    const s = window.__FIKA_SLIDES__.getState(), slide = s.slides[0]
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="45" fill="red"/></svg>')}`
    const image = { id:'vector-media',type:'image',left:50,top:50,width:200,height:200,rotate:0,fixedRatio:true,src,clip:{shape:'ellipse',range:[[10,10],[90,90]]},filters:{opacity:'50%'},opacity:.7 }
    s.setSlides([{...slide,elements:[image]}, {...slide,id:'second-page',elements:[]}])
  })
  const media = await downloadSvg()
  const mediaCheck = await page.evaluate(svg => {const d=new DOMParser().parseFromString(svg,'image/svg+xml');return {error:!!d.querySelector('parsererror'), circle:!!d.querySelector('circle'), opacity:d.querySelector('[data-element-id]')?.getAttribute('opacity'), clips:d.querySelectorAll('clipPath').length}},media.text)
  assert.equal(mediaCheck.error,false); assert.ok(mediaCheck.circle); assert.equal(mediaCheck.opacity,'0.35'); assert.ok(mediaCheck.clips>=2)
  const all = await downloadSvg('all'); assert.match(all.name,/\.zip$/)
  const zip = await JSZip.loadAsync(all.bytes); assert.equal(Object.keys(zip.files).filter(n=>n.endsWith('.svg')).length,2)
  const rangeZip = await downloadSvg('selected'); const ordered = await JSZip.loadAsync(rangeZip.bytes)
  assert.deepEqual(Object.keys(ordered.files).filter(n=>n.endsWith('.svg')),['002.svg','001.svg'])
  await page.evaluate(() => { const s=window.__FIKA_SLIDES__.getState(); s.setSlides(s.slides.map((slide,i)=>i?slide:{...slide,elements:slide.elements.map(e=>({...e,filters:{grayscale:'100%'}}))})) })
  const fallback = await downloadSvg()
  assert.match(fallback.text, /data:image\/png;base64/)
  assert.ok(await page.locator('.myna-download [role="status"]').filter({hasText:/raster|bitmap|image/i}).count())
  assert.deepEqual(errors,[])
  console.log('SVG export: standalone page decoding, editable text/shapes, escaped XML, native vector chart/table, rotated selection bounds, clipped SVG media, duplicate-chart IDs, all/ordered-page ZIP and isolated raster fallback notice passed.')
} finally { await browser.close() }
