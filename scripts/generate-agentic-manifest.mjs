import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Generates `dist/embed/agentic-manifest.json` — a lean, canonical description of
 * the agentic command surface (command list, payload/return schemas, and the
 * transitive closure of referenced helper/model types).
 *
 * Canonical sources (so the manifest auto-tracks the real bridge):
 *  - `src/embed/agentic/createAgenticApi.ts` — the authoritative `register('x.y', handler)`
 *    list AND each handler's inline `payload:` type (runtime truth + types together).
 *  - `dist/types/embed/agentic/types.d.ts`  — result map + agentic helper type declarations.
 *  - `dist/types/types/slides.d.ts`         — slide/element model type declarations.
 *
 * Consumers (e.g. server-side skill catalogs) read the JSON without importing Fika.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'src/embed/agentic/createAgenticApi.ts')
const AGENTIC_DTS = join(root, 'dist/types/embed/agentic/types.d.ts')
const SLIDES_DTS = join(root, 'dist/types/types/slides.d.ts')
const AGENTIC_AUX_DTS = [
  join(root, 'dist/types/embed/agentic/templates.d.ts'),
  join(root, 'dist/types/embed/agentic/styles.d.ts'),
  join(root, 'dist/types/embed/agentic/layouts.d.ts'),
  // `TextRunStyle` (text.create / text.setMarkdown `style`) lives with the markdown renderer.
  join(root, 'dist/types/utils/markdown.d.ts'),
]
const DOCS = join(root, 'src/embed/agentic/docs.json')
const PKG = join(root, 'package.json')
const OUT = join(root, 'dist/embed/agentic-manifest.json')

const SCHEMA_VERSION = 2

function read(path) {
  return readFileSync(path, 'utf8')
}

function stripComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Collapse a multi-line declaration/type into a single, separator-correct line. */
function normalizeType(raw) {
  const lines = stripComments(raw)
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  let out = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    out += line
    if (i === lines.length - 1) break
    const next = lines[i + 1]
    const endsOpen = /[{(<[,;|&=]$/.test(line) || line.endsWith('=>') || /\b(extends|keyof|typeof|in|of)$/.test(line)
    const nextCloses = /^[)}\]>|&]/.test(next) || /^(extends|implements)\b/.test(next)
    out += endsOpen || nextCloses ? ' ' : '; '
  }
  return out
    .replace(/\s+/g, ' ')
    .replace(/\s*;\s*/g, '; ')
    .replace(/;\s*}/g, ' }')
    .replace(/{\s*;/g, '{ ')
    .replace(/;\s*$/, '')
    .trim()
}

/** Read a balanced `(...)`/`{...}` region starting at `openIdx`, skipping strings. */
function readBalanced(src, openIdx) {
  const open = src[openIdx]
  const close = open === '(' ? ')' : open === '{' ? '}' : open === '[' ? ']' : null
  if (!close) return { inner: '', end: openIdx }
  let depth = 0
  let str = null
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i]
    if (str) {
      if (ch === '\\') { i++; continue }
      if (ch === str) str = null
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') { str = ch; continue }
    if (ch === '(' || ch === '{' || ch === '[') depth++
    else if (ch === ')' || ch === '}' || ch === ']') {
      depth--
      if (depth === 0) return { inner: src.slice(openIdx + 1, i), end: i }
    }
  }
  return { inner: src.slice(openIdx + 1), end: src.length }
}

/** Strip a `= default` suffix at bracket-depth 0 from a `payload:` type body. */
function stripDefault(typeText) {
  let depth = 0
  let str = null
  for (let i = 0; i < typeText.length; i++) {
    const ch = typeText[i]
    if (str) {
      if (ch === '\\') { i++; continue }
      if (ch === str) str = null
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') { str = ch; continue }
    if (ch === '(' || ch === '{' || ch === '[' || ch === '<') depth++
    else if (ch === ')' || ch === '}' || ch === ']' || ch === '>') depth--
    else if (ch === '=' && depth === 0 && typeText[i + 1] !== '>' && typeText[i - 1] === ' ') {
      return { type: typeText.slice(0, i), hadDefault: true }
    }
  }
  return { type: typeText, hadDefault: false }
}

/** Parse `register('x.y', handler)` calls → [{ name, payload | null, optional }]. */
function extractRegisters(src) {
  const out = []
  const re = /register\(\s*'([^']+)'\s*,/g
  let m
  while ((m = re.exec(src))) {
    const name = m[1]
    let j = re.lastIndex
    while (j < src.length && /\s/.test(src[j])) j++
    if (src[j] !== '(') {
      out.push({ name, payload: null, optional: false })
      continue
    }
    const { inner } = readBalanced(src, j)
    const trimmed = inner.trim()
    if (!trimmed) {
      out.push({ name, payload: 'undefined', optional: false })
      continue
    }
    const colon = trimmed.indexOf(':')
    const head = trimmed.slice(0, colon).trim()
    if (!/^payload\b/.test(head)) {
      out.push({ name, payload: null, optional: false })
      continue
    }
    const { type, hadDefault } = stripDefault(trimmed.slice(colon + 1).trim())
    const optional = hadDefault || /\bundefined\b/.test(type) || head.endsWith('?')
    out.push({ name, payload: normalizeType(type), optional })
  }
  return out
}

