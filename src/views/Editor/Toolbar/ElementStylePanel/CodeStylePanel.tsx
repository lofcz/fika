import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './CodeStylePanel.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'
import { useSlidesStore } from '@/store'
import { getHandleElement, useHandleElementShallow } from '../common/handleElement'
import type { PPTCodeElement } from '@/types/slides'
import { CODE_LANGUAGES, CODE_THEMES } from '@/configs/code'
import emitter, { EmitterEvents } from '@/utils/emitter'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useI18nContext } from '@/i18n/useI18nContext'
import Button from '@/components/Button'
import Divider from '@/components/Divider'
import FontSizeControl from '@/components/FontSizeControl'
import Select from '@/components/Select'
import Switch from '@/components/Switch'

const CodeStylePanel = memo(() => {
  const { LL } = useI18nContext()
  const handleCodeElement = useHandleElementShallow(el => {
    if (!el || el.type !== 'code') return null
    return { language: el.language, theme: el.theme, fontSize: el.fontSize, showLineNumbers: el.showLineNumbers }
  })
  const { addHistorySnapshot } = useHistorySnapshot()

  const languageOptions = CODE_LANGUAGES.map(item => ({
    label: item.label,
    value: item.id,
  }))
  const themeOptions = CODE_THEMES.map(item => ({
    label: item.label,
    value: item.id,
  }))

  const updateCode = (props: Partial<PPTCodeElement>) => {
    const handleElement = getHandleElement()
    if (!handleElement) return
    useSlidesStore.getState().updateElement({ id: handleElement.id, props })
    addHistorySnapshot()
  }

  const openCodeEditor = () => {
    const handleElement = getHandleElement()
    if (!handleElement) return
    emitter.emit(EmitterEvents.OPEN_CODE_EDITOR, handleElement.id)
  }

  if (!handleCodeElement) return null

  return (
    <div className={cx('code-style-panel')}>
      <div className={cx('row')}>
        <Button style={{ flex: '1' }} onClick={() => openCodeEditor()}>
          <Icon icon="pencil" /> {LL.canvas.floatingToolbar.editCode()}
        </Button>
      </div>
      <Divider />
      <div className={cx('row')}>
        <div className={cx('label')}>{LL.editor.stylePanel.code.language()}</div>
        <Select
          value={handleCodeElement.language}
          options={languageOptions}
          search
          style={{ width: '60%' }}
          onUpdateValue={value => updateCode({ language: String(value) })}
        />
      </div>
      <div className={cx('row')}>
        <div className={cx('label')}>{LL.editor.stylePanel.code.theme()}</div>
        <Select
          value={handleCodeElement.theme}
          options={themeOptions}
          search
          style={{ width: '60%' }}
          onUpdateValue={value => updateCode({ theme: String(value) })}
        />
      </div>
      <div className={cx('row')}>
        <div className={cx('label')}>{LL.editor.stylePanel.code.fontSize()}</div>
        <FontSizeControl value={handleCodeElement.fontSize} onUpdateValue={value => updateCode({ fontSize: value })} />
      </div>
      <div className={cx('row')}>
        <div className={cx('label')}>{LL.editor.stylePanel.code.lineNumbers()}</div>
        <Switch value={handleCodeElement.showLineNumbers} onUpdateValue={value => updateCode({ showLineNumbers: value })} />
      </div>
    </div>
  )
})

export default CodeStylePanel
