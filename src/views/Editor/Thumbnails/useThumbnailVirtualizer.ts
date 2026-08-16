import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useVirtualizer, type VirtualItem, type Virtualizer } from '@tanstack/react-virtual'
import { usePreviewDestSize, type PreviewDestSize } from './paneSize'
import type { RailSlideMeta } from '@/views/components/ThumbnailSlide/paintedSlide'

const SECTION_HEIGHT = 26
const ROW_CHROME = 16

export type ThumbnailVirtualizerApi = {
  scrollRef: RefObject<HTMLDivElement | null>
  virtualizer: Virtualizer<HTMLDivElement, Element>
  virtualItems: VirtualItem[]
  visibleSlideIds: string[]
  thumbHeight: number
  dest: PreviewDestSize
}

const rowHasSection = (item: RailSlideMeta | undefined, index: number, hasSection: boolean) => (
  !!(item?.sectionTag || (hasSection && index === 0))
)

export const useThumbnailVirtualizer = (
  items: RailSlideMeta[],
  hasSection: boolean,
): ThumbnailVirtualizerApi => {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const dest = usePreviewDestSize()
  const thumbHeight = dest.cssHeight + ROW_CHROME
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: index => thumbHeight + (rowHasSection(items[index], index, hasSection) ? SECTION_HEIGHT : 0),
    // Each row mounts a full live slide tree — keep the pre-mount window
    // minimal; content-visibility on .thumbnail-slide skips the offscreen
    // layout/paint of what does mount.
    overscan: 1,
    getItemKey: index => items[index]?.id ?? index,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [virtualizer, dest.cssHeight, dest.cssWidth, hasSection, items])

  const virtualItems = virtualizer.getVirtualItems()
  const startIndex = virtualItems[0]?.index
  const endIndex = virtualItems[virtualItems.length - 1]?.index
  const visibleSlideIds = useMemo(() => {
    if (startIndex === undefined || endIndex === undefined) return []
    const ids: string[] = []
    for (let i = startIndex; i <= endIndex; i++) {
      const id = items[i]?.id
      if (id) ids.push(id)
    }
    return ids
  }, [startIndex, endIndex, items])

  return { scrollRef, virtualizer, virtualItems, visibleSlideIds, thumbHeight, dest }
}
