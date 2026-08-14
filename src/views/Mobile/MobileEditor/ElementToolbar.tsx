import { bindStyles } from '@/utils/cssm'
import styles from './ElementToolbar.module.scss'
const cx = bindStyles(styles)
import { useMemo, useState } from 'react'
import { useMainStore, useSlidesStore, selectHandleElement } from '@/store'
import { Icon } from '@/components/Icon'
import type { PPTElement, TableCell } from '@/types/slides'
import { ElementAlignCommands, ElementOrderCommands } from '@/types/edit'
import emitter, { EmitterEvents } from '@/utils/emitter'
import useOrderElement from '@/hooks/useOrderElement'
import useAlignElementToCanvas from '@/hooks/useAlignElementToCanvas'
import useDeleteElement from '@/hooks/useDeleteElement'
import useAddSlidesOrElements from '@/hooks/useAddSlidesOrElements'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import Button from '@/components/Button'
import ButtonGroup from '@/components/ButtonGroup'
import Tabs from '@/components/Tabs'
import Divider from '@/components/Divider'
import RadioButton from '@/components/RadioButton'
import RadioGroup from '@/components/RadioGroup'
import ColorPicker from '@/components/ColorPicker/index'
import Popover from '@/components/Popover'
import { useI18nContext } from '@/i18n/useI18nContext'

const colors = ['#000000', '#ffffff', '#eeece1', '#1e497b', '#4e81bb', '#e2534d', '#9aba60', '#8165a0', '#47acc5', '#c21401', '#ff1e02', '#ffc12a', '#ffff3a', '#90cf5b', '#00af57']

