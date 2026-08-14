import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './RichTextBase.module.scss'
const cx = bindStyles(styles)
import { type ReactNode, memo, useState, useEffect, useRef, useCallback } from 'react'

import api from '@/services'
import { useShallow } from 'zustand/react/shallow'
import { useMainStore, selectHandleElement } from '@/store'
import emitter, { EmitterEvents } from '@/utils/emitter'
import { useFonts, fontSizeToPx, parseFontSize } from '@/configs/font'
import { EXTRAS_ENABLED } from '@/configs/featureFlags'
import message from '@/utils/message'
import { htmlToText } from '@/utils/common'
import ColorSwatches, { HIGHLIGHT_SWATCHES } from '@/components/ColorSwatches'
import FontSizeControl from '@/components/FontSizeControl'
import FormatChip from '@/components/FormatChip'
import Input from '@/components/Input'
import Button from '@/components/Button'
import Select from '@/components/Select'
import Popover from '@/components/Popover'
import PopoverMenuItem from '@/components/PopoverMenuItem'
import PanelSection from './PanelSection'
import { useI18nContext } from '@/i18n/useI18nContext'

export type IRichTextBaseProps = {
  showColor?: boolean
  presets?: ReactNode
  color?: ReactNode
  paragraphAction?: ReactNode
  paragraphExtra?: ReactNode
}

const AI_WRITING_COMMANDS = {
  polish: 'polish',
  expand: 'expand',
  condense: 'condense',
} as const

const BULLET_LIST_STYLE_TYPES = ['disc', 'circle', 'square']
const ORDERED_LIST_STYLE_TYPES = ['decimal', 'lower-roman', 'upper-roman', 'lower-alpha', 'upper-alpha', 'lower-greek']

