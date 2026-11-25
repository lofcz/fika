import { EMBED_ROOT_CLASS } from '@/utils/portal'

/**
 * Direct SVG `<foreignObject>` rasterizer for MathLive markup.
 *
 * MathLive's `convertLatexToMarkup` emits deterministic `.ML__*` spans styled
 * by ~14 KB of static CSS and KaTeX `.woff2` fonts. Rendering directly through
 * `<svg><style>...</style><foreignObject>...</foreignObject></svg>` avoids
 * SnapDOM's recursive `getComputedStyle` walk across every `.ML__*` node
 * (~15–40 ms/formula → ~1–2 ms/formula). Callers verify `canvasHasInk` and
 * fall back to SnapDOM only if direct SVG fails.
 */

const KATEX_CLASS_FAMILY_MAP: ReadonlyArray<readonly [needle: string, family: string]> = [
  ['ML__delim-size1', 'katex_size1'],
  ['delim-size1', 'katex_size1'],
  ['ML__small-op', 'katex_size1'],
  ['ML__delim-size2', 'katex_size2'],
  ['ML__large-op', 'katex_size2'],
  ['ML__delim-size3', 'katex_size3'],
  ['ML__delim-size4', 'katex_size4'],
  ['delim-size4', 'katex_size4'],
  ['ML__ams', 'katex_ams'],
  ['ML__bb', 'katex_ams'],
  ['ML__cal', 'katex_caligraphic'],
  ['ML__frak', 'katex_fraktur'],
  ['ML__tt', 'katex_typewriter'],
  ['ML__script', 'katex_script'],
  ['ML__sans', 'katex_sansserif'],
]

/** Extra Fika rules from `mixin.scss` required so fraction & radical bars match live DOM. */
export const FIKA_MATH_BASE_CSS = [
  '.fika-math{display:inline-block;vertical-align:baseline;line-height:normal;white-space:nowrap;--_text-font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
  '.fika-math .ML__latex{line-height:1.2;white-space:nowrap}',
  '.fika-math .ML__base,.fika-math .ML__mfrac,.fika-math .ML__vlist,.fika-math .ML__vlist-t{box-sizing:content-box}',
  '.fika-math .ML__sqrt-line::before,.fika-math .ML__sqrt-line::after,.fika-math .ML__frac-line::after{box-sizing:content-box;border-style:none}',
  '.fika-math.latex-el{display:block;margin:0}',
].join('')

export function extractReferencedKatexFamilies(html: string): string[] {
  const families = new Set<string>(['katex_main', 'katex_math'])
  for (const [needle, family] of KATEX_CLASS_FAMILY_MAP) {
    if (html.includes(needle)) families.add(family)
  }
  return Array.from(families)
}

type FontFaceSource = {
  dedupKey: string
  family: string
  weight: string
  style: string
  url: string
}

let cachedStaticMathCss = ''
let cachedEncodedStaticMathCss = ''
let bundledMathStaticCss = ''
let stylesheetsScanned = false
const fontFaceSourcesByFamily = new Map<string, FontFaceSource[]>()
const resolvedEncodedFontCssByFamily = new Map<string, Promise<string | null>>()
const dataUrlByFontUrl = new Map<string, Promise<string | null>>()

/** Strip `@font-face{...}` and `:root{...}` blocks so static layout CSS never overrides embedded base64 fonts. */
export const stripMathStaticGlobalAtRules = (css: string): string => (
  css.replace(/@font-face\s*\{[^}]*\}/gi, '').replace(/:root\s*\{[^}]*\}/gi, '').trim()
)

/** Supply bundled `mathlive/static.css` text as a fallback when no stylesheet carries `.ML__*`. */
export const setBundledMathStaticCss = (css: string) => {
  const sanitized = stripMathStaticGlobalAtRules(css)
  if (sanitized && sanitized !== bundledMathStaticCss) {
    bundledMathStaticCss = sanitized
    stylesheetsScanned = false
    cachedStaticMathCss = ''
    cachedEncodedStaticMathCss = ''
  }
}

export const getBundledMathStaticCss = () => bundledMathStaticCss

/** Fast check (no CSSRule.cssText serialization) for whether `.ML__*` rules exist in the document. */
export const hasMathliveStaticRules = (): boolean => {
  if (typeof document === 'undefined') return false
  if (document.querySelector('style[data-fika-math-static]')) return true
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | undefined
    try {
      rules = sheet.cssRules
    }
    catch {
      continue
    }
    if (!rules) continue
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]
      if (typeof CSSStyleRule !== 'undefined' && rule instanceof CSSStyleRule) {
        const sel = rule.selectorText
        if (sel && sel.includes('ML__frac-line')) return true
      }
    }
  }
  return false
}

