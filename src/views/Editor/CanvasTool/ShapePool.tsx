import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './ShapePool.module.scss'
const cx = bindStyles(styles)
import { memo, useCallback, useRef, useState, type CSSProperties } from 'react'
import { SHAPE_LIST, type ShapeCategoryKey, type ShapePoolItem } from '@/configs/shapes'
import type { LinePoolItem } from '@/configs/lines'
import { useI18nContext } from '@/i18n/useI18nContext'
import ShapeItemThumbnail from './ShapeItemThumbnail'
import LinePool from './LinePool'

export type IShapePoolProps = {
  className?: string
  style?: CSSProperties
  onSelect?: (payload: ShapePoolItem) => void
  onSelectLine?: (payload: LinePoolItem) => void
  onScribble?: () => void
  onPolygon?: () => void
  onPathDraw?: () => void
}

function ShapePool(props: IShapePoolProps) {
  const { LL } = useI18nContext()
  const [activeCategory, setActiveCategory] = useState<ShapeCategoryKey>('rectangle')
  const onSelectRef = useRef(props.onSelect)
  const onSelectLineRef = useRef(props.onSelectLine)
  const onScribbleRef = useRef(props.onScribble)
  const onPolygonRef = useRef(props.onPolygon)
  const onPathDrawRef = useRef(props.onPathDraw)
  onSelectRef.current = props.onSelect
  onSelectLineRef.current = props.onSelectLine
  onScribbleRef.current = props.onScribble
  onPolygonRef.current = props.onPolygon
  onPathDrawRef.current = props.onPathDraw

  const shapeList = (() => {
    const tabs = LL.editor.canvasTool.shapeTabs
    const labels: Record<ShapeCategoryKey, () => string> = {
      rectangle: tabs.rectangle,
      common: tabs.common,
      arrow: tabs.arrow,
      other: tabs.other,
      line: tabs.line,
    }
    return SHAPE_LIST.map(item => ({
      categoryKey: item.categoryKey,
      label: labels[item.categoryKey](),
      children: item.children,
    }))
  })()

  const activeShapes = shapeList.find(item => item.categoryKey === activeCategory)?.children ?? []

  const selectShape = useCallback((shape: ShapePoolItem) => {
    onSelectRef.current?.(shape)
  }, [])
  const selectLine = useCallback((line: LinePoolItem) => {
    onSelectLineRef.current?.(line)
  }, [])

  return (
    <div className={cx('shape-gallery', props.className)} style={props.style}>
      <section className={cx('gallery-section')}>
        <div className={cx('section-label')}>{LL.editor.canvasTool.draw()}</div>
        <div className={cx('draw-tools')}>
          <button type="button" className={cx('draw-tool')} onClick={() => onScribbleRef.current?.()}>
            <span className={cx('draw-tool-icon')} aria-hidden="true">
              <Icon icon="pencil-line" />
            </span>
            <span className={cx('draw-tool-copy')}>
              <span className={cx('draw-tool-title')}>{LL.editor.canvasTool.scribble()}</span>
              <span className={cx('draw-tool-desc')}>{LL.editor.canvasTool.scribbleDesc()}</span>
            </span>
          </button>
          <button type="button" className={cx('draw-tool')} onClick={() => onPolygonRef.current?.()}>
            <span className={cx('draw-tool-icon')} aria-hidden="true">
              <Icon icon="mouse-pointer-click" />
            </span>
            <span className={cx('draw-tool-copy')}>
              <span className={cx('draw-tool-title')}>{LL.editor.canvasTool.drawShape()}</span>
              <span className={cx('draw-tool-desc')}>{LL.editor.canvasTool.drawShapeDesc()}</span>
            </span>
          </button>
          <button type="button" className={cx('draw-tool')} onClick={() => onPathDrawRef.current?.()}>
            <span className={cx('draw-tool-icon')} aria-hidden="true">
              <Icon icon="spline" />
            </span>
            <span className={cx('draw-tool-copy')}>
              <span className={cx('draw-tool-title')}>{LL.editor.canvasTool.pathDraw()}</span>
              <span className={cx('draw-tool-desc')}>{LL.editor.canvasTool.pathDrawDesc()}</span>
            </span>
          </button>
        </div>
      </section>

      <section className={cx('gallery-section')}>
        <div className={cx('section-label')}>{LL.editor.canvasTool.linesAndArrows()}</div>
        <LinePool onSelect={selectLine} />
      </section>

      <section className={cx('gallery-section', 'shapes-section')}>
        <div className={cx('category-tabs')} role="tablist">
          {shapeList.map(item => (
            <button
              key={item.categoryKey}
              type="button"
              role="tab"
              className={cx('category-tab', { active: item.categoryKey === activeCategory })}
              aria-selected={item.categoryKey === activeCategory}
              onClick={() => setActiveCategory(item.categoryKey)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={cx('shape-list')}>
          {activeShapes.map((shape, index) => (
            <ShapeItemThumbnail
              className={cx('shape-item')}
              key={index}
              shape={shape}
              onSelect={selectShape}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

export default memo(ShapePool)
