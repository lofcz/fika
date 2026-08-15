/** Validate every XML part in each variant for well-formedness + namespace sanity. */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lintXml, loadPptx } from '../lib/pptx-inspect.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'out')

for (const f of readdirSync(OUT).filter(x => x.startsWith('v-') && x.endsWith('.pptx'))) {
  const deck = await loadPptx(readFileSync(join(OUT, f)))
  const parts = deck.names.filter(n => n.endsWith('.xml') || n.endsWith('.rels'))
  let bad = 0
  for (const part of parts) {
    const xml = await deck.zip.file(part).async('string')
    const issues = lintXml(xml)
    if (issues.length) {
      bad++
      console.log(`FAIL ${f} :: ${part} :: ${issues.slice(0, 3).join(' | ')}`)
    }
  }
  if (!bad) console.log(`OK   ${f}  (${parts.length} parts)`)
}