const RichTextBase = memo((props: IRichTextBaseProps) => {
  const { showColor = true } = props
  const { LL } = useI18nContext()
  const fonts = useFonts()

  const handleElementId = useMainStore(s => s.handleElementId)
  const richTextAttrs = useMainStore(useShallow(s => s.richTextAttrs))
  const textFormatPainter = useMainStore(s => s.textFormatPainter)

  const toggleTextFormatPainter = useCallback((keep = false) => {
    const { textFormatPainter: painter, richTextAttrs: attrs, setTextFormatPainter } = useMainStore.getState()
    if (painter) setTextFormatPainter(null)
    else {
      setTextFormatPainter({
        keep,
        bold: attrs.bold,
        em: attrs.em,
        underline: attrs.underline,
        strikethrough: attrs.strikethrough,
        color: attrs.color,
        backcolor: attrs.backcolor,
        fontname: attrs.fontname,
        fontsize: attrs.fontsize,
        align: attrs.align,
      })
    }
  }, [])

  const emitRichTextCommand = useCallback((command: string, value?: string) => {
    emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, {
      action: { command, value },
    })
  }, [])

  const [bulletListPanelVisible, setBulletListPanelVisible] = useState(false)
  const [orderedListPanelVisible, setOrderedListPanelVisible] = useState(false)
  const [highlightVisible, setHighlightVisible] = useState(false)
  const [moreVisible, setMoreVisible] = useState(false)
  const bulletListStyleTypeOption = BULLET_LIST_STYLE_TYPES
  const orderedListStyleTypeOption = ORDERED_LIST_STYLE_TYPES
  const [link, setLink] = useState('')
  const [linkPopoverVisible, setLinkPopoverVisible] = useState(false)
  const [AIPopoverVisible, setAIPopoverVisible] = useState(false)
  const [isAIWriting, setIsAIWriting] = useState(false)
  const isAIWritingRef = useRef(false)

  const setWriting = (value: boolean) => {
    isAIWritingRef.current = value
    setIsAIWriting(value)
  }

  useEffect(() => {
    setLinkPopoverVisible(false)
  }, [richTextAttrs])

  useEffect(() => {
    if (isAIWritingRef.current) setWriting(false)
  }, [handleElementId])

  const openLinkPopover = () => {
    setLink(richTextAttrs.link)
  }

  const updateLink = (next?: string) => {
    const linkRegExp = /^(https?):\/\/[\w\-]+(\.[\w\-]+)+([\w\-.,@?^=%&:\/~+#]*[\w\-@?^=%&\/~+#])?$/
    if (!next || !linkRegExp.test(next)) return message.error(LL.editor.richText.invalidLink())
    emitRichTextCommand('link', next)
    setLinkPopoverVisible(false)
  }

  const removeLink = () => {
    emitRichTextCommand('link')
    setLinkPopoverVisible(false)
  }

  const execAI = async (command: string) => {
    setAIPopoverVisible(false)
    const el = selectHandleElement(useMainStore.getState())
    if (!el) return

    let content = ''
    if (el.type === 'text' && el.content) content = el.content
    if (el.type === 'shape' && el.text && el.text.content) content = el.text.content
    if (!content) return message.error(LL.editor.richText.noTextContent())

    let resultText = ''
    const stream = await api.AI_Writing({
      content: htmlToText(content),
      command,
    })
    if (typeof stream === 'object' && stream.state === -1) {
      return message.error(LL.editor.richText.aiConcurrencyError())
    }

    setWriting(true)
    const reader: ReadableStreamDefaultReader = stream.body.getReader()
    const decoder = new TextDecoder('utf-8')
    const readStream = () => {
      reader.read().then(({ done, value }) => {
        if (!isAIWritingRef.current) return
        if (done) {
          setWriting(false)
          return
        }
        const chunk = decoder.decode(value, { stream: true })
        resultText += chunk
        emitRichTextCommand('replace', resultText)
        readStream()
      })
    }
    readStream()
  }

  return (
    <>
      {props.presets ? <PanelSection label={LL.editor.panel.style()}>{props.presets}</PanelSection> : null}

      <PanelSection label={LL.editor.panel.type()}>
        <div className={cx('type-row')}>
          <Select
            className={cx('quiet-select font-select')}
            value={richTextAttrs.fontname}
            search
            searchLabel={LL.editor.multiStyle.searchFont()}
            autofocus
            previewFonts
            onUpdateValue={value => emitRichTextCommand('fontname', value as string)}
            options={fonts}
          />
          <FontSizeControl
            value={parseFontSize(richTextAttrs.fontsize)}
            onUpdateValue={value => emitRichTextCommand('fontsize', fontSizeToPx(value))}
          />
        </div>
        <div className={cx('chip-track')}>
          <FormatChip active={richTextAttrs.bold} data-tooltip={LL.editor.richText.bold()} onClick={() => emitRichTextCommand('bold')}>
            <Icon icon="bold" />
          </FormatChip>
          <FormatChip active={richTextAttrs.em} data-tooltip={LL.editor.richText.italic()} onClick={() => emitRichTextCommand('em')}>
            <Icon icon="italic" />
          </FormatChip>
          <FormatChip active={richTextAttrs.underline} data-tooltip={LL.editor.richText.underline()} onClick={() => emitRichTextCommand('underline')}>
            <Icon icon="underline" />
          </FormatChip>
          <FormatChip active={richTextAttrs.strikethrough} data-tooltip={LL.editor.richText.strikethrough()} onClick={() => emitRichTextCommand('strikethrough')}>
            <Icon icon="strikethrough" />
          </FormatChip>
          <Popover
            trigger="click"
            value={highlightVisible}
            onUpdateValue={(value: boolean) => setHighlightVisible(value)}
            content={(
              <div className={cx('swatch-pop')}>
                <ColorSwatches
                  modelValue={richTextAttrs.backcolor}
                  includeTheme={false}
                  includeNeutrals={false}
                  extraColors={HIGHLIGHT_SWATCHES}
                  allowNone
                  noneValue=""
                  noneTitle={LL.editor.panel.none()}
                  customTitle={LL.editor.multiStyle.textHighlight()}
                  onUpdateModelValue={value => emitRichTextCommand('backcolor', value)}
                />
              </div>
            )}
          >
            <FormatChip active={!!richTextAttrs.backcolor} data-tooltip={LL.editor.panel.highlight()}>
              <Icon icon="highlighter" />
            </FormatChip>
          </Popover>
          <Popover
            trigger="click"
            placement="bottom-end"
            value={moreVisible}
            onUpdateValue={(value: boolean) => setMoreVisible(value)}
            content={(
              <div className={cx('more-menu')}>
                <div className={cx('chip-track')}>
                  <FormatChip active={richTextAttrs.superscript} data-tooltip={LL.editor.richText.superscript()} onClick={() => emitRichTextCommand('superscript')}>A²</FormatChip>
                  <FormatChip active={richTextAttrs.subscript} data-tooltip={LL.editor.richText.subscript()} onClick={() => emitRichTextCommand('subscript')}>A₂</FormatChip>
                  <FormatChip active={richTextAttrs.code} data-tooltip={LL.editor.richText.inlineCode()} onClick={() => emitRichTextCommand('code')}>
                    <Icon icon="code" />
                  </FormatChip>
                  <FormatChip active={richTextAttrs.blockquote} data-tooltip={LL.editor.richText.blockquote()} onClick={() => emitRichTextCommand('blockquote')}>
                    <Icon icon="quote" />
                  </FormatChip>
                </div>
                <div className={cx('chip-track')}>
                  <Popover
                    placement="bottom-end"
                    trigger="click"
                    value={linkPopoverVisible}
                    onUpdateValue={(value: boolean) => setLinkPopoverVisible(value)}
                    className={cx('chip-grow')}
                    content={(
                      <div className={cx('link-popover')}>
                        <Input value={link} onUpdateValue={(value: string) => setLink(value)} placeholder={LL.editor.richText.linkPlaceholder()} />
                        <div className={cx('btns')}>
                          <Button size="small" disabled={!richTextAttrs.link} onClick={() => removeLink()}>{LL.editor.richText.removeLink()}</Button>
                          <Button size="small" type="primary" onClick={() => updateLink(link)}>{LL.common.confirm()}</Button>
                        </div>
                      </div>
                    )}
                  >
                    <FormatChip active={!!richTextAttrs.link} data-tooltip={LL.editor.richText.hyperlink()} onClick={() => openLinkPopover()}>
                      <Icon icon="link" />
                    </FormatChip>
                  </Popover>
                  <FormatChip data-tooltip={LL.editor.richText.clearFormat()} onClick={() => emitRichTextCommand('clear')}>
                    <Icon icon="remove-formatting" />
                  </FormatChip>
                  <FormatChip
                    active={!!textFormatPainter}
                    data-tooltip={LL.editor.richText.formatPainter()}
                    onClick={() => toggleTextFormatPainter()}
                    onDoubleClick={() => toggleTextFormatPainter(true)}
                  >
                    <Icon icon="paintbrush" />
                  </FormatChip>
                  {EXTRAS_ENABLED ? (
                    <Popover
                      trigger="click"
                      value={AIPopoverVisible}
                      onUpdateValue={(value: boolean) => setAIPopoverVisible(value)}
                      className={cx('chip-grow')}
                      content={(
                        <>
                          <PopoverMenuItem onClick={() => execAI(AI_WRITING_COMMANDS.polish)}>{LL.editor.richText.aiPolish()}</PopoverMenuItem>
                          <PopoverMenuItem onClick={() => execAI(AI_WRITING_COMMANDS.expand)}>{LL.editor.richText.aiExpand()}</PopoverMenuItem>
                          <PopoverMenuItem onClick={() => execAI(AI_WRITING_COMMANDS.condense)}>{LL.editor.richText.aiCondense()}</PopoverMenuItem>
                        </>
                      )}
                    >
                      <FormatChip data-tooltip={LL.editor.richText.aiAssist()}>
                        <span className={cx({ 'ai-loading': isAIWriting })}>{isAIWriting ? '' : 'AI'}</span>
                      </FormatChip>
                    </Popover>
                  ) : null}
                </div>
              </div>
            )}
          >
            <FormatChip data-tooltip={LL.editor.panel.more()}>
              <Icon icon="ellipsis" />
            </FormatChip>
          </Popover>
        </div>
      </PanelSection>

      {showColor ? (
        <PanelSection label={LL.editor.panel.color()}>
          <ColorSwatches
            modelValue={richTextAttrs.color}
            allowNone
            noneValue=""
            noneTitle={LL.editor.panel.none()}
            customTitle={LL.editor.multiStyle.textColor()}
            onUpdateModelValue={value => emitRichTextCommand('color', value)}
          />
        </PanelSection>
      ) : null}
      {props.color}

      <PanelSection label={LL.editor.panel.paragraph()} action={props.paragraphAction}>
        <div className={cx('chip-track')}>
          <FormatChip active={richTextAttrs.align === 'left'} data-tooltip={LL.editor.multiStyle.alignLeft()} onClick={() => emitRichTextCommand('align', 'left')}>
            <Icon icon="align-left" />
          </FormatChip>
          <FormatChip active={richTextAttrs.align === 'center'} data-tooltip={LL.editor.multiStyle.alignCenter()} onClick={() => emitRichTextCommand('align', 'center')}>
            <Icon icon="align-center" />
          </FormatChip>
          <FormatChip active={richTextAttrs.align === 'right'} data-tooltip={LL.editor.multiStyle.alignRight()} onClick={() => emitRichTextCommand('align', 'right')}>
            <Icon icon="align-right" />
          </FormatChip>
          <FormatChip active={richTextAttrs.align as string === 'justify'} data-tooltip={LL.editor.multiStyle.justify()} onClick={() => emitRichTextCommand('align', 'justify')}>
            <Icon icon="align-justify" />
          </FormatChip>
        </div>
        <div className={cx('chip-track')}>
          <div className={cx('list-chip')}>
            <FormatChip active={richTextAttrs.bulletList} data-tooltip={LL.editor.richText.bulletList()} onClick={() => emitRichTextCommand('bulletList')}>
              <Icon icon="list" />
            </FormatChip>
            <Popover
              trigger="click"
              value={bulletListPanelVisible}
              onUpdateValue={(value: boolean) => setBulletListPanelVisible(value)}
              content={(
                <div className={cx('list-wrap')}>
                  {bulletListStyleTypeOption.map(item => (
                    <ul
                      className={cx('list')}
                      key={item}
                      style={{ listStyleType: item }}
                      onClick={() => {
                        emitRichTextCommand('bulletList', item)
                        setBulletListPanelVisible(false)
                      }}
                    >
                      {[0, 1, 2].map(key => <li className={cx('list-item')} key={key}><span /></li>)}
                    </ul>
                  ))}
                </div>
              )}
            >
              <FormatChip compact><Icon icon="chevron-down" /></FormatChip>
            </Popover>
          </div>
          <div className={cx('list-chip')}>
            <FormatChip active={richTextAttrs.orderedList} data-tooltip={LL.editor.richText.numberedList()} onClick={() => emitRichTextCommand('orderedList')}>
              <Icon icon="list-ordered" />
            </FormatChip>
            <Popover
              trigger="click"
              value={orderedListPanelVisible}
              onUpdateValue={(value: boolean) => setOrderedListPanelVisible(value)}
              content={(
                <div className={cx('list-wrap')}>
                  {orderedListStyleTypeOption.map(item => (
                    <ul
                      className={cx('list')}
                      key={item}
                      style={{ listStyleType: item }}
                      onClick={() => {
                        emitRichTextCommand('orderedList', item)
                        setOrderedListPanelVisible(false)
                      }}
                    >
                      {[0, 1, 2].map(key => <li className={cx('list-item')} key={key}><span /></li>)}
                    </ul>
                  ))}
                </div>
              )}
            >
              <FormatChip compact><Icon icon="chevron-down" /></FormatChip>
            </Popover>
          </div>
          <FormatChip compact data-tooltip={LL.editor.richText.decreaseIndent()} onClick={() => emitRichTextCommand('indent', '-1')}>
            <Icon icon="outdent" />
          </FormatChip>
          <FormatChip compact data-tooltip={LL.editor.richText.increaseIndent()} onClick={() => emitRichTextCommand('indent', '+1')}>
            <Icon icon="indent" />
          </FormatChip>
        </div>
        {props.paragraphExtra}
      </PanelSection>
    </>
  )
})

export default RichTextBase
