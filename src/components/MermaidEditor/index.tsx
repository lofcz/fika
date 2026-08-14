import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useState, useEffect, type KeyboardEvent } from 'react'

import { renderMermaid } from '@/utils/mermaid'
import message from '@/utils/message'
import { useI18nContext } from '@/i18n/useI18nContext'
import Button from '@/components/Button'
import TextArea from '@/components/TextArea'

export type IMermaidEditorProps = {
  value?: string
  onUpdate?: (payload: string) => void
  onClose?: () => void
}

const MermaidEditor = memo((props: IMermaidEditorProps) => {
  const value = props.value ?? ''
  const { LL } = useI18nContext()
  const [code, setCode] = useState('')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const textAreaRef = useRef<{ focus: () => void } | null>(null)
  const renderVersionRef = useRef(0)
  const LLRef = useRef(LL)
  LLRef.current = LL

  useEffect(() => {
    const version = ++renderVersionRef.current
    if (!code) {
      setSvg('')
      setError('')
      return
    }

    void (async () => {
      try {
        const result = await renderMermaid(code, 'editor')
        if (version !== renderVersionRef.current) return
        setSvg(result)
        setError('')
      }
      catch (err) {
        if (version !== renderVersionRef.current) return
        setSvg('')
        setError(err instanceof Error ? err.message : LLRef.current.components.mermaidEditor.syntaxError())
      }
    })()
  }, [code])

  useEffect(() => {
    setCode(value)
    setTimeout(() => textAreaRef.current?.focus(), 0)
  }, [])

  const update = useCallback(async () => {
    if (!code.trim()) return message.error(LL.components.mermaidEditor.codeEmpty())

    setSaving(true)
    try {
      await renderMermaid(code, 'editor-submit')
      props.onUpdate?.(code)
    }
    catch (err) {
      message.error(err instanceof Error ? err.message : LL.components.mermaidEditor.syntaxError())
    }
    finally {
      setSaving(false)
    }
  }, [code, LL, props.onUpdate])

  const handleKeydown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void update()
    }
  }, [update])

  return (
    <div className={cx('mermaid-editor')}>
      <div className={cx('container')}>
        <div className={cx('input-area')} onKeyDown={handleKeydown}>
          <TextArea
            ref={textAreaRef}
            value={code}
            onUpdateValue={setCode}
            placeholder={LL.components.mermaidEditor.inputPlaceholder()}
          />
        </div>
        <div className={cx('preview')}>
          {!code ? (
            <div className={cx('placeholder')}>{LL.components.mermaidEditor.previewPlaceholder()}</div>
          ) : svg ? (
            <div className={cx('preview-content')} dangerouslySetInnerHTML={{ __html: svg }} />
          ) : error ? (
            <div className={cx('error')}>{error}</div>
          ) : null}
        </div>
      </div>
      <div className={cx('footer')}>
        <Button className={cx('btn')} onClick={() => props.onClose?.()}>{LL.common.cancel()}</Button>
        <Button className={cx('btn')} type="primary" disabled={saving} onClick={() => { void update() }}>{LL.common.ok()}</Button>
      </div>
    </div>
  )
})

export default MermaidEditor
