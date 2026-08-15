import { bindStyles } from '@/utils/cssm'
import { createPortal } from 'react-dom'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo, type ReactNode } from 'react'

import { openContextmenu } from '@/utils/openContextmenu'
import { useMainStore, useSlidesStore } from '@/store'
import type { PPTAudioElement } from '@/types/slides'
import type { ContextmenuItem } from '@/components/Contextmenu/types'
import { isCompactAudioBox } from '@/utils/mediaLayout'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useMediaPoster from '@/hooks/useMediaPoster'
import useMediaPlayerTeleport from '@/hooks/useMediaPlayerTeleport'
import { queryFika } from '@/utils/portal'
import MediaPlayer from '@/views/components/element/MediaPlayer/index'

export type IAudioElementProps = {
  elementInfo: PPTAudioElement
  selectElement: (e: MouseEvent | TouchEvent, element: PPTAudioElement, canMove?: boolean) => void
  contextmenus: () => ContextmenuItem[] | null
}

function renderTeleported(teleportTo: HTMLElement | string, teleportDisabled: boolean, node: ReactNode) {
  if (teleportDisabled) return node
  const host = typeof teleportTo === 'string' ? queryFika(teleportTo) : teleportTo
  if (host) return createPortal(node, host)
  return node
}

const AudioElement = memo((props: IAudioElementProps) => {
  const { elementInfo, contextmenus } = props
  const updateElement = useSlidesStore(s => s.updateElement)
  const canvasScale = useMainStore(s => s.canvasScale)
  const activeElementIdList = useMainStore(s => s.activeElementIdList)
  const { addHistorySnapshot } = useHistorySnapshot()
  const isSelected = activeElementIdList.includes(props.elementInfo.id) && activeElementIdList.length === 1
  const isCompact = isCompactAudioBox(props.elementInfo.width, props.elementInfo.height)
  const { teleportTo, teleportDisabled } = useMediaPlayerTeleport(() => props.elementInfo.id, isSelected)
  const { synthesizing, displayPoster, persistPoster } = useMediaPoster(() => props.elementInfo)

  const onLoopChange = useCallback((value: boolean) => {
    updateElement({
      id: props.elementInfo.id,
      props: { loop: value },
    })
    addHistorySnapshot()
  }, [updateElement, props.elementInfo.id, addHistorySnapshot])

  const handleSelectElement = useCallback((e: MouseEvent | TouchEvent, canMove = true) => {
    if (props.elementInfo.lock) return
    e.stopPropagation()
    props.selectElement(e, props.elementInfo, canMove)
  }, [props.elementInfo, props.selectElement])

  const player = (
    <MediaPlayer
      kind="audio"
      width={elementInfo.width}
      height={elementInfo.height}
      src={elementInfo.src}
      poster={displayPoster}
      loop={elementInfo.loop}
      color={elementInfo.color}
      compact={isCompact}
      docked={isCompact && isSelected}
      scale={isSelected ? 1 : canvasScale}
      fillParent={isSelected}
      interactive={isSelected}
      synthesizing={synthesizing}
      onUpdateLoop={onLoopChange}
      onPoster={persistPoster}
    />
  )

  return (
    <div
      className={cx('editable-element-audio', { lock: elementInfo.lock })}
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

export default AudioElement
