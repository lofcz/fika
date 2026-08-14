import { bindStyles } from '@/utils/cssm'
import styles from './AudienceView.module.scss'
const cx = bindStyles(styles)
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Slide } from '@/types/slides'
import { useSlidesStore } from '@/store'
import { isLaserColorId, type LaserColorId } from '@/configs/laser'
import useExecPlay from './hooks/useExecPlay'
import useSlideSize from './hooks/useSlideSize'
import LaserTrailOverlay from './LaserTrailOverlay'
import ScreenSlideList from './ScreenSlideList'

export default function AudienceView() {
  const setViewportSize = useSlidesStore(s => s.setViewportSize)
  const setViewportRatio = useSlidesStore(s => s.setViewportRatio)
  const setSlides = useSlidesStore(s => s.setSlides)
  const { slideWidth, slideHeight } = useSlideSize()
  const {
    execNext,
    execPrev,
    turnSlideToIndex,
    turnSlideToId,
    animationIndex,
    setAnimationIndex,
    restoreAnimationState,
  } = useExecPlay()

  const [writingBoardVisible, setWritingBoardVisible] = useState(false)
  const [writingBoardBlackboard, setWritingBoardBlackboard] = useState(false)
  const [writingBoardDataURL, setWritingBoardDataURL] = useState('')
  const [laserPenVisible, setLaserPenVisible] = useState(false)
  const [laserPenColor, setLaserPenColor] = useState<LaserColorId>('red')
  const [laserPenX, setLaserPenX] = useState(0)
  const [laserPenY, setLaserPenY] = useState(0)

  const playRef = useRef({
    execNext,
    execPrev,
    turnSlideToIndex,
    turnSlideToId,
    setAnimationIndex,
    restoreAnimationState,
    setViewportSize,
    setViewportRatio,
    setSlides,
  })
  playRef.current = {
    execNext,
    execPrev,
    turnSlideToIndex,
    turnSlideToId,
    setAnimationIndex,
    restoreAnimationState,
    setViewportSize,
    setViewportRatio,
    setSlides,
  }

  const syncChannelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    const syncChannel = new BroadcastChannel('fika-audience-sync')
    syncChannelRef.current = syncChannel
    syncChannel.postMessage({ type: 'REQUEST_STATE' })
    syncChannel.postMessage({ type: 'REQUEST_WRITING_BOARD' })

    syncChannel.onmessage = ({ data }) => {
      const play = playRef.current
      const msg = data as {
        type: string
        index?: number
        id?: string
        slideIndex?: number
        animationIndex?: number
        viewportSize?: number
        viewportRatio?: number
        slides?: Slide[]
        dataURL?: string
        blackboard?: boolean
        x?: number
        y?: number
        color?: string
      }
      if (msg.type === 'EXEC_NEXT') play.execNext()
      else if (msg.type === 'EXEC_PREV') play.execPrev()
      else if (msg.type === 'TURN_TO_INDEX' && msg.index !== undefined) play.turnSlideToIndex(msg.index)
      else if (msg.type === 'TURN_TO_ID' && msg.id !== undefined) play.turnSlideToId(msg.id)
      else if (msg.type === 'INIT_STATE' && msg.slideIndex !== undefined) {
        flushSync(() => {
          if (msg.viewportSize !== undefined) play.setViewportSize(msg.viewportSize)
          if (msg.viewportRatio !== undefined) play.setViewportRatio(msg.viewportRatio)
          if (msg.slides) play.setSlides(msg.slides)
          play.turnSlideToIndex(msg.slideIndex)
          if (msg.animationIndex !== undefined) {
            play.setAnimationIndex(msg.animationIndex)
          }
        })
        if (msg.animationIndex !== undefined) {
          play.restoreAnimationState(msg.animationIndex)
        }
      }
      else if (msg.type === 'WRITING_BOARD_UPDATE') {
        setWritingBoardVisible(true)
        setWritingBoardDataURL(msg.dataURL || '')
        setWritingBoardBlackboard(msg.blackboard || false)
      }
      else if (msg.type === 'WRITING_BOARD_CLOSE') {
        setWritingBoardVisible(false)
        setWritingBoardDataURL('')
      }
      else if (msg.type === 'LASER_PEN_MOVE' && msg.x !== undefined && msg.y !== undefined) {
        setLaserPenVisible(true)
        setLaserPenX(msg.x)
        setLaserPenY(msg.y)
        if (isLaserColorId(msg.color)) setLaserPenColor(msg.color)
      }
      else if (msg.type === 'LASER_PEN_OFF') {
        setLaserPenVisible(false)
      }
      else if (msg.type === 'EXIT') {
        window.close()
      }
    }

    return () => {
      syncChannel.close()
      syncChannelRef.current = null
    }
  }, [])

  return (
    <div className={cx('audience-view')}>
      <ScreenSlideList
        slideWidth={slideWidth}
        slideHeight={slideHeight}
        animationIndex={animationIndex}
        turnSlideToId={turnSlideToId}
        manualExitFullscreen={() => {}}
      />
      {writingBoardVisible ? (
        <div className={cx('writing-board-overlay')}>
          <div
            className={cx('writing-board-content')}
            style={{
              width: slideWidth + 'px',
              height: slideHeight + 'px',
            }}
          >
            {writingBoardBlackboard ? <div className={cx('blackboard')} /> : null}
            {writingBoardDataURL ? <img src={writingBoardDataURL} /> : null}
          </div>
        </div>
      ) : null}
      <LaserTrailOverlay
        active={laserPenVisible}
        color={laserPenColor}
        remoteX={laserPenX}
        remoteY={laserPenY}
        slideWidth={slideWidth}
        slideHeight={slideHeight}
      />
    </div>
  )
}
