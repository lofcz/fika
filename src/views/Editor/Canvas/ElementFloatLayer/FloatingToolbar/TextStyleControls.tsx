import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './TextStyleControls.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import tinycolor from 'tinycolor2'
import { useMainStore } from '@/store'
import { FONT_SIZE_PX_OPTIONS, useFonts } from '@/configs/font'
import emitter, { EmitterEvents } from '@/utils/emitter'
import Select from '@/components/Select'
import Popover from '@/components/Popover'
import ColorPicker from '@/components/ColorPicker/index'
import { useI18nContext } from '@/i18n/useI18nContext'

const TextStyleControls = memo(() => {
  const { LL } = useI18nContext()
  const fonts = useFonts()
  const richTextAttrs = useMainStore(s => s.richTextAttrs)

  const emitRichTextCommand = (command: string, value?: string) => {
    emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { action: { command, value } })
  }

  const isPureWhiteColor = (color?: string) => {
    const rgba = tinycolor(color).toRgb()
    return rgba.r === 255 && rgba.g === 255 && rgba.b === 255 && rgba.a === 1
  }

  return (
    <>
      <Select
        className={cx('font-select')}
        value={richTextAttrs.fontname}
        search
        searchLabel={LL.canvas.floatingToolbar.searchFonts()}
        previewFonts
        onUpdateValue={value => emitRichTextCommand('fontname', value as string)}
        options={fonts}
      />
      <Select
        className={cx('fontsize-select')}
        value={richTextAttrs.fontsize}
        search
        searchLabel={LL.canvas.floatingToolbar.searchFontSizes()}
        onUpdateValue={value => emitRichTextCommand('fontsize', value as string)}
        options={FONT_SIZE_PX_OPTIONS}
      />

      <div className={cx('divider')} />

      <Popover
        trigger="click"
        content={<ColorPicker modelValue={richTextAttrs.color} onUpdateModelValue={value => emitRichTextCommand('color', value)} />}
      >
        <button className={cx('toolbar-btn', 'text-color-btn')} onMouseDown={event => { event.preventDefault() }}>
          <Icon icon="type" />
          <span className={cx('text-color-block', { white: isPureWhiteColor(richTextAttrs.color) })}>
            <span className={cx('text-color-block-content')} style={{ backgroundColor: richTextAttrs.color }} />
          </span>
        </button>
      </Popover>
      <button
        className={cx('toolbar-btn', { active: richTextAttrs.bold })}
        onMouseDown={event => { event.preventDefault() }}
        onClick={() => emitRichTextCommand('bold')}
      ><Icon icon="bold" /></button>
      <button
        className={cx('toolbar-btn', { active: richTextAttrs.em })}
        onMouseDown={event => { event.preventDefault() }}
        onClick={() => emitRichTextCommand('em')}
      ><Icon icon="italic" /></button>
      <button
        className={cx('toolbar-btn', { active: richTextAttrs.underline })}
        onMouseDown={event => { event.preventDefault() }}
        onClick={() => emitRichTextCommand('underline')}
      ><Icon icon="underline" /></button>

      <div className={cx('divider')} />

      <button
        className={cx('toolbar-btn', { active: richTextAttrs.align === 'left' })}
        onMouseDown={event => { event.preventDefault() }}
        onClick={() => emitRichTextCommand('align', 'left')}
      ><Icon icon="align-left" /></button>
      <button
        className={cx('toolbar-btn', { active: richTextAttrs.align === 'center' })}
        onMouseDown={event => { event.preventDefault() }}
        onClick={() => emitRichTextCommand('align', 'center')}
      ><Icon icon="align-center" /></button>
      <button
        className={cx('toolbar-btn', { active: richTextAttrs.align === 'right' })}
        onMouseDown={event => { event.preventDefault() }}
        onClick={() => emitRichTextCommand('align', 'right')}
      ><Icon icon="align-right" /></button>
      <button
        className={cx('toolbar-btn', { active: (richTextAttrs.align as string) === 'justify' })}
        onMouseDown={event => { event.preventDefault() }}
        onClick={() => emitRichTextCommand('align', 'justify')}
      ><Icon icon="align-justify" /></button>

      <div className={cx('divider')} />

      <button className={cx('toolbar-btn')} onMouseDown={event => { event.preventDefault() }} onClick={() => emitRichTextCommand('clear')}>
        <Icon icon="remove-formatting" />
      </button>
    </>
  )
})

TextStyleControls.displayName = 'TextStyleControls'

export default TextStyleControls
