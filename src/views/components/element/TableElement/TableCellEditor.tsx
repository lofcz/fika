import { memo, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { EditorState, TextSelection, type Command } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Slice } from 'prosemirror-model'
import { baseKeymap, toggleMark } from 'prosemirror-commands'
import { history, undo, redo, closeHistory } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import type { TableCell } from '@/types/slides'
import { pasteCustomClipboardString, pasteExcelClipboardString, pasteHTMLTableClipboardString } from '@/utils/clipboard'
import { getTableTextAttrs, parseTableText, serializeTableText, setTableTextAttrs, tableSchema, typesetTableMath } from '@/utils/prosemirror/table'
import { registerTableEditor, type TableEditorSession } from '@/utils/prosemirror/tableEditor'
import { splitBlockKeepStyle } from '@/utils/prosemirror/commands/splitBlockKeepStyle'
import { buildMathElement, ensureMathliveReady } from '@/utils/math'
import emitter, { EmitterEvents, type ApplyInlineMathPayload } from '@/utils/emitter'
import { bindStyles } from '@/utils/cssm'
import styles from './CustomTextarea.module.scss'
const cx = bindStyles(styles)

type Props = {
  cell: TableCell
  elementId: string
  sessions: Map<string, TableEditorSession>
  className?: string
  style?: CSSProperties
  onUpdateValue: (value: string, ignoreHistory?: boolean) => void
  onInsertExcelData: (data: string[][], rich?: boolean) => void
}

// Text undo is owned by the cell. An empty cell history must not undo the deck.
const historyCommand = (command: Command): Command => (state, dispatch, view) => {
  command(state, tr => dispatch?.(tr.setMeta('tableTextHistory', true)), view)
  return true
}
const undoText = historyCommand(undo)
const redoText = historyCommand(redo)

// Native caret movement can precede ProseMirror's selectionchange observer.
// Read it before a toolbar command or boundary navigation, especially with fast keys.
function syncDOMSelection(view: EditorView) {
  const dom = view.dom.ownerDocument.getSelection()
  if (!dom?.anchorNode || !dom.focusNode || !view.dom.contains(dom.anchorNode) || !view.dom.contains(dom.focusNode)) return
  const anchor = view.posAtDOM(dom.anchorNode, dom.anchorOffset)
  const head = view.posAtDOM(dom.focusNode, dom.focusOffset)
  const selection = TextSelection.between(view.state.doc.resolve(anchor), view.state.doc.resolve(head))
  if (!selection.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(selection).setMeta('addToHistory', false))
}

