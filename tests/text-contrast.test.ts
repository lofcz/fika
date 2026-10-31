import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRsbuild } from '@rsbuild/core'
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill'
import { afterAll, beforeAll, describe, expect, it } from '@rstest/core'
import { chromium, type Browser, type Page } from 'playwright'
import type { PPTShapeElement, PPTTextElement, Slide } from '../src/types/slides'
import type * as SlidePainter from '../src/paint/slidePainter'
import { applySlideBackgroundWithContrast, isDefaultInk, resolveLiveTextPaint } from '../src/utils/textContrast'

const defaultInks = ['#000000', '#ffffff', '#333333', '#18181b', '#9aa3ad', '#171717', '#42464a', '#dddddd']
const brandInks = ['#214846', '#172B43', '#0F172A', '#4b1234', '#260800', '#2563eb']
const theme = { backgroundColor: '#ffffff', fontColor: '#333333' }
const text = (id: string, color: string): PPTTextElement => ({
  id, type: 'text', left: 0, top: 0, width: 240, height: 80, rotate: 0,
  defaultFontName: 'Arial', defaultColor: color,
  content: `<p style="font-size:48px;color:${color}">Brand</p>`,
})
const shape = (id: string, color: string, fill = ''): PPTShapeElement => ({
  id, type: 'shape', left: 0, top: 0, width: 240, height: 80, rotate: 0,
  viewBox: [240, 80], path: 'M0 0 H240 V80 H0 Z', fixedRatio: false, fill,
  text: { content: text(id, color).content, defaultColor: color, defaultFontName: 'Arial', align: 'top' },
})

describe('default text ink contrast', () => {
  it('keeps black, white, and neutral default grays responsive to the surface', () => {
    for (const color of defaultInks) {
      expect(isDefaultInk(color)).toBe(true)
      for (const [surface, ink] of [['#F6EBD4', '#000000'], ['#0b1220', '#ffffff']]) {
        expect(resolveLiveTextPaint(color, `<p style="color: ${color}">Default</p>`, {
          background: { type: 'solid', color: surface },
        })).toEqual({ ink, defaultInk: ink, html: `<p style="color: ${ink}">Default</p>` })
      }
    }
  })

  it('preserves saturated dark ink regardless of the slide or own fill', () => {
    for (const color of brandInks) {
      expect(isDefaultInk(color)).toBe(false)
      const html = `<p style="color:${color}">Brand</p>`
      for (const surface of ['#ffffff', '#F6EBD4', '#0b1220']) {
        for (const fill of [undefined, '#ffffff', '#0b1220']) {
          expect(resolveLiveTextPaint(color, html, {
            background: { type: 'solid', color: surface }, fill,
          })).toEqual({ ink: color, defaultInk: color, html })
        }
      }
    }
    expect(isDefaultInk('not-a-color')).toBe(false)
  })

  it('retints only default text declarations in mixed rich HTML', () => {
    const html = '<p style="color:#333333;background-color:#172B43">Default '
      + '<strong style="color:#214846">Teal</strong>'
      + '<span style="color:rgb(23, 43, 67);border-color:#333333">Navy</span>'
      + '<em style="color:#9aa3ad">Gray</em></p>'
    for (const [surface, ink] of [['#F6EBD4', '#000000'], ['#0b1220', '#ffffff']]) {
      expect(resolveLiveTextPaint('#333333', html, {
        background: { type: 'solid', color: surface },
      })).toEqual({
        ink,
        defaultInk: ink,
        html: html.replace('color:#333333', `color: ${ink}`).replace('color:#9aa3ad', `color: ${ink}`),
      })
    }
  })

  it('preserves explicitly selected neutral colors while automatic ink follows the surface', () => {
    const html = '<p><span style="color:#000000">Auto</span><span data-color-explicit="true" style="color:#000000">Black</span><span data-color-explicit="true" style="color:#ffffff">White</span></p>'
    const painted = resolveLiveTextPaint('#000000', html, { background: { type: 'solid', color: '#111111' } })
    expect(painted.html).toContain('style="color: #ffffff">Auto')
    expect(painted.html).toContain('data-color-explicit="true" style="color:#000000">Black')
    expect(painted.html).toContain('data-color-explicit="true" style="color:#ffffff">White')
  })

  it('uses the underlying chip for default labels while preserving brand labels', () => {
    const chip = shape('chip', '#333333', '#0b1220')
    for (const color of ['#333333', '#214846', '#172B43']) {
      const label = text('label', color)
      const painted = resolveLiveTextPaint(color, label.content, {
        element: label, elements: [chip, label], background: { type: 'solid', color: '#ffffff' },
      })
      const ink = color === '#333333' ? '#ffffff' : color
      expect(painted.ink).toBe(ink)
      expect(painted.html).toContain(ink)
    }
  })

  it('preserves brand text across slide surface changes and still retints defaults', () => {
    const original: Slide = {
      id: 'slide', background: { type: 'solid', color: '#F6EBD4' },
      elements: [text('teal', '#214846'), shape('navy', '#172B43'), text('default', '#333333'), shape('chip', '#ffffff', '#0b1220')],
    }
    const snapshot = JSON.stringify(original)
    let slide = original
    const backgrounds: Array<NonNullable<Slide['background']>> = [
      { type: 'solid', color: '#0b1220' },
      { type: 'gradient', gradient: { type: 'linear', rotate: 0, colors: [{ pos: 0, color: '#0b1220' }, { pos: 100, color: '#214846' }] } },
      { type: 'solid', color: '#F6EBD4' },
    ]
    for (const [index, background] of backgrounds.entries()) {
      slide = applySlideBackgroundWithContrast({ ...slide, background }, theme)
      expect(slide.elements[0]).toEqual(original.elements[0])
      expect(slide.elements[1]).toEqual(original.elements[1])
      expect(slide.elements[2]).toMatchObject({ defaultColor: index === 2 ? '#000000' : '#ffffff' })
      expect((slide.elements[2] as PPTTextElement).content).toContain(index === 2 ? '#000000' : '#ffffff')
      expect(slide.elements[3]).toEqual(original.elements[3])
    }
    expect(JSON.stringify(original)).toBe(snapshot)
  })
})

