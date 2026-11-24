import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRsbuild } from '@rsbuild/core'
import { afterAll, beforeAll, describe, expect, it } from '@rstest/core'
import { chromium, type Browser, type Page } from 'playwright'
import type * as TextFit from '../src/utils/textFit'
import { normalizeFittedFontSizes } from '../src/utils/richTextFontSize'

declare global {
  interface Window { __parityTextFit: typeof TextFit }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let browser: Browser
let page: Page
let output: string

const PROSEMIRROR_STYLE = `
  * { box-sizing: border-box; }
  .box {
    position: relative;
    line-height: 1.5;
    word-break: break-word;
    font-family: Arial, sans-serif;
  }
  .ProseMirror {
    outline: 0;
    border: 0;
    position: relative;
    font-size: var(--text-fit-base-size, 16px);
    overflow-wrap: anywhere;
    word-wrap: break-word;
    word-break: break-word;
    white-space: pre-wrap;
    white-space: break-spaces;
    font-variant-ligatures: none;
    font-feature-settings: "liga" 0;
  }
  .ProseMirror p { margin: 0; margin-top: var(--paragraphSpace, 5px); }
  .ProseMirror p:first-child { margin-top: 0; }
  .ProseMirror strong, .ProseMirror em { display: contents; }
  .ProseMirror ul, .ProseMirror ol {
    margin: 0;
    list-style-position: outside;
    padding-inline-start: 1em;
  }
  .ProseMirror ul li, .ProseMirror ol li {
    display: list-item;
    list-style-position: outside;
    margin: 0;
    padding-inline-start: 0.5333333333em;
  }
  .ProseMirror ul li + li, .ProseMirror ol li + li {
    margin-top: var(--paragraphSpace, 5px);
  }
`

beforeAll(async () => {
  output = await mkdtemp(join(tmpdir(), 'fika-thumb-parity-'))
  const build = await createRsbuild({
    cwd: root,
    rsbuildConfig: {
      logLevel: 'error',
      source: { entry: { text: join(root, 'src/utils/textFit.ts') } },
      output: {
        target: 'web', minify: false, sourceMap: false, filenameHash: false,
        distPath: { root: output, js: '' }, filename: { js: 'text.js' },
      },
      performance: { chunkSplit: { strategy: 'all-in-one' } },
      tools: {
        htmlPlugin: false,
        rspack: { output: { library: { type: 'window', name: '__parityTextFit' } } },
      },
    },
  })
  await build.build()
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage()
  await page.setContent(`<!doctype html><html><head><style>${PROSEMIRROR_STYLE}</style></head><body></body></html>`)
  await page.addScriptTag({ content: await readFile(join(output, 'text.js'), 'utf8') })
}, 30000)

afterAll(async () => {
  await browser?.close()
  if (output) await rm(output, { recursive: true, force: true })
})

describe('thumbnail vs live canvas text-fit parity', () => {
  it('normalizes fitted calc() font sizes for px and pt units', () => {
    expect(normalizeFittedFontSizes('<ul style="font-size: calc(var(--text-fit-scale, 1) * 28px);">'))
      .toBe('<ul style="font-size: 28px;">')
    expect(normalizeFittedFontSizes('<p style="font-size: calc(var(--text-fit-scale, 1) * 24pt);">'))
      .toBe('<p style="font-size: 24pt;">')
  })

  it('matches DOM fit scale without over-shrinking tight boxes or lists before click', async () => {
    const cases = await page.evaluate(() => {
      const tf = window.__parityTextFit

      const wrapCalc = (html: string) => html.replace(
        /font-size\s*:\s*([0-9.]+(?:px|pt|em|rem|%))/gi,
        'font-size: calc(var(--text-fit-scale, 1) * $1)',
      )

      const measureDomScale = (opts: {
        html: string
        innerWidth: number
        innerHeight: number
        lineHeight: number
        blockSpace: number
        defaultSize: number
        fontFamily: string
      }) => {
        const box = document.createElement('div')
        box.className = 'box'
        box.style.width = `${opts.innerWidth}px`
        box.style.lineHeight = String(opts.lineHeight)
        box.style.fontFamily = opts.fontFamily
        box.style.setProperty('--paragraphSpace', `${opts.blockSpace}px`)
        const host = document.createElement('div')
        const pm = document.createElement('div')
        pm.className = 'ProseMirror'
        pm.innerHTML = wrapCalc(opts.html)
        host.appendChild(pm)
        box.appendChild(host)
        document.body.appendChild(box)

        const commit = (scale: number) => {
          if (scale === 1) {
            host.style.removeProperty('--text-fit-scale')
            host.style.setProperty('--text-fit-base-size', `${opts.defaultSize}px`)
          }
          else {
            host.style.setProperty('--text-fit-scale', String(scale))
            host.style.setProperty('--text-fit-base-size', `${Math.round(opts.defaultSize * scale * 100) / 100}px`)
          }
        }
        const height = Math.round(opts.innerHeight)
        let low = 0.01
        let high = 1
        commit(high)
        if (pm.scrollHeight <= height) {
          low = high
        }
        else {
          for (let i = 0; i < 10 && high - low > 0.001; i++) {
            const mid = (low + high) / 2
            commit(mid)
            if (pm.scrollHeight <= height) low = mid
            else high = mid
          }
        }
        const domHeightAt1 = (() => {
          commit(1)
          return pm.scrollHeight
        })()
        box.remove()
        return { domScale: low, domHeightAt1 }
      }

      const fixtures = [
        {
          name: 'tight single-line heading that fits at 1.0',
          html: '<p><span style="font-size: 40px;">Quarterly Revenue Overview</span></p>',
          innerWidth: 600,
          innerHeight: 50,
          lineHeight: 1.2,
          blockSpace: 5,
          defaultSize: 16,
          fontFamily: 'Arial',
        },
        {
          name: 'overflowing multi-line paragraph',
          html: '<p><span style="font-size: 36px;">Long presentation paragraph that wraps across multiple lines inside a fixed-height card box</span></p>',
          innerWidth: 380,
          innerHeight: 110,
          lineHeight: 1.3,
          blockSpace: 8,
          defaultSize: 16,
          fontFamily: 'Arial',
        },
        {
          name: 'bullet list without ul font-size (CSS 1em = defaultSize 16px, not span 32px)',
          html: '<ul><li><p><span style="font-size: 32px;">First long bullet point with enough words to wrap</span></p></li><li><p><span style="font-size: 32px;">Second bullet point with details</span></p></li></ul>',
          innerWidth: 360,
          innerHeight: 140,
          lineHeight: 1.25,
          blockSpace: 6,
          defaultSize: 16,
          fontFamily: 'Arial',
        },
        {
          name: 'bullet list with explicit ul font-size scaling via calc()',
          html: '<ul style="font-size: 28px; color: #1c7ed6;"><li><p><span style="font-size: 28px;">First styled bullet item that wraps cleanly</span></p></li><li><p><span style="font-size: 28px;">Second styled bullet item</span></p></li></ul>',
          innerWidth: 340,
          innerHeight: 120,
          lineHeight: 1.25,
          blockSpace: 8,
          defaultSize: 16,
          fontFamily: 'Arial',
        },
        {
          name: 'paragraph followed by list (zero gap before first li)',
          html: '<p><span style="font-size: 24px;">Section heading</span></p><ul><li><p><span style="font-size: 20px;">Point one</span></p></li><li><p><span style="font-size: 20px;">Point two</span></p></li></ul><p><span style="font-size: 20px;">Summary</span></p>',
          innerWidth: 400,
          innerHeight: 132,
          lineHeight: 1.25,
          blockSpace: 12,
          defaultSize: 16,
          fontFamily: 'Arial',
        },
        {
          name: 'placeholder unmarked text at defaultSize 24px',
          html: '<p>Unmarked placeholder paragraph that overflows a tight slot and must shrink from 24px</p>',
          innerWidth: 300,
          innerHeight: 62,
          lineHeight: 1.25,
          blockSpace: 5,
          defaultSize: 24,
          fontFamily: 'Arial',
        },
      ]

      return fixtures.map(f => {
        const { domScale, domHeightAt1 } = measureDomScale(f)
        const canvasScale = tf.textFitScaleForHtml(f.html, {
          innerWidth: f.innerWidth,
          innerHeight: f.innerHeight,
          defaultFontFamily: f.fontFamily,
          defaultSize: f.defaultSize,
          lineHeight: f.lineHeight,
          blockSpace: f.blockSpace,
        })
        const { blocks } = tf.extractFitBlocksFromHtml(f.html, {
          defaultFontFamily: f.fontFamily,
          defaultSize: f.defaultSize,
        })
        const canvasHeightAt1 = tf.measureTextBlocksHeight(blocks, {
          innerWidth: f.innerWidth,
          lineHeight: f.lineHeight,
          blockSpace: f.blockSpace,
        })
        return { name: f.name, domScale, canvasScale, domHeightAt1, canvasHeightAt1 }
      })
    })

    for (const row of cases) {
      expect(
        Math.abs(row.canvasScale - row.domScale),
        `${row.name}: canvasScale=${row.canvasScale} vs domScale=${row.domScale} (height@1 canvas=${row.canvasHeightAt1} dom=${row.domHeightAt1})`,
      ).toBeLessThan(0.025)
    }
    // Tight single-line heading & paragraph+list must stay at 1.0 (not over-shrunk by fitClipPadding)
    expect(cases[0].canvasScale).toBe(1)
    expect(cases[0].domScale).toBe(1)
    expect(cases[4].canvasHeightAt1).toBe(cases[4].domHeightAt1)
  })

  it('inherits list font-size, listColor, ordered start, and avoids duplicating nested lists or blockquotes', async () => {
    const result = await page.evaluate(() => {
      const tf = window.__parityTextFit
      const styledList = tf.extractFitBlocksFromHtml(
        '<ul style="font-size: 28px; color: #1c7ed6;"><li><p>Unmarked item</p></li><li><p><span style="color: #e64980;"><strong>Accent:</strong></span> body</p></li></ul>',
        { defaultFontFamily: 'Arial', defaultSize: 16 },
      ).blocks
      const ordered = tf.extractFitBlocksFromHtml(
        '<ol start="3"><li><p>Third</p></li><li><p>Fourth</p></li></ol>',
        { defaultFontFamily: 'Arial', defaultSize: 16 },
      ).blocks
      const nested = tf.extractFitBlocksFromHtml(
        '<ul><li><p>Parent</p><ul><li><p>Child</p></li></ul></li></ul>',
        { defaultFontFamily: 'Arial', defaultSize: 16 },
      ).blocks
      const quote = tf.extractFitBlocksFromHtml(
        '<blockquote><p>Quoted text</p></blockquote>',
        { defaultFontFamily: 'Arial', defaultSize: 20 },
      ).blocks
      return { styledList, ordered, nested, quote }
    })

    expect(result.styledList).toHaveLength(2)
    expect(result.styledList[0].listFontSize).toBe(28)
    expect(result.styledList[0].size).toBe(28)
    expect(result.styledList[0].runs?.[0].size).toBe(28)
    expect(result.styledList[0].listColor).toBe('rgb(28, 126, 214)')
    expect(result.styledList[0].firstInList).toBe(true)
    expect(result.styledList[1].firstInList).toBeUndefined()
    // Marker color comes from <ul>, not the accent <span> inside the second item
    expect(result.styledList[1].listColor).toBe('rgb(28, 126, 214)')
    expect(result.styledList[1].runs?.[0].color).toBe('rgb(230, 73, 128)')

    expect(result.ordered.map(b => b.listMarker)).toEqual(['3.', '4.'])
    expect(result.ordered.every(b => b.listOrdered)).toBe(true)

    expect(result.nested.map(b => b.text)).toEqual(['Parent', 'Child'])
    expect(result.quote.map(b => b.text)).toEqual(['Quoted text'])
    expect(result.quote[0].italic).toBe(true)
  })

  it('invalidates fit scale caches when inline math becomes ready and ignores sub-epsilon rememberFitScale noise', async () => {
    const result = await page.evaluate(() => {
      const tf = window.__parityTextFit
      const html = '<p><span style="font-size: 24px;">Formula </span><span class="fika-math" data-latex="\\frac{a+b+c+d+e}{x+y+z}">raw</span><span style="font-size: 24px;"> end</span></p>'
      let mathReady = false
      let fontChangeCount = 0
      const unsubFont = tf.subscribeTextFontChanges(() => { fontChangeCount++ })
      tf.registerInlineMathMeasurer((_latex, size) => (
        mathReady ? { width: size * 10, height: size * 2.4 } : null
      ))
      const opts = { innerWidth: 260, innerHeight: 70, defaultFontFamily: 'Arial', lineHeight: 1.25, blockSpace: 5 }
      const beforeMath = tf.textFitScaleForHtml(html, opts)
      mathReady = true
      tf.notifyInlineMathReady()
      const afterMath = tf.textFitScaleForHtml(html, opts)
      unsubFont()

      let fitChangeCount = 0
      const unsubFit = tf.subscribeFitScaleChanges(() => { fitChangeCount++ })
      // Sub-epsilon update must NOT trigger thumbnail repaint
      tf.rememberFitScale(html, opts, afterMath + 0.0002, 'el-1')
      const countAfterTiny = fitChangeCount
      // Real difference DOES trigger repaint
      tf.rememberFitScale(html, opts, Math.max(0.2, afterMath - 0.05), 'el-1')
      const countAfterReal = fitChangeCount
      // Color-only contrast rewrite hits the same memo key as authored HTML
      const darkList = '<ul style="font-size: 24px; color: #000000;"><li><p><span style="color: #000000;">Item</span></p></li></ul>'
      const lightList = '<ul style="font-size: 24px; color: #ffffff;"><li><p><span style="color: #ffffff;">Item</span></p></li></ul>'
      tf.rememberFitScale(darkList, opts, 0.777, 'el-2')
      const recalledOnContrastRewrite = tf.textFitScaleForHtml(lightList, opts)
      unsubFit()

      return { beforeMath, afterMath, fontChangeCount, countAfterTiny, countAfterReal, recalledOnContrastRewrite }
    })

    expect(result.fontChangeCount).toBe(1)
    expect(result.afterMath).toBeLessThan(result.beforeMath)
    expect(result.countAfterTiny).toBe(0)
    expect(result.countAfterReal).toBe(1)
    expect(result.recalledOnContrastRewrite).toBe(0.777)
  })
})