const normalizeKatexFamily = (raw: string): string => (
  raw.replace(/^['"]+|['"]+$/g, '').trim().toLowerCase()
)

const extractFontUrl = (srcValue: string, baseHref: string): string | null => {
  const match = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(srcValue)
  if (!match?.[1]) return null
  const raw = match[1].trim()
  if (!raw) return null
  if (raw.startsWith('data:')) return raw
  try {
    return new URL(raw, baseHref).href
  }
  catch {
    return raw
  }
}

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + chunkSize))
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

const fetchFontAsDataUrl = (url: string): Promise<string | null> => {
  if (url.startsWith('data:')) return Promise.resolve(url)
  let pending = dataUrlByFontUrl.get(url)
  if (!pending) {
    pending = fetch(url)
      .then(async res => {
        if (!res.ok) return null
        const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'font/woff2'
        const buf = await res.arrayBuffer()
        return `data:${mime};base64,${arrayBufferToBase64(buf)}`
      })
      .catch(() => null)
      .then(result => {
        if (!result) dataUrlByFontUrl.delete(url)
        return result
      })
    dataUrlByFontUrl.set(url, pending)
  }
  return pending
}

const ensureMathCssIndexed = (): boolean => {
  if (stylesheetsScanned && cachedStaticMathCss && fontFaceSourcesByFamily.size > 0) return true
  if (typeof document === 'undefined') return false
  const staticRules: string[] = []
  const seenFontKeys = new Set<string>()
  for (const existing of fontFaceSourcesByFamily.values()) {
    for (const src of existing) seenFontKeys.add(src.dedupKey)
  }
  const docBase = document.baseURI || (typeof location !== 'undefined' ? location.href : '')
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | undefined
    try {
      rules = sheet.cssRules
    }
    catch {
      continue
    }
    if (!rules) continue
    const sheetBase = sheet.href || docBase
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]
      // Filter by selectorText / font-family BEFORE reading rule.cssText so we
      // never serialize thousands of unrelated app CSSOM rules on initial load.
      if (typeof CSSFontFaceRule !== 'undefined' && rule instanceof CSSFontFaceRule) {
        const familyRaw = rule.style.getPropertyValue('font-family')
        if (!familyRaw || !/KaTeX/i.test(familyRaw)) continue
        const family = normalizeKatexFamily(familyRaw)
        const weight = (rule.style.getPropertyValue('font-weight') || '400').trim()
        const style = (rule.style.getPropertyValue('font-style') || 'normal').trim()
        const srcProp = rule.style.getPropertyValue('src') || rule.cssText
        const url = extractFontUrl(srcProp, sheetBase)
        if (!url) continue
        const dedupKey = `${family}|${weight}|${style}`
        if (seenFontKeys.has(dedupKey)) continue
        seenFontKeys.add(dedupKey)
        let bucket = fontFaceSourcesByFamily.get(family)
        if (!bucket) {
          bucket = []
          fontFaceSourcesByFamily.set(family, bucket)
        }
        bucket.push({
          dedupKey,
          family: familyRaw.replace(/^['"]+|['"]+$/g, '').trim(),
          weight,
          style,
          url,
        })
        continue
      }
      if (typeof CSSStyleRule !== 'undefined' && rule instanceof CSSStyleRule) {
        const sel = rule.selectorText || ''
        if (sel.includes('ML__') || sel.includes('fika-math')) {
          const text = rule.cssText
          if (text) staticRules.push(text)
        }
      }
      else if (typeof CSSGroupingRule !== 'undefined' && rule instanceof CSSGroupingRule) {
        const text = rule.cssText
        if (text && (text.includes('ML__') || text.includes('fika-math'))) {
          staticRules.push(text)
        }
      }
    }
  }
  const baseStatic = staticRules.length > 0 ? staticRules.join('') : bundledMathStaticCss
  if (baseStatic && fontFaceSourcesByFamily.size > 0) {
    cachedStaticMathCss = `${baseStatic}${FIKA_MATH_BASE_CSS}`
    cachedEncodedStaticMathCss = encodeURIComponent(cachedStaticMathCss)
    stylesheetsScanned = true
    return true
  }
  return false
}

