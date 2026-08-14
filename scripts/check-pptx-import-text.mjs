import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  PPTX_HYPERLINK_COLOR,
  PPTX_FOLLOWED_HYPERLINK_COLOR,
  wrapHangingIndentParagraphsAsLists,
  linkifyPlainUrls,
  styleImportedHyperlinks,
} = await import(pathToFileURL(join(root, 'src/utils/pptxImportText.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const hanging = [
  '<p style="text-align: left;margin-left: 18pt;text-indent: -18pt;"><span style="font-size: 28pt;">One</span></p>',
  '<p style="text-align: left;margin-left: 18pt;text-indent: -18pt;"><span style="font-size: 28pt;color: #FF0000;">Two</span></p>',
].join('')
const listed = wrapHangingIndentParagraphsAsLists(hanging, 4 / 3)
assert(listed.startsWith('<ul'), 'hanging indent becomes ul')
assert(listed.includes('padding-inline-start: 24px'), '18pt hanging indent becomes 24px list padding')
assert(listed.includes('font-size: 28pt'), 'ul copies run font-size so the marker matches PowerPoint')
assert((listed.match(/<li>/g) || []).length === 2, 'two hanging paragraphs become two list items')
assert(!listed.includes('text-indent'), 'list items drop hanging indent')
assert(!listed.includes('margin-left'), 'list items drop bullet margin')

const emptyHanging = [
  '<p style="margin-left: 18pt;text-indent: -18pt;"><span>One</span></p>',
  '<p style="margin-left: 18pt;text-indent: -18pt;"><span>Two</span></p>',
  '<p style="margin-left: 18pt;text-indent: -18pt;"><span>&nbsp;</span></p>',
  '<p style="margin-left: 18pt;text-indent: -18pt;"><span>Three</span></p>',
  '<p style="margin-left: 18pt;text-indent: -18pt;"><span>&nbsp;</span></p>',
].join('')
const emptyOut = wrapHangingIndentParagraphsAsLists(emptyHanging)
assert((emptyOut.match(/<li>/g) || []).length === 3, 'empty hanging paragraphs are not bullets')
assert(emptyOut.includes('One') && emptyOut.includes('Three'), 'non-empty bullets are kept')
assert((emptyOut.match(/<ul\b/g) || []).length === 2, 'a spacer between bullets splits the list instead of inserting an empty li')
assert(!/<li>[^<]*<p[^>]*>[^<]*<span[^>]*>&nbsp;/.test(emptyOut), 'nbsp-only hanging paragraphs never become list items')

const mixed = '<p style="text-align:left;">Title</p>' + hanging + '<p style="text-align:left;">After</p>'
const mixedOut = wrapHangingIndentParagraphsAsLists(mixed)
assert(mixedOut.startsWith('<p'), 'leading non-list paragraph stays a paragraph')
assert(/<ul\b/.test(mixedOut) && mixedOut.includes('After'), 'hanging run is wrapped between normal paragraphs')
assert(wrapHangingIndentParagraphsAsLists('<ul><li><p style="text-align:left;">A</p></li></ul>') === '<ul><li><p style="text-align:left;">A</p></li></ul>', 'existing ul is left alone')

const alreadyLinked = '<span><a href="https://stackoverflow.com/q/1">https://stackoverflow.com/q/1</a></span>'
assert(linkifyPlainUrls(alreadyLinked) === alreadyLinked, 'existing anchors are not wrapped again')

const plain = 'See https://stackoverflow.com/questions/1 and done.'
const linked = linkifyPlainUrls(plain)
assert(linked.includes('<a href="https://stackoverflow.com/questions/1"'), 'plain FQDN http(s) URLs become anchors')
assert(!linkifyPlainUrls('http://localhost/api').includes('<a '), 'non-FQDN hosts are not auto-linked')
assert(!linkifyPlainUrls('https://www.w3.org/2000/svg').includes('<a '), 'w3.org schema URLs are not auto-linked')
assert(!linkifyPlainUrls('not a url').includes('<a '), 'plain text stays plain')

const painted = styleImportedHyperlinks('<span style="color: #000000;font-size: 28px;"><a href="https://example.com/a">https://example.com/a</a></span>')
assert(painted.includes('font-size: 28px'), 'wrapping span keeps run font-size')
assert(!painted.includes('color: #000000'), 'wrapping span black is stripped so CSS can paint the link')
assert(!new RegExp(`color:\\s*${PPTX_HYPERLINK_COLOR}`, 'i').test(painted), 'hyperlink blue is not baked inline, so :visited can apply')
assert(PPTX_FOLLOWED_HYPERLINK_COLOR === '#954F72', 'Office folHlink purple')

const importSrc = readFileSync(join(root, 'src/hooks/useImport.ts'), 'utf8')
assert(importSrc.includes('wrapHangingIndentParagraphsAsLists'), 'useImport wraps inherited bullets as lists')
assert(importSrc.includes('linkifyPlainUrls'), 'useImport linkifies leftover http(s) text')
assert(importSrc.includes('styleImportedHyperlinks'), 'useImport styles imported hyperlinks')

const sample = join(homedir(), 'Desktop', 'Rizika použití EF s ohledem na výkonnost.pptx')
if (existsSync(sample)) {
  const buf = readFileSync(sample)
  const { parse } = await import(pathToFileURL(join(root, 'node_modules/pptxtojson/dist/index.js')).href)
  const json = await parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

  const slide5 = json.slides[4]
  const marsList = slide5.elements.find(el => el.type === 'text' && /MARS/.test(el.content || '') && /text-indent:\s*-/.test(el.content || ''))
  assert(!!marsList, 'slide 5 has the MARS bullet body')
  const marsImported = wrapHangingIndentParagraphsAsLists(marsList.content, 4 / 3)
  assert(/<ul\b/.test(marsImported), `slide 5 MARS body becomes a list (parser ul=${/<(ul|ol)\b/i.test(marsList.content)})`)
  assert(/<ul[^>]*padding-inline-start:\s*24px/.test(marsImported), 'MARS list keeps the 18pt hanging indent as 24px padding')
  assert(/<ul[^>]*font-size:/.test(marsImported), 'MARS list copies run font-size onto ul for PowerPoint-sized markers')
  assert((marsImported.match(/<li>/g) || []).length >= 5, 'slide 5 has several list items')

  const slide7 = json.slides[6]
  const enlistList = slide7.elements.find(el => el.type === 'text' && /Distribuov/.test(el.content || '') && /Enlist=True/.test(el.content || ''))
  assert(!!enlistList, 'slide 7 has the Enlist bullet body')
  const enlistParas = (enlistList.content.match(/<p\b/g) || []).length
  const enlistImported = wrapHangingIndentParagraphsAsLists(enlistList.content, 4 / 3)
  assert(
    (enlistImported.match(/<li>/g) || []).length === 3,
    `slide 7 matches PowerPoint's 3 bullets (parser had ${enlistParas} hanging paragraphs, import has ${(enlistImported.match(/<li>/g) || []).length} lis)`,
  )
  assert(enlistImported.includes('Distribuované'), 'slide 7 keeps the first bullet')
  assert(enlistImported.includes('Enlist=True'), 'slide 7 keeps the connection-string bullet')

  const slide8 = json.slides[7]
  const linksBox = slide8.elements.find(el => el.type === 'text' && /red-gate/.test(el.content || ''))
  assert(!!linksBox, 'slide 8 has the links text box')
  const imported = styleImportedHyperlinks(linkifyPlainUrls(wrapHangingIndentParagraphsAsLists(linksBox.content)))
  assert(/<ul\b/.test(imported), 'slide 8 Odkazy becomes a list')
  assert((imported.match(/<a /g) || []).length >= 4, `slide 8 keeps four hyperlinks, got ${(imported.match(/<a /g) || []).length}`)
  assert(imported.includes('red-gate.com'), 'slide 8 keeps the red-gate href')
  assert(!new RegExp(`<a[^>]*color:\\s*${PPTX_HYPERLINK_COLOR}`, 'i').test(imported), 'slide 8 anchors leave color to CSS so visited links can turn purple')
}

if (failures.length) {
  console.error('pptx import text checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('pptx import text checks passed')
