import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  lastCssDeclaration,
  importedParagraphMetrics,
  scalePptxTextInset,
  estimateAnywhereWrapLines,
  estimateColumnHeight,
  textFitsFixedBox,
} = await import(pathToFileURL(join(root, 'src/utils/pptxImportMetrics.ts')).href)
const { wrapHangingIndentParagraphsAsLists } = await import(pathToFileURL(join(root, 'src/utils/pptxImportText.ts')).href)
const { fitClipPadding } = await import(pathToFileURL(join(root, 'src/utils/textFit.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

assert(lastCssDeclaration('line-height: 1.2;line-height: 1.08;', 'line-height') === '1.08', 'last line-height wins')
assert(lastCssDeclaration('line-height: 1.2;', 'line-height') === '1.2', 'single line-height')
assert(lastCssDeclaration('', 'line-height') === null, 'missing line-height')

const duplicate = importedParagraphMetrics(
  '<p style="line-height: 1.2;line-height: 1.08;margin-top: 10pt;font-size: 28pt;">A</p>'
  + '<p style="line-height: 1.2;line-height: 1.08;margin-top: 10pt;font-size: 28pt;">B</p>',
  4 / 3,
)
assert(duplicate.lineHeight === 1.08, `duplicate line-height must resolve to 1.08, got ${duplicate.lineHeight}`)
assert(duplicate.margin === 13.3, `10pt paragraph space scales to 13.3px, got ${duplicate.margin}`)

assert(fitClipPadding(37, 0.86) >= 3 && fitClipPadding(37, 0.86) <= 12, 'tight autofit line-height keeps a small last-line pad, not a large gap')
assert(fitClipPadding(16, 1.5) >= 3 && fitClipPadding(16, 1.5) <= 8, 'normal line-height keeps only a subpixel clip pad')

const inset = scalePptxTextInset({ t: 3.6, r: 7.2, b: 3.6, l: 7.2 }, 4 / 3)
assert(inset && Math.abs(inset[0] - 4.8) < 0.01 && Math.abs(inset[1] - 9.6) < 0.01, `insets scale pt→px, got ${inset}`)

const listed = wrapHangingIndentParagraphsAsLists(
  '<p style="margin-left: 18pt;text-indent: -18pt;">A</p><p style="margin-left: 18pt;text-indent: -18pt;">B</p>',
  4 / 3,
)
assert(listed.includes('padding-inline-start: 24px'), 'imported bullet indent matches 18pt hanging indent')

const pmCss = readFileSync(join(root, 'src/assets/styles/prosemirror.scss'), 'utf8')
assert(pmCss.includes('overflow-wrap: anywhere'), 'long URLs wrap like PowerPoint (anywhere, not only at spaces)')
assert(pmCss.includes('li + li'), 'list item spacing is between items, not above the first item')
assert(pmCss.includes("content: '•'"), 'bullets use the PowerPoint Arial • glyph, not a tiny CSS disc')
assert(pmCss.includes('list-style-position: outside'), 'wrapped list lines hang under the text, not the bullet')
assert(pmCss.includes('color: #000'), 'list markers stay black even when the item is a hyperlink')
assert(/padding-inline-start: 0\.4em/.test(pmCss), 'list items keep a gap between the marker and the text')
assert(!/ul, ol, li \{[\s\S]*margin-top: var\(--paragraphSpace\)/.test(pmCss), 'ul/ol/li must not all take paragraphSpace on the first item')

const importSrc = readFileSync(join(root, 'src/hooks/useImport.ts'), 'utf8')
assert(importSrc.includes('importedParagraphMetrics'), 'useImport uses last-wins paragraph metrics')
assert(importSrc.includes('scalePptxTextInset'), 'useImport scales text insets to editor px')
assert(!importSrc.includes('ratio * fontScale'), 'normAutofit fontScale must not be baked into imported font-size px')

const sample = join(homedir(), 'Desktop', 'Rizika použití EF s ohledem na výkonnost.pptx')
if (existsSync(sample)) {
  const buf = readFileSync(sample)
  const { parse } = await import(pathToFileURL(join(root, 'node_modules/pptxtojson/dist/index.js')).href)
  const json = await parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  const ratio = 96 / 72

  const linksBox = json.slides[7].elements.find(el => el.type === 'text' && /red-gate/.test(el.content || ''))
  assert(!!linksBox, 'slide 8 has the Odkazy body')

  const metrics = importedParagraphMetrics(linksBox.content, ratio)
  assert(metrics.lineHeight <= 1.1, `slide 8 line-height must be the OOXML 0.9×1.2 value (~1.08), not the dummy 1.2; got ${metrics.lineHeight}`)
  assert(metrics.lineHeight >= 1, `slide 8 line-height should stay around 1.08, got ${metrics.lineHeight}`)

  const width = linksBox.width * ratio
  const height = linksBox.height * ratio
  const [insetT, insetR, insetB, insetL] = scalePptxTextInset(linksBox.textInset, ratio) || [0, 0, 0, 0]
  const bulletPad = 18 * ratio + 0.4 * Math.floor(28 * ratio)
  const innerWidth = width - insetL - insetR - bulletPad
  const innerHeight = height - insetT - insetB
  const fontSize = Math.floor(28 * ratio)
  const urls = [...new Set(
    [...linksBox.content.matchAll(/>(https?:\/\/[^<]+)</g)].map(match => match[1].replace(/&amp;/g, '&')),
  )]
  assert(urls.length >= 4, `slide 8 should have 4 URLs, got ${urls.length}: ${urls.join(' | ')}`)

  const lines = urls.map(url => estimateAnywhereWrapLines(url, innerWidth, fontSize))
  const contentHeight = estimateColumnHeight(lines, fontSize, metrics.lineHeight, metrics.margin || 0)
  assert(
    textFitsFixedBox(contentHeight, innerHeight),
    `slide 8 Odkazy must fit the imported box like PowerPoint `
    + `(contentHeight=${contentHeight.toFixed(1)} innerHeight=${innerHeight.toFixed(1)} `
    + `lines=${lines.join('+')} font=${fontSize} lh=${metrics.lineHeight} gap=${metrics.margin} `
    + `box=${width.toFixed(1)}x${height.toFixed(1)})`,
  )

  const wrongMetrics = importedParagraphMetrics(
    linksBox.content.replace(/line-height:\s*1\.08/g, ''),
    ratio,
  )
  const clippedHeight = estimateColumnHeight(lines, fontSize, Math.max(wrongMetrics.lineHeight, 1.2), (metrics.margin || 0) + 26.6)
  assert(
    clippedHeight > innerHeight,
    'the old first-wins 1.2 + stacked list margins must be shown to overflow, so this test actually guards the cutoff',
  )
}
else {
  console.warn('skipping slide 8 fit check: sample pptx not on Desktop')
}

if (failures.length) {
  console.error('pptx text-fit checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('pptx text-fit checks passed')
