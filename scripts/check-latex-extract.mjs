import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { extractEquationLatex, toHfmathLatex } = await import(pathToFileURL(join(root, 'src/utils/latex.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const source = String.raw`
Text
\begin{equation}
E = mc^2
\end{equation}
More
\begin{equation*}
a^2 + b^2 = c^2
\end{equation*}
`
const equations = extractEquationLatex(source)
assert(equations.length === 2, `expected 2 equations, got ${equations.length}`)
assert(equations[0] === 'E = mc^2', 'first equation body')
assert(equations[1] === 'a^2 + b^2 = c^2', 'starred equation body')
assert(extractEquationLatex('no equations').length === 0, 'empty when none')

assert(toHfmathLatex(String.raw`4^5\cdot3x+9=7`) === String.raw`4^5\cdot 3x+9=7`, 'space after \\cdot before a digit')
assert(toHfmathLatex(String.raw`4^{5}\cdot3x+9=7`) === String.raw`4^{5}\cdot 3x+9=7`, 'space after braced superscript')
assert(toHfmathLatex(String.raw`\sin x`) === String.raw`\sin x`, 'leave already-spaced commands alone')
assert(toHfmathLatex(String.raw`\left(x\right)`) === String.raw`\left(x\right)`, 'do not split \\left(')
assert(toHfmathLatex(String.raw`\sin2\theta`) === String.raw`\sin 2\theta`, 'space after \\sin before a digit')

{
  const { hfmath } = await import('hfmath')
  const compact = String.raw`4^5\cdot3x+9=7`
  const raw = new hfmath(compact)._tokens
  const fixed = new hfmath(toHfmathLatex(compact))._tokens
  assert(raw.includes(String.raw`\cdot3x`), 'upstream hfmath swallows the digit into \\cdot')
  assert(fixed.includes(String.raw`\cdot`), 'normalized latex keeps \\cdot as its own token')
  assert(!fixed.includes(String.raw`\cdot3x`), 'normalized latex does not keep the swallowed token')
}

if (failures.length) {
  console.error('latex extract checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('latex extract checks passed')
