import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { bundleEntry } from './lib/bundle-ts-entry.mjs'

/**
 * OMML run styling: pptxgenjs embeds OMML opaquely, so equation color/size
 * must be stamped into m:r / m:ctrlPr as a:rPr before export.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = (entry, fileName) => bundleEntry(root, entry, fileName)

const { applyOmmlRunStyle } = await bundle('src/utils/latexToOmml.ts', 'latexToOmml.mjs')

const failures = []
const check = (cond, msg) => { if (!cond) failures.push(msg) }

const raw = [
  '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">',
  '<m:f><m:fPr><m:ctrlPr/></m:fPr>',
  '<m:num><m:r><m:t>a</m:t></m:r></m:num>',
  '<m:den><m:r><m:t>b</m:t></m:r></m:den>',
  '</m:f></m:oMath>',
].join('')

const styled = applyOmmlRunStyle(raw, { color: '#8c8c8c', fontSizePt: 24 })
check(styled.includes('srgbClr val="8C8C8C"'), 'color stamped into OMML')
check(/sz="2400"/.test(styled), 'font size stamped as hundredths of a point')
check((styled.match(/<m:r>[\s\S]*?<a:rPr\b/g) || []).length >= 2, 'a:rPr applied to both numerator and denominator runs')
check(/<m:ctrlPr>[\s\S]*?<a:rPr\b[\s\S]*?8C8C8C/.test(styled), 'fraction control (vinculum) also receives the color')

const restyled = applyOmmlRunStyle(styled, { color: '#BE5105' })
check(restyled.includes('srgbClr val="BE5105"'), 'restyle replaces prior color')
check(!restyled.includes('srgbClr val="8C8C8C"'), 'prior color removed on restyle')
check(
  (restyled.match(/<a:rPr\b/g) || []).length === (styled.match(/<a:rPr\b/g) || []).length,
  'restyle does not nest extra a:rPr nodes',
)

check(applyOmmlRunStyle(raw, {}) === raw, 'empty style leaves OMML untouched')

const colorOnly = applyOmmlRunStyle(raw, { color: '#ffffff' })
check(colorOnly.includes('srgbClr val="FFFFFF"'), 'color-only style stamps color')
check(!/sz="/.test(colorOnly), 'color-only style does not pin font size into OMML')

const useExport = readFileSync(join(root, 'src/hooks/useExport.ts'), 'utf8')
check(useExport.includes('applyOmmlRunStyle'), 'useExport imports/uses applyOmmlRunStyle')
check(useExport.includes('options.omml = applyOmmlRunStyle'), 'inline fika-math export stamps OMML run style')
check(
  /el\.type === 'latex'[\s\S]{0,800}applyOmmlRunStyle/.test(useExport),
  'latex element export stamps OMML run style',
)
check(
  /formatHTML\(el\.content,\s*\{[\s\S]*?color:\s*defaultColor/.test(useExport),
  'text export passes defaultColor fallback into formatHTML for unstyled math',
)
check(
  !/if \(!options\.fontSize && fallback\?\.fontSizePt\)/.test(useExport),
  'inline math export does not fall back to text-box fontSize for OMML sz',
)
check(
  /mathOwnStyle\['font-size'\]/.test(useExport) && !/explicitFontSize = mathStyle\['font-size'\]/.test(useExport),
  'OMML sz uses math span own style only (not ancestor font-size)',
)
check(
  /applyOmmlRunStyle\(ommlRaw,\s*\{\s*color\s*\}\)/.test(useExport),
  'latex element export stamps color only (no default sz)',
)

if (failures.length) {
  console.error(`check-omml-run-style FAILED (${failures.length}):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('omml run style checks passed')
