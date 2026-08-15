import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './TableStylePanel.module.scss'
const cx = bindStyles(styles)
import { memo, useState, useEffect } from 'react'

import { useI18nContext } from '@/i18n/useI18nContext'
import { useMainStore, useSlidesStore } from '@/store'
import { getHandleElement, shallowEqual, useHandleElementId, useHandleElementSelect } from '../common/handleElement'
import type { PPTTableElement, TableCell, TableCellStyle, TableTheme } from '@/types/slides'
import { FONT_SIZE_PX_OPTIONS, useFonts } from '@/configs/font'
import { DEFAULT_TABLE_THEME } from '@/configs/table'
import emitter, { EmitterEvents, type TableCommand } from '@/utils/emitter'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import ElementOutline from '../common/ElementOutline'
import PanelSection from '../common/PanelSection'
import ColorSwatches from '@/components/ColorSwatches'
import FormatChip from '@/components/FormatChip'
import Switch from '@/components/Switch'
import Checkbox from '@/components/Checkbox'
import Button from '@/components/Button'
import Select from '@/components/Select'
import Popover from '@/components/Popover'
import PopoverMenuItem from '@/components/PopoverMenuItem'

const TableStylePanel = memo(() => {
  const { LL } = useI18nContext()
  const fonts = useFonts()
  const handleElementId = useHandleElementId()
  const selectedCells = useMainStore(s => s.selectedTableCells)
  const tableStyle = useHandleElementSelect(el => {
    if (!el || el.type !== 'table') return null
    const cells = useMainStore.getState().selectedTableCells
    let rowIndex = 0
    let colIndex = 0
    if (cells.length) {
      const selectedCell = cells[0]
      rowIndex = +selectedCell.split('_')[0]
      colIndex = +selectedCell.split('_')[1]
    }
    return {
      theme: el.theme,
      cellStyle: el.data[rowIndex]?.[colIndex]?.style,
    }
  }, (a, b) => {
    if (a === b) return true
    if (!a || !b) return false
    return a.theme === b.theme && shallowEqual(a.cellStyle, b.cellStyle)
  })
  const [textAttrs, setTextAttrs] = useState({
    bold: false,
    em: false,
    underline: false,
    strikethrough: false,
    color: '#000',
    backcolor: '',
    fontsize: '12px',
    fontname: '',
    align: 'left',
    vAlign: 'top',
  })
  const [theme, setTheme] = useState<TableTheme>()
  const [hasTheme, setHasTheme] = useState(false)
  const { addHistorySnapshot } = useHistorySnapshot()

  useEffect(() => {
    if (!tableStyle) return
    setTheme(tableStyle.theme)
    setHasTheme(!!tableStyle.theme)
  }, [tableStyle])

  const updateTextAttrState = () => {
    const style = tableStyle?.cellStyle
    if (!style) {
      setTextAttrs({
        bold: false,
        em: false,
        underline: false,
        strikethrough: false,
        color: '#000',
        backcolor: '',
        fontsize: '12px',
        fontname: '',
        align: 'left',
        vAlign: 'top',
      })
    }
    else {
      setTextAttrs({
        bold: !!style.bold,
        em: !!style.em,
        underline: !!style.underline,
        strikethrough: !!style.strikethrough,
        color: style.color || '#000',
        backcolor: style.backcolor || '',
        fontsize: style.fontsize || '12px',
        fontname: style.fontname || '',
        align: style.align || 'left',
        vAlign: style.vAlign || 'top',
      })
    }
  }

  useEffect(() => {
    updateTextAttrState()
  }, [tableStyle, selectedCells])

  const updateElement = (props: Partial<PPTTableElement>) => {
    useSlidesStore.getState().updateElement({ id: handleElementId, props })
    addHistorySnapshot()
  }

  const updateTextAttrs = (textAttrProp: Partial<TableCellStyle>) => {
    const _handleElement = getHandleElement() as PPTTableElement | null
    if (!_handleElement || _handleElement.type !== 'table') return
    const data: TableCell[][] = JSON.parse(JSON.stringify(_handleElement.data))
    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < data[i].length; j++) {
        if (!selectedCells.length || selectedCells.includes(`${i}_${j}`)) {
          const style = data[i][j].style || {}
          data[i][j].style = { ...style, ...textAttrProp }
        }
      }
    }
    updateElement({ data })
    setTextAttrs(prev => ({ ...prev, ...textAttrProp }))
  }

  const updateTheme = (themeProp: Partial<TableTheme>) => {
    if (!theme) return
    const _theme = { ...theme, ...themeProp }
    updateElement({ theme: _theme })
  }

  const toggleTheme = (checked: boolean) => {
    if (checked) {
      updateElement({ theme: { ...DEFAULT_TABLE_THEME } })
    }
    else {
      useSlidesStore.getState().removeElementProps({ id: handleElementId, propName: 'theme' })
      addHistorySnapshot()
    }
  }

  const emitTableCommand = (command: TableCommand['command'], position?: TableCommand['position']) => {
    emitter.emit(EmitterEvents.TABLE_COMMAND, {
      targetId: handleElementId,
      command,
      position,
    })
  }

  return (
    <div className={cx('table-style-panel')}>
      <PanelSection label={LL.editor.panel.type()}>
        <Select
          className="quiet-select"
          value={textAttrs.fontname}
          search
          searchLabel={LL.editor.multiStyle.searchFont()}
          autofocus
          previewFonts
          onUpdateValue={value => updateTextAttrs({ fontname: String(value) })}
          options={fonts}
        />
        <Select
          className="quiet-select"
          value={textAttrs.fontsize}
          search
          searchLabel={LL.editor.multiStyle.searchFontSize()}
          autofocus
          onUpdateValue={value => updateTextAttrs({ fontsize: String(value) })}
          options={FONT_SIZE_PX_OPTIONS}
        />
        <div className="chip-row">
          <FormatChip active={textAttrs.bold} data-tooltip={LL.editor.stylePanel.table.bold()} onClick={() => updateTextAttrs({ bold: !textAttrs.bold })}>
            <Icon icon="bold" />
          </FormatChip>
          <FormatChip active={textAttrs.em} data-tooltip={LL.editor.stylePanel.table.italic()} onClick={() => updateTextAttrs({ em: !textAttrs.em })}>
            <Icon icon="italic" />
          </FormatChip>
          <FormatChip active={textAttrs.underline} data-tooltip={LL.editor.stylePanel.table.underline()} onClick={() => updateTextAttrs({ underline: !textAttrs.underline })}>
            <Icon icon="underline" />
          </FormatChip>
          <FormatChip active={textAttrs.strikethrough} data-tooltip={LL.editor.stylePanel.table.strikethrough()} onClick={() => updateTextAttrs({ strikethrough: !textAttrs.strikethrough })}>
            <Icon icon="strikethrough" />
          </FormatChip>
        </div>
      </PanelSection>

      <PanelSection label={LL.editor.panel.color()}>
        <ColorSwatches
          modelValue={textAttrs.color}
          customTitle={LL.editor.multiStyle.textColor()}
          onUpdateModelValue={value => updateTextAttrs({ color: value })}
        />
      </PanelSection>

      <PanelSection label={LL.editor.stylePanel.table.cellFill()}>
        <ColorSwatches
          modelValue={textAttrs.backcolor}
          allowNone
          noneValue=""
          noneTitle={LL.editor.panel.none()}
          customTitle={LL.editor.stylePanel.table.cellFill()}
          onUpdateModelValue={value => updateTextAttrs({ backcolor: value })}
        />
      </PanelSection>

      <PanelSection label={LL.editor.panel.paragraph()}>
        <div className="chip-row">
          <FormatChip active={textAttrs.align === 'left'} data-tooltip={LL.editor.multiStyle.alignLeft()} onClick={() => updateTextAttrs({ align: 'left' })}>
            <Icon icon="align-left" />
          </FormatChip>
          <FormatChip active={textAttrs.align === 'center'} data-tooltip={LL.editor.multiStyle.alignCenter()} onClick={() => updateTextAttrs({ align: 'center' })}>
            <Icon icon="align-center" />
          </FormatChip>
          <FormatChip active={textAttrs.align === 'right'} data-tooltip={LL.editor.multiStyle.alignRight()} onClick={() => updateTextAttrs({ align: 'right' })}>
            <Icon icon="align-right" />
          </FormatChip>
          <FormatChip active={textAttrs.align === 'justify'} data-tooltip={LL.editor.multiStyle.justify()} onClick={() => updateTextAttrs({ align: 'justify' })}>
            <Icon icon="align-justify" />
          </FormatChip>
        </div>
        <div className="chip-row">
          <FormatChip active={textAttrs.vAlign === 'top'} data-tooltip={LL.editor.stylePanel.shared.textAlignTop()} onClick={() => updateTextAttrs({ vAlign: 'top' })}>
            <Icon icon="align-vertical-justify-start" />
          </FormatChip>
          <FormatChip active={textAttrs.vAlign === 'middle'} data-tooltip={LL.editor.stylePanel.shared.textAlignMiddle()} onClick={() => updateTextAttrs({ vAlign: 'middle' })}>
            <Icon icon="align-vertical-justify-center" />
          </FormatChip>
          <FormatChip active={textAttrs.vAlign === 'bottom'} data-tooltip={LL.editor.stylePanel.shared.textAlignBottom()} onClick={() => updateTextAttrs({ vAlign: 'bottom' })}>
            <Icon icon="align-vertical-justify-end" />
          </FormatChip>
        </div>
      </PanelSection>

      <ElementOutline fixed />

      <PanelSection label={LL.editor.stylePanel.table.rows()}>
        <div className={cx('split-action')}>
          <Button className={cx('split-main')} onClick={() => emitTableCommand('insert-row', 'after')}>
            {LL.editor.stylePanel.table.addRow()}
          </Button>
          <Popover
            trigger="click"
            content={(
              <>
                <PopoverMenuItem center onClick={() => emitTableCommand('insert-row', 'before')}>{LL.editor.stylePanel.table.addAbove()}</PopoverMenuItem>
                <PopoverMenuItem center onClick={() => emitTableCommand('insert-row', 'after')}>{LL.editor.stylePanel.table.addBelow()}</PopoverMenuItem>
                <PopoverMenuItem center onClick={() => emitTableCommand('delete-row')}>{LL.editor.stylePanel.table.deleteRow()}</PopoverMenuItem>
              </>
            )}
          >
            <FormatChip compact><Icon icon="chevron-down" /></FormatChip>
          </Popover>
        </div>
      </PanelSection>

      <PanelSection label={LL.editor.stylePanel.table.columns()}>
        <div className={cx('split-action')}>
          <Button className={cx('split-main')} onClick={() => emitTableCommand('insert-col', 'after')}>
            {LL.editor.stylePanel.table.addColumn()}
          </Button>
          <Popover
            trigger="click"
            content={(
              <>
                <PopoverMenuItem center onClick={() => emitTableCommand('insert-col', 'before')}>{LL.editor.stylePanel.table.addLeft()}</PopoverMenuItem>
                <PopoverMenuItem center onClick={() => emitTableCommand('insert-col', 'after')}>{LL.editor.stylePanel.table.addRight()}</PopoverMenuItem>
                <PopoverMenuItem center onClick={() => emitTableCommand('delete-col')}>{LL.editor.stylePanel.table.deleteColumn()}</PopoverMenuItem>
              </>
            )}
          >
            <FormatChip compact><Icon icon="chevron-down" /></FormatChip>
          </Popover>
        </div>
      </PanelSection>

      <PanelSection>
        <div className="field">
          <span className="field-label">{LL.editor.stylePanel.table.enableThemeTable()}</span>
          <Switch value={hasTheme} onUpdateValue={value => toggleTheme(value)} />
        </div>
        {theme ? (
          <>
            <div className={cx('theme-checks')}>
              <Checkbox onUpdateValue={value => updateTheme({ rowHeader: value })} value={theme.rowHeader}>{LL.editor.stylePanel.table.headerRow()}</Checkbox>
              <Checkbox onUpdateValue={value => updateTheme({ rowFooter: value })} value={theme.rowFooter}>{LL.editor.stylePanel.table.summaryRow()}</Checkbox>
              <Checkbox onUpdateValue={value => updateTheme({ colHeader: value })} value={theme.colHeader}>{LL.editor.stylePanel.table.firstColumn()}</Checkbox>
              <Checkbox onUpdateValue={value => updateTheme({ colFooter: value })} value={theme.colFooter}>{LL.editor.stylePanel.table.lastColumn()}</Checkbox>
            </div>
            <ColorSwatches
              modelValue={theme.color}
              customTitle={LL.editor.stylePanel.table.themeColor()}
              onUpdateModelValue={value => updateTheme({ color: value })}
            />
          </>
        ) : null}
      </PanelSection>
    </div>
  )
})

export default TableStylePanel
