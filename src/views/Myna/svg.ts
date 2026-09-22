import type { Gradient, PPTElement, PPTElementOutline, PPTTableElement, Slide, SlideTheme } from '@/types/slides'
import { frameClipPolygon, frameDescendantIds } from '@/utils/nestedFrames'
import { paintRichText, type CanvasTextPaintOptions } from '@/paint/textPainter'
import { renderSlideImage } from '@/embed/render'
import { getElementListRange, getLineElementRenderPath, getTableThemeColors } from '@/utils/element'
import { imageClipPathData, imageClipKind, imageCornerRadius, outlineDashArray } from '@/utils/elementPaint'
import { resolveShapePaintPath } from '@/utils/elementOutline'
import { resolveLiveTextPaint, resolveTableCellFill, resolveChartElementSeriesColors, resolveChartLabelColor } from '@/utils/textContrast'
import { resolvePaintFontFamily } from '@/utils/textFit'
import { elementLocksTextBox, resolveTextBoxLayout } from '@/utils/placeholderLayout'
import { getFikaExportMediaResolver } from '@/configs/exportMediaResolver'
import { embedSvgFonts } from '@/utils/fontEmbedCss'
import { getChartOption, expandChartThemeColors } from '@/views/components/element/ChartElement/chartOption'
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { DEFAULT_CHART_LINE_COLOR } from '@/configs/chart'

export interface MynaSvgTarget { slide: Slide; theme: SlideTheme; viewportSize: number; viewportRatio: number }
export interface MynaSvgOptions { selectedIds?: readonly string[]; transparentBackground?: boolean; signal?: AbortSignal }
export interface MynaSvgResult { blob: Blob; svg: string; width: number; height: number; warnings: string[] }
const xml = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
const n = (v: number) => Number.isFinite(v) ? +v.toFixed(4) : 0
const blobData = (blob: Blob) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(blob) })

