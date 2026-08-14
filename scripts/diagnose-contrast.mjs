/**
 * Run the contrast fixer against a real .pptx and print every action.
 *
 * Usage: node scripts/diagnose-contrast.mjs path/to/deck.pptx
 *
 * Converts via the same fill/content/order rules useImport uses for the
 * fields the contrast engine reads (geometry, fills, HTML colors), then
 * calls diagnoseSlideTextContrast.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundleEntry } from './lib/bundle-ts-entry.mjs'
import { parse } from 'pptxtojson/dist/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pptxPath = resolve(process.argv[2] || '')
if (!pptxPath) {
  console.error('Usage: node scripts/diagnose-contrast.mjs path/to/deck.pptx')
  process.exit(1)
}

const { diagnoseSlideTextContrast, collectHtmlTextColors } = await bundleEntry(
  root,
  'src/utils/textContrast.ts',
  'textContrast.mjs',
)

const THEME = { backgroundColor: '#ffffff', fontColor: '#333333' }

const mapFill = (fill) => {
  if (!fill) return { kind: 'none' }
  if (fill.type === 'color') return { kind: 'solid', color: fill.value || '' }
  if (fill.type === 'gradient') {
    return {
      kind: 'gradient',
      gradient: {
        type: fill.value.path === 'line' ? 'linear' : 'radial',
        colors: fill.value.colors.map(c => ({ color: c.color, pos: parseInt(c.pos, 10) || 0 })),
        rotate: fill.value.rot || 0,
      },
    }
  }
  if (fill.type === 'image') return { kind: 'image' }
  return { kind: 'none' }
}

const mapBackground = (fill) => {
  const m = mapFill(fill)
  if (m.kind === 'solid') return { type: 'solid', color: m.color || '#fff' }
  if (m.kind === 'gradient') return { type: 'gradient', gradient: m.gradient }
  if (m.kind === 'image') return { type: 'image', image: { src: 'x', size: 'cover' } }
  return { type: 'solid', color: '#fff' }
}

/** Flatten groups/diagrams the same way useImport does (order-sorted). */
const flatten = (elements, ox = 0, oy = 0) => {
  const sorted = [...elements].sort((a, b) => (a.order || 0) - (b.order || 0))
  const out = []
  for (const el of sorted) {
    if (el.type === 'group' || el.type === 'diagram') {
      out.push(...flatten(el.elements || [], ox + (el.left || 0), oy + (el.top || 0)))
      continue
    }
    out.push({ ...el, left: (el.left || 0) + ox, top: (el.top || 0) + oy })
  }
  return out
}

const toSlideElements = (rawElements) => {
  const elements = []
  for (const el of flatten(rawElements)) {
    const base = {
      id: String(el.id ?? elements.length),
      left: el.left || 0,
      top: el.top || 0,
      width: el.width || 1,
      height: el.height || 1,
      rotate: el.rotate || 0,
      name: el.name,
    }

    if (el.type === 'shape') {
      if (el.shapType === 'line' || /Connector/.test(el.shapType || '')) {
        elements.push({
          ...base,
          type: 'line',
          start: [0, 0],
          end: [el.width || 0, el.height || 0],
          style: 'solid',
          color: '#000',
          points: ['', ''],
        })
        continue
      }
      const fillMap = mapFill(el.fill)
      const vb = el.pathViewBox
      const shape = {
        ...base,
        type: 'shape',
        viewBox: vb
          ? [vb.width || el.width || 200, vb.height || el.height || 200]
          : el.path
            ? [el.width || 200, el.height || 200]
            : [200, 200],
        path: el.path || 'M0 0 L200 0 L200 200 L0 200 Z',
        fixedRatio: false,
        fill: el.strokeOnly ? '' : (fillMap.kind === 'solid' ? fillMap.color : ''),
        gradient: fillMap.kind === 'gradient' ? fillMap.gradient : undefined,
        pattern: fillMap.kind === 'image' ? 'x' : undefined,
        outline: el.borderColor ? { style: 'solid', width: 1, color: typeof el.borderColor === 'string' ? el.borderColor : '#000' } : undefined,
      }
      if (el.content && el.content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim()) {
        shape.text = {
          content: el.content,
          defaultFontName: 'Arial',
          defaultColor: THEME.fontColor,
          align: 'middle',
        }
      }
      elements.push(shape)
    }
    else if (el.type === 'text') {
      const fillMap = mapFill(el.fill)
      elements.push({
        ...base,
        type: 'text',
        content: el.content || '',
        defaultFontName: 'Arial',
        defaultColor: THEME.fontColor,
        fill: fillMap.kind === 'solid' ? fillMap.color : '',
      })
    }
    else if (el.type === 'image') {
      elements.push({ ...base, type: 'image', src: el.base64 || 'x', fixedRatio: false })
    }
    else if (el.type === 'math') {
      elements.push({
        ...base,
        type: 'latex',
        latex: el.latex || '',
        path: 'M0 0',
        color: '#000000',
        strokeWidth: 2,
        viewBox: [100, 100],
        fixedRatio: true,
      })
    }
    else if (el.type === 'table') {
      elements.push({
        ...base,
        type: 'table',
        outline: {},
        colWidths: el.colWidths || [1],
        cellMinHeight: 36,
        data: (el.data || []).map(row => row.map((cell, ci) => ({
          id: `c${ci}`,
          colspan: cell.colSpan || 1,
          rowspan: cell.rowSpan || 1,
          text: cell.text || '',
          style: {
            color: cell.fontColor,
            backcolor: cell.fillColor,
          },
        }))),
      })
    }
    else if (el.type === 'chart' || el.type === 'video' || el.type === 'audio') {
      elements.push({ ...base, type: el.type === 'chart' ? 'chart' : el.type, ...(el.type === 'chart' ? { chartType: 'bar', data: [], themes: [] } : { src: 'x' }) })
    }
  }
  return elements
}

