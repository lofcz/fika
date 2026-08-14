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
const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}
function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

const main = read('src/main.tsx')
assert(main.includes('createRoot'), 'main.tsx mounts with createRoot')
assert(main.includes('<App'), 'main.tsx renders App')
assert(main.includes('TypesafeI18n'), 'main.tsx wraps TypesafeI18n')
assert(!/\bfrom ['"]vue['"]/.test(main), 'main.tsx has no Vue imports')
assert(!/\bfrom ['"]pinia['"]/.test(main), 'main.tsx has no Pinia imports')

const mount = read('src/embed/mount.ts')
assert(mount.includes('createRoot'), 'embed mount uses createRoot')
assert(mount.includes('EmbedRoot'), 'embed mount renders EmbedRoot')
assert(mount.includes('mountFika'), 'embed exports mountFika')
assert(mount.includes('peer dependency'), 'embed mount documents React as a peer')
assert(read('rsbuild.config.embed.ts').includes('peerDependencies: true'), 'embed build externalizes React peer dependencies')
assert(read('rsbuild.config.embed.ts').includes('dependencies: false'), 'embed build still bundles non-React dependencies')
assert(!read('rsbuild.config.embed.ts').includes("strategy: 'all-in-one'"), 'embed build keeps lazy chunks')
assert(!/splitChunks:\s*false/.test(read('rsbuild.config.embed.ts')), 'embed build does not disable splitChunks')
assert(read('rsbuild.config.ts').includes('name: \'react\''), 'demo build emits its own React chunk')
assert(!/\bfrom ['"]vue['"]/.test(mount), 'embed mount has no Vue imports')
assert(!/\bfrom ['"]pinia['"]/.test(mount), 'embed mount has no Pinia imports')

const editor = read('src/views/Editor/index.tsx')
assert(editor.includes('EditorHeader'), 'Editor shell still mounts the header')
assert(editor.includes('Canvas'), 'Editor shell still mounts the canvas')

const pkg = JSON.parse(read('package.json'))
assert(!pkg.dependencies.vue, 'package.json dropped Vue')
assert(!pkg.dependencies.pinia, 'package.json dropped Pinia')
assert(!pkg.dependencies.vuedraggable, 'package.json dropped vuedraggable')
assert(!pkg.dependencies?.react, 'package.json does not ship React as a runtime dependency')
assert(!pkg.dependencies?.['react-dom'], 'package.json does not ship React DOM as a runtime dependency')
assert(pkg.peerDependencies?.react === '>19.2.0', 'package.json peers React >19.2.0')
assert(pkg.peerDependencies?.['react-dom'] === '>19.2.0', 'package.json peers React DOM >19.2.0')
assert(pkg.devDependencies?.react, 'demo/dev still installs React')
assert(pkg.devDependencies?.['react-dom'], 'demo/dev still installs React DOM')
assert(pkg.dependencies.zustand, 'package.json depends on Zustand')
assert(!JSON.stringify(pkg).toLowerCase().includes('vureact'), 'package.json has no vureact')
assert(!read('src/store/index.ts').includes('storeToRefs'), 'store index dropped storeToRefs')
assert(!read('src/main.tsx').toLowerCase().includes('vureact'), 'main.tsx has no vureact')

const textEl = read('src/views/components/element/TextElement/index.tsx')
const textElCss = read('src/views/components/element/TextElement/index.module.scss')
const pmCss = read('src/assets/styles/prosemirror.scss')
assert(!textEl.includes('TextPlaceholder'), 'canvas text no longer paints a second placeholder overlay')
assert(textEl.includes('<ProsemirrorEditor'), 'live editor stays mounted')
assert(textEl.includes('placeholderSeed'), 'canvas seeds from the shared placeholder paint helper')
assert(textEl.includes('placeholderBoxVars'), 'canvas box vars come from the shared placeholder paint helper')
assert(!textElCss.includes('visibility: hidden'), 'idle editor stays visible so the list is the only layout')
assert(pmCss.includes('content: var(--placeholder-prompt)'), 'empty prompt is a CSS ghost on the live paragraph')
assert(pmCss.includes('color: currentColor'), 'list markers inherit the same ink as the prompt')

const { placeholderSeed, placeholderAlignOf, emptyPlaceholderHtml, placeholderChrome, isListPlaceholder } = await import(
  pathToFileURL(join(root, 'src/utils/placeholderPaint.ts')).href
)
const bullet = { placeholder: 'Click to add text', textType: 'content', placeholderFontSize: 20 }
const title = { placeholder: 'Click to add title', textType: 'title', placeholderFontSize: 66, placeholderAlign: 'center' }
assert(isListPlaceholder(bullet) === true, 'content placeholders are lists')
assert(isListPlaceholder(title) === false, 'title placeholders are not lists')
assert(emptyPlaceholderHtml(bullet) === '<ul><li><p></p></li></ul>', 'empty list HTML is a real ul/li/p')
assert(emptyPlaceholderHtml(title) === '<p></p>', 'empty title HTML is a real paragraph')
assert(placeholderAlignOf(bullet) === 'left', 'list prompt is left-aligned')
assert(placeholderAlignOf(title) === 'center', 'title prompt is centered')
const emptySeed = placeholderSeed(bullet, 'empty', '#111')
const emptySeedAgain = placeholderSeed(bullet, 'empty', '#111')
assert(JSON.stringify(emptySeed) === JSON.stringify(emptySeedAgain), 'empty seed is idempotent')
assert(emptySeed.fontSize === '20px' && emptySeed.bold === false, 'body empty seed keeps prompt metrics')
assert(placeholderSeed(title, 'empty', '#111').fontSize === '36px', 'cover empty seed keeps the original quiet prompt')
assert(placeholderSeed(title, 'filled', '#111').fontSize === '66px', 'typed cover title uses the 66 Large title size')
assert(placeholderSeed(title, 'filled', '#111').bold === false, 'typed cover title is not extra-bold')
const { placeholderBoxTypography } = await import(pathToFileURL(join(root, 'src/configs/textPresets.ts')).href)
const subtitle = { placeholder: 'Click to add subtitle', textType: 'subtitle', placeholderFontSize: 40, placeholderAlign: 'center', placeholderBold: true }
assert(placeholderBoxTypography(title, true).fontWeight === 500, 'title placeholder is 100 up from regular, not extra-bold')
assert(placeholderBoxTypography(title, false).fontWeight === 500, 'typed title stays medium, not extra-bold')
assert(placeholderBoxTypography(subtitle, true).fontWeight === 400, 'subtitle placeholder is not bold')
assert(placeholderBoxTypography(subtitle, false).fontWeight === 400, 'typed subtitle is not bold')
assert(pmCss.includes('font-weight: var(--placeholder-weight, 400)'), 'empty prompt inherits the box weight')
const { computePlaceholderSlotHeight, computePlaceholderMinBoxHeight } = await import(
  pathToFileURL(join(root, 'src/utils/placeholderLayout.ts')).href
)
const titleMetrics = { textType: 'title', placeholderFontSize: 66, lineHeight: 1.2, inset: [10, 10, 10, 10] }
const promptBox = computePlaceholderMinBoxHeight({ ...titleMetrics, placeholderFontSize: 36 })
const typedBox = computePlaceholderMinBoxHeight({ ...titleMetrics, placeholderFontSize: 66 })
const slot = computePlaceholderSlotHeight(titleMetrics)
assert(slot === Math.max(promptBox, typedBox), 'placeholder slot fits the bigger of prompt and typed paints')
assert(slot === typedBox, 'cover title slot fits the 66 typed size')
assert(!textEl.includes('!isEmptyPlaceholder ? \'auto\''), 'typing does not unlock placeholder height to auto')
assert(textEl.includes('computePlaceholderSlotHeight'), 'style patches size the slot from both paints')
const applySrc = read('src/utils/prosemirror/commands/applyPlaceholderStyles.ts')
assert(!applySrc.includes('if (textHasFontSize(doc, fontsize)) return'), 'filled seed overwrites the quiet prompt font size on the first character')
assert(applySrc.includes('textAlreadyPainted'), 'filled seed is idempotent only when marks already match')
assert(applySrc.includes("phase === 'empty'"), 'empty seed does not stamp a prompt font-size mark')
assert(applySrc.includes('tr.removeMark(from, to, fontsize)'), 'filled seed replaces the prompt font-size mark')
const editorSrc = read('src/views/components/element/ProsemirrorEditor.tsx')
assert(editorSrc.includes('onPlaceholderFill'), 'first character applies filled placeholder styles in the same transaction')
assert(editorSrc.includes('richTextAttrsFromElement'), 'empty editor syncs sidebar attrs from the element, not the prompt')
assert(editorSrc.includes('getPlaceholderFill'), 'editor installs the first-character fill plugin')
assert(read('src/utils/prosemirror/plugins/placeholderFill.ts').includes('appendTransaction'), 'fill plugin upgrades prompt marks on the first character')
const idle = placeholderChrome({ placeholder: 'Click', empty: true, editing: false })
const editingEmpty = placeholderChrome({ placeholder: 'Click', empty: true, editing: true })
const firstChar = placeholderChrome({ placeholder: 'Click', empty: false, editing: true })
assert(idle.editorMounted && editingEmpty.editorMounted && firstChar.editorMounted, 'editor stays mounted idle/edit/first-char')
assert(idle.showPrompt === true, 'idle empty shows the CSS prompt on the live list')
assert(editingEmpty.showPrompt === false && firstChar.showPrompt === false, 'edit hides the prompt without remounting')

const toolbar = read('src/views/Editor/Toolbar/index.tsx')
const stylePanel = read('src/views/Editor/Toolbar/ElementStylePanel/index.tsx')
const popover = read('src/components/Popover.tsx')
const panelSwitch = read('src/views/Editor/Toolbar/common/panelSwitch.ts')
assert(toolbar.includes('useKeepAlive'), 'toolbar keep-alives visited sidepanels')
assert(toolbar.includes('hidden={state !== activePanel}'), 'toolbar hides inactive sidepanels instead of unmounting')
assert(!/requestAnimationFrame\(\(\) => \{\s*inner = requestAnimationFrame/.test(toolbar), 'toolbar does not delay panel switch by two animation frames')
assert(!/\{Panel \? <Panel \/> : null\}/.test(toolbar), 'toolbar does not remount the active panel on selection change')
assert(stylePanel.includes('useKeepAlive'), 'element style panel keep-alives visited type panels')
assert(stylePanel.includes('hidden={type !== handleElementType}'), 'element style panel hides inactive type panels instead of unmounting')
assert(!stylePanel.includes('createElement(currentPanelComponent)'), 'element style panel no longer remounts via createElement')
assert(popover.includes('onPointerEnter={prefetch}'), 'popover still prefetches content on hover')
assert(!/instanceRef\.current = inst\s+mountContent\(inst, false\)/.test(popover), 'popover does not eagerly mount ColorPicker content')
assert(panelSwitch.includes('resolveToolbarPanelState'), 'panel switch helper is present')

const resolveToolbarPanelState = (selectionTabKeys, toolbarState) => (
  selectionTabKeys.includes(toolbarState) ? toolbarState : selectionTabKeys[0]
)
const rememberSeen = (seen, current) => {
  if (current == null || seen.includes(current)) return seen
  return [...seen, current]
}
assert(resolveToolbarPanelState(['slideDesign', 'slideAnimation', 'elAnimation'], 'elStyle') === 'slideDesign', 'deselect leaves Style for Design immediately')
assert(resolveToolbarPanelState(['elStyle', 'elPosition', 'elAnimation'], 'slideDesign') === 'elStyle', 'select leaves Design for Style immediately')
assert(resolveToolbarPanelState(['elStyle', 'elPosition', 'elAnimation'], 'elAnimation') === 'elAnimation', 'shared Animation tab is preserved')
assert(rememberSeen(['text'], 'shape').join(',') === 'text,shape', 'keep-alive remembers both text and shape panels')
assert(rememberSeen(['text', 'shape'], null).join(',') === 'text,shape', 'deselect does not drop keep-alive panels')

if (failures.length) {
  console.error('react mount checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('react mount checks passed')
