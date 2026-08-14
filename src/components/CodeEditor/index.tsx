import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, useMemo, memo, useState, useEffect } from 'react'

import { CODE_LANGUAGES, CODE_THEMES, DEFAULT_CODE_FONT_SIZE, DEFAULT_CODE_LANGUAGE, DEFAULT_CODE_SAMPLE, DEFAULT_CODE_THEME, type CodeEditorPayload, resolveCodeLanguage, resolveCodeTheme } from '@/configs/code'
import message from '@/utils/message'
import { useI18nContext } from '@/i18n/useI18nContext'
import Button from '@/components/Button'
import CodeEditorSkeleton from './CodeEditorSkeleton'
import FontSizeControl from '@/components/FontSizeControl'
import Select from '@/components/Select'
import Switch from '@/components/Switch'

type CodeMirrorModule = typeof import('./codeMirror')
type CodeMirrorEditor = Awaited<ReturnType<CodeMirrorModule['createCodeMirrorEditor']>>

export type ICodeEditorProps = {
  code?: string
  language?: string
  theme?: string
  fontSize?: number
  showLineNumbers?: boolean
  className?: string
} & {
  onUpdate?: (payload: CodeEditorPayload) => void
  onClose?: () => void
}

const CodeEditor = memo((vrProps: ICodeEditorProps) => {
  const props = useMemo<Readonly<{
    code?: string
    language?: string
    theme?: string
    fontSize?: number
    showLineNumbers?: boolean
  }>>(() => ({
    ...vrProps,
    code: vrProps.code ?? DEFAULT_CODE_SAMPLE,
    language: vrProps.language ?? DEFAULT_CODE_LANGUAGE,
    theme: vrProps.theme ?? DEFAULT_CODE_THEME,
    fontSize: vrProps.fontSize ?? DEFAULT_CODE_FONT_SIZE,
    showLineNumbers: vrProps.showLineNumbers ?? true,
  }), [vrProps.code, vrProps.language, vrProps.theme, vrProps.fontSize, vrProps.showLineNumbers])

  const { LL } = useI18nContext()

  const [language, setLanguage] = useState(resolveCodeLanguage(props.language))
  const [theme, setTheme] = useState(resolveCodeTheme(props.theme))
  const [fontSize, setFontSize] = useState(props.fontSize)
  const [showLineNumbers, setShowLineNumbers] = useState(props.showLineNumbers)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const editorHostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<CodeMirrorEditor | null>(null)
  const languageRef = useRef(language)
  const themeRef = useRef(theme)
  const onUpdateRef = useRef(vrProps.onUpdate)
  const onCloseRef = useRef(vrProps.onClose)
  onUpdateRef.current = vrProps.onUpdate
  onCloseRef.current = vrProps.onClose

  const languageOptions = CODE_LANGUAGES.map(item => ({ label: item.label, value: item.id }))
  const themeOptions = CODE_THEMES.map(item => ({ label: item.label, value: item.id }))

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const host = editorHostRef.current
        if (!host) return
        const { createCodeMirrorEditor } = await import('./codeMirror')
        if (cancelled) return
        editorRef.current = await createCodeMirrorEditor({
          parent: host,
          doc: props.code,
          language,
          theme,
          fontSize,
          showLineNumbers,
        })
      }
      catch (error) {
        if (cancelled) return
        console.error('[CodeEditor]', error)
        setLoadError(LL.components.codeEditor.renderFailed())
      }
      finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
      editorRef.current?.destroy()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    const previous = languageRef.current
    if (previous === language) return
    languageRef.current = language
    void (async () => {
      if (!editorRef.current) return
      try {
        await editorRef.current.setLanguage(language)
      }
      catch {
        languageRef.current = previous
        setLanguage(previous)
      }
    })()
  }, [language])

  useEffect(() => {
    const previous = themeRef.current
    if (previous === theme) return
    themeRef.current = theme
    void (async () => {
      if (!editorRef.current) return
      try {
        await editorRef.current.setTheme(theme)
      }
      catch {
        themeRef.current = previous
        setTheme(previous)
      }
    })()
  }, [theme])

  useEffect(() => {
    editorRef.current?.setFontSize(fontSize)
  }, [fontSize])

  useEffect(() => {
    editorRef.current?.setLineNumbers(showLineNumbers)
  }, [showLineNumbers])

  const submit = useCallback(() => {
    const code = editorRef.current?.getDoc() ?? ''
    if (!code.trim()) {
      message.error(LL.components.codeEditor.codeEmpty())
      return
    }
    onUpdateRef.current?.({
      code,
      language,
      theme,
      fontSize,
      showLineNumbers,
    })
  }, [LL.components.codeEditor, language, theme, fontSize, showLineNumbers])

  return (
    <div className={cx('code-editor-host', vrProps.className)}>
      {!ready ? <CodeEditorSkeleton className={cx('boot-skeleton')} /> : null}
      <div className={cx('code-editor', { pending: !ready })} inert={!ready}>
        <div className={cx('toolbar')}>
          <div className={cx('field')}>
            <span className={cx('label')}>{LL.components.codeEditor.language()}</span>
            <Select
              value={language}
              options={languageOptions}
              search
              onUpdateValue={value => setLanguage(resolveCodeLanguage(String(value)))}
            />
          </div>
          <div className={cx('field')}>
            <span className={cx('label')}>{LL.components.codeEditor.theme()}</span>
            <Select
              value={theme}
              options={themeOptions}
              search
              onUpdateValue={value => setTheme(resolveCodeTheme(String(value)))}
            />
          </div>
          <div className={cx('field', 'size')}>
            <span className={cx('label')}>{LL.components.codeEditor.fontSize()}</span>
            <FontSizeControl value={fontSize} onUpdateValue={value => setFontSize(value)} />
          </div>
          <label className={cx('line-numbers')}>
            <Switch value={showLineNumbers} onUpdateValue={value => setShowLineNumbers(value)} />
            <span>{LL.components.codeEditor.lineNumbers()}</span>
          </label>
        </div>

        <div className={cx('editor-wrap')}>
          <div ref={editorHostRef} className={cx('editor-host')} />
          {loadError ? <div className={cx('load-error')}>{loadError}</div> : null}
        </div>

        <div className={cx('footer')}>
          <Button className={cx('btn')} onClick={() => onCloseRef.current?.()}>{LL.common.cancel()}</Button>
          <Button className={cx('btn')} type="primary" onClick={() => submit()}>{LL.common.ok()}</Button>
        </div>
      </div>
    </div>
  )
})

export default CodeEditor
