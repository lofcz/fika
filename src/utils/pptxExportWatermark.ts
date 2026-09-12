/**
 * Bakes a host-mandated watermark into an exported PPTX package.
 *
 * The mark is a picture part referenced from every slide AND every slide
 * master, written straight into the OOXML so it does not depend on the
 * generator (the same routine stamps regenerated decks and retained source
 * packages):
 *
 *   - slide copy: last in the shape tree (always visible, even over full-bleed
 *     photos) and fully locked — `noSelect` keeps PowerPoint from selecting it
 *     by click, marquee, Ctrl+A or the selection pane, so it behaves like
 *     background chrome rather than an element;
 *   - master copy: `userDrawn`, also locked, so it survives the deletion of
 *     slide-level shapes in editors that ignore locks, and only disappears via
 *     the slide master view;
 *   - one shared media part, rels added to each stamped part, content types
 *     patched when the image extension is new to the package.
 *
 * Stamped parts carry `descr="fika:export-watermark"`; re-stamping a package
 * that already has the marker is a no-op, so a re-imported export does not
 * pile up marks.
 */
import JSZip from 'jszip'
import type { FikaExportWatermark, FikaExportWatermarkPosition } from '@/configs/exportWatermark'

export const EXPORT_WATERMARK_MARKER = 'fika:export-watermark'

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

const DEFAULT_WIDTH_RATIO = 0.12
const DEFAULT_MARGIN_RATIO = 0.02
const DEFAULT_SLIDE_CX = 12192000
const DEFAULT_SLIDE_CY = 6858000

export interface WatermarkImage {
  bytes: Uint8Array
  mime: 'image/png' | 'image/jpeg'
  width: number
  height: number
}

// ─── image loading ────────────────────────────────────────────────────────────

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function sniffMime(bytes: Uint8Array): WatermarkImage['mime'] | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  return null
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2
      continue
    }
    const length = view.getUint16(offset + 2)
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) }
    offset += 2 + length
  }
  return null
}

/** Reads dimensions from the PNG/JPEG header — no decoder or DOM needed. */
export function readWatermarkImage(bytes: Uint8Array): WatermarkImage {
  const mime = sniffMime(bytes)
  if (!mime) throw new Error('Export watermark must be a PNG or JPEG image')
  const size = mime === 'image/png' ? pngSize(bytes) : jpegSize(bytes)
  if (!size || size.width <= 0 || size.height <= 0) throw new Error('Export watermark image header is unreadable')
  return { bytes, mime, ...size }
}

/** Resolves `image` (data: URL or fetchable URL) to raw bytes plus dimensions. */
export async function loadWatermarkImage(image: string): Promise<WatermarkImage> {
  const dataUrl = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(image)
  if (dataUrl) {
    const [, , base64, payload] = dataUrl
    const bytes = base64 ? decodeBase64(payload) : new TextEncoder().encode(decodeURIComponent(payload))
    return readWatermarkImage(bytes)
  }
  const response = await fetch(image)
  if (!response.ok) throw new Error(`Export watermark image request failed (${response.status})`)
  return readWatermarkImage(new Uint8Array(await response.arrayBuffer()))
}

// ─── XML helpers ──────────────────────────────────────────────────────────────

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return match ? match[1] : null
}

function nextShapeId(xml: string): number {
  let max = 1
  for (const m of xml.matchAll(/<p:cNvPr\b[^>]*\sid="(\d+)"/g)) {
    const id = Number(m[1])
    if (Number.isFinite(id) && id > max) max = id
  }
  return max + 1
}

function nextRelId(relsXml: string): string {
  let max = 0
  for (const m of relsXml.matchAll(/\sId="rId(\d+)"/g)) {
    const id = Number(m[1])
    if (Number.isFinite(id) && id > max) max = id
  }
  return `rId${max + 1}`
}

function relsPathFor(partPath: string): string {
  const slash = partPath.lastIndexOf('/')
  return `${partPath.slice(0, slash + 1)}_rels/${partPath.slice(slash + 1)}.rels`
}

interface Geometry {
  x: number
  y: number
  cx: number
  cy: number
}