/** Extract top-level `interface`/`enum`/`type` declarations → Map(name → normalized text). */
function extractDecls(srcStripped) {
  const decls = new Map()
  const lines = srcStripped.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    const m = line.match(/^(?:export\s+)?(?:declare\s+)?(?:const\s+)?(interface|enum|type)\s+([A-Za-z0-9_$]+)/)
    if (!m) { i++; continue }
    const kind = m[1]
    const name = m[2]
    if (kind === 'type') {
      const { text, next } = consumeTypeAlias(lines, i)
      if (!decls.has(name)) decls.set(name, normalizeType(text))
      i = next
    }
    else {
      const { text, next } = consumeBraced(lines, i)
      if (!decls.has(name)) decls.set(name, normalizeType(text))
      i = next
    }
  }
  return decls
}

function consumeBraced(lines, start) {
  let depth = 0
  let seen = false
  let text = ''
  let i = start
  for (; i < lines.length; i++) {
    const l = lines[i]
    text += (text ? '\n' : '') + l
    for (const ch of l) {
      if (ch === '{') { depth++; seen = true }
      else if (ch === '}') depth--
    }
    if (seen && depth <= 0) { i++; break }
  }
  return { text, next: i }
}

function consumeTypeAlias(lines, start) {
  let depth = 0
  let text = ''
  let i = start
  for (; i < lines.length; i++) {
    const l = lines[i]
    text += (text ? '\n' : '') + l
    for (const ch of l) {
      if (ch === '{' || ch === '(' || ch === '[') depth++
      else if (ch === '}' || ch === ')' || ch === ']') depth--
    }
    const trimmed = l.trim()
    const continues = /[=|&,<(+\-]$/.test(trimmed) || trimmed.endsWith('=>') || /\b(extends|keyof|typeof)$/.test(trimmed)
    if (depth <= 0 && !continues) { i++; break }
  }
  return { text, next: i }
}

/** Parse an interface body of `'key': Type;` members → Map(key → normalized type). */
function parseMapInterface(srcStripped, interfaceName) {
  const idx = srcStripped.indexOf(`interface ${interfaceName}`)
  if (idx < 0) return new Map()
  const braceIdx = srcStripped.indexOf('{', idx)
  const { inner } = readBalanced(srcStripped, braceIdx)
  const members = new Map()
  let depth = 0
  let start = 0
  let str = null
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (str) {
      if (ch === '\\') { i++; continue }
      if (ch === str) str = null
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') { str = ch; continue }
    if (ch === '(' || ch === '{' || ch === '[') depth++
    else if (ch === ')' || ch === '}' || ch === ']') depth--
    else if (ch === ';' && depth === 0) {
      addMember(members, inner.slice(start, i))
      start = i + 1
    }
  }
  addMember(members, inner.slice(start))
  return members
}

function addMember(map, raw) {
  const text = raw.trim()
  if (!text) return
  const m = text.match(/^['"]([^'"]+)['"]\s*:\s*([\s\S]+)$/)
  if (!m) return
  map.set(m[1], normalizeType(m[2]))
}

/** Read a balanced `<...>` region starting at `openIdx` (points at `<`). */
function readBalancedAngle(src, openIdx) {
  let depth = 0
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '<') depth++
    else if (src[i] === '>') {
      depth--
      if (depth === 0) return src.slice(openIdx + 1, i)
    }
  }
  return ''
}

/**
 * Pull the command-bus `data` type out of a fluent method's return annotation:
 *  - `Promise<FikaCommandResult<Data>>` / `FikaCommandResult<Data>` -> `Data`
 *  - synchronous getters (`get`/`list`) returning raw `X` -> `X`
 */
function extractResultData(returnText) {
  const text = returnText.replace(/;\s*$/, '').trim()
  const marker = 'FikaCommandResult<'
  const at = text.indexOf(marker)
  if (at >= 0) return readBalancedAngle(text, at + marker.length - 1) || null
  const promise = 'Promise<'
  const pAt = text.indexOf(promise)
  if (pAt >= 0) {
    const inner = readBalancedAngle(text, pAt + promise.length - 1)
    return inner ? inner.trim() : null
  }
  return text || null
}

