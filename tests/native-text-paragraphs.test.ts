import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRsbuild } from '@rsbuild/core'
import { afterAll, beforeAll, describe, expect, it } from '@rstest/core'
import { chromium, type Browser, type Page } from 'playwright'
import type * as TextFit from '../src/utils/textFit'

declare global {
  interface Window { __nativeTextFit: typeof TextFit }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let browser: Browser
let page: Page
let output: string

// This suite always uses Chromium's DOM parser and real Canvas font metrics.
// A Node-only test with `if (!DOMParser) return` missed these renderer bugs.
beforeAll(async () => {
  output = await mkdtemp(join(tmpdir(), 'fika-native-text-'))
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
        rspack: { output: { library: { type: 'window', name: '__nativeTextFit' } } },
      },
    },
  })
  await build.build()
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage()
  await page.setContent('<!doctype html><html><body></body></html>')
  await page.addScriptTag({ content: await readFile(join(output, 'text.js'), 'utf8') })
}, 30000)

afterAll(async () => {
  await browser?.close()
  if (output) await rm(output, { recursive: true, force: true })
})

describe('native text paragraph semantics', () => {
  it('preserves blank paragraphs, literal copy, and explicit pre-wrap spacing', async () => {
    const result = await page.evaluate(() => {
      const text = window.__nativeTextFit
      const html = '<p style="white-space:pre-wrap;font-size:32px"><strong>  Školní  &amp; &lt;koncert&gt;  </strong></p>'
        + '<p style="white-space:pre-wrap;font-size:32px"></p>'
        + '<p style="white-space:pre-wrap;font-size:32px"><em>**doslova** _text_  </em></p>'
      const { blocks } = text.extractFitBlocksFromHtml(html, { defaultFontFamily: 'Arial' })
      const options = { innerWidth: 800, lineHeight: 1.25, blockSpace: 9 }
      const session = text.createFitMeasureSession(html, { key: 'literal', defaultFontFamily: 'Arial', lineHeight: 1.25 })!
      return {
        blocks,
        height: text.measureTextBlocksHeight(blocks, options),
        sessionHeight: text.measureSessionHeight(session, 800, 9),
        scale: text.textFitScaleForHtml(html, { ...options, innerHeight: 142, defaultFontFamily: 'Arial' }),
      }
    })
    expect(result.blocks.map(block => block.text)).toEqual(['  Školní  & <koncert>  ', '', '**doslova** _text_  '])
    expect(result.blocks.map(block => block.size)).toEqual([32, 32, 32])
    expect(result.blocks[0].runs?.[0].bold).toBe(true)
    expect(result.blocks[2].runs?.[0].italic).toBe(true)
    expect(result.height).toBe(3 * 40 + 2 * 9)
    expect(result.sessionHeight).toBe(result.height)
    expect(result.scale).toBe(1)
  })

  it('keeps hard breaks as lines without inventing paragraph spacing', async () => {
    const result = await page.evaluate(() => {
      const text = window.__nativeTextFit
      const { blocks } = text.extractFitBlocksFromHtml('<p style="font-size:32px">Školní<br><br>koncert</p>', { defaultFontFamily: 'Arial' })
      return { blocks, height: text.measureTextBlocksHeight(blocks, { innerWidth: 800, lineHeight: 1.25, blockSpace: 19 }) }
    })
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].text).toBe('Školní\n\nkoncert')
    expect(result.height).toBe(120)
  })

  it('keeps CSS bold, italic, and color even for a single native run', async () => {
    const runs = await page.evaluate(() => window.__nativeTextFit.extractFitBlocksFromHtml(
      '<p><span style="font-size:40px;font-weight:700;font-style:italic;color:#c94832">Koncert</span></p>',
      { defaultFontFamily: 'Arial' },
    ).blocks[0].runs)
    expect(runs).toHaveLength(1)
    expect(runs?.[0]).toMatchObject({ text: 'Koncert', size: 40, bold: true, italic: true, color: 'rgb(201, 72, 50)' })
  })

  it('retains normal whitespace collapsing outside preformatted paragraphs', async () => {
    const blocks = await page.evaluate(() => window.__nativeTextFit.extractFitBlocksFromHtml(
      '<p>První   druhý\n třetí</p><p></p><p><br class="ProseMirror-trailingBreak"></p>',
      { defaultFontFamily: 'Arial', defaultSize: 24 },
    ).blocks)
    expect(blocks.map(block => block.text)).toEqual(['První druhý třetí', '', ''])
    expect(blocks[0].whiteSpace).toBeUndefined()
  })

  it('uses the same wrap and height for static fitting and resize sessions', async () => {
    const result = await page.evaluate(() => {
      const text = window.__nativeTextFit
      const html = '<p style="white-space:pre-wrap;font-size:32px">  A  B  C  D  E  F  G  H  I  J  </p>'
        + '<p style="font-size:24px">Malý <strong style="font-size:48px">VELKÝ</strong> text</p>'
      const { blocks } = text.extractFitBlocksFromHtml(html, { defaultFontFamily: 'Arial' })
      const session = text.createFitMeasureSession(html, { key: 'wrap', defaultFontFamily: 'Arial', lineHeight: 1.2 })!
      return [220, 320, 600].map(width => ({
        staticHeight: text.measureTextBlocksHeight(blocks, { innerWidth: width, lineHeight: 1.2, blockSpace: 7 }),
        sessionHeight: text.measureSessionHeight(session, width, 7),
      }))
    })
    expect(result[0].staticHeight).toBeGreaterThan(result[2].staticHeight)
    for (const row of result) expect(row.sessionHeight).toBe(row.staticHeight)
  })
})
