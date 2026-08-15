import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './TableToolbar.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react'

import { useMainStore, useSlidesStore } from '@/store'
import type { PPTTableElement } from '@/types/slides'
import { applyTableCellStyles } from '@/utils/tableCellStyle'
import { tableStyleTarget } from '@/utils/tableStyleTarget'
import emitter, { EmitterEvents, type TableCommand } from '@/utils/emitter'
import BorderPanel from './BorderPanel'
import Popover from '@/components/Popover'
import PopoverMenuItem from '@/components/PopoverMenuItem'
import ColorPicker from '@/components/ColorPicker/index'
import { useI18nContext } from '@/i18n/useI18nContext'
import { findSlideElement, sameElementId } from '../floatCompare'

export type ITableToolbarProps = {
  elementInfo: PPTTableElement
}

const TableToolbar = memo((props: ITableToolbarProps) => {
  const { LL } = useI18nContext()
  const handleElementId = useMainStore(s => s.handleElementId)
  const selectedTableCells = useMainStore(s => s.selectedTableCells)

  const cellBackcolor = useSlidesStore(s => {
    const el = findSlideElement(s, handleElementId)
    if (!el || el.type !== 'table') return ''
    const selected = tableStyleTarget(handleElementId, selectedTableCells)[0]
    const rowIndex = selected ? +selected.split('_')[0] : 0
    const colIndex = selected ? +selected.split('_')[1] : 0
    return el.data[rowIndex]?.[colIndex]?.style?.backcolor || ''
  })

  const emitTableCommand = useCallback((command: TableCommand['command'], position?: TableCommand['position']) => {
    emitter.emit(EmitterEvents.TABLE_COMMAND, {
      targetId: props.elementInfo.id,
      command,
      position,
    })
  }, [props.elementInfo.id])

  const updateCellBackcolor = useCallback((backcolor: string) => {
    applyTableCellStyles({ backcolor })
  }, [])

  return (
    <div className={cx('toolbar-content')}>
      <Popover
        trigger="click"
        content={<ColorPicker modelValue={cellBackcolor} onUpdateModelValue={value => updateCellBackcolor(value)} />}
      >
        <button className={cx('toolbar-btn')}>
          <Icon icon="paint-bucket" className={cx('icon')} />
          <span>{LL.canvas.floatingToolbar.fill()}</span>
        </button>
      </Popover>
      <BorderPanel />

      <div className={cx('divider')} />

      <Popover
        trigger="click"
        content={(
          <div className={cx('table-command-menu')}>
            <PopoverMenuItem center onClick={() => emitTableCommand('insert-row', 'before')}>{LL.editor.stylePanel.table.addAbove()}</PopoverMenuItem>
            <PopoverMenuItem center onClick={() => emitTableCommand('insert-row', 'after')}>{LL.editor.stylePanel.table.addBelow()}</PopoverMenuItem>
            <PopoverMenuItem center onClick={() => emitTableCommand('insert-col', 'before')}>{LL.editor.stylePanel.table.addLeft()}</PopoverMenuItem>
            <PopoverMenuItem center onClick={() => emitTableCommand('insert-col', 'after')}>{LL.editor.stylePanel.table.addRight()}</PopoverMenuItem>
          </div>
        )}
      >
        <button className={cx('toolbar-btn')}>
          <Icon icon="plus" className={cx('icon')} />
          <span>{LL.canvas.table.add()}</span>
        </button>
      </Popover>
      <Popover
        trigger="click"
        content={(
          <div className={cx('table-command-menu')}>
            <PopoverMenuItem center onClick={() => emitTableCommand('delete-row')}>{LL.editor.stylePanel.table.deleteRow()}</PopoverMenuItem>
            <PopoverMenuItem center onClick={() => emitTableCommand('delete-col')}>{LL.editor.stylePanel.table.deleteColumn()}</PopoverMenuItem>
          </div>
        )}
      >
        <button className={cx('toolbar-btn')}>
          <Icon icon="minus" className={cx('icon')} />
          <span>{LL.common.delete()}</span>
        </button>
      </Popover>
    </div>
  )
}, sameElementId)

TableToolbar.displayName = 'TableToolbar'

export default TableToolbar
