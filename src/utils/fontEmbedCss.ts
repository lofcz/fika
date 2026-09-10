/**
 * `@font-face` CSS with the font files inlined as data URLs, for markup that
 * is rasterised as a standalone SVG image (math booths, mermaid diagrams):
 * an SVG drawn through `<img>` cannot reach the page's web fonts, so any
 * family it names must travel with it.
 *
 * html-to-image only inlines the families the probed node uses, so the probe
 * is a stub naming exactly the requested families. Results are cached per
 * family set; a result without inlined data (stylesheet not parsed yet, font
 * fetch failed) is not cached so the next capture retries.
 */

const cache = new Map<string, Promise<string>>()

const normalizeFamily = (family: string) => family.trim().replace(/^["']|["']$/g, '')

/** Families the document declares via `@font-face` (loaded or not). */
export const declaredFontFamilies = (): Set<string> => {
  const families = new Set<string>()
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (!fonts) return families
  for (const face of fonts as unknown as Iterable<FontFace>) families.add(normalizeFamily(face.family))
  return families
}

export const fontEmbedCssFor = (families: readonly string[], host?: HTMLElement): Promise<string> => {
  const wanted = [...new Set(families.map(normalizeFamily))].filter(Boolean).sort()
  if (!wanted.length || typeof document === 'undefined') return Promise.resolve('')
  const key = wanted.join('\0')
  const cached = cache.get(key)
  if (cached) return cached
  const promise = import('html-to-image')
    .then(async mod => {
      const probe = document.createElement('div')
      probe.setAttribute('aria-hidden', 'true')
      probe.style.cssText = 'position:fixed;left:-10000px;top:0;width:max-content;pointer-events:none'
      for (const family of wanted) {
        const span = document.createElement('span')
        span.style.fontFamily = `"${family}"`
        span.textContent = 'x'
        probe.appendChild(span)
      }
      ;(host ?? document.documentElement).appendChild(probe)
      try {
        return await mod.getFontEmbedCSS(probe)
      }
      finally {
        probe.remove()
      }
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
      const name = normalizeFamily(family)
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