/** Inline SVG media keeps QR codes and uploaded vector art editable in downstream tools. */
function inlineSvg(source: string, prefix: string, x: number, y: number, width: number, height: number): string | null {
  if (!/^data:image\/svg\+xml[;,]/i.test(source)) return null
  const comma = source.indexOf(',')
  const raw = source.slice(0, comma).includes(';base64') ? new TextDecoder().decode(Uint8Array.from(atob(source.slice(comma + 1)), c => c.charCodeAt(0))) : decodeURIComponent(source.slice(comma + 1))
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml')
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Invalid SVG media')
  const svg = doc.documentElement
  if (svg.querySelector('style,foreignObject')) return null
  for (const unsafe of svg.querySelectorAll('script,foreignObject,iframe,object,embed,animate,animateTransform,set')) unsafe.remove()
  const ids = new Map<string, string>()
  for (const node of svg.querySelectorAll('[id]')) { const old = node.id; ids.set(old, `${prefix}-${ids.size}`); node.id = ids.get(old)! }
  for (const node of [svg, ...svg.querySelectorAll('*')]) {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name)) { node.removeAttribute(attr.name); continue }
      let value = attr.value
      if (attr.localName === 'href' && !value.startsWith('#') && !value.startsWith('data:image/')) { node.removeAttributeNode(attr); continue }
      for (const [old, next] of ids) { value = value.split(`url(#${old})`).join(`url(#${next})`); if (value === `#${old}`) value = `#${next}` }
      node.setAttribute(attr.name, value)
    }
  }
  // CSS styles can load external resources; presentation attributes and vector geometry survive.
  for (const style of svg.querySelectorAll('style')) style.remove()
  if (!svg.hasAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${parseFloat(svg.getAttribute('width') || '') || width} ${parseFloat(svg.getAttribute('height') || '') || height}`)
  svg.setAttribute('x', String(x)); svg.setAttribute('y', String(y)); svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height)); svg.setAttribute('preserveAspectRatio', 'none')
  return new XMLSerializer().serializeToString(svg)
}

/** Record the native text painter's laid-out glyph runs, rather than reimplement wrapping. */
function vectorText(options: CanvasTextPaintOptions): string {
  const ctx = document.createElement('canvas').getContext('2d')!
  const chunks: string[] = []
  const stack: string[] = []
  let transform = '', path = ''
  const attrs = () => ` transform="${xml(transform)}" opacity="${ctx.globalAlpha}"`
  const methods: Record<string, (...args: any[]) => any> = {
    save: () => { ctx.save(); stack.push(transform) },
    restore: () => { ctx.restore(); transform = stack.pop() || '' },
    translate: (x, y) => { transform += ` translate(${n(x)} ${n(y)})` },
    rotate: a => { transform += ` rotate(${n(a * 180 / Math.PI)})` },
    fillText: (text, x, y) => {
      const style = document.createElement('span').style; style.font = ctx.font
      const f = `font-style="${xml(style.fontStyle)}" font-weight="${xml(style.fontWeight)}" font-size="${xml(style.fontSize)}" font-family="${xml(style.fontFamily)}"`
      chunks.push(`<text x="${n(x)}" y="${n(y)}" ${f} fill="${xml(ctx.fillStyle)}" letter-spacing="${xml(ctx.letterSpacing || '0px')}" text-anchor="${ctx.textAlign === 'right' ? 'end' : 'start'}" xml:space="preserve"${attrs()}>${xml(text)}</text>`)
    },
    beginPath: () => { path = '' },
    moveTo: (x, y) => { path += `M${n(x)} ${n(y)}` },
    lineTo: (x, y) => { path += `L${n(x)} ${n(y)}` },
    stroke: () => chunks.push(`<path d="${path}" fill="none" stroke="${xml(ctx.strokeStyle)}" stroke-width="${ctx.lineWidth}"${attrs()}/>`),
    drawImage: (source, x, y, width, height) => {
      const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height
      canvas.getContext('2d')!.drawImage(source, 0, 0)
      chunks.push(`<image href="${canvas.toDataURL()}" x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}"${attrs()}/>`)
    },
  }
  const recorder = new Proxy(ctx, { get: (o, p) => methods[String(p)] || (typeof Reflect.get(o, p) === 'function' ? Reflect.get(o, p).bind(o) : Reflect.get(o, p)), set: (o, p, v) => Reflect.set(o, p, v) })
  paintRichText(recorder, options)
  return chunks.join('')
}

