import type { MutableRefObject } from 'react'
import type { PPTElement } from '@/types/slides'
import type { ContextmenuItem } from '@/components/Contextmenu/types'
import useElementContextmenu from '@/hooks/useElementContextmenu'

export type ElementContextmenus = (element: PPTElement, isMultiSelect: boolean) => ContextmenuItem[] | null

/** Isolates context-menu store subscriptions so operate chrome does not rerender on keystroke. */
export default function ContextMenuBridge({
  openLinkDialog,
  menuRef,
}: {
  openLinkDialog: () => void
  menuRef: MutableRefObject<ElementContextmenus | null>
}) {
  const { contextmenus } = useElementContextmenu(openLinkDialog)
  menuRef.current = contextmenus
  return null
}
