import { existsSync, readFileSync, statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
registerHooks({
  resolve(specifier, context, nextResolve) {
    const fromDir = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : srcDir
    const resolved = specifier.startsWith('@/')
      ? join(srcDir, specifier.slice(2))
      : specifier.startsWith('.')
        ? join(fromDir, specifier)
        : null
    if (resolved) {
      const candidates = [
        resolved + '.ts',
        resolved + '.js',
        join(resolved, 'index.ts'),
        resolved,
      ]
      const file = candidates.find(path => existsSync(path) && statSync(path).isFile())
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const { readTextBoxStyle, applyTextBoxStylePatch, isTextStyleTarget, isShapeTextFixedHeight } = await import(
  pathToFileURL(join(root, 'src/views/Editor/Toolbar/common/textBoxStyle.ts')).href
)
const { classifyElementListSync, patchEditingElementChrome, slideElementsSnapEqual } = await import(
  pathToFileURL(join(root, 'src/views/Editor/Canvas/elementListSync.ts')).href
)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const textEl = {
  type: 'text',
  id: 't1',
  left: 0,
  top: 0,
  width: 200,
  height: 80,
  rotate: 0,
  content: '<p>Hi</p>',
  defaultFontName: 'Inter',
  defaultColor: '#111',
  fill: '#fff',
  lineHeight: 1.2,
  paragraphSpace: 10,
  inset: [8, 8, 8, 8],
  fixedHeight: true,
  vAlign: 'middle',
}
const shapeEl = {
  type: 'shape',
  id: 's1',
  left: 0,
  top: 0,
  width: 200,
  height: 80,
  rotate: 0,
  viewBox: [200, 200],
  path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
  fill: '#f4e8d0',
  fixedRatio: false,
  text: {
    content: '<p>Houby</p>',
    defaultFontName: 'Inter',
    defaultColor: '#111',
    align: 'top',
    lineHeight: 1.15,
    paragraphSpace: 0,
    inset: [4, 6, 4, 6],
  },
}
const defaultShapeText = {
  content: '',
  defaultFontName: 'Inter',
  defaultColor: '#111',
  align: 'middle',
}

assert(isTextStyleTarget(textEl) && isTextStyleTarget(shapeEl), 'text and shape-with-text share the text style target')
assert(!isTextStyleTarget({ type: 'image' }), 'images are not text style targets')

const textStyle = readTextBoxStyle(textEl)
assert(textStyle && textStyle.fixedHeight && textStyle.vAlign === 'middle', 'native text boxes expose fixed height')
assert(textStyle.fill === '#fff' && textStyle.lineHeight === 1.2, 'native text box fill and line height are read from the element')

const shapeStyle = readTextBoxStyle(shapeEl)
assert(shapeStyle && shapeStyle.fixedHeight, 'imported shape text defaults to a fixed box')
assert(isShapeTextFixedHeight(shapeEl.text), 'unset shape text.fixedHeight means fixed')
assert(!isShapeTextFixedHeight({ ...shapeEl.text, fixedHeight: false }), 'shape text.fixedHeight false is auto height')
assert(shapeStyle.vAlign === 'top' && shapeStyle.fill === '#f4e8d0', 'shape text vAlign and fill come from the shape')
assert(shapeStyle.inset.join() === '4,6,4,6', 'shape text inset is read from text.inset')

const textFill = applyTextBoxStylePatch(textEl, { fill: '#abc' }, defaultShapeText)
assert(textFill?.props?.fill === '#abc', 'text fill patch writes element.fill')

const textAuto = applyTextBoxStylePatch(textEl, { fixedHeight: false }, defaultShapeText)
assert(textAuto?.remove?.includes('fixedHeight') && textAuto.remove.includes('vAlign'), 'unlocking height clears fixedHeight and vAlign')
const unlocked = { ...textEl, fixedHeight: false }
delete unlocked.vAlign
const lockNormal = applyTextBoxStylePatch(unlocked, { fixedHeight: true }, defaultShapeText)
assert(lockNormal?.props?.fixedHeight === true && lockNormal?.props?.vAlign === 'top', 'locking a normal text box keeps top align')
assert(!('inset' in (lockNormal?.props || {})), 'locking height does not rewrite padding')
assert(readTextBoxStyle({ ...unlocked, ...lockNormal.props })?.inset.join() === unlocked.inset.join(), 'locking height leaves the same inset')

const shapeAlign = applyTextBoxStylePatch(shapeEl, { vAlign: 'bottom', lineHeight: 1.5 }, defaultShapeText)
assert(shapeAlign?.props?.text?.align === 'bottom', 'shape vAlign patch writes text.align')
assert(shapeAlign?.props?.text?.lineHeight === 1.5, 'shape lineHeight patch writes text.lineHeight')
assert(shapeAlign?.props?.text?.content === '<p>Houby</p>', 'shape text content is preserved when patching chrome')

const shapeFill = applyTextBoxStylePatch(shapeEl, { fill: '' }, defaultShapeText)
assert(shapeFill?.props?.fill === '', 'shape fill patch writes element.fill')
const shapeAuto = applyTextBoxStylePatch(shapeEl, { fixedHeight: false }, defaultShapeText)
assert(shapeAuto?.props?.text?.fixedHeight === false, 'shape auto-height patch writes text.fixedHeight')
const shapeFixed = applyTextBoxStylePatch(shapeEl, { fixedHeight: true }, defaultShapeText)
assert(shapeFixed?.props?.text?.fixedHeight === true, 'shape fixed-height patch writes text.fixedHeight')

const coverTitle = {
  ...textEl,
  placeholder: 'Click to add title',
  textType: 'title',
  placeholderFontSize: 66,
  placeholderAlign: 'center',
  content: '',
  fixedHeight: false,
}
delete coverTitle.vAlign
const coverStyle = readTextBoxStyle(coverTitle)
assert(coverStyle && coverStyle.vAlign === 'middle', 'cover title placeholder reads as middle, not top')
const lockCover = applyTextBoxStylePatch(coverTitle, { fixedHeight: true, vAlign: coverStyle.vAlign }, defaultShapeText)
assert(lockCover?.props?.fixedHeight === true && lockCover?.props?.vAlign === 'middle', 'locking a title placeholder keeps middle align')
const lockCoverBare = applyTextBoxStylePatch(coverTitle, { fixedHeight: true }, defaultShapeText)
assert(lockCoverBare?.props?.vAlign === 'middle', 'locking without an explicit vAlign still persists the resolved middle')

const slideOf = (el) => ({ id: 'slide-1', elements: [el] })
const lockedTitle = { ...coverTitle, ...lockCoverBare.props }
assert(
  classifyElementListSync(slideOf(coverTitle), slideOf(lockedTitle), coverTitle.id) === 'patch-chrome',
  'locking height while editing patches chrome instead of remounting the editor',
)
const layoutSrc = readFileSync(join(root, 'src/utils/placeholderLayout.ts'), 'utf8')
const lockSrc = readFileSync(join(root, 'src/utils/textBoxLock.ts'), 'utf8')
assert(layoutSrc.includes("export type TextBoxLiveMode = 'grow' | 'fit' | 'slot'"), 'auto↔fixed share one live text-box mode')
assert(lockSrc.includes('export const elementLocksTextBox'), 'text and shape lock predicates are shared')
assert(layoutSrc.includes("from './textBoxLock'"), 'layout re-exports the shared lock predicates')
const patched = patchEditingElementChrome([coverTitle], lockedTitle)
assert(patched[0].fixedHeight === true && patched[0].vAlign === 'middle', 'live editor chrome keeps the resolved middle align')

const mutated = { ...coverTitle }
const prevMutated = { id: 'slide-1', elements: [mutated] }
Object.assign(mutated, { fixedHeight: true, vAlign: 'middle' })
assert(
  classifyElementListSync(prevMutated, { id: 'slide-1', elements: [mutated] }, coverTitle.id) === 'skip',
  'mutating the same element object cannot notify the canvas — updateElement must replace it',
)
assert(
  !slideElementsSnapEqual(
    { id: 'slide-1', elements: [coverTitle] },
    { id: 'slide-1', elements: [lockedTitle] },
    coverTitle.id,
  ),
  'locking height is not a content-only skip for the canvas subscription',
)

const slidesSrc = readFileSync(join(root, 'src/store/slides.ts'), 'utf8')
assert(!slidesSrc.includes('Object.assign(el, props)'), 'updateElement must not mutate the live element')
assert(slidesSrc.includes('{ ...el, ...props }'), 'updateElement replaces the element so identity-based sync sees chrome')
const canvasSrc = readFileSync(join(root, 'src/views/Editor/Canvas/index.tsx'), 'utf8')
assert(canvasSrc.includes('slideElementsSnapEqual'), 'canvas subscribes to an elements-array snapshot, not slide identity')
assert(canvasSrc.includes('snapSlideElements'), 'canvas snapshots slide.elements before immer overwrites the live slide')
const textElSrc = readFileSync(join(root, 'src/views/components/element/TextElement/index.tsx'), 'utf8')
assert(textElSrc.includes('data-text-box-mode'), 'live text boxes expose grow/fit/slot mode')
assert(textElSrc.includes('data-fixed-height'), 'live text boxes mark explicit fixed height')

const textPanel = readFileSync(join(root, 'src/views/Editor/Toolbar/ElementStylePanel/TextStylePanel.tsx'), 'utf8')
const shapePanel = readFileSync(join(root, 'src/views/Editor/Toolbar/ElementStylePanel/ShapeStylePanel.tsx'), 'utf8')
assert(textPanel.includes('TextStyleContent'), 'TextStylePanel renders the shared text style content')
assert(shapePanel.includes('TextStyleContent'), 'ShapeStylePanel renders the shared text style content')
const textStyleSrc = readFileSync(join(root, 'src/views/Editor/Toolbar/common/TextStyleContent.tsx'), 'utf8')
assert(textStyleSrc.includes('updateFixedHeight'), 'shared text style content always exposes auto/fixed height')
assert(textStyleSrc.includes('LL.editor.stylePanel.text.fixedHeight()'), 'fixed height control is labeled')
assert(textStyleSrc.includes('data-height-mode="fixed"'), 'fixed-height control is a real labeled button')
assert(textStyleSrc.includes('aria-pressed={fixedHeight}'), 'fixed-height control exposes pressed state')
assert(!shapePanel.includes('PanelAccordion'), 'ShapeStylePanel no longer has a separate MORE accordion for text')
assert(!shapePanel.includes('RichTextBase'), 'ShapeStylePanel does not mount a second rich-text stack')

if (failures.length) {
  console.error('text style panel checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('text style panel checks passed')
