import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}
function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

assert(read('src/types/slides.ts').includes("MERMAID = 'mermaid'"), 'MERMAID enum')
assert(read('src/hooks/useExport.ts').includes("el.type === 'mermaid'"), 'export mermaid branch')
assert(read('src/hooks/useExport.ts').includes('renderMermaid'), 'export uses renderMermaid')
assert(read('src/hooks/useCreateElement.ts').includes('createMermaidElement'), 'createMermaidElement')
assert(read('src/hooks/useCreateElement.ts').includes('createLatexElements'), 'createLatexElements')
assert(read('src/views/Editor/CanvasTool/index.tsx').includes('MermaidEditor'), 'CanvasTool MermaidEditor')
assert(read('src/views/Editor/CanvasTool/index.tsx').includes('LaTeXExtractor') || read('src/views/Editor/CanvasTool/index.tsx').includes('LazyLaTeXEditor'), 'CanvasTool LaTeX editor')
assert(read('src/types/slides.ts').includes("CODE = 'code'"), 'CODE enum')
assert(read('src/hooks/useExport.ts').includes("el.type === 'code'"), 'export code branch')
assert(read('src/hooks/useExport.ts').includes('renderCodeElementPng'), 'export uses renderCodeElementPng')
assert(read('src/hooks/useCreateElement.ts').includes('createCodeElement'), 'createCodeElement')
assert(read('src/views/Editor/CanvasTool/index.tsx').includes('LazyCodeEditor'), 'CanvasTool LazyCodeEditor')
assert(read('src/views/Editor/index.tsx').includes('CodeEditorDialog'), 'Editor CodeEditorDialog')
assert(read('src/views/Editor/index.tsx').includes("import('./CodeEditorDialog") || read('src/components/CodeEditor/lazy.ts').includes('lazy('), 'CodeEditorDialog is async')
assert(read('src/components/CodeEditor/lazy.ts').includes('lazy('), 'CodeEditor lazy wrapper')
assert(read('src/views/Editor/index.tsx').includes('SlideCodePanel'), 'Editor SlideCodePanel')
assert(read('src/views/Editor/index.tsx').includes('showCodePanel'), 'SlideCodePanel mounts lazily')
assert(read('src/views/Editor/Remark/index.tsx').includes('onToggleCodePanel') || read('src/views/Editor/Remark/index.tsx').includes('code-panel-btn'), 'Remark opens SlideCodePanel')
assert(!read('src/views/Editor/CanvasTool/index.tsx').includes(':v-tooltip'), 'CanvasTool must use v-tooltip directive, not :v-tooltip bind')
assert(read('src/views/Editor/CanvasTool/index.tsx').includes('data-tooltip='), 'CanvasTool uses tooltip data attributes')
assert(read('src/views/Editor/Thumbnails/Templates.tsx').includes('importTheme'), 'Templates importTheme')
assert(read('src/views/Editor/Thumbnails/index.tsx').includes('ExportThemeDialog'), 'Thumbnails ExportThemeDialog')
assert(read('src/utils/pptxUnit.ts').includes('getPPTXImageCrop'), 'pptxUnit helpers')
assert(read('src/utils/pptxImportPicture.ts').includes('pptxPictureSource'), 'picture-shape import helper')
assert(read('src/hooks/useImport.ts').includes('pptxPictureSource'), 'useImport uses picture-shape helper')
assert(read('src/utils/pptxImportText.ts').includes('wrapHangingIndentParagraphsAsLists'), 'inherited-bullet list helper')
assert(read('src/utils/pptxImportText.ts').includes('isEmptyListParagraph'), 'empty hanging paragraphs are not imported as bullets')
assert(read('src/hooks/useImport.ts').includes('wrapHangingIndentParagraphsAsLists'), 'useImport wraps inherited bullets')
assert(read('src/hooks/useImport.ts').includes('linkifyPlainUrls'), 'useImport linkifies leftover URLs')
assert(read('src/hooks/useImport.ts').includes('styleImportedHyperlinks'), 'useImport styles imported hyperlinks')
assert(read('src/utils/pptxImportMetrics.ts').includes('importedParagraphMetrics'), 'paragraph metrics last-wins helper')
assert(read('src/hooks/useImport.ts').includes('importedParagraphMetrics'), 'useImport uses importedParagraphMetrics')
assert(read('src/hooks/useImport.ts').includes('scalePptxTextInset'), 'useImport scales text insets')
assert(!read('src/hooks/useImport.ts').includes('ratio * fontScale'), 'normAutofit fontScale is not baked into imported run sizes')
assert(read('src/views/components/element/TextElement/index.tsx').includes('textFitPaintStyle'), 'editor paints text-fit for imported inline font sizes')
assert(read('src/views/components/element/TextElement/index.tsx').includes('data-text-fit-host'), 'text-fit zoom is applied on a host wrapping the editor')
assert(read('src/views/components/element/TextElement/index.tsx').includes('textFitHostRef'), 'editor measures the same host it paints')
assert(!read('src/views/components/element/TextElement/index.tsx').includes('showFittedPreview'), 'no overlay swap on click — one authored HTML paint path')
assert(read('src/utils/textFit.ts').includes('fitScaleFromContentHeight'), 'shrink-to-fit scale is innerHeight / laid-out height')
assert(read('src/utils/textFit.ts').includes('measureUnzoomedScrollHeight'), 'fit measures unzoomed DOM height, not a CSS-zoom guess')
assert(read('src/utils/textFit.ts').includes('fitClipPadding'), 'fixed-height fit reserves space for last-line glyph descent')
assert(read('src/assets/styles/prosemirror.scss').includes('overflow-wrap: anywhere'), 'long strings wrap inside the box')
assert(read('src/assets/styles/prosemirror.scss').includes('a:visited'), 'visited hyperlinks use PowerPoint followed color')
assert(read('src/assets/styles/prosemirror.scss').includes('#954F72'), 'followed hyperlink is Office folHlink purple')
assert(read('src/utils/pptxImportText.ts').includes('PPTX_FOLLOWED_HYPERLINK_COLOR'), 'followed hyperlink color constant')
assert(read('src/assets/styles/prosemirror.scss').includes('li + li'), 'list spacing is between items')
assert(read('src/assets/styles/prosemirror.scss').includes("content: '•'"), 'PowerPoint Arial bullet marker')
assert(read('src/assets/styles/prosemirror.scss').includes('list-style-position: outside'), 'hanging indent uses outside markers')
assert(read('src/assets/styles/prosemirror.scss').includes('color: #000'), 'list markers stay black, including on hyperlinks')
assert(/li \{[\s\S]*padding-inline-start: 0\.4em/.test(read('src/assets/styles/prosemirror.scss')), 'marker-to-text gap on list items')
assert(read('src/utils/prosemirror/schema/nodes.ts').includes('paddingInlineStart'), 'list hanging indent survives ProseMirror')
assert(read('src/hooks/useImport.ts').includes('styleSpan.style[styleProp]'), 'list marker size compares run values, not span identity')
assert(read('src/hooks/useImport.ts').includes('PPTX_HYPERLINK_COLOR'), 'import does not paint list markers with hyperlink blue')
assert(read('src/utils/hyperlinkFollow.ts').includes('isFollowHyperlinkClick'), 'ctrl/cmd-click hyperlink helper')
assert(read('src/views/components/element/ProsemirrorEditor.tsx').includes('hyperlink-hover-tooltip'), 'editor link tooltip')
assert(read('src/i18n/en/canvas/index.ts').includes('followLink'), 'follow-link i18n')
assert(!read('src/views/Editor/SlideCodePanel.tsx').includes('@/ai/'), 'SlideCodePanel has no AI imports')
assert(!read('src/views/Editor/SlideCodePanel.tsx').includes('useAIStore'), 'SlideCodePanel has no AI store')

const staticHeavyImport = /(?:^|\n)\s*import\s+[^;]*\s+from\s+['"](?:mermaid|dompurify|codemirror|@codemirror\/)/
assert(!staticHeavyImport.test(read('src/utils/mermaid.ts')), 'mermaid.ts must not statically import mermaid/dompurify')
assert(read('src/utils/mermaid.ts').includes("import('mermaid')"), 'mermaid.ts must dynamically import mermaid')
assert(read('src/utils/mermaid.ts').includes("import('dompurify')"), 'mermaid.ts must dynamically import dompurify')
assert(!staticHeavyImport.test(read('src/views/Editor/SlideCodePanel.tsx')), 'SlideCodePanel must not statically import CodeMirror')
assert(read('src/views/Editor/SlideCodePanel.tsx').includes("import('./slideCodeMirror')"), 'SlideCodePanel must dynamically load slideCodeMirror')
assert(staticHeavyImport.test(read('src/views/Editor/slideCodeMirror.ts')), 'slideCodeMirror owns the static CodeMirror imports')

const staticCodeImport = /(?:^|\n)\s*import\s+[^;]*\s+from\s+['"](?:shiki|codejar|@shikijs\/|@cmshiki\/)/
assert(!staticCodeImport.test(read('src/utils/codeHighlight.ts')), 'codeHighlight must not statically import shiki')
assert(read('src/utils/codeHighlight.ts').includes("import('shiki/core')"), 'codeHighlight must dynamically import shiki/core')
assert(read('src/utils/codeHighlight.ts').includes("import('shiki/engine/javascript')"), 'codeHighlight must dynamically import js engine')
assert(!staticCodeImport.test(read('src/components/CodeEditor/index.tsx')), 'CodeEditor must not statically import shiki/cmshiki')
assert(!staticHeavyImport.test(read('src/components/CodeEditor/index.tsx')), 'CodeEditor must not statically import CodeMirror')
assert(read('src/components/CodeEditor/index.tsx').includes("import('./codeMirror')"), 'CodeEditor must dynamically load codeMirror')
assert(staticHeavyImport.test(read('src/components/CodeEditor/codeMirror.ts')), 'codeMirror owns the static CodeMirror imports')
assert(read('src/components/CodeEditor/codeMirror.ts').includes('codeToTokens'), 'codeMirror highlights with Shiki tokens')
assert(!read('src/components/CodeEditor/codeMirror.ts').includes('@cmshiki'), 'codeMirror must not import @cmshiki/shiki')
assert(!read('src/components/CodeEditor/index.tsx').includes('textarea'), 'CodeEditor must not hand-roll a textarea')
assert(!read('src/components/CodeEditor/codeMirror.ts').includes('codejar'), 'codeMirror must not use codejar')
assert(!staticCodeImport.test(read('src/views/Editor/CanvasTool/index.tsx')), 'CanvasTool must not statically import shiki')
assert(!staticCodeImport.test(read('src/views/components/element/CodeElement/CodeContent.tsx')), 'CodeContent must not statically import shiki')

const chineseUserFacing = /[\u4e00-\u9fff]/
for (const file of [
  'src/components/MermaidEditor/index.tsx',
  'src/components/LaTeXEditor/LaTeXExtractor.tsx',
  'src/components/CodeEditor/index.tsx',
  'src/views/Editor/SlideCodePanel.tsx',
  'src/views/Editor/Thumbnails/ExportThemeDialog.tsx',
]) {
  const content = read(file)
  const withoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  assert(!chineseUserFacing.test(withoutComments), `${file} still has CJK user-facing text`)
}

if (failures.length) {
  console.error('port feature checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('port feature checks passed')