/**
 * Build `domain.method -> resultData` from every `FikaAgent<Domain>Api` interface.
 * Used to recover return types for commands the (hand-written) result map omits.
 */
function resolveFluentReturns(stripped) {
  const map = new Map()
  const reIface = /interface\s+FikaAgent([A-Za-z]+)Api\b/g
  let m
  while ((m = reIface.exec(stripped))) {
    const domain = m[1].toLowerCase()
    const braceIdx = stripped.indexOf('{', m.index)
    if (braceIdx < 0) continue
    const { inner } = readBalanced(stripped, braceIdx)
    for (const member of splitTopLevel(inner, ';')) {
      const paren = member.indexOf('(')
      if (paren < 0) continue
      const name = member.slice(0, paren).trim().split(/\s+/).pop()
      if (!/^[a-z][A-Za-z0-9]*$/.test(name)) continue
      const { end } = readBalanced(member, paren)
      const colon = member.indexOf(':', end)
      if (colon < 0) continue
      const data = extractResultData(member.slice(colon + 1))
      if (data) map.set(`${domain}.${name}`, normalizeType(data))
    }
  }
  return map
}

/** Split a body string into members by a top-level (bracket-depth 0) separator char. */
function splitTopLevel(body, sep) {
  const parts = []
  let depth = 0
  let start = 0
  let str = null
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (str) {
      if (ch === '\\') { i++; continue }
      if (ch === str) str = null
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') { str = ch; continue }
    if (ch === '(' || ch === '{' || ch === '[' || ch === '<') depth++
    else if (ch === ')' || ch === '}' || ch === ']' || ch === '>') depth--
    else if (ch === sep && depth === 0) {
      parts.push(body.slice(start, i))
      start = i + 1
    }
  }
  parts.push(body.slice(start))
  return parts.map(p => p.trim()).filter(Boolean)
}

const ID_RE = /[A-Za-z_$][A-Za-z0-9_$]*/g

function referencedTypes(text, declIndex) {
  const found = new Set()
  const ids = text.match(ID_RE)
  if (!ids) return found
  for (const id of ids) {
    if (/^[A-Z]/.test(id) && declIndex.has(id)) found.add(id)
  }
  return found
}

/**
 * Per-layout slot / variant cheatsheet, read off the `PPTX_LAYOUTS` source.
 *
 * Formatting-tolerant: layout objects are found by their top-level
 * `id: '…'` at two-space indent (slots' `name:` sit at four, variants' `id:`
 * at four as well but only ever follow a `variants:` key), so a formatter
 * re-flowing braces cannot silently empty the list again.
 */
function extractLayoutCheatsheet(layoutsSrc) {
  const src = layoutsSrc.replace(/\r\n?/g, '\n')
  const arrayStart = src.indexOf('export const PPTX_LAYOUTS')
  if (arrayStart < 0) return []
  const arrayEnd = src.indexOf('\n}];', arrayStart)
  const body = src.slice(arrayStart, arrayEnd < 0 ? src.length : arrayEnd + 4)
  const idRe = /^  id: '([a-zA-Z][a-zA-Z0-9_]*)',/gm
  const starts = []
  let m
  while ((m = idRe.exec(body))) starts.push({ id: m[1], at: m.index })
  const out = []
  for (let i = 0; i < starts.length; i++) {
    const block = body.slice(starts[i].at, i + 1 < starts.length ? starts[i + 1].at : body.length)
    const slots = []
    const slotRe = /name: '([a-zA-Z0-9_]+)',\s*type: '([a-zA-Z]+)',\s*required: (true|false)/g
    let sm
    while ((sm = slotRe.exec(block))) slots.push(`${sm[1]}${sm[3] === 'true' ? '*' : ''}:${sm[2]}`)
    const variants = []
    const variantsAt = block.indexOf('variants:')
    if (variantsAt >= 0) {
      const tail = block.slice(variantsAt)
      if (/^variants:\s*centeredVariant\(/.test(tail)) {
        variants.push('centered(centered)')
      } else {
        const variantRe = /id: '([a-zA-Z0-9_]+)',\s*label: '[^']*',\s*anchor: '([a-zA-Z]+)'/g
        let vm
        while ((vm = variantRe.exec(tail))) variants.push(`${vm[1]}(${vm[2]})`)
      }
    }
    out.push({ id: starts[i].id, slots, variants })
  }
  return out
}