declare global {
  interface Window { __textContrastPainter: typeof SlidePainter }
}

describe('native Canvas text color fidelity', () => {
  let browser: Browser
  let page: Page
  let output: string

  beforeAll(async () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    output = await mkdtemp(join(tmpdir(), 'fika-text-contrast-'))
    const build = await createRsbuild({
      cwd: root,
      rsbuildConfig: {
        logLevel: 'error',
        plugins: [pluginNodePolyfill({ include: ['process'], globals: { process: true } })],
        source: { entry: { painter: join(root, 'src/paint/slidePainter.ts') } },
        output: {
          target: 'web', minify: false, sourceMap: false, filenameHash: false, assetPrefix: '/',
          distPath: { root: output, js: '' }, filename: { js: '[name].js' },
        },
        performance: { chunkSplit: { strategy: 'all-in-one' } },
        tools: {
          htmlPlugin: false,
          rspack: { output: { library: { type: 'window', name: '__textContrastPainter' } } },
        },
      },
    })
    await build.build()
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setContent('<!doctype html><html><body></body></html>')
    await page.addScriptTag({ content: await readFile(join(output, 'painter.js'), 'utf8') })
    if (errors.length) throw new Error(errors.join('\n'))
  }, 30000)

  afterAll(async () => {
    await browser?.close()
    if (output) await rm(output, { recursive: true, force: true })
  })

  it('paints authored teal/navy and adaptive defaults in both text and shape text', async () => {
    const cases = [
      { color: '#214846', surface: '#F6EBD4', expected: '#214846' },
      { color: '#172B43', surface: '#F6EBD4', expected: '#172b43' },
      { color: '#333333', surface: '#F6EBD4', expected: '#000000' },
      { color: '#333333', surface: '#0b1220', expected: '#ffffff' },
    ]
    for (const { color, surface, expected } of cases) {
      for (const element of [text('text', color), shape('shape', color)]) {
        for (const inline of [true, false]) {
          const result = await page.evaluate(({ element, surface, inline }) => {
            // Exercise authored inline runs and inherited defaultColor separately.
            if (!inline) {
              if (element.type === 'text') element.content = '<p style="font-size:48px">Brand</p>'
              else element.text!.content = '<p style="font-size:48px">Brand</p>'
            }
            const canvas = document.createElement('canvas')
            window.__textContrastPainter.paintSlideToCanvas(canvas, {
              slide: { id: 'slide', background: { type: 'solid', color: surface }, elements: [element] },
              theme: { backgroundColor: surface, fontColor: '#333333', fontName: 'Arial', themeColors: [], outline: {}, shadow: { h: 0, v: 0, blur: 0, color: 'transparent' } },
              viewportSize: 240, viewportRatio: 1 / 3, cssWidth: 240, dpr: 1, invalidate: () => {},
            })
            const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
            const colors = new Map<string, number>()
            for (let i = 0; i < pixels.length; i += 4) {
              const hex = '#' + [pixels[i], pixels[i + 1], pixels[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('')
              colors.set(hex, (colors.get(hex) || 0) + 1)
            }
            return Object.fromEntries(colors)
          }, { element, surface, inline })
          // Count fully painted glyph pixels, excluding antialiased edges.
          expect(result[expected]).toBeGreaterThan(100)
          if (color !== '#333333') expect(result['#000000'] || 0).toBe(0)
        }
      }
    }
  })
})