/** Portable SVG with editable vector primitives; complex unsupported objects are isolated raster fallbacks. */
export async function exportMynaSvg(target: MynaSvgTarget, options: MynaSvgOptions = {}): Promise<MynaSvgResult> {
  const { slide, theme, viewportSize: pageWidth, viewportRatio } = target
  const pageHeight = pageWidth * viewportRatio
  const warnings: string[] = [], defs: string[] = []
  let serial = 0
  const id = () => `fika-svg-${++serial}`
  const check = () => options.signal?.throwIfAborted()
  check(); await document.fonts?.ready
  const selected = options.selectedIds ? new Set(options.selectedIds) : null
  const groups = new Set(slide.elements.filter(e => selected?.has(e.id) && e.groupId).map(e => e.groupId))
  const expanded = selected ? new Set(frameDescendantIds(slide.elements, slide.elements.filter(e => selected.has(e.id) || (e.groupId && groups.has(e.groupId))).map(e => e.id))) : null
  const elements = slide.elements.filter(e => !expanded || expanded.has(e.id))
  if (!elements.length && selected) throw new Error('No elements selected for SVG export')
  // Selection bounds include descendants, but clipped overflow must not enlarge a frame export.
  const visibleRanges = selected ? elements.flatMap(element => {
    const bounds = getElementListRange([element]), clip = frameClipPolygon(element, slide.elements)
    if (!clip) return [bounds]
    if (!clip.length) return []
    const clipped = { minX: Math.max(bounds.minX, Math.min(...clip.map(point => point.x))), minY: Math.max(bounds.minY, Math.min(...clip.map(point => point.y))), maxX: Math.min(bounds.maxX, Math.max(...clip.map(point => point.x))), maxY: Math.min(bounds.maxY, Math.max(...clip.map(point => point.y))) }
    return clipped.maxX >= clipped.minX && clipped.maxY >= clipped.minY ? [clipped] : []
  }) : []
  const range = selected && visibleRanges.length ? { minX: Math.min(...visibleRanges.map(r => r.minX)), minY: Math.min(...visibleRanges.map(r => r.minY)), maxX: Math.max(...visibleRanges.map(r => r.maxX)), maxY: Math.max(...visibleRanges.map(r => r.maxY)) } : selected ? getElementListRange(elements) : { minX: 0, minY: 0, maxX: pageWidth, maxY: pageHeight }
  // Native range includes rotated boxes and line control points. Reserve painted strokes and shadows.
  const padding = selected ? Math.max(0, ...elements.map(e => {
    const stroke = e.type === 'line' ? e.width : ('outline' in e ? e.outline?.width || 0 : 0)
    const shadow = 'shadow' in e ? e.shadow : undefined
    return (e.type === 'line' && e.points.some(Boolean) ? stroke * 5 : stroke / 2) + (shadow ? Math.max(Math.abs(shadow.h), Math.abs(shadow.v)) + shadow.blur * 2 : 0)
  })) : 0
  const x = range.minX - padding, y = range.minY - padding
  const width = Math.max(1, range.maxX - range.minX + padding * 2), height = Math.max(1, range.maxY - range.minY + padding * 2)
  const media = new Map<string, Promise<string>>()
  const embed = (src: string) => {
    if (src.startsWith('data:')) return Promise.resolve(src)
    if (!media.has(src)) media.set(src, (async () => {
      try { const response = await fetch(src, { signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) }); if (!response.ok) throw new Error(`${response.status}`); return await blobData(await response.blob()) }
      catch (error) { check(); const resolved = await getFikaExportMediaResolver()?.(src); if (resolved?.startsWith('data:')) return resolved; throw new Error(`Cannot embed export image: ${src}`, { cause: error }) }
    })())
    return media.get(src)!
  }
  const gradient = (g: Gradient) => {
    const key = id(), stops = g.colors.map(s => `<stop offset="${s.pos}%" stop-color="${xml(s.color)}"/>`).join('')
    defs.push(g.type === 'radial' ? `<radialGradient id="${key}">${stops}</radialGradient>` : `<linearGradient id="${key}" x1="0" y1="0.5" x2="1" y2="0.5" gradientTransform="rotate(${n(g.rotate)} .5 .5)">${stops}</linearGradient>`)
    return `url(#${key})`
  }
  const outline = (o?: PPTElementOutline) => o?.width ? `stroke="${xml(o.color)}" stroke-width="${o.width}" stroke-dasharray="${outlineDashArray(o.style, o.width)?.join(' ') || 'none'}"` : 'stroke="none"'
  const rect = (w: number, h: number, fill: string, o?: PPTElementOutline) => `<rect width="${n(w)}" height="${n(h)}" fill="${xml(fill || 'none')}" ${outline(o)}/>`
  const text = (e: Extract<PPTElement, { type: 'text' | 'shape' }>) => {
    const t = e.type === 'text' ? e : e.text
    if (!t?.content) return ''
    const painted = resolveLiveTextPaint(t.defaultColor || theme.fontColor, t.content, { element: e, elements: slide.elements, fill: e.fill, background: slide.background, fallbackSurface: theme.backgroundColor, themeFontColor: theme.fontColor })
    const layout = e.type === 'text' ? resolveTextBoxLayout(e, slide.type) : { vAlign: e.text?.align }
    return vectorText({ html: painted.html, x: 0, y: 0, width: e.width, height: e.height, defaultFontFamily: resolvePaintFontFamily(t.defaultFontName || theme.fontName), defaultColor: painted.ink, lineHeight: t.lineHeight, letterSpacing: t.wordSpace, paragraphSpace: t.paragraphSpace, inset: t.inset, vAlign: layout.vAlign, fit: e.type === 'text' ? elementLocksTextBox(e) : t.fixedHeight !== false, vertical: e.type === 'text' && e.vertical })
  }
  const fallback = async (e: PPTElement, reason: string) => {
    warnings.push(`${e.name || e.id}: ${reason}; embedded as a raster image.`)
    const shadow = 'shadow' in e ? e.shadow : undefined
    const pad = Math.max(32, shadow ? Math.max(Math.abs(shadow.h), Math.abs(shadow.v)) + shadow.blur * 2 : 0)
    const range = getElementListRange([e]), left = range.minX - pad, top = range.minY - pad
    const w = Math.max(1, range.maxX - range.minX + pad * 2), h = Math.max(1, range.maxY - range.minY + pad * 2)
    const copy = { ...e, left: e.left - left, top: e.top - top }
    const result = await renderSlideImage({ ...target, slide: { ...slide, elements: [copy], background: undefined }, viewportSize: w, viewportRatio: h / w }, { width: Math.ceil(w * 2), transparentBackground: true, fullResolutionImages: true, timeoutMs: 15000 })
    return `<image x="${n(left)}" y="${n(top)}" width="${n(w)}" height="${n(h)}" href="${await blobData(result.blob)}"/>`
  }
  const table = (e: PPTTableElement) => {
    const chunks: string[] = [], occupied = new Set<string>(), rows = e.data.length, cols = e.colWidths.length
    const sum = e.colWidths.reduce((a, b) => a + b, 0) || 1, widths = e.colWidths.map(w => w / sum * e.width), rh = Math.max(e.cellMinHeight, e.height / rows)
    for (let r = 0; r < rows; r++) { let left = 0; for (let c = 0; c < cols; c++) {
      const cell = e.data[r][c], cw = widths[c]; if (!cell || occupied.has(`${r}:${c}`)) { left += cw; continue }
      const cs = Math.max(1, cell.colspan), rs = Math.max(1, cell.rowspan), w = widths.slice(c, c + cs).reduce((a, b) => a + b, 0), h = rh * rs
      for (let rr = r; rr < r + rs; rr++) for (let cc = c; cc < c + cs; cc++) occupied.add(`${rr}:${cc}`)
      const s = cell.style || {}, colors = e.theme ? getTableThemeColors(e.theme.color) : undefined
      chunks.push(`<g transform="translate(${n(left)} ${n(r * rh)})">${rect(w, h, resolveTableCellFill(e, r, c) || (colors ? r % 2 ? colors.stripe : colors.stripeAlt : 'none'))}`)
      const edges = [[s.borderTopWidth, 0, 0, w, 0], [s.borderRightWidth, w, 0, w, h], [s.borderBottomWidth, 0, h, w, h], [s.borderLeftWidth, 0, 0, 0, h]]
      for (const [sw, x1, y1, x2, y2] of edges) chunks.push(`<path d="M${x1} ${y1}L${x2} ${y2}" ${outline({ ...e.outline, width: sw ?? e.outline?.width })}/>`)
      const key = id(); defs.push(`<clipPath id="${key}">${rect(w, h, '#fff')}</clipPath>`)
      const css = `font-size:${s.fontsize || '14px'};color:${s.color || theme.fontColor};font-family:${s.fontname || theme.fontName};text-align:${s.align || 'left'};font-weight:${s.bold ? 'bold' : 'normal'};font-style:${s.em ? 'italic' : 'normal'};text-decoration:${s.underline ? 'underline' : ''} ${s.strikethrough ? 'line-through' : ''}`
      chunks.push(`<g clip-path="url(#${key})">${vectorText({ html: `<p style="${xml(css)}">${xml(cell.text).replace(/\n/g, '<br>')}</p>`, x: 0, y: 0, width: w, height: h, defaultFontFamily: resolvePaintFontFamily(s.fontname || theme.fontName), defaultColor: s.color || theme.fontColor, defaultSize: parseFloat(s.fontsize || '14'), lineHeight: 1.45, paragraphSpace: 0, inset: [10, 14, 10, 14], vAlign: s.vAlign || 'middle', align: s.align || 'left' })}</g></g>`)
      left += cw
    }}
    return chunks.join('')
  }
  const chunks: string[] = []
  if (!selected && !options.transparentBackground) {
    const bg = slide.background
    chunks.push(rect(pageWidth, pageHeight, bg?.type === 'gradient' && bg.gradient ? gradient(bg.gradient) : bg?.color || theme.backgroundColor || '#fff'))
    if (bg?.type === 'image' && bg.image) {
      const href = await embed(bg.image.src)
      if (bg.image.size === 'repeat') {
        const img = new Image(); img.src = href; await img.decode()
        const key = id(); defs.push(`<pattern id="${key}" patternUnits="userSpaceOnUse" width="${img.naturalWidth}" height="${img.naturalHeight}"><image href="${xml(href)}" width="${img.naturalWidth}" height="${img.naturalHeight}"/></pattern>`)
        chunks.push(rect(pageWidth, pageHeight, `url(#${key})`))
      }
      else chunks.push(`<image width="${pageWidth}" height="${pageHeight}" preserveAspectRatio="xMidYMid ${bg.image.size === 'contain' ? 'meet' : 'slice'}" href="${xml(href)}"/>`)
    }
  }
  echarts.use([SVGRenderer])
  for (const e of elements) {
    check()
    // Clip in page coordinates outside the element's own transform, including raster fallbacks.
    const polygon = frameClipPolygon(e, slide.elements)
    if (polygon && !polygon.length) continue
    let frameClip = ''
    if (polygon) {
      const key = id()
      defs.push(`<clipPath id="${key}" clipPathUnits="userSpaceOnUse"><polygon points="${polygon.map(point => `${n(point.x)},${n(point.y)}`).join(' ')}"/></clipPath>`)
      frameClip = key
    }
    const append = (markup: string) => chunks.push(frameClip ? `<g clip-path="url(#${frameClip})" data-element-id="${xml(e.id)}"${e.groupId ? ` data-group-id="${xml(e.groupId)}"` : ''}>${markup}</g>` : markup)
    if (e.effects && Object.keys(e.effects).length || e.type === 'text' && /data-latex|math-inline|math-node/.test(e.content)) { append(await fallback(e, 'Advanced effect or inline mathematics')); continue }
    let body = '', extra = '', transform = `translate(${n(e.left)} ${n(e.top)})`
    if (e.type !== 'line') {
      transform += ` rotate(${n(e.rotate || 0)} ${n(e.width / 2)} ${n(e.height / 2)})`
      if ('flipH' in e && e.flipH) transform += ` translate(${e.width} 0) scale(-1 1)`
      if ('flipV' in e && e.flipV) transform += ` translate(0 ${e.height}) scale(1 -1)`
    }
    if (e.type !== 'image' && 'opacity' in e) extra += ` opacity="${e.opacity ?? 1}"`
    if ('shadow' in e && e.shadow) {
      const key = id(), s = e.shadow
      defs.push(`<filter id="${key}" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="${s.h}" dy="${s.v}" stdDeviation="${s.blur / 2}" flood-color="${xml(s.color)}"/></filter>`)
      extra += ` filter="url(#${key})"`
    }
    switch (e.type) {
      case 'text': body = rect(e.width, e.height, e.fill || 'none', e.outline) + text(e); break
      case 'shape': {
        const key = id(), path = `<path d="${xml(resolveShapePaintPath(e))}" transform="scale(${e.width / e.viewBox[0]} ${e.height / e.viewBox[1]})" fill-rule="evenodd"`
        body = `${path} fill="${xml(e.gradient ? gradient(e.gradient) : e.fill || 'none')}" ${outline(e.outline)} vector-effect="non-scaling-stroke"/>`
        if (e.pattern) { defs.push(`<clipPath id="${key}">${path}/></clipPath>`); body += `<image width="${e.width}" height="${e.height}" preserveAspectRatio="xMidYMid slice" href="${xml(await embed(e.pattern))}" clip-path="url(#${key})"/>` }
        body += text(e); break
      }
      case 'image': {
        if (e.colorMask || e.filters && Object.entries(e.filters).some(([k, v]) => k !== 'opacity' && v && parseFloat(v) !== (['brightness', 'contrast', 'saturate'].includes(k) ? v.includes('%') ? 100 : 1 : 0))) { append(await fallback(e, 'Image color effect')); continue }
        const key = id(), kind = imageClipKind(e), path = imageClipPathData(e)
        const mask = kind === 'ellipse' ? `<ellipse cx="${e.width / 2}" cy="${e.height / 2}" rx="${e.width / 2}" ry="${e.height / 2}"/>` : path ? `<path d="${xml(path)}"/>` : `<rect width="${e.width}" height="${e.height}" rx="${imageCornerRadius(e)}"/>`
        defs.push(`<clipPath id="${key}">${mask}</clipPath>`)
        const [[sx, sy], [ex, ey]] = e.clip?.range || [[0, 0], [100, 100]], w = e.width * 100 / Math.max(.001, ex - sx), h = e.height * 100 / Math.max(.001, ey - sy)
        const source = await embed(e.src)
        body = `<g clip-path="url(#${key})">${inlineSvg(source, id(), -w * sx / 100, -h * sy / 100, w, h) || `<image x="${-w * sx / 100}" y="${-h * sy / 100}" width="${w}" height="${h}" preserveAspectRatio="none" href="${xml(source)}"/>`}</g>`
        if (e.outline?.width) body += mask.replace('/>', ` fill="none" ${outline(e.outline)}/>`)
        const ownOpacity = 'opacity' in e && typeof e.opacity === 'number' ? e.opacity : 1
        if (e.filters?.opacity || ownOpacity !== 1) extra += ` opacity="${ownOpacity * (e.filters?.opacity ? parseFloat(e.filters.opacity) / (e.filters.opacity.includes('%') ? 100 : 1) : 1)}"`
        break
      }
      case 'line': {
        const markers = e.points.map((p, i) => {
          if (!p) return ''
          const key = id(); defs.push(`<marker id="${key}" viewBox="0 0 10 10" refX="${p === 'dot' ? 5 : 9}" refY="5" markerWidth="${p === 'dot' ? 3 : 5}" markerHeight="${p === 'dot' ? 3 : 5}" orient="auto-start-reverse">${p === 'dot' ? `<circle cx="5" cy="5" r="4" fill="${xml(e.color)}"/>` : `<path d="M0 0L10 5L0 10Z" fill="${xml(e.color)}"/>`}</marker>`)
          return `marker-${i ? 'end' : 'start'}="url(#${key})"`
        }).join(' ')
        body = `<path d="${xml(getLineElementRenderPath(e))}" fill="none" ${outline({ color: e.color, width: e.width, style: e.style })} ${markers}/>`; break
      }
      case 'table': body = table(e); break
      case 'chart': {
        const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: e.width, height: e.height })
        try {
          const colors = resolveChartElementSeriesColors(e, { background: slide.background, fallbackSurface: theme.backgroundColor })
          const option = getChartOption({ type: e.chartType, data: e.data, themeColors: expandChartThemeColors(colors), textColor: resolveChartLabelColor(e, { background: slide.background, fallbackSurface: theme.backgroundColor, fontColor: theme.fontColor }), lineColor: e.lineColor || DEFAULT_CHART_LINE_COLOR, lineSmooth: e.options?.lineSmooth || false, stack: e.options?.stack || false, fontSize: e.options?.fontSize, width: e.width })
          // ECharts SSR writes font-family into a double-quoted style attribute without escaping it.
          const safeFonts = (value: any): any => Array.isArray(value) ? value.map(safeFonts) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === 'fontFamily' && typeof child === 'string' ? child.replace(/"/g, "'") : safeFonts(child)])) : value
          const portableOption = safeFonts(option)
          chart.setOption({ ...portableOption, animation: false }); const chartSvg = new DOMParser().parseFromString(chart.renderToSVGString(), 'image/svg+xml')
          if (chartSvg.querySelector('parsererror')) throw new Error('Chart SVG could not be serialized')
          const prefix = id(), names = new Map<string, string>()
          for (const node of chartSvg.querySelectorAll('[id]')) { names.set(node.id, `${prefix}-${names.size}`); node.id = names.get(node.id)! }
          for (const node of chartSvg.querySelectorAll('*')) {
            for (const attr of [...node.attributes]) {
              let value = attr.value
              for (const [old, next] of names) { value = value.split(`url(#${old})`).join(`url(#${next})`); if (value === `#${old}`) value = `#${next}` }
              if (attr.name === 'class') value = value.split(/\s+/).map(c => `${prefix}-${c}`).join(' ')
              node.setAttribute(attr.name, value)
            }
            if (node.localName === 'style') node.textContent = (node.textContent || '').replace(/\.(zr[\w-]+)/g, `.${prefix}-$1`)
          }
          body = rect(e.width, e.height, e.fill || 'none', e.outline) + new XMLSerializer().serializeToString(chartSvg.documentElement)
        } finally { chart.dispose() }
        break
      }
      case 'latex':
        if (e.path) { body = `<path d="${xml(e.path)}" fill="${xml(e.color)}" stroke="${xml(e.color)}" stroke-width="${e.strokeWidth || 0}" transform="scale(${e.width / e.viewBox[0]} ${e.height / e.viewBox[1]})"/>`; break }
        append(await fallback(e, 'Typeset mathematics')); continue
      default: append(await fallback(e, e.type === 'video' || e.type === 'audio' ? 'Static media preview' : `${e.type} rendering`)); continue
    }
    append(`<g id="${id()}"${!frameClip ? ` data-element-id="${xml(e.id)}"${e.groupId ? ` data-group-id="${xml(e.groupId)}"` : ''}` : ''} transform="${transform}"${extra}><title>${xml(e.name || e.type)}</title>${body}</g>`)
  }
  check()
  const clip = id(); defs.push(`<clipPath id="${clip}"><rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}"/></clipPath>`)
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(width)}" height="${n(height)}" viewBox="${n(x)} ${n(y)} ${n(width)} ${n(height)}"><defs>${defs.join('')}</defs><g clip-path="url(#${clip})">${chunks.join('')}</g></svg>`
  // Preserve contiguous groups without moving overlapping objects through the stacking order.
  const output = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (output.querySelector('parsererror')) throw new Error('SVG export produced invalid XML')
  const layer = output.documentElement.lastElementChild!
  let group: Element | null = null
  for (const node of [...layer.children]) {
    const groupId = node.getAttribute('data-group-id')
    if (!groupId) { group = null; continue }
    if (!group || group.getAttribute('data-group-id') !== groupId) {
      group = output.createElementNS('http://www.w3.org/2000/svg', 'g')
      group.setAttribute('id', id()); group.setAttribute('data-group-id', groupId)
      layer.insertBefore(group, node)
    }
    group.appendChild(node)
  }
  svg = await embedSvgFonts(new XMLSerializer().serializeToString(output.documentElement))
  check()
  return { svg, blob: new Blob([svg], { type: 'image/svg+xml' }), width, height, warnings }
}
