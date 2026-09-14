/**
 * `@font-face` CSS with the font files inlined as data URLs, for markup that
 * is rasterised as a standalone SVG image (mermaid diagrams): an SVG drawn
 * through `<img>` cannot reach the page's web fonts, so any family it names
 * must travel with it.
 *
 * Walks document stylesheets for matching `@font-face` rules and inlines
 * their `url()` sources. Results are cached per family set; a result without
 * inlined data (stylesheet not parsed yet, font fetch failed) is not cached
 * so the next capture retries.
 */

const cache = new Map<string, Promise<string>>()

const FONT_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi

export const normalizeFontFamily = (family: string) => family.trim().replace(/^["']|["']$/g, '')

const familyKey = (family: string) => normalizeFontFamily(family).toLowerCase()

/** Families the document declares via `@font-face` (loaded or not). */
export const declaredFontFamilies = (): Set<string> => {
  const families = new Set<string>()
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (!fonts) return families
  for (const face of fonts as unknown as Iterable<FontFace>) families.add(normalizeFontFamily(face.family))
  return families
}

const resolveUrl = (src: string, baseHref: string | null): string => {
  if (/^(data:|blob:|https?:)/i.test(src)) return src
  try {
    return new URL(src, baseHref || (typeof document !== 'undefined' ? document.baseURI : undefined)).href
  }
  catch {
    return src
  }
}

const urlToDataUrl = async (url: string): Promise<string | null> => {
  if (url.startsWith('data:')) return url
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  }
  catch {
    return null
  }
}

const inlineUrls = async (cssText: string, baseHref: string | null): Promise<string> => {
  const replacements = new Map<string, string>()
  FONT_URL.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FONT_URL.exec(cssText))) {
    const raw = match[2]
    if (replacements.has(raw) || raw.startsWith('data:')) continue
    const data = await urlToDataUrl(resolveUrl(raw, baseHref))
    if (data) replacements.set(raw, data)
  }
  let next = cssText
  for (const [from, to] of replacements) next = next.split(from).join(to)
  return next
}

const collectFontFaceRules = (): Array<{ rule: CSSFontFaceRule; href: string | null }> => {
  const found: Array<{ rule: CSSFontFaceRule; href: string | null }> = []
  if (typeof document === 'undefined') return found
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    }
    catch {
      continue
    }
    const href = sheet.href
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) found.push({ rule, href })
    }
  }
  return found
}

export const fontEmbedCssFor = (families: readonly string[], _host?: HTMLElement): Promise<string> => {
  const wanted = [...new Set(families.map(familyKey))].filter(Boolean).sort()
  if (!wanted.length || typeof document === 'undefined') return Promise.resolve('')
  const key = wanted.join('\0')
  const cached = cache.get(key)
  if (cached) return cached
  const wantedSet = new Set(wanted)
  const promise = Promise.resolve()
    .then(async () => {
      const chunks: string[] = []
      for (const { rule, href } of collectFontFaceRules()) {
        const family = familyKey(rule.style.getPropertyValue('font-family'))
        if (!wantedSet.has(family)) continue
        const inlined = await inlineUrls(rule.cssText, href)
        if (/data:/.test(inlined)) chunks.push(inlined)
      }
      return chunks.join('\n')
    })
    .then(css => {
      if (!/data:/.test(css)) cache.delete(key)
      return css
    })
    .catch(() => {
      cache.delete(key)
      return ''
    })
  cache.set(key, promise)
  return promise
}

/** Drop cached CSS so a later capture retries stylesheet reads. Tests only. */
export const resetFontEmbedCssCache = () => {
  cache.clear()
}

const FONT_FAMILY_DECL = /font-family\s*[:=]\s*("[^"]*"|'[^']*'|[^;"'}>]+)/g

/**
 * Inline every declared web font an SVG names into a `<style>` at its top,
 * so the diagram paints the same through `<img>` as it does in the DOM.
 * Families the document does not declare (system stacks, generics) are left
 * to the renderer.
 */
export const embedSvgFonts = async (svg: string): Promise<string> => {
  const declared = declaredFontFamilies()
  const used = new Set<string>()
  for (const match of svg.matchAll(FONT_FAMILY_DECL)) {
    for (const family of match[1].split(',')) {
      const name = normalizeFontFamily(family)
      if (declared.has(name)) used.add(name)
    }
  }
  if (!used.size) return svg
  const css = await fontEmbedCssFor([...used])
  if (!css) return svg
  const open = svg.indexOf('>', svg.indexOf('<svg'))
  if (open < 0) return svg
  return `${svg.slice(0, open + 1)}<style>${css}</style>${svg.slice(open + 1)}`
}
