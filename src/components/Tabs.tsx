import { bindStyles } from '@/utils/cssm'
import styles from './Tabs.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, useState, useEffect, useLayoutEffect, type CSSProperties } from 'react'
import { OverlayScrollbars } from 'overlayscrollbars'
import FitText from '@/components/FitText'
import 'overlayscrollbars/overlayscrollbars.css'

interface TabItem {
  key: string
  label: string
  color?: string
  disabled?: boolean
}

export type ITabsProps = {
  value: string
  tabs: TabItem[]
  card?: boolean
  tabsStyle?: CSSProperties
  tabStyle?: CSSProperties
  spaceAround?: boolean
  spaceBetween?: boolean
  className?: string
  style?: CSSProperties
  onUpdateValue?: (payload: string) => void
  onHover?: (payload: string) => void
}

function tabSetKey(tabs: TabItem[]) {
  return tabs.map(tab => tab.key).join('\0')
}

export default function Tabs({
  value,
  tabs,
  card = false,
  tabsStyle,
  tabStyle,
  spaceAround = false,
  spaceBetween = false,
  className,
  style,
  onUpdateValue,
  onHover,
}: ITabsProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const pillRef = useRef<HTMLDivElement | null>(null)
  const tabElsRef = useRef(new Map<string, HTMLDivElement>())
  const scrollbarsRef = useRef<ReturnType<typeof OverlayScrollbars> | null>(null)
  const pillReadyRef = useRef(false)
  const tabSetRef = useRef(tabSetKey(tabs))
  const [isScrollable, setIsScrollable] = useState(false)

  const setTabEl = useCallback((key: string, node: HTMLDivElement | null) => {
    const map = tabElsRef.current
    if (node) map.set(key, node)
    else map.delete(key)
  }, [])

  const syncPill = useCallback((animate: boolean) => {
    const root = tabsRef.current
    const pill = pillRef.current
    const tab = tabElsRef.current.get(value)
    if (!root || !pill || !tab) return

    const x = tab.offsetLeft
    const y = card ? tab.offsetTop : root.clientHeight - 2
    const w = tab.offsetWidth
    const h = card ? tab.offsetHeight : 2
    if (w <= 0 || h <= 0) return

    const width = `${w}px`
    const height = `${h}px`
    const transform = `translate3d(${x}px, ${y}px, 0)`
    const moved = pill.style.transform !== transform || pill.style.width !== width || pill.style.height !== height
    if (!moved && animate) {
      pill.dataset.ready = ''
      return
    }
    if (!moved) return

    pill.style.width = width
    pill.style.height = height
    pill.style.transform = transform
    pill.style.background = tab.dataset.tabColor || ''
    if (animate) pill.dataset.ready = ''
    else delete pill.dataset.ready
    pill.dataset.placed = ''
  }, [card, value])

  const hasHorizontalOverflow = useCallback(() => {
    if (!scrollRef.current || !tabsRef.current) return false
    return tabsRef.current.scrollWidth > scrollRef.current.clientWidth + 1
  }, [])

  const getScrollViewport = useCallback(() => {
    return scrollbarsRef.current?.elements().viewport ?? scrollRef.current
  }, [])

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!isScrollable) return
    const viewport = getScrollViewport()
    if (!viewport) return
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (!delta) return
    event.preventDefault()
    event.stopPropagation()
    viewport.scrollLeft += delta
  }

  const updateScrollable = useCallback(() => {
    void Promise.resolve().then(() => {
      const overflowing = hasHorizontalOverflow()
      setIsScrollable(overflowing)

      if (overflowing) {
        if (!scrollbarsRef.current && scrollRef.current) {
          scrollbarsRef.current = OverlayScrollbars(scrollRef.current, {
            overflow: {
              x: 'scroll',
              y: 'hidden',
            },
            scrollbars: {
              visibility: 'auto',
              autoHide: 'leave',
              autoHideDelay: 300,
            },
          })
        }
        else scrollbarsRef.current?.update(true)
      }
      else if (scrollbarsRef.current) {
        scrollbarsRef.current.destroy()
        scrollbarsRef.current = null
      }
    })
  }, [hasHorizontalOverflow])

  useLayoutEffect(() => {
    const nextSet = tabSetKey(tabs)
    if (tabSetRef.current !== nextSet) {
      tabSetRef.current = nextSet
      pillReadyRef.current = false
    }
    syncPill(pillReadyRef.current)
    if (pillReadyRef.current) return
    const id = requestAnimationFrame(() => {
      pillReadyRef.current = true
    })
    return () => cancelAnimationFrame(id)
  }, [syncPill, tabs, value])

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      updateScrollable()
      syncPill(false)
    })
    if (scrollRef.current) resizeObserver.observe(scrollRef.current)
    if (tabsRef.current) resizeObserver.observe(tabsRef.current)
    updateScrollable()
    return () => {
      resizeObserver.disconnect()
      scrollbarsRef.current?.destroy()
      scrollbarsRef.current = null
    }
  }, [syncPill, updateScrollable])

  useEffect(() => {
    updateScrollable()
  }, [tabs, value, tabsStyle, tabStyle, updateScrollable])

  return (
    <div
      ref={scrollRef}
      className={[cx('tabs-scroll', { card, scrollable: isScrollable }), className].filter(Boolean).join(' ')}
      style={{ ...(tabsStyle || {}), ...style }}
      onMouseDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
      onWheel={handleWheel}
    >
      <div
        ref={tabsRef}
        className={cx('tabs', {
          card,
          'space-around': spaceAround,
          'space-between': spaceBetween,
        })}
      >
        <div ref={pillRef} className={cx('pill')} />
        {tabs.map(tab => (
          <div
            className={cx('tab', {
              active: tab.key === value,
              disabled: tab.disabled,
            })}
            key={tab.key}
            ref={node => setTabEl(tab.key, node)}
            data-toolbar-tab={tab.key}
            data-tab-color={tab.color}
            style={{
              ...(tabStyle || {}),
              '--color': tab.color,
            } as CSSProperties}
            onClick={() => {
              if (!tab.disabled) onUpdateValue?.(tab.key)
            }}
            onMouseEnter={() => {
              if (!tab.disabled) onHover?.(tab.key)
            }}
          >
            <FitText
              text={tab.label}
              maxFontSize={card ? 12 : 13}
              minFontSize={8}
              fontWeight={600}
              letterSpacing={card ? 0.24 : 0}
              lineHeight={1}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