function main() {
  if (!existsSync(AGENTIC_DTS) || !existsSync(SLIDES_DTS)) {
    console.error('dist/types missing — run `bun run build:types` first.')
    process.exit(1)
  }

  const pkg = JSON.parse(read(PKG))
  const srcStripped = stripComments(read(SRC))
  const agenticStripped = stripComments(read(AGENTIC_DTS))
  const slidesStripped = stripComments(read(SLIDES_DTS))

  const registers = extractRegisters(read(SRC))
  const resultMap = parseMapInterface(agenticStripped, 'FikaCommandResultDataMap')
  const payloadMap = parseMapInterface(agenticStripped, 'FikaCommandPayloadMap')
  const fluentReturns = resolveFluentReturns(agenticStripped)

  const declModel = extractDecls(slidesStripped)
  const declAgentic = extractDecls(agenticStripped)
  const declLocal = extractDecls(srcStripped)
  for (const auxPath of AGENTIC_AUX_DTS) {
    if (!existsSync(auxPath)) continue
    for (const [name, text] of extractDecls(stripComments(read(auxPath)))) {
      if (!declAgentic.has(name)) declAgentic.set(name, text)
    }
  }

  const declIndex = new Map()
  const sourceOf = new Map()
  for (const [name, text] of declLocal) { declIndex.set(name, text); sourceOf.set(name, 'helper') }
  for (const [name, text] of declAgentic) { declIndex.set(name, text); sourceOf.set(name, 'helper') }
  for (const [name, text] of declModel) { declIndex.set(name, text); sourceOf.set(name, 'model') }

  const authored = existsSync(DOCS) ? JSON.parse(read(DOCS)) : { domains: {}, commands: {}, guides: [], designSystem: undefined }
  const commandDocs = authored.commands ?? {}
  const domainDocs = authored.domains ?? {}

  const commands = []
  for (const reg of registers) {
    const payload = reg.payload ?? payloadMap.get(reg.name) ?? 'unknown'
    const returns = resultMap.get(reg.name) ?? fluentReturns.get(reg.name) ?? 'unknown'
    const entry = {
      name: reg.name,
      domain: reg.name.split('.')[0],
      payload,
      returns,
    }
    if (reg.optional) entry.optional = true
    const doc = commandDocs[reg.name]
    if (doc) entry.doc = doc
    commands.push(entry)
  }

  const visited = new Set()
  const queue = []
  for (const c of commands) {
    for (const id of referencedTypes(`${c.payload} ${c.returns}`, declIndex)) queue.push(id)
  }
  while (queue.length) {
    const name = queue.shift()
    if (visited.has(name)) continue
    visited.add(name)
    for (const id of referencedTypes(declIndex.get(name) ?? '', declIndex)) {
      if (!visited.has(id)) queue.push(id)
    }
  }

  const helperTypes = {}
  const modelTypes = {}
  for (const name of [...visited].sort()) {
    const bucket = sourceOf.get(name) === 'model' ? modelTypes : helperTypes
    bucket[name] = declIndex.get(name)
  }

  const domains = []
  const domainSeen = new Map()
  for (const c of commands) {
    if (!domainSeen.has(c.domain)) {
      const doc = domainDocs[c.domain]
      const entry = { id: c.domain, commandCount: 0 }
      if (doc?.title) entry.title = doc.title
      if (doc?.summary) entry.summary = doc.summary
      if (doc?.whenToUse) entry.whenToUse = doc.whenToUse
      domainSeen.set(c.domain, entry)
      domains.push(entry)
    }
    domainSeen.get(c.domain).commandCount++
  }

  const LAYOUTS_SRC_PATH = join(root, 'src/embed/agentic/layouts.ts')
  const layoutCheatsheet = extractLayoutCheatsheet(existsSync(LAYOUTS_SRC_PATH) ? read(LAYOUTS_SRC_PATH) : '')
  if (layoutCheatsheet.length === 0) {
    // The pinned agent prompt depends on this list; an empty one means the
    // agent has to re-learn slot names every session. Fail loudly.
    console.error('generate-agentic-manifest: extracted 0 layouts from PPTX_LAYOUTS — the source shape changed, fix extractLayoutCheatsheet.')
    process.exit(1)
  }

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    package: pkg.name,
    packageVersion: pkg.version,
    generatedAt: new Date().toISOString(),
    summary: authored.summary,
    commandCount: commands.length,
    designSystem: authored.designSystem,
    domains,
    commands,
    guides: authored.guides ?? [],
    layoutCheatsheet,
    helperTypes,
    modelTypes,
  }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`)
  const documentedCommands = commands.filter(c => c.doc).length
  console.log(
    `Generated agentic-manifest.json: ${commands.length} commands (${documentedCommands} documented), ${domains.length} domains, `
    + `${(manifest.guides ?? []).length} guides, ${layoutCheatsheet.length} layouts in cheatsheet, `
    + `${Object.keys(helperTypes).length} helper types, ${Object.keys(modelTypes).length} model types.`,
  )
}

main()
