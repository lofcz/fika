import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context)
    const without = specifier.slice(2)
    const candidates = [
      join(srcDir, without),
      join(srcDir, without + '.ts'),
      join(srcDir, without + '.js'),
      join(srcDir, without, 'index.ts'),
    ]
    const file = candidates.find(path => existsSync(path))
    if (!file) return nextResolve(specifier, context)
    return { url: pathToFileURL(file).href, shortCircuit: true }
  },
})

const { DEFAULT_CODE_LANGUAGE, DEFAULT_CODE_SAMPLE, DEFAULT_CODE_THEME, measureCodeElementSize, resolveCodeLanguage, resolveCodeTheme } = await import(
  pathToFileURL(join(root, 'src/configs/code.ts')).href
)
const { highlightCodeBlock, highlightEditorHtml, prepareHighlighter } = await import(
  pathToFileURL(join(root, 'src/utils/codeHighlight.ts')).href
)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

assert(resolveCodeLanguage('ts') === 'typescript', 'ts alias')
assert(resolveCodeLanguage('py') === 'python', 'py alias')
assert(resolveCodeLanguage('c#') === 'csharp', 'c# alias')
assert(resolveCodeLanguage('unknown-lang') === DEFAULT_CODE_LANGUAGE, 'unknown language fallback')
assert(resolveCodeTheme('github-light') === 'github-light', 'known theme')
assert(resolveCodeTheme('unknown-theme') === DEFAULT_CODE_THEME, 'unknown theme fallback')

const sampleSize = measureCodeElementSize({ code: DEFAULT_CODE_SAMPLE, fontSize: 18, showLineNumbers: true })
assert(sampleSize.height < 220, 'sample code height fits content instead of a tall empty frame')
assert(sampleSize.height > 100, 'sample code height includes lines and padding')
assert(sampleSize.width <= 640, 'sample code width stays within the slide cap')

const highlighted = await highlightCodeBlock('const n: number = 1', 'ts', 'github-dark')
assert(highlighted.language === 'typescript', 'highlight resolves ts → typescript')
assert(highlighted.theme === 'github-dark', 'highlight keeps theme')
assert(typeof highlighted.html === 'string' && highlighted.html.includes('shiki'), 'highlight emits shiki HTML')
assert(typeof highlighted.bg === 'string' && highlighted.bg.startsWith('#'), 'highlight exposes theme background')

await prepareHighlighter('typescript', 'github-dark')
const editorHtml = highlightEditorHtml('const n: number = 1', 'ts', 'github-dark')
assert(editorHtml.includes('const'), 'sync editor highlight emits tokens')
assert(!editorHtml.includes('<pre'), 'sync editor highlight is inner code HTML')
assert(!editorHtml.includes('class="line"'), 'editor highlight must not wrap lines')
assert(!editorHtml.includes('<br'), 'editor highlight must not use br')

function plainFromEditorHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
}

for (const code of ['const n = 1', 'const n = 1\n', 'a\nb', 'a\nb\n', DEFAULT_CODE_SAMPLE, DEFAULT_CODE_SAMPLE + '\n']) {
  const html = highlightEditorHtml(code, 'ts', 'github-dark')
  assert(plainFromEditorHtml(html) === code, `editor highlight round-trips ${JSON.stringify(code)}`)
  assert(!html.includes('class="line"'), `no line wrappers for ${JSON.stringify(code)}`)
  assert(!html.includes('<br'), `no br for ${JSON.stringify(code)}`)
}

const source = readFileSync(join(root, 'src/utils/codeHighlight.ts'), 'utf8')
assert(!/(?:^|\n)\s*import\s+[^;]*\s+from\s+['"]shiki['"]/.test(source), 'codeHighlight must not import shiki barrel')
assert(source.includes("import('shiki/core')"), 'codeHighlight loads shiki/core on demand')

if (failures.length) {
  console.error('code highlight checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('code highlight checks passed')
