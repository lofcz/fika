import { bindStyles } from '@/utils/cssm'
import styles from './MenuContent.module.scss'
const cx = bindStyles(styles)
import { memo, useEffect, useRef } from 'react'

import Tooltip from '@/directive/tooltip'
import type { ContextmenuItem } from './types'

export type IMenuContentProps = {
  menus: ContextmenuItem[]
  handleClickMenuItem: (item: ContextmenuItem) => void
  className?: string
}

const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const htmlTooltip = (value?: string) => ({
  content: value ? `<span class="contextmenu-tooltip">${escapeHtml(value)}</span>` : '',
  placement: 'right' as const,
  delay: [400, 0] as [number, number],
})

const TooltipText = memo(({ text, className }: { text?: string; className: string }) => {
  const ref = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const binding = { value: htmlTooltip(text) }
    Tooltip.mounted(el, binding)
    return () => Tooltip.unmounted(el)
  }, [text])
  return <span ref={ref} className={className}>{text}</span>
})

const MenuContent = memo((props: IMenuContentProps) => {
  const { menus, handleClickMenuItem } = props

  return (
    <ul className={cx('menu-content', props.className)}>
      {menus.map((menu, index) => !menu.hide ? (
        <li
          className={cx('menu-item', {
            divider: menu.divider,
            disable: menu.disable,
          })}
          onClick={(event) => { event.stopPropagation(); handleClickMenuItem(menu) }}
          key={menu.text || index}
        >
          {!menu.divider ? (
            <div className={cx('menu-item-content', {
              'has-children': menu.children,
              'has-handler': menu.handler,
            })}>
              <TooltipText text={menu.text} className={cx('text')} />
              {menu.subText && !menu.children ? (
                <TooltipText text={menu.subText} className={cx('sub-text')} />
              ) : null}
              {menu.children && menu.children.length ? (
                <MenuContent
                  className={cx('sub-menu')}
                  menus={menu.children}
                  handleClickMenuItem={handleClickMenuItem}
                />
              ) : null}
            </div>
          ) : null}
        </li>
      ) : null)}
    </ul>
  )
})

export default MenuContent
