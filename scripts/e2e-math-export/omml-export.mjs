/**
 * E2E: LaTeX → MathML → OMML → PPTX contains native m:oMath (no math PNGs).
 * Also verifies mixed plain-text + math in the same paragraph.
 *
 * Run: node scripts/e2e-math-export/omml-export.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPptx } from '../lib/pptx-inspect.mjs'
import { convertLatexToMathMl } from 'mathlive'
import { mml2omml } from 'mathml2omml'
import pptxgen from 'pptxgenjs-plus'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'out')
mkdirSync(OUT, { recursive: true })

function latexToOmml(latex) {
  const mml = convertLatexToMathMl(latex)
  const wrapped = /<math[\s/>]/i.test(mml)
    ? mml
    : `<math xmlns="http://www.w3.org/1998/Math/MathML">${mml}</math>`
  const omml = mml2omml(wrapped)
  if (!/<m:oMath[\s/>]/i.test(omml)) throw new Error(`no oMath for: ${latex}`)
  return omml
}

const failures = []
const assert = (cond, msg) => {
  if (!cond) failures.push(msg)
}

const cases = [
  { label: 'frac', latex: 'v = \\frac{s}{t}', expectFraction: true },
  { label: 'cdot', latex: 's = v \\cdot t', expectFraction: false },
  { label: 'approx', latex: 'a = g \\approx 9.81', expectFraction: false },
  { label: 'subscript', latex: 'F_t = f \\cdot F_n', expectFraction: false },
]

const unit = {}
for (const c of cases) {
  const omml = latexToOmml(c.latex)
  unit[c.label] = {
    hasOMath: /<m:oMath[\s/>]/.test(omml),
    hasMf: omml.includes('<m:f'),
    hasNum: omml.includes('<m:num'),
    hasDen: omml.includes('<m:den'),
    len: omml.length,
  }
  assert(unit[c.label].hasOMath, `${c.label}: missing m:oMath`)
  assert(unit[c.label].len > 40, `${c.label}: OMML too short`)
  if (c.expectFraction) {
    assert(unit[c.label].hasMf && unit[c.label].hasNum && unit[c.label].hasDen, `${c.label}: missing fraction parts`)
  }
}

const pptx = new pptxgen()
const slide = pptx.addSlide()
slide.addText(
  [
    { text: 'Konstantní rychlost: ' },
    { text: '', options: { omml: latexToOmml('v = \\frac{s}{t}') } },
    { text: ' a také ' },
    { text: '', options: { omml: latexToOmml('s = v \\cdot t') } },
  ],
  { x: 0.5, y: 0.5, w: 9, h: 1 },
)
slide.addText(
  [{ text: '', options: { omml: latexToOmml('s = v_0 t + \\frac{1}{2} a t^2') } }],
  { x: 0.5, y: 1.8, w: 9, h: 1.2 },
)

const buf = await pptx.write({ outputType: 'nodebuffer' })
const outFile = join(OUT, 'omml-export.pptx')
writeFileSync(outFile, buf)

const deck = await loadPptx(buf)
const firstSlide = deck.slides[0]
const slideXml = firstSlide.xml
const mixedPara = /<a:p>[\s\S]*?<a:t>Konstantní rychlost: <\/a:t>[\s\S]*?<m:oMath[\s>][\s\S]*?<\/m:oMath>[\s\S]*?<a:t> a také <\/a:t>[\s\S]*?<m:oMath[\s>][\s\S]*?<\/m:oMath>[\s\S]*?<\/a:p>/

const checks = {
  hasMathNs: firstSlide.hasMathNs,
  oMathCount: firstSlide.oMath,
  hasFraction: firstSlide.hasFraction,
  hasNum: slideXml.includes('<m:num'),
  hasDen: slideXml.includes('<m:den'),
  hasPlainText: slideXml.includes('Konstantní rychlost'),
  hasMixedMidText: slideXml.includes(' a také '),
  mixedInSameParagraph: mixedPara.test(slideXml),
  pPrViolations: firstSlide.pPrViolations,
  mediaCount: deck.mediaCount,
  mediaFiles: deck.mediaNames,
  outFile,
  unit,
}

assert(checks.hasMathNs, 'slide missing math namespace')
assert(checks.oMathCount >= 3, `expected ≥3 oMath, got ${checks.oMathCount}`)
assert(checks.hasFraction && checks.hasNum && checks.hasDen, 'missing fraction structure')
assert(checks.hasPlainText, 'missing surrounding Czech text')
assert(checks.hasMixedMidText, 'missing mid-sentence plain text')
assert(checks.mixedInSameParagraph, 'plain text + OMML not interleaved in same <a:p>')
assert(checks.mediaCount === 0, `unexpected media files: ${checks.mediaFiles.join(', ')}`)

writeFileSync(join(OUT, 'omml-summary.json'), JSON.stringify({ checks, failures }, null, 2))
console.log(JSON.stringify({ checks, failures }, null, 2))

if (failures.length) {
  console.error('\nFAIL: OMML export checks failed')
  for (const f of failures) console.error(' -', f)
  process.exit(1)
}
console.log('\nPASS: PPTX contains native OMML math (mixed text+math, no media images)')
process.exit(0)
