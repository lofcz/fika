import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { chromium } from 'playwright'
// Execute the real production helper and its production image loader in a DOM.
// Flatten their ES module boundaries for this isolated browser (no application globals or mocks).
const files = ['src/utils/pptxExportWatermark.ts', 'src/views/Myna/svgWatermark.ts']
const sources = await Promise.all(files.map(async file => stripTypeScriptTypes(await readFile(file, 'utf8')).replace(/^import .*?;?\s*$/gm, '').replace(/^export /gm, '')))
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.addScriptTag({ path: 'node_modules/jszip/dist/jszip.min.js' })
  await page.addScriptTag({ content: `${sources.join('\n')}\nwindow.testWatermarkSvg = watermarkSvg;` })
  const results = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 50
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,100,50)
    const image = canvas.toDataURL()
    const source = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="-40 -20 200 100"><rect x="-40" y="-20" width="200" height="100" fill="#fff"/></svg>'
    const read = async options => {
      const blob = await window.testWatermarkSvg(source,200,100,{image,widthRatio:.2,marginRatio:.05,opacity:.4,...options},'#ffffff')
      const doc=new DOMParser().parseFromString(await blob.text(),'image/svg+xml'),mark=doc.querySelector('image')
      const raster=new Image();raster.src=URL.createObjectURL(blob);await raster.decode();URL.revokeObjectURL(raster.src)
      return {error:!!doc.querySelector('parsererror'),x:+mark.getAttribute('x'),y:+mark.getAttribute('y'),width:+mark.getAttribute('width'),height:+mark.getAttribute('height'),opacity:+mark.getAttribute('opacity'),embedded:mark.getAttribute('href')===image,last:doc.documentElement.lastElementChild===mark}
    }
    return [await read({position:'bottom-right'}), await read({position:'top-left'})]
  })
  assert.deepEqual(results[0], {error:false,x:110,y:50,width:40,height:20,opacity:.4,embedded:true,last:true})
  assert.deepEqual(results[1], {error:false,x:-30,y:-10,width:40,height:20,opacity:.4,embedded:true,last:true})
  console.log('SVG watermark: real image embedding, negative-origin selection bounds, corner placement, alpha, topmost stacking and standalone browser decode passed.')
} finally { await browser.close() }
