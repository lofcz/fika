import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { validateThemeFile, parseThemeFileContent } = await import(
  pathToFileURL(join(root, 'src/utils/themeFile.ts')).href
)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const validPayload = {
  title: 'Demo theme',
  slides: [{ id: 's1', elements: [] }],
  theme: { fontColor: '#333' },
  width: 1000,
  height: 562.5,
}
const valid = validateThemeFile(validPayload)
assert(valid.ok === true, 'valid theme')
assert(validateThemeFile({ ...validPayload, slides: [] }).ok === false, 'reject empty slides')
assert(validateThemeFile({ ...validPayload, title: '' }).ok === false, 'reject empty title')

const json = JSON.stringify(validPayload)
const parsed = parseThemeFileContent(json, { encrypted: false, decrypt: s => s })
assert(parsed.title === 'Demo theme', 'parse plain json')

const encrypted = parseThemeFileContent('CIPHER', {
  encrypted: true,
  decrypt: () => json,
})
assert(encrypted.width === 1000, 'parse decrypted content')

let threw = false
try {
  parseThemeFileContent('bad', { encrypted: false, decrypt: s => s })
}
catch {
  threw = true
}
assert(threw, 'invalid json throws')

if (failures.length) {
  console.error('themeFile checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('themeFile checks passed')
