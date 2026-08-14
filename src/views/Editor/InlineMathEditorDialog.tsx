import { bindStyles } from '@/utils/cssm'
import styles from './InlineMathEditorDialog.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useState, useEffect } from 'react'

import emitter, { EmitterEvents, type OpenInlineMathPayload } from '@/utils/emitter'
import { dockMathVirtualKeyboard, ensureMathliveReady, renderMathToHtml } from '@/utils/math'
import message from '@/utils/message'
import { useI18nContext } from '@/i18n/useI18nContext'
import Modal from '@/components/Modal'
import Button from '@/components/Button'
import MathFieldSkeleton from '@/components/LaTeXEditor/MathFieldSkeleton'

type MathField = HTMLElement & {
  value: string
  getValue: (format?: string) => string
}

const InlineMathEditorDialog = memo(() => {
  const { LL } = useI18nContext()
  const [visible, setVisible] = useState(false)
  const fieldHostRef = useRef<HTMLDivElement | null>(null)
  const [fieldReady, setFieldReady] = useState(false)
  const [editing, setEditing] = useState<OpenInlineMathPayload | null>(null)
  const mathFieldRef = useRef<MathField | null>(null)

  const destroyField = () => {
    const mathField = mathFieldRef.current
    if (mathField && mathField.parentElement) mathField.parentElement.removeChild(mathField)
    mathFieldRef.current = null
  }

  const mountField = useCallback(async (latex: string) => {
    await ensureMathliveReady()
    dockMathVirtualKeyboard()
    let host: HTMLElement | null = null
    for (let i = 0; i < 8; i++) {
      host = fieldHostRef.current
      if (host) break
      await Promise.resolve()
    }
    if (!host) return
    destroyField()
    const field = document.createElement('math-field') as MathField
    field.setAttribute('math-virtual-keyboard-policy', 'sandboxed')
    field.value = latex
    host.appendChild(field)
    mathFieldRef.current = field
    setFieldReady(true)
    requestAnimationFrame(() => field.focus())
  }, [])

  const openEditor = useCallback((payload: OpenInlineMathPayload) => {
    setEditing(payload)
    setVisible(true)
    void mountField(payload.latex)
  }, [mountField])

  const confirm = useCallback(() => {
    const target = editing
    const mathField = mathFieldRef.current
    if (!target || !mathField) return
    const latex = (mathField.getValue ? mathField.getValue('latex') : mathField.value).trim()
    if (!latex) {
      message.error(LL.components.inlineMathEditor.empty())
      return
    }
    emitter.emit(EmitterEvents.APPLY_INLINE_MATH, {
      elementId: target.elementId,
      pos: target.pos,
      latex,
      html: renderMathToHtml(latex, target.display),
      display: target.display,
    })
    setVisible(false)
  }, [editing, LL])

  const handleClosed = useCallback(() => {
    destroyField()
    setEditing(null)
  }, [])

  useEffect(() => {
    if (!visible) destroyField()
  }, [visible])

  useEffect(() => {
    emitter.on(EmitterEvents.OPEN_INLINE_MATH_EDITOR, openEditor)
    return () => {
      emitter.off(EmitterEvents.OPEN_INLINE_MATH_EDITOR, openEditor)
      destroyField()
    }
  }, [openEditor])

  return (
    <Modal visible={visible} onUpdateVisible={setVisible} width={640} onClosed={handleClosed}>
      <div className={cx('inline-math-editor')}>
        <div className={cx('title')}>{LL.components.inlineMathEditor.title()}</div>
        <div className={cx('field')}>
          {!fieldReady ? <MathFieldSkeleton className={cx('field-skel')} /> : null}
          <div className={cx('field-host')} ref={fieldHostRef} />
        </div>
        <div className={cx('footer')}>
          <Button className={cx('btn')} onClick={() => setVisible(false)}>{LL.common.cancel()}</Button>
          <Button className={cx('btn')} type="primary" onClick={() => confirm()}>{LL.common.ok()}</Button>
        </div>
      </div>
    </Modal>
  )
})

export default InlineMathEditorDialog
