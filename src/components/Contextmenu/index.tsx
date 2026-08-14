import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react'

import type { ContextmenuItem, Axis } from './types'
import MenuContent from './MenuContent'

export type IContextmenuProps = {
  axis: Axis
  bounds?: { width: number; height: number }
  el: HTMLElement
  menus: ContextmenuItem[]
  removeContextmenu: () => void
  className?: string
}

const Contextmenu = memo((props: IContextmenuProps) => {
  const { menus, removeContextmenu } = props
  const MENU_WIDTH = 180
  const MENU_HEIGHT = 30
  const DIVIDER_HEIGHT = 11
  const PADDING = 5
  const { x, y } = props.axis
  const menuCount = props.menus.filter(menu => !(menu.divider || menu.hide)).length
  const dividerCount = props.menus.filter(menu => menu.divider).length
  const menuWidth = MENU_WIDTH
  const menuHeight = menuCount * MENU_HEIGHT + dividerCount * DIVIDER_HEIGHT + PADDING * 2
  const screenWidth = props.bounds?.width ?? window.innerWidth
  const screenHeight = props.bounds?.height ?? window.innerHeight
  const style = {
    left: screenWidth <= x + menuWidth ? Math.max(0, x - menuWidth) : x,
    top: screenHeight <= y + menuHeight ? Math.max(0, y - menuHeight) : y,
  }

  const handleClickMenuItem = useCallback((item: ContextmenuItem) => {
    if (item.disable) return
    if (item.children && !item.handler) return
    if (item.handler) item.handler(props.el)
    props.removeContextmenu()
  }, [props.el, props.removeContextmenu])

  return (
    <>
      <div
        className={cx('contextmenu-mask')}
        onContextMenu={(event) => { event.preventDefault(); removeContextmenu() }}
        onMouseDown={(event) => { if (event.button !== 0) return; removeContextmenu() }}
      />
      <div
        className={cx('contextmenu', props.className)}
        style={{
          left: style.left + 'px',
          top: style.top + 'px',
        }}
        onContextMenu={(event) => { event.preventDefault() }}
        onMouseDown={(event) => { event.stopPropagation() }}
        onPointerDown={(event) => { event.stopPropagation() }}
      >
        <MenuContent menus={menus} handleClickMenuItem={handleClickMenuItem} />
      </div>
    </>
  )
})

export default Contextmenu
