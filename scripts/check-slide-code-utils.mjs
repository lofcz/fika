import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { parseAndFormatJSON, findElementRange } = await import(
  pathToFileURL(join(root, 'src/views/Editor/slideCodeUtils.ts')).href
)
const { validateSlide } = await import(
  pathToFileURL(join(root, 'src/views/Editor/slideValidator.ts')).href
)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const ok = parseAndFormatJSON('{"a":1}')
assert(ok.success === true && ok.formatted.includes('"a"'), 'format success')
const bad = parseAndFormatJSON('{')
assert(bad.success === false, 'format failure')

const source = JSON.stringify({
  id: 's1',
  elements: [
    { id: 'e1', type: 'text', left: 0, top: 0, width: 10, height: 10, rotate: 0 },
    { id: 'e2', type: 'mermaid', left: 1, top: 1, width: 20, height: 20, rotate: 0, code: 'graph TD;A-->B' },
    { id: 'e3', type: 'code', left: 2, top: 2, width: 30, height: 30, rotate: 0, code: 'const n = 1', language: 'typescript', theme: 'github-dark', fontSize: 18, showLineNumbers: true },
  ],
}, null, 2)
const range = findElementRange(source, 'e2')
assert(!!range && source.slice(range.start, range.end).includes('"e2"'), 'findElementRange e2')
const codeRange = findElementRange(source, 'e3')
assert(!!codeRange && source.slice(codeRange.start, codeRange.end).includes('"code"'), 'findElementRange e3')

const valid = validateSlide(JSON.parse(source))
assert(valid.ok === true, 'validateSlide ok')
assert(source.includes('"code"'), 'slide fixture includes code element')
const invalid = validateSlide({ id: 's1', elements: [{ id: 'x' }] })
assert(invalid.ok === false, 'validateSlide rejects incomplete element')

if (failures.length) {
  console.error('slideCodeUtils checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('slideCodeUtils checks passed')
