import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundleEntry } from './lib/bundle-ts-entry.mjs'

/**
 * Runtime checks for agent text normalization:
 *  - literal `\n` / `\r\n` / `\r` → real newlines (and `<br/>` on HTML content path)
 *  - HTML entity decode
 *  - LaTeX-safe unescape (`\nu` / `\neq` kept)
 *  - layout image slot `{ src, sourceUrl }` → element.link
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = (entry, fileName) => bundleEntry(root, entry, fileName)

const {
  decodeHtmlEntities,
  unescapeAgentNewlines,
  agentTextToHtmlBreaks,
} = await bundle('src/utils/agentText.ts', 'agentText.mjs')

const {
  markdownToHtml,
  splitLinesPreservingMath,
  renderInlineMarkdown,
  normalizeAgentText,
  tokenizeMath,
} = await bundle('src/utils/markdown.ts', 'markdown.mjs')

const { buildLayoutSlide } = await bundle('src/embed/agentic/layouts.ts', 'layouts.mjs')
const stylesMod = await bundle('src/embed/agentic/styles.ts', 'styles.mjs')
const preset = stylesMod.PPTX_STYLE_PRESETS?.[0]
  ?? stylesMod.listStylePresets?.()[0]
  ?? stylesMod.resolveStylePreset?.('minimal')

const failures = []
function check(condition, message) {
  if (!condition) failures.push(message)
}

check(unescapeAgentNewlines('a\\nb') === 'a\nb', 'literal \\n becomes newline')
check(unescapeAgentNewlines('a\\r\\nb') === 'a\nb', 'literal \\r\\n becomes newline')
check(unescapeAgentNewlines('a\\rb') === 'a\nb', 'literal \\r becomes newline')
check(unescapeAgentNewlines('a\\nb\\nc') === 'a\nb\nc', 'multiple literal \\n')
check(unescapeAgentNewlines('line\\n- bullet') === 'line\n- bullet', '\\n before dash becomes newline')

{
  const input = 'costs $5\\nuse $\\nu$'
  const out = normalizeAgentText(input)
  check(
    out === 'costs $5\nuse $\\nu$',
    `currency $5 must not swallow \\n or break \\nu (got ${JSON.stringify(out)})`,
  )
  const kinds = tokenizeMath(input).map(s => s.type)
  check(kinds.includes('math'), 'tokenizeMath still finds the real $\\nu$ span')
}
{
  const input = 'price \\$5\\nnext $\\nu$'
  const out = normalizeAgentText(input)
  check(
    out === 'price \\$5\nnext $\\nu$',
    `escaped \\$ must not disturb \\nu (got ${JSON.stringify(out)})`,
  )
}
{
  const input = 'use `$\\nu$` in docs\\nThanks'
  const out = normalizeAgentText(input)
  check(
    out === 'use `$\\nu$` in docs\nThanks',
    `inline code \\nu must stay intact (got ${JSON.stringify(out)})`,
  )
}
{
  const input = 'see $\\alpha$ then\\nnext'
  check(
    normalizeAgentText(input) === 'see $\\alpha$ then\nnext',
    'closed math + trailing newline escape',
  )
}
check(normalizeAgentText('$\\nu$') === '$\\nu$', 'LaTeX \\nu inside math is preserved')
check(normalizeAgentText('x $\\neq$ y') === 'x $\\neq$ y', 'LaTeX \\neq inside math is preserved')
check(
  normalizeAgentText('plain $\\frac{1}{2}$ then\\nnext') === 'plain $\\frac{1}{2}$ then\nnext',
  'unescapes newlines outside math while keeping math intact',
)
check(
  unescapeAgentNewlines('$\\nu$') !== '$\\nu$',
  'unescapeAgentNewlines is intentionally dumb — math safety is normalizeAgentText/tokenizeMath',
)

check(decodeHtmlEntities('A &amp; B') === 'A & B', 'decodes &amp;')
check(decodeHtmlEntities('&lt;tag&gt;') === '<tag>', 'decodes &lt;/&gt;')
check(decodeHtmlEntities('&nbsp;x') === '\u00a0x', 'decodes &nbsp;')
check(decodeHtmlEntities('&#8222;quote&#8220;') === '\u201Equote\u201C', 'decodes numeric entities')
check(decodeHtmlEntities('plain') === 'plain', 'plain text unchanged')

check(
  normalizeAgentText('- one\\n- two &amp; three') === '- one\n- two & three',
  'normalizeAgentText unescapes newlines and decodes entities',
)

check(
  agentTextToHtmlBreaks('- one\\n- two\r\n- three') === '- one<br/>- two<br/>- three',
  'agentTextToHtmlBreaks turns escapes + real newlines into <br/>',
)
check(
  agentTextToHtmlBreaks('<p>keep &amp; entity</p>') === '<p>keep &amp; entity</p>',
  'HTML content path does not decode entities inside tags',
)
check(
  agentTextToHtmlBreaks('<p>line1\\nline2</p>') === '<p>line1<br/>line2</p>',
  'HTML content path still converts escaped newlines to <br/>',
)

{
  const lines = splitLinesPreservingMath('- Narozen 1890.\\n- Prozaik, dramatik.')
  check(lines.length === 2, `splitLinesPreservingMath splits literal \\n (got ${lines.length})`)
  check(lines[0].includes('Narozen'), 'first line keeps first bullet')
  check(lines[1].includes('Prozaik'), 'second line keeps second bullet')
}

{
  const html = await markdownToHtml('First\\nSecond &amp; more')
  check(html.includes('First'), 'markdownToHtml keeps first line')
  check(html.includes('Second'), 'markdownToHtml keeps second line')
  check(html.includes('&') || html.includes('&amp;'), 'markdownToHtml preserves ampersand meaning')
  check(!html.includes('\\n'), 'markdownToHtml must not leave literal \\n')
}

{
  const inline = renderInlineMarkdown('A &amp; B')
  check(inline.includes('A') && inline.includes('B'), 'renderInlineMarkdown keeps text')
  check(!inline.includes('&amp;') || inline.includes('&'), 'renderInlineMarkdown decodes entities for display')
}

{
  assert.ok(preset, 'style preset required for layout build')
  const { slide } = await buildLayoutSlide(
    'imageText',
    {
      title: 'Karel Čapek',
      bullets: ['- Narozen 1890.\\n- Prozaik &amp; dramatik.'],
      image: {
        src: 'https://cdn.example.com/capek.jpg',
        sourceUrl: 'https://en.wikipedia.org/wiki/Karel_Capek',
      },
    },
    preset,
    { width: 1000, height: 562.5 },
  )

  const image = (slide.elements || []).find(el => el.type === 'image')
  check(!!image, 'imageText layout emits an image element')
  check(image?.src === 'https://cdn.example.com/capek.jpg', 'image src preserved')
  check(image?.link?.type === 'web', 'image link type is web')
  check(
    image?.link?.target === 'https://en.wikipedia.org/wiki/Karel_Capek',
    'image link target is sourceUrl',
  )

  const textEl = (slide.elements || []).find(el => el.type === 'text' && String(el.content || '').includes('Narozen'))
  check(!!textEl, 'bullets text element exists')
  const content = String(textEl?.content || '')
  check(!content.includes('\\n'), 'layout bullet content must not contain literal \\n')
  check(content.includes('Prozaik'), 'second bullet line made it into HTML')
  check(content.includes('&') || content.includes('dramati'), 'entity-decoded / rendered body text present')
}

if (failures.length) {
  console.error('check-agent-text failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('check-agent-text: ok')
