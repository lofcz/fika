import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Pin, PinOff, X } from 'lucide-react'
import { useI18nContext } from '@/i18n/useI18nContext'
import { bindStyles } from '@/utils/cssm'
import styles from './drawer.module.scss'
const cx = bindStyles(styles)

/** Resizable dock; unpinned drawers overlay the stage without resizing the design. */
export default function MynaDrawer({ id, side = 'left', title, onClose, children }: {
  id: string; side?: 'left' | 'right'; title: string; onClose: () => void; children: ReactNode
}) {
  const { LL } = useI18nContext()
  const initialWidth = side === 'left' ? 300 : 292
  const storageKey = `fika:myna:drawer:${side}`
  const [preference, setPreference] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      return { width: Math.min(440, Math.max(240, Number(saved?.width) || initialWidth)), pinned: saved?.pinned !== false }
    } catch { return { width: initialWidth, pinned: true } }
  })
  const drag = useRef<{ x: number; width: number } | null>(null)
  const update = (next: typeof preference) => {
    setPreference(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Layout remains usable without storage. */ }
  }
  return <aside id={id} aria-label={title} className={cx('drawer', side, { floating: !preference.pinned })} style={{ '--drawer-width': `${preference.width}px` } as CSSProperties} onKeyDown={event => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.stopPropagation(); onClose()
      document.querySelector<HTMLButtonElement>(`button[aria-controls="${id}"][aria-pressed="true"]`)?.focus()
    }
  }}>
    <div className={cx('heading')}><strong>{title}</strong><div>
      <button aria-label={preference.pinned ? LL.myna.unpinDrawer() : LL.myna.pinDrawer()} title={preference.pinned ? LL.myna.unpinDrawer() : LL.myna.pinDrawer()} aria-pressed={preference.pinned} onClick={() => update({ ...preference, pinned: !preference.pinned })}>{preference.pinned ? <Pin size={15} /> : <PinOff size={15} />}</button>
      <button aria-label={side === 'left' ? LL.myna.closeLibrary() : LL.myna.closeProperties()} onClick={onClose}><X size={17} /></button>
    </div></div>
    <div className={cx('content')}>{children}</div>
    <div className={cx('resize')} role="separator" tabIndex={0} aria-label={LL.myna.resizeDrawer()} aria-orientation="vertical" aria-valuemin={240} aria-valuemax={440} aria-valuenow={preference.width}
      onDoubleClick={() => update({ ...preference, width: initialWidth })}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const delta = (event.key === 'ArrowRight' ? 16 : -16) * (side === 'left' ? 1 : -1)
        const width = event.key === 'Home' ? 240 : event.key === 'End' ? 440 : Math.min(440, Math.max(240, preference.width + delta))
        update({ ...preference, width })
      }}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); drag.current = { x: event.clientX, width: preference.width }; event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={event => { if (!drag.current) return; const width = Math.min(440, Math.max(240, drag.current.width + (event.clientX - drag.current.x) * (side === 'left' ? 1 : -1))); update({ ...preference, width }) }}
      onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
      onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }} />
  </aside>
}
