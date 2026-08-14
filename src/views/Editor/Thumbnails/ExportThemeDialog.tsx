import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './ExportThemeDialog.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo, useState, type CSSProperties } from 'react'

import { saveAs } from 'file-saver'
import type { SlideThemeFile } from '@/types/slides'
import { encrypt } from '@/utils/crypto'
import message from '@/utils/message'
import { useI18nContext } from '@/i18n/useI18nContext'
import Button from '@/components/Button'
import Input from '@/components/Input'
import RadioButton from '@/components/RadioButton'
import RadioGroup from '@/components/RadioGroup'

type FilePickerDone = undefined
type FileExtList = string[]
type AcceptMap = { [type: string]: FileExtList }

type SaveFilePickerWritable = {
  write: (data: Blob) => globalThis.Promise<FilePickerDone>
  close: () => globalThis.Promise<FilePickerDone>
}

type SaveFilePickerHandle = {
  createWritable: () => globalThis.Promise<SaveFilePickerWritable>
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: {
      description: string
      accept: AcceptMap
    }[]
  }) => globalThis.Promise<SaveFilePickerHandle>
}

export type IExportThemeDialogProps = {
  data: SlideThemeFile
  onClose?: () => void
  className?: string
  style?: CSSProperties
}

const ExportThemeDialog = memo((props: IExportThemeDialogProps) => {
  const { LL } = useI18nContext()
  const [format, setFormat] = useState<'fika' | 'json'>('fika')
  const [themeName, setThemeName] = useState(props.data.title || LL.editor.templates.currentTheme())

  const exportTheme = useCallback(async () => {
    const title = themeName.trim()
    if (!title) {
      message.warning(LL.editor.exportTheme.nameRequired())
      return
    }

    const content = JSON.stringify({ ...props.data, title })
    const blob = format === 'fika'
      ? new Blob([encrypt(content)], { type: 'application/octet-stream' })
      : new Blob([content], { type: 'application/json;charset=utf-8' })
    const filename = title.replace(/[\\/:*?"<>|]/g, '_') || LL.editor.templates.currentTheme()
    const suggestedName = `${filename}.${format}`
    const pickerWindow = window as unknown as SaveFilePickerWindow

    if (!pickerWindow.showSaveFilePicker) {
      saveAs(blob, suggestedName)
      props.onClose?.()
      return
    }

    try {
      const handle = await pickerWindow.showSaveFilePicker({
        suggestedName,
        types: [{
          description: format === 'fika'
            ? LL.editor.exportTheme.fikaDescription()
            : LL.editor.exportTheme.jsonDescription(),
          accept: format === 'fika'
            ? { 'application/octet-stream': ['.fika'] }
            : { 'application/json': ['.json'] },
        }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      props.onClose?.()
    }
    catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      message.error(LL.editor.exportTheme.exportFailed())
    }
  }, [themeName, LL, props.data, format, props.onClose])

  return (
    <div className={cx('export-theme-dialog', props.className)} style={props.style}>
      <div className={cx('title')}>{LL.editor.exportTheme.title()}</div>
      <div className={cx('description')}>{LL.editor.exportTheme.description()}</div>

      <div className={cx('name-row')}>
        <div className={cx('label')}>{LL.editor.exportTheme.nameLabel()}</div>
        <Input
          className={cx('name-input')}
          value={themeName}
          onUpdateValue={setThemeName}
          maxlength={100}
          placeholder={LL.editor.exportTheme.namePlaceholder()}
          onEnter={() => exportTheme()}
        />
      </div>

      <RadioGroup className={cx('formats')} value={format} onUpdateValue={value => setFormat(value as 'fika' | 'json')}>
        <RadioButton value="fika">FIKA</RadioButton>
        <RadioButton value="json">JSON</RadioButton>
      </RadioGroup>

      {format === 'fika'
        ? <div className={cx('tip')}>{LL.editor.exportTheme.tipFika()}</div>
        : <div className={cx('tip')}>{LL.editor.exportTheme.tipJson()}</div>}

      <div className={cx('btns')}>
        <Button type="primary" onClick={() => exportTheme()}>
          <Icon icon="download" /> {LL.editor.exportTheme.export()}
        </Button>
        <Button onClick={() => props.onClose?.()}>{LL.common.cancel()}</Button>
      </div>
    </div>
  )
})

export default ExportThemeDialog
