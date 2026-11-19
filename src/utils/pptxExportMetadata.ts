/**
 * Writes host metadata (`exportMetadata`) into a finished PPTX package:
 * - `docProps/app.xml`    `<Application>` = generator
 * - `docProps/core.xml`   `cp:keywords` gains `AI-generated` (when aiGenerated),
 *                         `dc:description` = statement (only when empty),
 *                         `dc:title` = title (when given)
 * - `docProps/custom.xml` `AIGenerated` (bool), `DigitalSourceType`, `Generator`
 * Missing parts are created together with their package relationship and
 * content-type override. Works on regenerated decks and retained source
 * packages alike; applying it twice yields the same properties.
 */
import JSZip from 'jszip'
import type { FikaExportMetadata } from '@/configs/exportMetadata'

export const AI_GENERATED_KEYWORD = 'AI-generated'

const NS = {
  cp: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  ep: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
  op: 'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties',
  vt: 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes',
}

const PART = {
  core: {
    rel: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
    contentType: 'application/vnd.openxmlformats-package.core-properties+xml',
    path: 'docProps/core.xml',
    empty: () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="${NS.cp}" xmlns:dc="${NS.dc}" xmlns:dcterms="${NS.dcterms}" xmlns:xsi="${NS.xsi}"></cp:coreProperties>`,
  },
  app: {
    rel: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
    contentType: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
    path: 'docProps/app.xml',
    empty: () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="${NS.ep}" xmlns:vt="${NS.vt}"></Properties>`,
  },
  custom: {
    rel: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties',
    contentType: 'application/vnd.openxmlformats-officedocument.custom-properties+xml',
    path: 'docProps/custom.xml',
    empty: () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="${NS.op}" xmlns:vt="${NS.vt}"></Properties>`,
  },
} as const

/** Format id every user-defined custom property uses. */
const CUSTOM_FMTID = '{D5CDD505-2E9C-101B-9397-08002B2CF9AE}'

export function escapeXml(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function unescapeXml(value: string): string {
  return value.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_, entity: string) => {
    const lower = entity.toLowerCase()
    if (lower === 'lt') return '<'
    if (lower === 'gt') return '>'
    if (lower === 'quot') return '"'
    if (lower === 'apos') return "'"
    if (lower === 'amp') return '&'
    return String.fromCodePoint(lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10))
  })
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag)?.slice(2).find((v) => v !== undefined)
}

/** Root element's opening tag (skips the XML declaration and comments). */
function rootTag(xml: string): { tag: string; index: number } {
  const match = /<(?![?!])[^>]+>/.exec(xml)
  if (!match) throw new Error('Invalid XML part')
  return { tag: match[0], index: match.index }
}

/** Prefix bound to `uri` on the root element; declares `fallback` when missing. */
function ensurePrefix(xml: string, uri: string, fallback: string): { xml: string; prefix: string } {
  const { tag, index } = rootTag(xml)
  const declared = new RegExp(`\\sxmlns:([A-Za-z_][\\w.-]*)\\s*=\\s*["']${uri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).exec(tag)
  if (declared) return { xml, prefix: declared[1] }
  let prefix = fallback
  for (let n = 2; new RegExp(`\\sxmlns:${prefix}\\s*=`).test(tag); n++) prefix = `${fallback}${n}`
  const end = tag.endsWith('/>') ? tag.length - 2 : tag.length - 1
  const next = `${tag.slice(0, end)} xmlns:${prefix}="${uri}"${tag.slice(end)}`
  return { xml: xml.slice(0, index) + next + xml.slice(index + tag.length), prefix }
}

/** Inserts `content` before the root's closing tag (expanding `<root/>`). */
function appendToRoot(xml: string, content: string): string {
  const { tag, index } = rootTag(xml)
  if (tag.endsWith('/>')) {
    const name = /^<([^\s/>]+)/.exec(tag)![1]
    return `${xml.slice(0, index)}${tag.slice(0, -2)}>${content}</${name}>${xml.slice(index + tag.length)}`
  }
  const close = xml.lastIndexOf('</')
  if (close < 0) throw new Error('Invalid XML part')
  return xml.slice(0, close) + content + xml.slice(close)
}

function elementPattern(qname: string) {
  const q = qname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`<${q}(\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${q}\\s*>)`)
}

function readElement(xml: string, qname: string): string | undefined {
  const match = elementPattern(qname).exec(xml)
  return match ? unescapeXml(match[2] ?? '') : undefined
}

/** Replaces the element's text (keeping its attributes) or appends it. */
function writeElement(xml: string, qname: string, text: string): string {
  const pattern = elementPattern(qname)
  const match = pattern.exec(xml)
  const value = escapeXml(text)
  if (!match) return appendToRoot(xml, `<${qname}>${value}</${qname}>`)
  return xml.slice(0, match.index) + `<${qname}${match[1] ?? ''}>${value}</${qname}>` + xml.slice(match.index + match[0].length)
}

function resolvePartPath(target: string): string {
  const parts: string[] = []
  for (const segment of target.replace(/^\/+/, '').split('/')) {
    if (segment === '..') parts.pop()
    else if (segment && segment !== '.') parts.push(segment)
  }
  return parts.join('/')
}

/** Finds a package-level part by relationship type, creating it when missing. */
async function packagePart(zip: JSZip, kind: keyof typeof PART): Promise<{ path: string; xml: string }> {
  const spec = PART[kind]
  let rels = await zip.file('_rels/.rels')?.async('string')
  if (rels === undefined) {
    rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  }
  for (const rel of rels.match(/<Relationship\b[^>]*>/g) ?? []) {
    if (attr(rel, 'Type') !== spec.rel || attr(rel, 'TargetMode') === 'External') continue
    const path = resolvePartPath(attr(rel, 'Target') ?? '')
    const xml = await zip.file(path)?.async('string')
    if (xml !== undefined) return { path, xml }
  }
  let path: string = spec.path
  for (let n = 2; zip.file(path); n++) path = spec.path.replace(/\.xml$/, `${n}.xml`)
  const ids = new Set((rels.match(/<Relationship\b[^>]*>/g) ?? []).map((rel) => attr(rel, 'Id')))
  let id = 1
  while (ids.has(`rId${id}`)) id++
  zip.file('_rels/.rels', appendToRoot(rels, `<Relationship Id="rId${id}" Type="${spec.rel}" Target="${path}"/>`))
  const types = await zip.file('[Content_Types].xml')?.async('string')
  if (types === undefined) throw new Error('PPTX package has no [Content_Types].xml')
  const overrides = types.match(/<Override\b[^>]*>/g) ?? []
  if (!overrides.some((o) => resolvePartPath(attr(o, 'PartName') ?? '') === path)) {
    zip.file('[Content_Types].xml', appendToRoot(types, `<Override PartName="/${path}" ContentType="${spec.contentType}"/>`))
  }
  return { path, xml: spec.empty() }
}

function applyCore(xml: string, metadata: FikaExportMetadata): string {
  let next = xml
  const cp = ensurePrefix(next, NS.cp, 'cp'); next = cp.xml
  const dc = ensurePrefix(next, NS.dc, 'dc'); next = dc.xml
  if (metadata.aiGenerated) {
    const keywordsTag = `${cp.prefix}:keywords`
    const current = (readElement(next, keywordsTag) ?? '').trim()
    const tokens = current.split(/[;,]/).map((token) => token.trim().toLowerCase())
    if (!tokens.includes(AI_GENERATED_KEYWORD.toLowerCase())) {
      next = writeElement(next, keywordsTag, current ? `${current}; ${AI_GENERATED_KEYWORD}` : AI_GENERATED_KEYWORD)
    }
  }
  if (metadata.statement && !(readElement(next, `${dc.prefix}:description`) ?? '').trim()) {
    next = writeElement(next, `${dc.prefix}:description`, metadata.statement)
  }
  if (metadata.title) next = writeElement(next, `${dc.prefix}:title`, metadata.title)
  return next
}

function applyApp(xml: string, metadata: FikaExportMetadata): string {
  // Extended properties live in the default namespace in every writer we know of;
  // honour a prefixed root just in case.
  const prefix = /^<([A-Za-z_][\w.-]*):/.exec(rootTag(xml).tag)?.[1]
  return writeElement(xml, prefix ? `${prefix}:Application` : 'Application', metadata.generator)
}

function applyCustom(xml: string, metadata: FikaExportMetadata): string {
  const vt = ensurePrefix(xml, NS.vt, 'vt')
  let next = vt.xml
  const prefix = /^<([A-Za-z_][\w.-]*):/.exec(rootTag(next).tag)?.[1]
  const property = prefix ? `${prefix}:property` : 'property'
  const values: Array<[string, string, string]> = [
    ['AIGenerated', 'bool', metadata.aiGenerated ? 'true' : 'false'],
    ['DigitalSourceType', 'lpwstr', metadata.digitalSourceType],
    ['Generator', 'lpwstr', metadata.generator],
  ]
  const names = new Set(values.map(([name]) => name))
  const blocks = new RegExp(`<${property}\\b[^>]*?(?:/>|>[\\s\\S]*?</${property}\\s*>)`, 'g')
  next = next.replace(blocks, (block) => {
    const name = attr(/^<[^>]*>/.exec(block)![0], 'name')
    return name !== undefined && names.has(unescapeXml(name)) ? '' : block
  })
  let pid = 1
  for (const block of next.match(blocks) ?? []) pid = Math.max(pid, Number(attr(block, 'pid')) || 1)
  const added = values.map(([name, type, value]) =>
    `<${property} fmtid="${CUSTOM_FMTID}" pid="${++pid}" name="${name}"><${vt.prefix}:${type}>${escapeXml(value)}</${vt.prefix}:${type}></${property}>`).join('')
  return appendToRoot(next, added)
}

export async function applyPptxExportMetadata(bytes: ArrayBuffer | Uint8Array, metadata: FikaExportMetadata): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes)
  const core = await packagePart(zip, 'core')
  zip.file(core.path, applyCore(core.xml, metadata))
  const app = await packagePart(zip, 'app')
  zip.file(app.path, applyApp(app.xml, metadata))
  const custom = await packagePart(zip, 'custom')
  zip.file(custom.path, applyCustom(custom.xml, metadata))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
}
