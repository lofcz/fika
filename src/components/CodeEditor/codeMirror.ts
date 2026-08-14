/**
 * CodeMirror bootstrap for CodeEditor.
 * Loaded via dynamic import so CodeMirror stays out of the initial embed graph.
 * Highlighting uses the shared Shiki highlighter via `codeToTokens`.
 */
import { EditorView } from 'codemirror'
import { indentWithTab, history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { Compartment, EditorState, RangeSetBuilder, type Extension } from '@codemirror/state'
import {
  Decoration,
  ViewPlugin,
  drawSelection,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { resolveCodeLanguage, resolveCodeTheme } from '@/configs/code'
import { getHighlighter, prepareHighlighter } from '@/utils/codeHighlight'

export { EditorView }

type ShikiHighlighter = Awaited<ReturnType<typeof getHighlighter>>

type ShikiToken = {
  content: string
  offset: number
  color?: string
  bgColor?: string
  fontStyle?: number
}

const lineNumbersCompartment = new Compartment()
const fontSizeCompartment = new Compartment()
const chromeCompartment = new Compartment()
const highlightCompartment = new Compartment()

function shikiLang(language: string) {
  const id = resolveCodeLanguage(language)
  return id === 'plaintext' ? 'text' : id
}

function tokenCss(token: ShikiToken) {
  const parts: string[] = []
  if (token.color) parts.push(`color:${token.color}`)
  if (token.bgColor) parts.push(`background-color:${token.bgColor}`)
  const style = token.fontStyle ?? 0
  if (style > 0) {
    if (style & 1) parts.push('font-style:italic')
    if (style & 2) parts.push('font-weight:bold')
    if (style & 4) parts.push('text-decoration:underline')
  }
  return parts.join(';')
}

function buildTokenDecorations(doc: string, highlighter: ShikiHighlighter, language: string, theme: string) {
  const builder = new RangeSetBuilder<Decoration>()
  if (!doc) return Decoration.none

  try {
    const { tokens } = highlighter.codeToTokens(doc, {
      lang: shikiLang(language),
      theme,
    })

    for (const line of tokens) {
      for (const token of line) {
        const css = tokenCss(token)
        if (!css) continue
        const from = token.offset
        const to = from + token.content.length
        if (to <= from) continue
        builder.add(from, to, Decoration.mark({ attributes: { style: css } }))
      }
    }

    return builder.finish()
  }
  catch (error) {
    console.error('[CodeEditor] highlight failed', error)
    return Decoration.none
  }
}

function shikiHighlightExt(highlighter: ShikiHighlighter, language: string, theme: string): Extension {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildTokenDecorations(view.state.doc.toString(), highlighter, language, theme)
    }

    update(update: ViewUpdate) {
      if (!update.docChanged) return
      this.decorations = buildTokenDecorations(update.state.doc.toString(), highlighter, language, theme)
    }
  }, {
    decorations: plugin => plugin.decorations,
  })
}

function lineNumbersExt(on: boolean): Extension {
  return on ? lineNumbers() : []
}

function fontSizeExt(fontSize: number): Extension {
  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: fontSize + 'px',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      fontFamily: "ui-monospace, 'Cascadia Code', 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
      lineHeight: '1.5',
    },
    '.cm-content': {
      padding: '16px 0',
    },
    '.cm-line': {
      padding: '0 18px 0 12px',
    },
  })
}

function chromeExt(bg: string, fg: string): Extension {
  return EditorView.theme({
    '&': {
      backgroundColor: bg,
      color: fg,
    },
    '.cm-content': {
      caretColor: fg,
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: fg,
    },
    '.cm-gutters': {
      backgroundColor: bg,
      color: fg,
      border: 'none',
      opacity: '0.45',
    },
  })
}

export type CodeMirrorEditor = {
  getDoc: () => string
  setLanguage: (language: string) => Promise<void>
  setTheme: (theme: string) => Promise<void>
  setFontSize: (fontSize: number) => void
  setLineNumbers: (on: boolean) => void
  destroy: () => void
}

export async function createCodeMirrorEditor(options: {
  parent: HTMLElement
  doc: string
  language: string
  theme: string
  fontSize: number
  showLineNumbers: boolean
}): Promise<CodeMirrorEditor> {
  let language = resolveCodeLanguage(options.language)
  let theme = resolveCodeTheme(options.theme)
  let fontSize = options.fontSize
  const highlighter = await getHighlighter()
  const prepared = await prepareHighlighter(language, theme)

  let languageRequest = 0
  let themeRequest = 0

  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.doc,
      extensions: [
        highlightSpecialChars(),
        history(),
        drawSelection(),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        EditorState.tabSize.of(2),
        indentUnit.of('  '),
        highlightCompartment.of(shikiHighlightExt(highlighter, prepared.language, prepared.theme)),
        chromeCompartment.of(chromeExt(prepared.bg, prepared.fg)),
        lineNumbersCompartment.of(lineNumbersExt(options.showLineNumbers)),
        fontSizeCompartment.of(fontSizeExt(fontSize)),
        EditorView.contentAttributes.of({
          spellcheck: 'false',
          autocapitalize: 'off',
          autocomplete: 'off',
        }),
      ],
    }),
  })

  return {
    getDoc: () => view.state.doc.toString(),
    async setLanguage(nextLanguage) {
      const request = ++languageRequest
      const next = resolveCodeLanguage(nextLanguage)
      const prepared = await prepareHighlighter(next, theme)
      if (request !== languageRequest) return
      language = next
      view.dispatch({
        effects: [
          highlightCompartment.reconfigure(shikiHighlightExt(highlighter, prepared.language, prepared.theme)),
          chromeCompartment.reconfigure(chromeExt(prepared.bg, prepared.fg)),
        ],
      })
    },
    async setTheme(nextTheme) {
      const request = ++themeRequest
      const next = resolveCodeTheme(nextTheme)
      const prepared = await prepareHighlighter(language, next)
      if (request !== themeRequest) return
      theme = next
      view.dispatch({
        effects: [
          highlightCompartment.reconfigure(shikiHighlightExt(highlighter, prepared.language, prepared.theme)),
          chromeCompartment.reconfigure(chromeExt(prepared.bg, prepared.fg)),
        ],
      })
    },
    setFontSize(next) {
      fontSize = next
      view.dispatch({
        effects: fontSizeCompartment.reconfigure(fontSizeExt(next)),
      })
    },
    setLineNumbers(on) {
      view.dispatch({
        effects: lineNumbersCompartment.reconfigure(lineNumbersExt(on)),
      })
    },
    destroy() {
      view.destroy()
    },
  }
}
