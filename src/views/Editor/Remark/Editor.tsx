import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './Editor.module.scss'
const cx = bindStyles(styles)
import { useRef, useMemo, useCallback, memo, useState, useEffect } from 'react'

import { debounce } from '@/utils/debounce'
import { useMainStore } from '@/store'
import { useClickOutside } from '@/hooks/useClickOutside'
import { useI18nContext } from '@/i18n/useI18nContext'
import type { EditorView } from 'prosemirror-view'
import { initProsemirrorEditor, createDocument } from '@/utils/prosemirror'
import { addMark, autoSelectAll, restoreTextSelection, getTextAttrs, type TextAttrs } from '@/utils/prosemirror/utils'
import { toggleList } from '@/utils/prosemirror/commands/toggleList'
import { resolveFikaPortalTarget, queryFika } from '@/utils/portal'
import tippy, { type Instance } from 'tippy.js'
import ColorPicker from '@/components/ColorPicker/index'
import Popover from '@/components/Popover'
import { toggleMark } from 'prosemirror-commands'

export type IEditorProps = {
  value: string
  onUpdate?: (payload: string) => void
}

const Editor = memo((props: IEditorProps) => {
  const { LL } = useI18nContext()
  const editorViewRef = useRef<EditorView | undefined>(undefined)
  const initTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const initAttemptsRef = useRef(0)
  const menuInstanceRef = useRef<Instance | undefined>(undefined)
  const onUpdateRef = useRef(props.onUpdate)
  onUpdateRef.current = props.onUpdate
  const valueRef = useRef(props.value)
  valueRef.current = props.value

  const [attr, setAttr] = useState<TextAttrs>()

  const hideMenuInstance = useCallback(() => {
    menuInstanceRef.current?.hide()
  }, [])

  const editorRootRef = useRef<HTMLDivElement | null>(null)
  useClickOutside(editorRootRef, hideMenuInstance)

  const handleInput = useMemo(() => debounce(function () {
    const view = editorViewRef.current
    if (!view) return
    onUpdateRef.current?.(view.dom.innerHTML)
  }, 300, { trailing: true }), [])

  const handleFocus = useCallback(() => {
    useMainStore.getState().setDisableHotkeysState(true)
  }, [])

  const handleBlur = useCallback(() => {
    useMainStore.getState().setDisableHotkeysState(false)
  }, [])

  const updateTextContent = useCallback(() => {
    const editorView = editorViewRef.current
    if (!editorView) return
    const { doc, tr } = editorView.state
    editorView.dispatch(tr.replaceRangeWith(0, doc.content.size, createDocument(valueRef.current)))
  }, [])

  const handleMouseup = useCallback(() => {
    const selection = window.getSelection()
    const editorView = editorViewRef.current
    if (
      !selection ||
      !selection.anchorNode ||
      !selection.focusNode ||
      selection.isCollapsed ||
      selection.type === 'Caret' ||
      selection.type === 'None' ||
      !editorView
    ) return

    const range = selection.getRangeAt(0)
    const menuInstance = menuInstanceRef.current
    if (menuInstance) {
      setAttr(getTextAttrs(editorView))
      const { x, y, left, top } = range.getBoundingClientRect()
      menuInstance.setProps({
        getReferenceClientRect: () => ({
          x,
          y,
          left,
          top,
          height: 0,
          width: 0,
          right: left,
          bottom: top,
        } as DOMRect),
      })
      menuInstance.show()
    }
  }, [])

  const execCommand = useCallback((command: string, value?: string) => {
    const editorView = editorViewRef.current
    if (!editorView) return

    if (command === 'color' && value) {
      const mark = editorView.state.schema.marks.forecolor.create({ color: value })
      autoSelectAll(editorView)
      addMark(editorView, mark)
    }
    else if (command === 'backcolor' && value) {
      const mark = editorView.state.schema.marks.backcolor.create({ backcolor: value })
      autoSelectAll(editorView)
      addMark(editorView, mark)
    }
    else if (command === 'bold') {
      restoreTextSelection(editorView)
      toggleMark(editorView.state.schema.marks.strong)(editorView.state, editorView.dispatch)
    }
    else if (command === 'em') {
      restoreTextSelection(editorView)
      toggleMark(editorView.state.schema.marks.em)(editorView.state, editorView.dispatch)
    }
    else if (command === 'underline') {
      restoreTextSelection(editorView)
      toggleMark(editorView.state.schema.marks.underline)(editorView.state, editorView.dispatch)
    }
    else if (command === 'strikethrough') {
      restoreTextSelection(editorView)
      toggleMark(editorView.state.schema.marks.strikethrough)(editorView.state, editorView.dispatch)
    }
    else if (command === 'bulletList') {
      const { bullet_list: bulletList, list_item: listItem } = editorView.state.schema.nodes
      toggleList(bulletList, listItem, '')(editorView.state, editorView.dispatch)
    }
    else if (command === 'orderedList') {
      const { ordered_list: orderedList, list_item: listItem } = editorView.state.schema.nodes
      toggleList(orderedList, listItem, '')(editorView.state, editorView.dispatch)
    }
    else if (command === 'clear') {
      autoSelectAll(editorView)
      const { $from, $to } = editorView.state.selection
      editorView.dispatch(editorView.state.tr.removeMark($from.pos, $to.pos))
    }

    editorView.focus()
    handleInput()
    setAttr(getTextAttrs(editorView))
  }, [handleInput])

  const initEditor = useCallback(() => {
    if (editorViewRef.current) return
    const editorViewEl = queryFika<HTMLElement>('.remark .prosemirror-editor')
    const menuEl = queryFika<HTMLElement>('.remark .menu')
    if (!editorViewEl || !menuEl) {
      if (initAttemptsRef.current < 30) {
        initAttemptsRef.current++
        initTimerRef.current = setTimeout(initEditor, 16)
      }
      return
    }

    try {
      editorViewRef.current = initProsemirrorEditor(editorViewEl, valueRef.current, {
        handleDOMEvents: {
          focus: handleFocus,
          blur: handleBlur,
          mouseup: handleMouseup,
          mousedown: () => {
            window.getSelection()?.removeAllRanges()
            hideMenuInstance()
          },
          keydown: hideMenuInstance,
          input: handleInput,
        },
      }, {
        placeholder: LL.editor.remark.clickToEnterSpeakerNotes(),
      })

      menuInstanceRef.current = tippy(editorViewEl, {
        duration: 0,
        content: menuEl,
        interactive: true,
        trigger: 'manual',
        placement: 'top-start',
        appendTo: () => resolveFikaPortalTarget(menuEl),
        hideOnClick: 'toggle',
        offset: [0, 6],
      })
    }
    catch (error) {
      throw error
    }
  }, [handleFocus, handleBlur, handleMouseup, hideMenuInstance, handleInput, LL])

  useEffect(() => {
    Promise.resolve().then(() => {
      initTimerRef.current = setTimeout(initEditor, 0)
    })
  }, [])

  useEffect(() => {
    Promise.resolve().then(updateTextContent)
  }, [props.value, updateTextContent])

  useEffect(() => () => {
    if (initTimerRef.current) clearTimeout(initTimerRef.current)
    editorViewRef.current?.destroy()
  }, [])

  return (
    <div className={cx('editor')} ref={editorRootRef}>
      <div className={cx('prosemirror-editor')} />
      <div className={cx('menu')}>
        <button className={cx({ active: attr?.bold })} onMouseDown={event => event.preventDefault()} onClick={() => execCommand('bold')}>
          <Icon icon="bold" />
        </button>
        <button className={cx({ active: attr?.em })} onMouseDown={event => event.preventDefault()} onClick={() => execCommand('em')}>
          <Icon icon="italic" />
        </button>
        <button className={cx({ active: attr?.underline })} onMouseDown={event => event.preventDefault()} onClick={() => execCommand('underline')}>
          <Icon icon="underline" />
        </button>
        <button className={cx({ active: attr?.strikethrough })} onMouseDown={event => event.preventDefault()} onClick={() => execCommand('strikethrough')}>
          <Icon icon="strikethrough" />
        </button>
        <Popover
          trigger="click"
          style={{ width: '30%' }}
          content={<ColorPicker modelValue={attr?.color} onUpdateModelValue={value => execCommand('color', value)} />}
        >
          <button><Icon icon="type" /></button>
        </Popover>
        <Popover
          trigger="click"
          style={{ width: '30%' }}
          content={<ColorPicker modelValue={attr?.backcolor} onUpdateModelValue={value => execCommand('backcolor', value)} />}
        >
          <button><Icon icon="highlighter" /></button>
        </Popover>
        <button className={cx({ active: attr?.bulletList })} onMouseDown={event => event.preventDefault()} onClick={() => execCommand('bulletList')}>
          <Icon icon="list" />
        </button>
        <button className={cx({ active: attr?.orderedList })} onMouseDown={event => event.preventDefault()} onClick={() => execCommand('orderedList')}>
          <Icon icon="list-ordered" />
        </button>
        <button onMouseDown={event => event.preventDefault()} onClick={() => execCommand('clear')}>
          <Icon icon="remove-formatting" />
        </button>
      </div>
    </div>
  )
}, (prev, next) => prev.value === next.value)

Editor.displayName = 'RemarkEditor'

export default Editor
