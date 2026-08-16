import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useVirtualizer, type VirtualItem, type Virtualizer } from '@tanstack/react-virtual'
import { usePreviewDestSize, type PreviewDestSize } from './paneSize'
import type { RailSlideMeta } from '@/views/components/ThumbnailSlide/paintedSlide'
import { canCaptureThumb, hasFreshSnapshotFor, teardownThumbSnapshot } from '@/views/components/ThumbnailSlide/thumbSnapshot'

const SECTION_HEIGHT = 26
const ROW_CHROME = 16
const MAX_PINNED_TEARDOWNS = 1

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

const findThumbNode = (root: HTMLElement | null, slideId: string) => {
  const box = root?.querySelector<HTMLElement>(`[data-thumbnail-slide="${CSS.escape(slideId)}"]`)
  return box?.querySelector<HTMLElement>('[data-live-slide-thumb]') ?? box ?? null
}

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
    overscan: 1,
    getItemKey: index => items[index]?.id ?? index,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [virtualizer, dest.cssHeight, dest.cssWidth, hasSection, items])

  const windowItems = virtualizer.getVirtualItems()
  const prevWindowRef = useRef<VirtualItem[]>([])
  const pinnedRef = useRef(new Map<string, VirtualItem>())
  const capturingRef = useRef(new Set<string>())
  const [, setPinEpoch] = useState(0)

  const windowKeys = new Set(windowItems.map(row => String(row.key)))
  for (const id of [...pinnedRef.current.keys()]) {
    if (windowKeys.has(id)) pinnedRef.current.delete(id)
  }
  for (const row of prevWindowRef.current) {
    const id = String(row.key)
    if (windowKeys.has(id) || pinnedRef.current.has(id)) continue
    if (hasFreshSnapshotFor(id) || !canCaptureThumb(id)) continue
    if (pinnedRef.current.size >= MAX_PINNED_TEARDOWNS) continue
    pinnedRef.current.set(id, row)
  }

  const pinnedSlideIds = [...pinnedRef.current.keys()]
  const extraPinned = pinnedSlideIds
    .map(id => pinnedRef.current.get(id))
    .filter((row): row is VirtualItem => !!row && !windowKeys.has(String(row.key)))
  const virtualItems = extraPinned.length ? [...windowItems, ...extraPinned] : windowItems

  useEffect(() => {
    prevWindowRef.current = windowItems
    const root = scrollRef.current
    for (const id of pinnedRef.current.keys()) {
      if (capturingRef.current.has(id)) continue
      capturingRef.current.add(id)
      void teardownThumbSnapshot(id, () => findThumbNode(root, id)).finally(() => {
        capturingRef.current.delete(id)
        pinnedRef.current.delete(id)
        setPinEpoch(n => n + 1)
      })
    }
  })

  const startIndex = windowItems[0]?.index
  const endIndex = windowItems[windowItems.length - 1]?.index
  const visibleSlideIds = useMemo(() => {
    if (startIndex === undefined || endIndex === undefined) return []
    const ids: string[] = []
    for (let i = startIndex; i <= endIndex; i++) {
      const id = items[i]?.id
      if (id) ids.push(id)
    }
    return ids
  }, [startIndex, endIndex, items])

  return { scrollRef, virtualizer, virtualItems, visibleSlideIds, pinnedSlideIds, thumbHeight, dest }
}