const TableCellEditor = memo((props: Props) => {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const current = useRef(props)
  current.current = props

  useLayoutEffect(() => {
    const initial = current.current
    const doc = parseTableText(initial.cell)
    const cached = initial.sessions.get(initial.cell.id)
    let state = cached?.state.doc.eq(doc) ? cached.state : EditorState.create({
      doc,
      plugins: [keymap({
        'Mod-b': toggleMark(tableSchema.marks.strong),
        'Mod-i': toggleMark(tableSchema.marks.em),
        'Mod-u': toggleMark(tableSchema.marks.underline),
        'Mod-d': toggleMark(tableSchema.marks.strikethrough),
        'Enter': splitBlockKeepStyle,
        'Shift-Enter': (state, dispatch) => {
          dispatch?.(state.tr.replaceSelectionWith(tableSchema.nodes.hard_break.create()).scrollIntoView())
          return true
        },
        'Mod-z': undoText,
        'Mod-y': redoText,
        'Mod-Shift-z': redoText,
      }), keymap(baseKeymap), history()],
    })
    if (!doc.firstChild?.childCount && !cached) {
      state = state.apply(setTableTextAttrs(state, initial.cell.style || {}).setMeta('addToHistory', false))
    }
    const sync = () => {
      const view = viewRef.current
      if (!view) return
      const { cell, sessions, elementId } = current.current
      sessions.set(cell.id, { state: view.state, value: serializeTableText(view.state.doc) })
      emitter.emit(EmitterEvents.TABLE_TEXT_ATTRS, { elementId, attrs: getTableTextAttrs(view.state, cell.style) })
    }
    const view = new EditorView({ mount: host.current! }, {
      state,
      clipboardTextSerializer: slice => slice.content.textBetween(0, slice.content.size, '\n', node =>
        node.type.name === 'math' ? (node.attrs.display ? `\\[${node.attrs.latex}\\]` : `\\(${node.attrs.latex}\\)`)
          : node.type.name === 'hard_break' ? '\n' : '',
      ),
      nodeViews: {
        math(node) {
          const dom = buildMathElement(node.attrs.latex, '', !!node.attrs.display)
          let destroyed = false
          void ensureMathliveReady().then(() => {
            if (!destroyed) dom.replaceChildren(...buildMathElement(node.attrs.latex, '', !!node.attrs.display).childNodes)
          }).catch(() => {})
          return { dom, destroy: () => { destroyed = true } }
        },
      },
      dispatchTransaction(tr) {
        view.updateState(view.state.apply(tr))
        if (tr.docChanged && !view.composing && !tr.getMeta('tableTextHistory')) {
          const math = typesetTableMath(view.state.tr)
          if (math.docChanged) view.updateState(view.state.apply(math))
        }
        sync()
        if (tr.docChanged) current.current.onUpdateValue(serializeTableText(view.state.doc), !!tr.getMeta('tableTextHistory'))
      },
      handleDOMEvents: {
        keydown: () => { if (!view.composing) syncDOMSelection(view); return false },
        beforeinput(view, event) {
          const type = (event as InputEvent).inputType
          if (type !== 'historyUndo' && type !== 'historyRedo') return false
          event.preventDefault()
          return (type === 'historyUndo' ? undoText : redoText)(view.state, view.dispatch, view)
        },
        focus: () => { sync(); return false },
        compositionend: () => {
          queueMicrotask(() => {
            if (viewRef.current !== view) return
            const tr = typesetTableMath(view.state.tr)
            if (tr.docChanged) view.dispatch(tr)
          })
          return false
        },
      },
      handlePaste(_view, event) {
        const clipboard = event.clipboardData
        if (!clipboard) return false
        const text = clipboard.getData('text/plain')
        if (text && typeof pasteCustomClipboardString(text) === 'object') return true
        const html = clipboard.getData('text/html')
        const table = html ? pasteHTMLTableClipboardString(html, true) : null
        const data = table?.length ? table : pasteExcelClipboardString(text)
        if (data?.length && data[0].length) {
          current.current.onInsertExcelData(data, !!table?.length)
          return true
        }
        const doc = parseTableText({ text: html || text, ...(html ? { textFormat: 'html' as const } : {}) })
        view.dispatch(closeHistory(view.state.tr).replaceSelection(Slice.maxOpen(doc.content)).scrollIntoView())
        return true
      },
      handleDoubleClickOn(_view, _pos, node, pos) {
        if (node.type.name !== 'math') return false
        emitter.emit(EmitterEvents.OPEN_INLINE_MATH_EDITOR, {
          elementId: current.current.elementId, cellId: current.current.cell.id,
          pos, latex: node.attrs.latex, display: !!node.attrs.display,
        })
        return true
      },
    })
    viewRef.current = view
    const unregister = registerTableEditor(initial.elementId, {
      cellId: initial.cell.id,
      getAttrs: () => getTableTextAttrs(view.state, current.current.cell.style),
      applyAttrs(attrs) {
        if (view.composing) return null
        syncDOMSelection(view)
        const wholeCell = view.state.selection.empty
        view.updateState(view.state.apply(closeHistory(setTableTextAttrs(view.state, attrs))))
        sync()
        view.focus()
        return { text: serializeTableText(view.state.doc), wholeCell }
      },
      atBoundary(boundary) {
        syncDOMSelection(view)
        return view.state.selection.empty && view.state.selection.from === (boundary === 'start' ? 1 : view.state.doc.content.size - 1)
      },
    })
    const applyMath = (payload: ApplyInlineMathPayload) => {
      if (payload.elementId !== current.current.elementId || payload.cellId !== current.current.cell.id) return
      if (view.state.doc.nodeAt(payload.pos)?.type.name !== 'math') return
      view.dispatch(closeHistory(view.state.tr).setNodeMarkup(payload.pos, undefined, { latex: payload.latex, display: payload.display }))
      view.focus()
    }
    emitter.on(EmitterEvents.APPLY_INLINE_MATH, applyMath)
    sync()
    view.focus()
    return () => {
      sync()
      unregister()
      emitter.off(EmitterEvents.APPLY_INLINE_MATH, applyMath)
      viewRef.current = null
      view.destroy()
    }
  }, [props.cell.id, props.elementId])

  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view) return
    const session = props.sessions.get(props.cell.id)
    if (props.cell.textFormat === 'html' && serializeTableText(view.state.doc) === props.cell.text) return
    const doc = parseTableText(props.cell)
    if (view.state.doc.eq(doc)) return
    // External replacements, including empty cells, invalidate stale text history.
    view.updateState(session?.state.doc.eq(doc) ? session.state : EditorState.create({ doc, plugins: view.state.plugins }))
    props.sessions.set(props.cell.id, { state: view.state, value: serializeTableText(doc) })
  }, [props.cell, props.sessions])

  return <div ref={host} className={cx('custom-textarea', props.className)} style={props.style} />
})
export default TableCellEditor