const buf = readFileSync(pptxPath)
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const json = await parse(ab, { imageMode: 'none' })

console.log(`\n=== contrast diagnose: ${pptxPath} ===`)
console.log(`slides: ${json.slides.length}  themeFonts default: ${THEME.fontColor} on ${THEME.backgroundColor}`)
console.log(`trigger: 3:1   target: 4.5:1\n`)

const allActions = []
for (const [si, item] of json.slides.entries()) {
  const slide = {
    id: `s${si}`,
    background: mapBackground(item.fill),
    elements: toSlideElements(item.elements || []),
  }
  const actions = diagnoseSlideTextContrast(slide, THEME, si)
  allActions.push(...actions)

  const textish = slide.elements.filter(e =>
    e.type === 'text' || (e.type === 'shape' && e.text) || e.type === 'latex' || e.type === 'table')
  console.log(`--- slide ${si + 1}  bg=${slide.background.type}${slide.background.color ? ` ${slide.background.color}` : ''}  elements=${slide.elements.length}  textTargets=${textish.length} ---`)

  for (const el of textish) {
    const idx = slide.elements.indexOf(el)
    if (el.type === 'text' || (el.type === 'shape' && el.text)) {
      const html = el.type === 'text' ? el.content : el.text.content
      const colors = collectHtmlTextColors(html)
      const fill = el.type === 'shape' ? (el.fill || (el.gradient ? 'gradient' : el.pattern ? 'pattern' : 'none')) : (el.fill || 'none')
      const plain = (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50)
      console.log(`  [${idx}] ${el.type} fill=${fill} colors=[${colors.join(', ')}] "${plain}"`)
    }
  }

  const fixes = actions.filter(a => a.kind === 'fix')
  const skips = actions.filter(a => a.kind === 'skip')
  if (!fixes.length && !skips.length) console.log('  (no text targets evaluated)')
  for (const a of fixes) {
    console.log(`  FIX  ${a.elementType}#${a.elementIndex} ${a.target}: ${a.from} → ${a.to}  (ratio ${a.ratioBefore} → ${a.ratioAfter})  bg=[${a.backgrounds.join(', ')}]  "${a.snippet || ''}"`)
  }
  for (const a of skips) {
    if (a.reason === 'readable (above trigger)') continue 
    console.log(`  SKIP ${a.elementType}#${a.elementIndex}: ${a.reason}${a.colors ? ` colors=[${a.colors.join(', ')}]` : ''}${a.backgrounds ? ` bg=[${a.backgrounds.join(', ')}]` : ''}  "${a.snippet || ''}"`)
  }
  const readableSkips = skips.filter(a => a.reason === 'readable (above trigger)').length
  if (readableSkips) console.log(`  (${readableSkips} readable color(s) left alone)`)
}

const fixes = allActions.filter(a => a.kind === 'fix')
const skips = allActions.filter(a => a.kind === 'skip')
console.log(`\n=== summary ===`)
console.log(`fixes: ${fixes.length}`)
console.log(`skips: ${skips.length}  (readable: ${skips.filter(a => a.reason === 'readable (above trigger)').length}, other: ${skips.filter(a => a.reason !== 'readable (above trigger)').length})`)
if (fixes.length) {
  console.log(`\nAll fixes:`)
  for (const a of fixes) {
    console.log(`  slide ${a.slideIndex + 1} / ${a.elementType}#${a.elementIndex} / ${a.target}: ${a.from} → ${a.to}  (${a.ratioBefore}:1 → ${a.ratioAfter}:1 vs [${a.backgrounds.join(', ')}])  "${a.snippet || ''}"`)
  }
}