function placement(
  slide: { cx: number; cy: number },
  image: WatermarkImage,
  watermark: FikaExportWatermark,
): Geometry {
  const widthRatio = clampRatio(watermark.widthRatio, DEFAULT_WIDTH_RATIO)
  const marginRatio = clampRatio(watermark.marginRatio, DEFAULT_MARGIN_RATIO)
  const cx = Math.round(slide.cx * widthRatio)
  const cy = Math.round(cx * (image.height / image.width))
  const margin = Math.round(slide.cx * marginRatio)
  const position: FikaExportWatermarkPosition = watermark.position ?? 'bottom-right'
  const x = position.endsWith('left') ? margin : slide.cx - cx - margin
  const y = position.startsWith('top') ? margin : slide.cy - cy - margin
  return { x, y, cx, cy }
}

function clampRatio(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1) return fallback
  return value
}

function picXml(opts: {
  id: number
  relId: string
  name: string
  geometry: Geometry
  opacity: number
  master: boolean
}): string {
  const { id, relId, name, geometry: g, opacity, master } = opts
  const alpha = opacity < 1 ? `<a:alphaModFix amt="${Math.round(opacity * 100000)}"/>` : ''
  const nvPr = master ? '<p:nvPr userDrawn="1"/>' : '<p:nvPr/>'
  return (
    '<p:pic>' +
    `<p:nvPicPr><p:cNvPr id="${id}" name="${escapeAttr(name)}" descr="${EXPORT_WATERMARK_MARKER}"/>` +
    '<p:cNvPicPr><a:picLocks noGrp="1" noSelect="1" noRot="1" noChangeAspect="1" noMove="1" noResize="1" ' +
    'noEditPoints="1" noAdjustHandles="1" noChangeArrowheads="1" noChangeShapeType="1" noCrop="1"/></p:cNvPicPr>' +
    `${nvPr}</p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${relId}">${alpha}</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${g.x}" y="${g.y}"/><a:ext cx="${g.cx}" cy="${g.cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
    '</p:pic>'
  )
}

/** Makes sure the part root declares the prefixes the injected picture uses. */
function ensureNamespaces(xml: string): string {
  return xml.replace(/<p:(sld|sldMaster)\b([^>]*)>/, (root, tag: string, attrs: string) => {
    let next = attrs
    if (!/\sxmlns:a=/.test(next)) next += ` xmlns:a="${NS_A}"`
    if (!/\sxmlns:r=/.test(next)) next += ` xmlns:r="${NS_R}"`
    if (!/\sxmlns:p=/.test(next)) next += ` xmlns:p="${NS_P}"`
    return `<p:${tag}${next}>`
  })
}

// ─── package surgery ──────────────────────────────────────────────────────────

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path)
  return file ? await file.async('string') : null
}

function mediaExtension(mime: WatermarkImage['mime']): 'png' | 'jpeg' {
  return mime === 'image/png' ? 'png' : 'jpeg'
}

function ensureContentType(contentTypes: string, ext: string, mime: string): string {
  const hasDefault = new RegExp(`<Default\\b[^>]*Extension="${ext}"`, 'i').test(contentTypes)
  if (hasDefault) return contentTypes
  return contentTypes.replace(/(<Types\b[^>]*>)/, `$1<Default Extension="${ext}" ContentType="${mime}"/>`)
}

function uniqueMediaName(zip: JSZip, ext: string): string {
  for (let i = 1; ; i++) {
    const name = `ppt/media/fika-watermark${i === 1 ? '' : `-${i}`}.${ext}`
    if (!zip.file(name)) return name
  }
}

async function slideSize(zip: JSZip): Promise<{ cx: number; cy: number }> {
  const presentation = await readText(zip, 'ppt/presentation.xml')
  const sldSz = presentation ? /<p:sldSz\b[^>]*\/?>/.exec(presentation)?.[0] ?? '' : ''
  return {
    cx: Number(attr(sldSz, 'cx')) || DEFAULT_SLIDE_CX,
    cy: Number(attr(sldSz, 'cy')) || DEFAULT_SLIDE_CY,
  }
}

async function stampPart(
  zip: JSZip,
  partPath: string,
  opts: { mediaPath: string; name: string; geometry: Geometry; opacity: number; master: boolean },
): Promise<boolean> {
  const xml = await readText(zip, partPath)
  if (!xml || xml.includes(EXPORT_WATERMARK_MARKER)) return false
  const close = xml.lastIndexOf('</p:spTree>')
  if (close < 0) return false

  const relsPath = relsPathFor(partPath)
  const rels =
    (await readText(zip, relsPath)) ??
    `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
  const relId = nextRelId(rels)
  const target = opts.mediaPath.replace(/^ppt\//, '../')
  zip.file(
    relsPath,
    rels.replace(/<\/Relationships>\s*$/, `<Relationship Id="${relId}" Type="${REL_IMAGE}" Target="${target}"/></Relationships>`),
  )

  const pic = picXml({
    id: nextShapeId(xml),
    relId,
    name: opts.name,
    geometry: opts.geometry,
    opacity: opts.opacity,
    master: opts.master,
  })
  zip.file(partPath, ensureNamespaces(xml.slice(0, close) + pic + xml.slice(close)))
  return true
}

function partPaths(zip: JSZip, pattern: RegExp): string[] {
  return Object.keys(zip.files)
    .filter((path) => pattern.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/** True when the package already carries the export watermark on any slide. */
export async function hasPptxExportWatermark(bytes: ArrayBuffer | Uint8Array): Promise<boolean> {
  const zip = await JSZip.loadAsync(bytes)
  for (const path of partPaths(zip, /^ppt\/slides\/slide\d+\.xml$/)) {
    const xml = await readText(zip, path)
    if (xml?.includes(EXPORT_WATERMARK_MARKER)) return true
  }
  return false
}

/**
 * Returns a new package with the watermark on every slide and slide master.
 * Throws when the input is not a presentation package.
 */
export async function applyPptxExportWatermark(
  bytes: ArrayBuffer | Uint8Array,
  watermark: FikaExportWatermark,
  image: WatermarkImage,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes)
  const slides = partPaths(zip, /^ppt\/slides\/slide\d+\.xml$/)
  if (slides.length === 0) throw new Error('PPTX package has no slides')
  const masters = partPaths(zip, /^ppt\/slideMasters\/slideMaster\d+\.xml$/)

  const contentTypes = await readText(zip, '[Content_Types].xml')
  if (!contentTypes) throw new Error('PPTX package has no [Content_Types].xml')

  const ext = mediaExtension(image.mime)
  const mediaPath = uniqueMediaName(zip, ext)
  zip.file(mediaPath, image.bytes, { compression: 'STORE' })
  zip.file('[Content_Types].xml', ensureContentType(contentTypes, ext, image.mime))

  const geometry = placement(await slideSize(zip), image, watermark)
  const opacity =
    typeof watermark.opacity === 'number' && watermark.opacity > 0 && watermark.opacity < 1 ? watermark.opacity : 1
  const name = watermark.name?.trim() || 'Watermark'

  let stamped = 0
  for (const path of slides) {
    if (await stampPart(zip, path, { mediaPath, name, geometry, opacity, master: false })) stamped += 1
  }
  for (const path of masters) {
    if (await stampPart(zip, path, { mediaPath, name, geometry, opacity, master: true })) stamped += 1
  }
  if (stamped === 0) {
    // Already watermarked — hand back the input untouched instead of a re-zipped copy.
    return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  }

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

/**
 * Browser download through a real `HTMLAnchorElement.click()` — the same seam
 * pptxgenjs uses, which embedding hosts rely on to capture export bytes.
 */
export function downloadPptxBytes(bytes: Uint8Array, fileName: string): void {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const url = URL.createObjectURL(new Blob([copy], { type: PPTX_MIME }))
  const link = document.createElement('a')
  link.setAttribute('style', 'display:none;')
  link.dataset.interception = 'off'
  link.href = url
  link.download = fileName.toLowerCase().endsWith('.pptx') ? fileName : `${fileName}.pptx`
  document.body.appendChild(link)
  link.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    link.remove()
  }, 100)
}
