import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './TableGenerator.module.scss'
const cx = bindStyles(styles)
import { useRef, useState, type CSSProperties, type ChangeEvent } from 'react'
import message from '@/utils/message'
import Button from '@/components/Button'
import { useI18nContext } from '@/i18n/useI18nContext'

interface InsertData {
  row: number
  col: number
}

export default function TableGenerator({
  className,
  style,
  onInsert,
}: {
  className?: string
  style?: CSSProperties
  onInsert?: (payload: InsertData) => void
  onClose?: () => void
}) {
  const { LL } = useI18nContext()

  const gridSize = 10
  const minDim = 1
  const maxDim = 20

  const [endCell, setEndCell] = useState<number[]>([])
  const endCellRef = useRef(endCell)
  endCellRef.current = endCell
  const [customRow, setCustomRow] = useState(3)
  const [customCol, setCustomCol] = useState(3)
  const [isCustom, setIsCustom] = useState(false)

  const tableTitle = (() => {
    if (isCustom) return LL.editor.canvasTool.tableGenerator.custom()
    if (!endCell.length) return LL.editor.canvasTool.tableGenerator.table()
    const [rows, cols] = endCell
    return LL.editor.canvasTool.tableGenerator.tableWithSize({ rows, cols })
  })()

  const isActive = (row: number, col: number) => {
    return endCell.length > 0 && row <= endCell[0] && col <= endCell[1]
  }

  const clampDim = (value: number) => Math.min(maxDim, Math.max(minDim, value))

  const nudge = (dim: 'row' | 'col', delta: number) => {
    if (dim === 'row') setCustomRow(v => clampDim(v + delta))
    else setCustomCol(v => clampDim(v + delta))
  }

  const setDim = (dim: 'row' | 'col', raw: string) => {
    const parsed = Number.parseInt(raw, 10)
    const next = clampDim(Number.isNaN(parsed) ? minDim : parsed)
    if (dim === 'row') setCustomRow(next)
    else setCustomCol(next)
  }

  const handleClickTable = () => {
    if (!endCellRef.current.length) return
    const [row, col] = endCellRef.current
    onInsert?.({ row, col })
  }

  const insertCustomTable = () => {
    if (customRow < minDim || customRow > maxDim) return message.warning(LL.editor.canvasTool.tableGenerator.rowColRangeWarning())
    if (customCol < minDim || customCol > maxDim) return message.warning(LL.editor.canvasTool.tableGenerator.rowColRangeWarning())
    onInsert?.({ row: customRow, col: customCol })
    setIsCustom(false)
  }

  const rows = Array.from({ length: gridSize }, (_, i) => i + 1)
  const cols = Array.from({ length: gridSize }, (_, j) => j + 1)

  return (
    <div className={cx('table-generator', className)} style={style}>
      <div className={cx('header')}>
        {isCustom ? (
          <button type="button" className={cx('back-btn')} onClick={() => setIsCustom(false)}>
            <Icon icon="chevron-left" />
          </button>
        ) : null}
        <div className={cx('title')}>{tableTitle}</div>
        {!isCustom ? (
          <button type="button" className={cx('mode-btn')} onClick={() => setIsCustom(true)}>
            {LL.editor.canvasTool.tableGenerator.custom()}
          </button>
        ) : null}
      </div>

      {!isCustom ? (
        <div
          className={cx('grid')}
          onMouseLeave={() => setEndCell([])}
          onClick={() => handleClickTable()}
        >
          {rows.flatMap(row => cols.map(col => (
            <div
              key={`${row}-${col}`}
              className={cx('cell', { active: isActive(row, col) })}
              onMouseEnter={() => {
                const next = [row, col]
                endCellRef.current = next
                setEndCell(next)
              }}
            />
          )))}
        </div>
      ) : (
        <div className={cx('custom')}>
          <div className={cx('dims')}>
            <div className={cx('dim')}>
              <span className={cx('dim-label')}>{LL.editor.canvasTool.tableGenerator.rows()}</span>
              <div className={cx('stepper')}>
                <button type="button" className={cx('step')} onClick={() => nudge('row', -1)}>−</button>
                <input
                  className={cx('step-value')}
                  value={customRow}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setDim('row', event.target.value)}
                />
                <button type="button" className={cx('step')} onClick={() => nudge('row', 1)}>+</button>
              </div>
            </div>
            <div className={cx('dim')}>
              <span className={cx('dim-label')}>{LL.editor.canvasTool.tableGenerator.cols()}</span>
              <div className={cx('stepper')}>
                <button type="button" className={cx('step')} onClick={() => nudge('col', -1)}>−</button>
                <input
                  className={cx('step-value')}
                  value={customCol}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setDim('col', event.target.value)}
                />
                <button type="button" className={cx('step')} onClick={() => nudge('col', 1)}>+</button>
              </div>
            </div>
          </div>
          <Button className={cx('insert-btn')} type="primary" onClick={() => insertCustomTable()}>
            {LL.editor.canvasTool.insertTable()}
          </Button>
        </div>
      )}
    </div>
  )
}
