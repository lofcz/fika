import { bindStyles } from '@/utils/cssm'
import styles from './LayerStackPanel.module.scss'
const cx = bindStyles(styles)
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { Icon, type IconName } from '@/components/Icon'
import type { LayerStackEntry } from '@/utils/layerStack'
import { useI18nContext } from '@/i18n/useI18nContext'

const TYPE_ICONS: Record<string, IconName> = {
  text: 'type',
  image: 'image',
  shape: 'shapes',
  line: 'spline',
  chart: 'chart-pie',
  table: 'table',
  video: 'video',
  audio: 'volume-2',
  latex: 'radical',
  mermaid: 'git-branch',
  code: 'code',
}

const ANCHOR_GAP = 14
const EDGE_PAD = 8

const htmlSnippet = (html?: string) => {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

const entryText = (entry: LayerStackEntry) => {
  const element = entry.element
  if (element.type === 'text') return htmlSnippet(element.content)
  if (element.type === 'shape') return htmlSnippet(element.text?.content)
  return ''
}

export type ILayerStackPanelProps = {
  /** Canvas-root-relative anchor of the probed point, in px. */
  anchor: { x: number; y: number }
  entries: LayerStackEntry[]
  activeIndex: number
  onPick: (index: number) => void
  onClose: () => void
}

const LayerStackPanel = memo((props: ILayerStackPanelProps) => {
  const { LL } = useI18nContext()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [placed, setPlaced] = useState({ left: props.anchor.x + ANCHOR_GAP, top: props.anchor.y + ANCHOR_GAP })

  const onCloseRef = useRef(props.onClose)
  onCloseRef.current = props.onClose

  useLayoutEffect(() => {
    const panel = panelRef.current
    const host = panel?.parentElement
    if (!panel || !host) return
    let left = props.anchor.x + ANCHOR_GAP
    let top = props.anchor.y + ANCHOR_GAP
    const maxLeft = host.clientWidth - panel.offsetWidth - EDGE_PAD
    const maxTop = host.clientHeight - panel.offsetHeight - EDGE_PAD
    if (left > maxLeft) left = Math.max(EDGE_PAD, props.anchor.x - panel.offsetWidth - ANCHOR_GAP)
    if (top > maxTop) top = Math.max(EDGE_PAD, maxTop)
    setPlaced({ left, top })
  }, [props.anchor.x, props.anchor.y, props.entries])

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      // Alt-clicks are cycle gestures — the canvas handler updates or closes us.
      if (e.altKey) return
      const panel = panelRef.current
      if (panel && e.target instanceof Node && panel.contains(e.target)) return
      onCloseRef.current()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [])

  const typeLabel = (type: string) => {
    const types = LL.editor.elementTypes
    const labels: Record<string, () => string> = {
      text: types.text,
      image: types.image,
      shape: types.shape,
      line: types.line,
      chart: types.chart,
      table: types.table,
      video: types.video,
      audio: types.audio,
      latex: types.latex,
      mermaid: types.mermaid,
      code: types.code,
    }
    return labels[type]?.() ?? type
  }

  const entryLabel = (entry: LayerStackEntry) => {
    if (entry.groupId) return `${LL.editor.selectPanel.group()} · ${entry.groupSize}`
    return entry.element.name || entryText(entry) || typeLabel(entry.element.type)
  }

  const entryIcon = (entry: LayerStackEntry): IconName => {
    if (entry.groupId) return 'group'
    return TYPE_ICONS[entry.element.type] ?? 'shapes'
  }

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.nativeEvent.stopPropagation()
  }

  return (
    <>
      <span className={cx('anchor-dot')} style={{ left: props.anchor.x + 'px', top: props.anchor.y + 'px' }} />
      <div
        ref={panelRef}
        className={cx('layer-stack')}
        data-layer-stack=""
        style={{ left: placed.left + 'px', top: placed.top + 'px' }}
        onMouseDown={stop}
      >
        <div className={cx('head')}>
          <span className={cx('kicker')}>{LL.canvas.layerStack.title()}</span>
          <span className={cx('count')}>{props.entries.length}</span>
        </div>
        <div className={cx('rows')}>
          {props.entries.map((entry, index) => (
            <button
              key={entry.element.id}
              type="button"
              disabled={entry.locked}
              className={cx('row', { active: index === props.activeIndex, locked: entry.locked })}
              onClick={() => props.onPick(index)}
            >
              <span className={cx('glyph')} aria-hidden={true}>
                <Icon icon={entryIcon(entry)} />
              </span>
              <span className={cx('label')}>{entryLabel(entry)}</span>
              {entry.locked ? <Icon icon="lock" className={cx('lock')} /> : null}
            </button>
          ))}
        </div>
        <div className={cx('hint')}>{LL.canvas.layerStack.hint()}</div>
      </div>
    </>
  )
})

LayerStackPanel.displayName = 'LayerStackPanel'

export default LayerStackPanel
