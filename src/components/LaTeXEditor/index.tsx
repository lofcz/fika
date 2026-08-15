import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, useState, useEffect, type CSSProperties } from 'react'

import message from '@/utils/message'
import { dockMathVirtualKeyboard, ensureMathliveReady, measureLatexElement } from '@/utils/math'

import MathFieldSkeleton from './MathFieldSkeleton'
import Button from '../Button'
import { useI18nContext } from '@/i18n/useI18nContext'

type MathField = HTMLElement & {
  value: string
  getValue: (format?: string) => string
  focus: () => void
  insert: (s: string, options?: { focus?: boolean; selectionMode?: string }) => boolean
  mathVirtualKeyboardPolicy: string
}

type VirtualKeyboard = {
  visible: boolean
  show: (o?: { animate: boolean }) => void
  hide: (o?: { animate: boolean }) => void
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

export interface LatexResult {
  latex: string
  path: string
  w: number
  h: number
}

export type ILaTeXEditorProps = {
  value?: string
  onUpdate?: (payload: LatexResult) => void
  onClose?: () => void
}

export default function LaTeXEditor({
  value = '',
  onUpdate,
  onClose,
}: ILaTeXEditorProps) {
  const { LL } = useI18nContext()

  const editing = !!value
  const heading = editing
    ? LL.components.latexEditor.editTitle()
    : LL.components.latexEditor.title()

  const fieldBoxRef = useRef<HTMLDivElement | null>(null)
  const fieldHostRef = useRef<HTMLDivElement | null>(null)
  const mathFieldRef = useRef<MathField | null>(null)
  const pendingSnippetRef = useRef('')
  const [fieldReady, setFieldReady] = useState(false)
  const [empty, setEmpty] = useState(!value)
  const [hasDraft, setHasDraft] = useState(!!value)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [hintStyle, setHintStyle] = useState<CSSProperties>({ left: '44px' })

  const getKeyboard = (): VirtualKeyboard | undefined => {
    return (window as unknown as { mathVirtualKeyboard?: VirtualKeyboard }).mathVirtualKeyboard
  }

  const readLatex = () => {
    const mathField = mathFieldRef.current
    if (!mathField) return ''
    const next = mathField.getValue
      ? mathField.getValue('latex-without-placeholders')
      : mathField.value
    return (next || '').trim()
  }

  const placeHint = useCallback(() => {
    const field = mathFieldRef.current
    const box = fieldBoxRef.current
    if (!field || !box) return

    const boxRect = box.getBoundingClientRect()
    const root = field.shadowRoot
    const content = root?.querySelector('.ML__content') as HTMLElement | null
    const caret = root?.querySelector('.ML__caret, .ML__text-caret, .ML__latex-caret') as HTMLElement | null

    let left = 44
    if (caret) {
      const caretWidth = parseFloat(getComputedStyle(caret, '::after').borderRightWidth) || 2
      const caretRect = caret.getBoundingClientRect()
      const origin = caretRect.height > 0
        ? caretRect.left
        : (content?.getBoundingClientRect().left ?? boxRect.left + 28)
      left = origin - boxRect.left + caretWidth + 14
    }
    else if (content) {
      left = content.getBoundingClientRect().left - boxRect.left + 12
    }

    setHintStyle({ left: `${Math.max(36, Math.round(left))}px` })
  }, [])

  const syncKeyboard = useCallback(() => {
    setKeyboardOpen(!!getKeyboard()?.visible)
  }, [])

  const syncEmpty = useCallback(() => {
    const next = !readLatex()
    setEmpty(next)
    setHasDraft(!next || !!pendingSnippetRef.current)
  }, [])

  const hideKeyboard = useCallback(() => {
    try {
      getKeyboard()?.hide({ animate: false })
    }
    catch {  }
    document.body.style.removeProperty('padding-bottom')
    setKeyboardOpen(false)
  }, [])

  const destroyField = useCallback(() => {
    hideKeyboard()
    const vk = getKeyboard()
    if (vk) vk.removeEventListener('virtual-keyboard-toggle', syncKeyboard)
    const mathField = mathFieldRef.current
    if (mathField) {
      mathField.removeEventListener('input', syncEmpty)
      mathField.removeEventListener('focus', placeHint)
      if (mathField.parentElement) mathField.parentElement.removeChild(mathField)
    }
    mathFieldRef.current = null
  }, [hideKeyboard, syncKeyboard, syncEmpty, placeHint])

  useEffect(() => {
    let cancelled = false

    const mountField = async () => {
      await ensureMathliveReady()
      dockMathVirtualKeyboard()
      await Promise.resolve()
      if (cancelled) return
      const host = fieldHostRef.current
      if (!host) return

      destroyField()
      const field = document.createElement('math-field') as MathField
      field.setAttribute('default-mode', 'math')
      field.mathVirtualKeyboardPolicy = 'manual'
      if (value) field.value = value
      field.addEventListener('input', syncEmpty)
      field.addEventListener('focus', placeHint)
      host.appendChild(field)
      mathFieldRef.current = field
      const queued = pendingSnippetRef.current
      if (queued) {
        field.insert(queued, { focus: true, selectionMode: 'placeholder' })
        pendingSnippetRef.current = ''
      }
      setFieldReady(true)
      syncEmpty()
      getKeyboard()?.addEventListener('virtual-keyboard-toggle', syncKeyboard)
      requestAnimationFrame(() => {
        field.focus()
        requestAnimationFrame(() => placeHint())
      })
    }

    void mountField()
    return () => {
      cancelled = true
      destroyField()
    }
  }, [destroyField, syncEmpty, placeHint, syncKeyboard])

  useEffect(() => {
    if (empty) void Promise.resolve().then(() => placeHint())
  }, [empty, placeHint])

  const focusField = () => {
    mathFieldRef.current?.focus()
  }

  const toggleKeyboard = () => {
    mathFieldRef.current?.focus()
    dockMathVirtualKeyboard()
    const vk = getKeyboard()
    if (!vk) return
    if (vk.visible) {
      vk.hide()
      document.body.style.removeProperty('padding-bottom')
    }
    else vk.show()
    syncKeyboard()
  }

  const insertSnippet = (latex: string) => {
    const mathField = mathFieldRef.current
    if (!mathField) {
      pendingSnippetRef.current = latex
      setEmpty(false)
      setHasDraft(true)
      return
    }
    mathField.focus()
    mathField.insert(latex, { focus: true, selectionMode: 'placeholder' })
    pendingSnippetRef.current = ''
    syncEmpty()
  }

  const update = async () => {
    const latex = readLatex() || pendingSnippetRef.current
    if (!latex) return message.error(LL.components.latexEditor.formulaEmpty())

    let width = 160
    let height = 64
    try {
      const measured = await Promise.race([
        measureLatexElement(latex),
        new Promise<{ width: number; height: number }>(resolve => {
          setTimeout(() => resolve({ width, height }), 280)
        }),
      ])
      width = measured.width
      height = measured.height
    }
    catch { /* fallback box */ }
    onUpdate?.({
      latex,
      path: '',
      w: width,
      h: height,
    })
  }

  return (
    <div className={cx('latex-editor')}>
      <div className={cx('header')}>
        <div className={cx('title')}>{heading}</div>
        <p className={cx('lede')}>{LL.components.latexEditor.description()}</p>
      </div>

      <label className={cx('field-label')}>{LL.components.latexEditor.fieldLabel()}</label>
      <div
        className={cx('field', { ready: fieldReady })}
        ref={fieldBoxRef}
        onClick={() => focusField()}
      >
        {!fieldReady ? <MathFieldSkeleton className={cx('field-skel')} /> : null}
        <div className={cx('field-host')} ref={fieldHostRef} />
        {fieldReady && empty ? (
          <div className={cx('field-hint')} style={hintStyle}>
            {LL.components.latexEditor.hint()}
          </div>
        ) : null}
        {fieldReady ? (
          <button
            type="button"
            className={cx('kb-toggle', { active: keyboardOpen })}
            title={LL.components.latexEditor.keyboardTooltip()}
            aria-label={LL.components.latexEditor.keyboardTooltip()}
            aria-pressed={keyboardOpen}
            onClick={event => { event.stopPropagation(); toggleKeyboard() }}
          >
            <svg className={cx('kb-icon')} viewBox="0 0 24 24" aria-hidden="true">
              <rect x="2.75" y="6.75" width="18.5" height="11.5" rx="2.25" />
              <path d="M6.25 10.25h1.5M10.25 10.25h1.5M14.25 10.25h1.5M17.25 10.25h1.5" />
              <path d="M6.25 13h1.5M10.25 13h3.5M17.25 13h1.5" />
              <path d="M8.5 15.75h7" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className={cx('tips-block')}>
        <div className={cx('tips-label')}>{LL.components.latexEditor.tipsLabel()}</div>
        <div className={cx('tips')}>
          <button type="button" className={cx('tip')} data-latex-tip="frac" onClick={() => insertSnippet('\\frac{#?}{#?}')}>
            <kbd>frac</kbd>
            {' '}
            {LL.components.latexEditor.tipFraction()}
          </button>
          <button type="button" className={cx('tip')} data-latex-tip="power" onClick={() => insertSnippet('^{#?}')}>
            <kbd>^</kbd>
            {' '}
            {LL.components.latexEditor.tipPower()}
          </button>
          <button type="button" className={cx('tip')} data-latex-tip="sqrt" onClick={() => insertSnippet('\\sqrt{#?}')}>
            <kbd>sqrt</kbd>
            {' '}
            {LL.components.latexEditor.tipRoot()}
          </button>
        </div>
      </div>

      <div className={cx('footer')}>
        <Button className={cx('btn')} onClick={() => onClose?.()}>{LL.common.cancel()}</Button>
        <Button className={cx('btn')} type="primary" data-editor-insert="latex" disabled={!hasDraft} onClick={() => { void update() }}>
          {editing ? LL.common.save() : LL.components.latexEditor.insert()}
        </Button>
      </div>
    </div>
  )
}
