import { afterEach, describe, expect, it } from '@rstest/core'

const hasDom = typeof document !== 'undefined' && typeof document.createElement === 'function'
import {
  embedSvgFonts,
  fontEmbedCssFor,
  normalizeFontFamily,
  resetFontEmbedCssCache,
} from '../src/utils/fontEmbedCss'

afterEach(() => {
  resetFontEmbedCssCache()
  if (hasDom) document.getElementById('font-embed-css-test')?.remove()
})

describe('font embed CSS', () => {
  it('strips quotes from family names', () => {
    expect(normalizeFontFamily('"KaTeX_Main"')).toBe('KaTeX_Main')
    expect(normalizeFontFamily("'Inter'")).toBe('Inter')
    expect(normalizeFontFamily('  Roboto  ')).toBe('Roboto')
  })

  it.skipIf(!hasDom)('inlines matching @font-face urls as data URLs', async () => {
    const style = document.createElement('style')
    style.id = 'font-embed-css-test'
    style.textContent = `
      @font-face {
        font-family: 'FikaTestFace';
        src: url(data:font/woff2;base64,AA==) format('woff2');
        font-weight: 400;
      }
    `
    document.head.appendChild(style)
    const css = await fontEmbedCssFor(['FikaTestFace'])
    expect(css).toContain('FikaTestFace')
    expect(css).toContain('data:font/woff2;base64,AA==')
  })

  it.skipIf(!hasDom)('skips families that are not requested', async () => {
    const style = document.createElement('style')
    style.id = 'font-embed-css-test'
    style.textContent = `
      @font-face {
        font-family: 'FikaOtherFace';
        src: url(data:font/woff2;base64,BB==) format('woff2');
      }
    `
    document.head.appendChild(style)
    expect(await fontEmbedCssFor(['MissingFace'])).toBe('')
  })

  it.skipIf(!hasDom)('injects inlined faces into an SVG that names them', async () => {
    const style = document.createElement('style')
    style.id = 'font-embed-css-test'
    style.textContent = `
      @font-face {
        font-family: Inter;
        src: url(data:font/woff2;base64,CC==) format('woff2');
      }
    `
    document.head.appendChild(style)
    const face = new FontFace('Inter', 'url(data:font/woff2;base64,CC==)')
    document.fonts.add(face)
    try {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text style="font-family:Inter">Hi</text></svg>'
      const out = await embedSvgFonts(svg)
      expect(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg"><style>')).toBe(true)
      expect(out).toContain('data:font/woff2;base64,CC==')
    }
    finally {
      document.fonts.delete(face)
    }
  })
})
