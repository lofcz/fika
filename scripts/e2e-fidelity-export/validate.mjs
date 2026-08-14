/** Validate every XML part in each variant for well-formedness + namespace sanity. */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSZip } from '@node-projects/jszip'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'out')

function lintXml(xml) {
  const issues = []
  const stack = []
  const re = /<(\/?)([A-Za-z0-9]+:[A-Za-z0-9]+|[A-Za-z0-9]+)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
  let m
  while ((m = re.exec(xml))) {
    const [, closing, tag, attrs] = m
    if (tag.startsWith('?')) continue
    const selfClose = /\/$/.test(attrs.trim()) || /\/>$/.test(m[0])
    if (closing) {
      if (stack[stack.length - 1] !== tag) issues.push(`mismatch close </${tag}> top=<${stack[stack.length - 1]}>`)
      else stack.pop()
    } else if (!selfClose) {
      stack.push(tag)
    }
  }
  if (stack.length) issues.push(`unclosed: ${stack.slice(-5).join(',')}`)
  const ns = xml.slice(0, xml.indexOf('>') + 1)
  const prefixes = [...ns.matchAll(/xmlns:([A-Za-z0-9]+)=/g)].map(x => x[1])
  const dup = prefixes.filter((p, i) => prefixes.indexOf(p) !== i)
  if (dup.length) issues.push(`dup ns: ${dup.join(',')}`)
  const bareAmp = xml.match(/&(?!amp;|lt;|gt;|quot;|apos;|#)/)
  if (bareAmp) issues.push(`bare & at ${bareAmp.index}`)
  return issues
}

for (const f of readdirSync(OUT).filter(x => x.startsWith('v-') && x.endsWith('.pptx'))) {
  const zip = await JSZip.loadAsync(readFileSync(join(OUT, f)))
  const parts = Object.keys(zip.files).filter(n => n.endsWith('.xml') || n.endsWith('.rels'))
  let bad = 0
  for (const part of parts) {
    const xml = await zip.file(part).async('string')
    const issues = lintXml(xml)
    if (issues.length) {
      bad++
      console.log(`FAIL ${f} :: ${part} :: ${issues.slice(0, 3).join(' | ')}`)
    }
  }
  if (!bad) console.log(`OK   ${f}  (${parts.length} parts)`)
}
