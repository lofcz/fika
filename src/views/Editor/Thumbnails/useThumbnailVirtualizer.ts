import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useVirtualizer, type VirtualItem, type Virtualizer } from '@tanstack/react-virtual'
import { usePreviewDestSize, type PreviewDestSize } from './paneSize'
import type { RailSlideMeta } from '@/views/components/ThumbnailSlide/paintedSlide'
import { notifyThumbnailScrollActivity } from '@/paint/rasterResources'

const SECTION_HEIGHT = 26
const ROW_CHROME = 16

export type ThumbnailVirtualizerApi = {
  scrollRef: RefObject<HTMLDivElement | null>
  virtualizer: Virtualizer<HTMLDivElement, Element>
  virtualItems: VirtualItem[]
  visibleSlideIds: string[]
  pinnedSlideIds: string[]
  thumbHeight: number
  dest: PreviewDestSize
}

const rowHasSection = (item: RailSlideMeta | undefined, index: number, hasSection: boolean) => (
  !!(item?.sectionTag || (hasSection && index === 0))
)

const EMPTY_IDS: string[] = []

export const useThumbnailVirtualizer = (
  items: RailSlideMeta[],
  hasSection: boolean,
  _showGapControls = false,
): ThumbnailVirtualizerApi => {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const dest = usePreviewDestSize()
  const thumbHeight = dest.cssHeight + ROW_CHROME
  const latestRef = useRef({ items, hasSection, thumbHeight })
  latestRef.current = { items, hasSection, thumbHeight }

  const getScrollElement = useMemo(() => () => scrollRef.current, [])
  const estimateSize = useMemo(() => (index: number) => {
    const cur = latestRef.current
    return cur.thumbHeight + (rowHasSection(cur.items[index], index, cur.hasSection) ? SECTION_HEIGHT : 0)
  }, [])
  const getItemKey = useMemo(() => (index: number) => latestRef.current.items[index]?.id ?? index, [])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    estimateSize,
    overscan: 3,
    getItemKey,
    // Never call ReactDOM.flushSync synchronously inside scroll events.
    useFlushSync: false,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [virtualizer, dest.cssHeight, dest.cssWidth, hasSection, items])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => notifyThumbnailScrollActivity()
    // Capture phase ensures `isThumbnailScrolling()` flips true before the
    // virtualizer's scroll listener mounts newly visible thumbnail rows.
    el.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => el.removeEventListener('scroll', onScroll, true)
  }, [])

  const virtualItems = virtualizer.getVirtualItems()

  return {
    scrollRef,
    virtualizer,
    virtualItems,
    visibleSlideIds: EMPTY_IDS,
    pinnedSlideIds: EMPTY_IDS,
    thumbHeight,
    dest,
  }
}