const getEncodedFontCssForFamily = (family: string): Promise<string | null> => {
  const existing = resolvedEncodedFontCssByFamily.get(family)
  if (existing) return existing
  const sources = fontFaceSourcesByFamily.get(family)
  if (!sources?.length) return Promise.resolve(null)
  const promise = Promise.all(
    sources.map(async src => {
      const dataUrl = await fetchFontAsDataUrl(src.url)
      if (!dataUrl) return null
      return `@font-face{font-family:"${src.family}";font-style:${src.style};font-weight:${src.weight};src:url("${dataUrl}") format("woff2")}`
    }),
  ).then(parts => {
    if (parts.some(part => !part)) {
      resolvedEncodedFontCssByFamily.delete(family)
      return null
    }
    // Pre-encode once per KaTeX family (`encodeURIComponent` is homomorphic
    // under concatenation), eliminating ~160ms of per-formula base64 escaping
    // while keeping `data:image/svg+xml` untainted across Chromium & Firefox.
    return encodeURIComponent(parts.join(''))
  })
  resolvedEncodedFontCssByFamily.set(family, promise)
  return promise
}

let sharedXmlSerializer: XMLSerializer | null = null
const getXmlSerializer = () => {
  if (!sharedXmlSerializer) sharedXmlSerializer = new XMLSerializer()
  return sharedXmlSerializer
}

const SVG_STYLE_OPEN_ENC = encodeURIComponent('<style><![CDATA[')
const SVG_STYLE_CLOSE_OPEN_FO_ENC = encodeURIComponent(']]></style><foreignObject x="0" y="0" ')
const SVG_FO_DIV_OPEN_ENC = encodeURIComponent(`><div xmlns="http://www.w3.org/1999/xhtml" class="${EMBED_ROOT_CLASS}" style="margin:0;padding:0;background:transparent">`)
const SVG_TAIL_ENC = encodeURIComponent('</div></foreignObject></svg>')

/**
 * Render an already-measured offscreen MathLive `host` directly to a HiDPI
 * canvas via SVG `<foreignObject>`. Returns `null` if stylesheets/fonts aren't
 * indexable yet or if decoding fails (caller falls back to SnapDOM).
 */
export async function captureMathHostDirectSvg(
  host: HTMLElement,
  width: number,
  height: number,
  dpr: number,
): Promise<HTMLCanvasElement | null> {
  if (!ensureMathCssIndexed()) return null
  const families = extractReferencedKatexFamilies(host.innerHTML)
  const encodedFontCssParts = await Promise.all(families.map(getEncodedFontCssForFamily))
  // Every referenced KaTeX font family must resolve; otherwise fall back to SnapDOM.
  if (encodedFontCssParts.some(part => !part)) return null
  const xhtml = getXmlSerializer().serializeToString(host)
  const pixelW = Math.max(1, Math.ceil(width * dpr))
  const pixelH = Math.max(1, Math.ceil(height * dpr))
  // Only encode the tiny per-formula markup + header; CSS and embedded woff2
  // font faces are pre-encoded once per session/family (keeps data: URI clean
  // so Chromium never taints the canvas like blob: SVG <foreignObject> URLs).
  const encodedHead = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelW}" height="${pixelH}" viewBox="0 0 ${width} ${height}">`,
  )
  const encodedFoDims = encodeURIComponent(`width="${width}" height="${height}"`)
  const dataUri = `data:image/svg+xml;charset=utf-8,${encodedHead}${SVG_STYLE_OPEN_ENC}${encodedFontCssParts.join('')}${cachedEncodedStaticMathCss}${SVG_STYLE_CLOSE_OPEN_FO_ENC}${encodedFoDims}${SVG_FO_DIV_OPEN_ENC}${encodeURIComponent(xhtml)}${SVG_TAIL_ENC}`

  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Direct math SVG decode failed'))
      image.src = dataUri
    })
    const out = document.createElement('canvas')
    out.width = pixelW
    out.height = pixelH
    out.style.width = `${width}px`
    out.style.height = `${height}px`
    const ctx = out.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(image, 0, 0, pixelW, pixelH)
    return out
  }
  catch {
    return null
  }
}

export const resetMathSvgRasterCache = () => {
  stylesheetsScanned = false
  cachedStaticMathCss = ''
  cachedEncodedStaticMathCss = ''
  fontFaceSourcesByFamily.clear()
  resolvedEncodedFontCssByFamily.clear()
  dataUrlByFontUrl.clear()
}
