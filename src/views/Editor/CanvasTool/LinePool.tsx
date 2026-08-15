import { bindStyles } from '@/utils/cssm'
import styles from './LinePool.module.scss'
const cx = bindStyles(styles)
import { memo, useRef, type CSSProperties } from 'react'
import { LINE_LIST, type LineCategoryKey, type LinePoolItem } from '@/configs/lines'
import { useI18nContext } from '@/i18n/useI18nContext'
import LinePointMarker from '@/views/components/element/LineElement/LinePointMarker'

export type ILinePoolProps = {
  className?: string
  style?: CSSProperties
  onSelect?: (payload: LinePoolItem) => void
}

function LinePool(props: ILinePoolProps) {
  const { LL } = useI18nContext()
  const onSelectRef = useRef(props.onSelect)
  onSelectRef.current = props.onSelect

  const lineList = (() => {
    const lines = LL.configs.lines
    const labels: Record<LineCategoryKey, () => string> = {
      straight: lines.straight,
      polyCurve: lines.polyCurve,
    }
    return LINE_LIST.map(item => ({
      type: item.type,
      label: labels[item.type](),
      children: item.children,
    }))
  })()

  const selectLine = (line: LinePoolItem) => {
    onSelectRef.current?.(line)
  }

  return (
    <div className={cx('line-pool', props.className)} style={props.style}>
      {lineList.map((item, i) => (
        <div className={cx('category')} key={item.type}>
          <div className={cx('category-name')}>{item.label}</div>
          <div className={cx('line-list')}>
            {item.children.map((line, j) => (
              <button
                type="button"
                className={cx('line-item')}
                data-line-item=""
                key={j}
                onClick={() => selectLine(line)}
              >
                <svg
                  overflow="visible"
                  width="22"
                  height="22"
                >
                  <defs>
                    {line.points[0] ? (
                      <LinePointMarker
                        id={`preset-line-${i}-${j}`}
                        position="start"
                        type={line.points[0]}
                        color="currentColor"
                        baseSize={2}
                        preview
                      />
                    ) : null}
                    {line.points[1] ? (
                      <LinePointMarker
                        id={`preset-line-${i}-${j}`}
                        position="end"
                        type={line.points[1]}
                        color="currentColor"
                        baseSize={2}
                        preview
                      />
                    ) : null}
                  </defs>
                  <path
                    className={cx('line-path')}
                    d={line.path}
                    stroke="currentColor"
                    fill="none"
                    strokeWidth="2"
                    strokeDasharray={line.style === 'solid' ? '0, 0' : '4, 1'}
                    markerStart={line.points[0] ? `url(#${`preset-line-${i}-${j}`}-${line.points[0]}-start)` : ''}
                    markerEnd={line.points[1] ? `url(#${`preset-line-${i}-${j}`}-${line.points[1]}-end)` : ''}
                  />
                </svg>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default memo(LinePool)
