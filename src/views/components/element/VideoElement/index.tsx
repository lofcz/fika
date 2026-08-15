import { bindStyles } from '@/utils/cssm'
import { createPortal } from 'react-dom'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo, type ReactNode } from 'react'

import { openContextmenu } from '@/utils/openContextmenu'
import { useMainStore } from '@/store'
import type { PPTVideoElement } from '@/types/slides'
import type { ContextmenuItem } from '@/components/Contextmenu/types'
import useMediaPoster from '@/hooks/useMediaPoster'
import useMediaPlayerTeleport from '@/hooks/useMediaPlayerTeleport'
import { queryFika } from '@/utils/portal'
import MediaPlayer from '@/views/components/element/MediaPlayer/index'

export type IVideoElementProps = {
  elementInfo: PPTVideoElement
  selectElement: (e: MouseEvent | TouchEvent, element: PPTVideoElement, canMove?: boolean) => void
  contextmenus: () => ContextmenuItem[] | null
}

function renderTeleported(teleportTo: HTMLElement | string, teleportDisabled: boolean, node: ReactNode) {
  if (teleportDisabled) return node
  const host = typeof teleportTo === 'string' ? queryFika(teleportTo) : teleportTo
  if (host) return createPortal(node, host)
  return node
}

const VideoElement = memo((props: IVideoElementProps) => {
  const { elementInfo, contextmenus } = props
  const canvasScale = useMainStore(s => s.canvasScale)
  const activeElementIdList = useMainStore(s => s.activeElementIdList)
  const isSelected = activeElementIdList.includes(props.elementInfo.id) && activeElementIdList.length === 1
  const { teleportTo, teleportDisabled } = useMediaPlayerTeleport(() => props.elementInfo.id, isSelected)
  const { persistPoster } = useMediaPoster(() => props.elementInfo)

  const handleSelectElement = useCallback((e: MouseEvent | TouchEvent, canMove = true) => {
    if (props.elementInfo.lock) return
    e.stopPropagation()
    props.selectElement(e, props.elementInfo, canMove)
  }, [props.elementInfo, props.selectElement])

  const player = (
    <MediaPlayer
      kind="video"
      width={elementInfo.width}
      height={elementInfo.height}
      src={elementInfo.src}
      poster={elementInfo.poster}
      scale={isSelected ? 1 : canvasScale}
      fillParent={isSelected}
      interactive={isSelected}
      onPoster={persistPoster}
    />
  )

  return (
    <div
      className={cx('editable-element-video', { lock: elementInfo.lock })}
      style={{
        top: elementInfo.top + 'px',
        left: elementInfo.left + 'px',
        width: elementInfo.width + 'px',
        height: elementInfo.height + 'px',
      }}
    >
      <div className={cx('rotate-wrapper')} style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
        <div
          className={cx('element-content')}
          data-live-box
          onContextMenu={event => {
            event.stopPropagation()
            event.preventDefault()
            openContextmenu(event, contextmenus)
          }}
          onMouseDown={$event => { handleSelectElement($event.nativeEvent, false) }}
          onTouchStart={$event => { handleSelectElement($event.nativeEvent, false) }}
        >
          {renderTeleported(teleportTo, teleportDisabled, player)}
        </div>
      </div>
    </div>
  )
})

export default VideoElement