export default function ElementToolbar() {
  const { LL } = useI18nContext()
  const handleElement = useMainStore(selectHandleElement)
  const handleElementId = useMainStore(s => s.handleElementId)
  const richTextAttrs = useMainStore(s => s.richTextAttrs)
  const updateElementStore = useSlidesStore(s => s.updateElement)
  const { addHistorySnapshot } = useHistorySnapshot()
  const { orderElement } = useOrderElement()
  const { alignElementToCanvas } = useAlignElementToCanvas()
  const { addElementsFromData } = useAddSlidesOrElements()
  const { deleteElement } = useDeleteElement()
  const [activeTab, setActiveTab] = useState('common')

  const updateElement = (id: string, props: Partial<PPTElement>) => {
    updateElementStore({ id, props })
    addHistorySnapshot()
  }

  const tabs = useMemo(() => [
    { key: 'style', label: LL.mobile.elementToolbar.tabStyle() },
    { key: 'common', label: LL.mobile.elementToolbar.tabLayout() },
  ], [LL])

  const textPropsEnable = (() => {
    if (!handleElement) return false
    if (handleElement.type === 'text') return true
    if (handleElement.type === 'shape' && handleElement.text?.content) return true
    return false
  })()

  const textColorPropsEnable = (() => {
    if (!handleElement) return false
    if (
      handleElement.type === 'text' ||
      handleElement.type === 'table' ||
      handleElement.type === 'latex'
    ) return true
    if (handleElement.type === 'shape' && handleElement.text?.content) return true
    return false
  })()

  const fillPropsEnable = (() => {
    if (!handleElement) return false
    if (
      handleElement.type === 'text' ||
      handleElement.type === 'shape' ||
      handleElement.type === 'chart' ||
      handleElement.type === 'table' ||
      handleElement.type === 'line' ||
      handleElement.type === 'audio'
    ) return true
    return false
  })()

  const copyElement = () => {
    const element: PPTElement = JSON.parse(JSON.stringify(handleElement))
    addElementsFromData([element])
  }

  const emitRichTextCommand = (command: string, value?: string) => {
    emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { action: { command, value } })
  }

  const fontColor = (() => {
    if (!handleElement) return '#fff'
    if (handleElement.type === 'text' || (handleElement.type === 'shape' && handleElement.text?.content)) {
      return richTextAttrs.color
    }
    if (handleElement.type === 'table') {
      const data: TableCell[][] = JSON.parse(JSON.stringify(handleElement.data))
      return data[0][0].style?.color
    }
    if (handleElement.type === 'latex') {
      return handleElement.color
    }
    return '#fff'
  })()

  const updateFontColor = (color: string) => {
    if (!handleElement) return
    if (handleElement.type === 'text' || (handleElement.type === 'shape' && handleElement.text?.content)) {
      emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { action: { command: 'color', value: color } })
    }
    if (handleElement.type === 'table') {
      const data: TableCell[][] = JSON.parse(JSON.stringify(handleElement.data))
      for (let i = 0; i < data.length; i++) {
        for (let j = 0; j < data[i].length; j++) {
          const style = data[i][j].style || {}
          data[i][j].style = { ...style, color }
        }
      }
      updateElement(handleElementId, { data })
    }
    if (handleElement.type === 'latex') {
      updateElement(handleElementId, { color })
    }
  }

  const fill = (() => {
    if (!handleElement) return '#fff'
    if (
      handleElement.type === 'text' ||
      handleElement.type === 'shape' ||
      handleElement.type === 'chart'
    ) return handleElement.fill
    if (handleElement.type === 'table') {
      const data: TableCell[][] = JSON.parse(JSON.stringify(handleElement.data))
      return data[0][0].style?.backcolor
    }
    if (handleElement.type === 'audio' || handleElement.type === 'line') {
      return handleElement.color
    }
    return '#fff'
  })()

  const updateFill = (color: string) => {
    if (!handleElement) return
    if (
      handleElement.type === 'text' ||
      handleElement.type === 'shape' ||
      handleElement.type === 'chart'
    ) updateElement(handleElementId, { fill: color })

    if (handleElement.type === 'table') {
      const data: TableCell[][] = JSON.parse(JSON.stringify(handleElement.data))
      for (let i = 0; i < data.length; i++) {
        for (let j = 0; j < data[i].length; j++) {
          const style = data[i][j].style || {}
          data[i][j].style = { ...style, backcolor: color }
        }
      }
      updateElement(handleElementId, { data })
    }

    if (handleElement.type === 'audio' || handleElement.type === 'line') {
      updateElement(handleElementId, { color })
    }
  }

  return (
    <div className={cx('element-toolbar')}>
      <Tabs
        tabs={tabs}
        value={activeTab}
        onUpdateValue={setActiveTab}
        tabsStyle={{ marginBottom: '8px' }}
        tabStyle={{
          width: '30%',
          margin: '0 10%',
        }}
      />

      <div className={cx('content')}>
        {activeTab === 'style' ? (
          <div className={cx('style')}>
            {textPropsEnable ? (
              <>
                <ButtonGroup className={cx('row')}>
                  <Button style={{ flex: 1 }} type="checkbox" checked={richTextAttrs.bold} onClick={() => emitRichTextCommand('bold')}>
                    <Icon icon="bold" />
                  </Button>
                  <Button style={{ flex: 1 }} type="checkbox" checked={richTextAttrs.em} onClick={() => emitRichTextCommand('em')}>
                    <Icon icon="italic" />
                  </Button>
                  <Button style={{ flex: 1 }} type="checkbox" checked={richTextAttrs.underline} onClick={() => emitRichTextCommand('underline')}>
                    <Icon icon="underline" />
                  </Button>
                  <Button style={{ flex: 1 }} type="checkbox" checked={richTextAttrs.strikethrough} onClick={() => emitRichTextCommand('strikethrough')}>
                    <Icon icon="strikethrough" />
                  </Button>
                </ButtonGroup>

                <ButtonGroup className={cx('row')}>
                  <Button style={{ flex: 1 }} onClick={() => emitRichTextCommand('fontsize-add')}>
                    <Icon icon="type" />+
                  </Button>
                  <Button style={{ flex: 1 }} onClick={() => emitRichTextCommand('fontsize-reduce')}>
                    <Icon icon="type" />-
                  </Button>
                </ButtonGroup>

                <RadioGroup
                  className={cx('row')}
                  value={richTextAttrs.align}
                  onUpdateValue={value => emitRichTextCommand('align', value)}
                >
                  <RadioButton value="left"><Icon icon="align-left" /></RadioButton>
                  <RadioButton value="center"><Icon icon="align-center" /></RadioButton>
                  <RadioButton value="right"><Icon icon="align-right" /></RadioButton>
                </RadioGroup>
              </>
            ) : null}

            {textColorPropsEnable ? (
              <div className={cx('row-block')}>
                <div className={cx('label')}>{LL.mobile.elementToolbar.textColorLabel()}</div>
                <div className={cx('colors')}>
                  {colors.map(color => (
                    <div className={cx('color')} key={color} onClick={() => updateFontColor(color)}>
                      <div className={cx('color-block')} style={{ backgroundColor: color }} />
                    </div>
                  ))}
                  <div className={cx('color', 'custom')}>
                    <Popover trigger="click" content={(
                      <ColorPicker modelValue={fontColor} onUpdateModelValue={value => updateFontColor(value)} />
                    )}
                    >
                      <div className={cx('color-block')} />
                    </Popover>
                  </div>
                </div>
              </div>
            ) : null}

            {fillPropsEnable ? (
              <div className={cx('row-block')}>
                <div className={cx('label')}>{LL.mobile.elementToolbar.fillColorLabel()}</div>
                <div className={cx('colors')}>
                  {colors.map(color => (
                    <div className={cx('color')} key={color} onClick={() => updateFill(color)}>
                      <div className={cx('color-block')} style={{ backgroundColor: color }} />
                    </div>
                  ))}
                  <div className={cx('color', 'custom')}>
                    <Popover trigger="click" content={(
                      <ColorPicker modelValue={fill} onUpdateModelValue={value => updateFill(value)} />
                    )}
                    >
                      <div className={cx('color-block')} />
                    </Popover>
                  </div>
                </div>
              </div>
            ) : null}

            {!textPropsEnable && !textColorPropsEnable && !fillPropsEnable ? (
              <div className={cx('tip')}>{LL.mobile.elementToolbar.noProperties()}</div>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'common' ? (
          <div className={cx('common')}>
            <ButtonGroup className={cx('row')}>
              <Button style={{ flex: 1 }} onClick={copyElement}><Icon icon="copy" className={cx('icon')} /> {LL.common.copy()}</Button>
              <Button style={{ flex: 1 }} onClick={deleteElement}><Icon icon="trash-2" className={cx('icon')} /> {LL.common.delete()}</Button>
            </ButtonGroup>

            <Divider margin={20} />

            <ButtonGroup className={cx('row')}>
              <Button style={{ flex: 1 }} onClick={() => orderElement(handleElement!, ElementOrderCommands.TOP)}><Icon icon="send-to-back" className={cx('icon')} /> {LL.mobile.elementToolbar.orderBringToFront()}</Button>
              <Button style={{ flex: 1 }} onClick={() => orderElement(handleElement!, ElementOrderCommands.BOTTOM)}><Icon icon="bring-to-front" className={cx('icon')} /> {LL.mobile.elementToolbar.orderSendToBack()}</Button>
              <Button style={{ flex: 1 }} onClick={() => orderElement(handleElement!, ElementOrderCommands.UP)}><Icon icon="bring-to-front" className={cx('icon')} /> {LL.mobile.elementToolbar.orderMoveUp()}</Button>
              <Button style={{ flex: 1 }} onClick={() => orderElement(handleElement!, ElementOrderCommands.DOWN)}><Icon icon="send-to-back" className={cx('icon')} /> {LL.mobile.elementToolbar.orderMoveDown()}</Button>
            </ButtonGroup>

            <Divider margin={20} />

            <ButtonGroup className={cx('row')}>
              <Button style={{ flex: 1 }} onClick={() => alignElementToCanvas(ElementAlignCommands.LEFT)}><Icon icon="align-start-vertical" className={cx('icon')} /> {LL.editor.multiPosition.alignLeft()}</Button>
              <Button style={{ flex: 1 }} onClick={() => alignElementToCanvas(ElementAlignCommands.HORIZONTAL)}><Icon icon="align-center-horizontal" className={cx('icon')} /> {LL.editor.multiPosition.alignHorizontalCenter()}</Button>
              <Button style={{ flex: 1 }} onClick={() => alignElementToCanvas(ElementAlignCommands.RIGHT)}><Icon icon="align-end-vertical" className={cx('icon')} /> {LL.editor.multiPosition.alignRight()}</Button>
            </ButtonGroup>
            <ButtonGroup className={cx('row')}>
              <Button style={{ flex: 1 }} onClick={() => alignElementToCanvas(ElementAlignCommands.TOP)}><Icon icon="align-start-horizontal" className={cx('icon')} /> {LL.editor.multiPosition.alignTop()}</Button>
              <Button style={{ flex: 1 }} onClick={() => alignElementToCanvas(ElementAlignCommands.VERTICAL)}><Icon icon="align-center-vertical" className={cx('icon')} /> {LL.editor.multiPosition.alignVerticalCenter()}</Button>
              <Button style={{ flex: 1 }} onClick={() => alignElementToCanvas(ElementAlignCommands.BOTTOM)}><Icon icon="align-end-horizontal" className={cx('icon')} /> {LL.editor.multiPosition.alignBottom()}</Button>
            </ButtonGroup>
          </div>
        ) : null}
      </div>
    </div>
  )
}
