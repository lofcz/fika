import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMainStore, useSlidesStore, selectCurrentSlide, selectHandleElement } from '@/store'
import type { PPTElement } from '@/types/slides'
import type { AlignmentLineProps } from '@/types/edit'
import type { Mode } from '@/types/mobile'
import useSlideBackgroundStyle from '@/hooks/useSlideBackgroundStyle'
import useDragElement from '@/views/Editor/Canvas/hooks/useDragElement'
import useScaleElement from '@/views/Editor/Canvas/hooks/useScaleElement'
import useRotateElement from '@/views/Editor/Canvas/hooks/useRotateElement'
import useOperateChrome from '@/views/Editor/Canvas/hooks/useOperateChrome'
import AlignmentLine from '@/views/Editor/Canvas/AlignmentLine'
import MobileEditableElement from './MobileEditableElement'
import MobileOperate from './MobileOperate'
import SlideToolbar from './SlideToolbar'
import ElementToolbar from './ElementToolbar'
import Header from './Header'

export type IMobileEditorProps = {
  changeMode: (mode: Mode) => void
}

export default function MobileEditor({ changeMode }: IMobileEditorProps) {
  const slideIndex = useSlidesStore(s => s.slideIndex)
  const currentSlide = useSlidesStore(selectCurrentSlide)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const viewportSize = useSlidesStore(s => s.viewportSize)
  const updateSlideIndex = useSlidesStore(s => s.updateSlideIndex)
  const activeElementIdList = useMainStore(s => s.activeElementIdList)
  const handleElement = useMainStore(selectHandleElement)
  const setActiveElementIdList = useMainStore(s => s.setActiveElementIdList)
  const setHandleElementId = useMainStore(s => s.setHandleElementId)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [alignmentLines, setAlignmentLines] = useState<AlignmentLineProps[]>([])
  const [canvasScale, setCanvasScale] = useState(1)
  const background = currentSlide?.background
  const { backgroundStyle } = useSlideBackgroundStyle(background)
  const { operateLineColor, operateLineHalo } = useOperateChrome()

  useLayoutEffect(() => {
    const measure = () => {
      if (!contentRef.current) return
      const contentWidth = contentRef.current.clientWidth
      const contentheight = contentRef.current.clientHeight
      const contentRatio = contentheight / contentWidth
      if (contentRatio >= viewportRatio) setCanvasScale((contentWidth - 20) / viewportSize)
      else setCanvasScale((contentheight - 20) / viewportRatio / viewportSize)
    }
    measure()
    const observer = contentRef.current ? new ResizeObserver(measure) : null
    if (contentRef.current && observer) observer.observe(contentRef.current)
    return () => observer?.disconnect()
  }, [viewportRatio, viewportSize])

  useEffect(() => {
    if (activeElementIdList.length) setActiveElementIdList([])
    if (slideIndex !== 0) updateSlideIndex(0)
  }, [])

  const viewportStyles = {
    width: viewportSize * canvasScale + 'px',
    height: viewportSize * viewportRatio * canvasScale + 'px',
  }

  const [elementList, setElementList] = useState<PPTElement[]>([])
  useEffect(() => {
    setElementList(currentSlide ? JSON.parse(JSON.stringify(currentSlide.elements)) : [])
  }, [currentSlide])

  const { dragElement } = useDragElement(elementList, setElementList, alignmentLines, setAlignmentLines, canvasScale)
  const { scaleElement } = useScaleElement(elementList, setElementList, canvasScale)
  const { rotateElement } = useRotateElement(elementList, setElementList, viewportRef, canvasScale)

  const selectElement = (e: TouchEvent, element: PPTElement, startMove = true) => {
    if (!activeElementIdList.includes(element.id)) {
      setActiveElementIdList([element.id])
      setHandleElementId(element.id)
    }
    if (startMove) dragElement(e, element)
  }

  const handleClickBlankArea = () => {
    setActiveElementIdList([])
  }

  return (
    <div className={cx('mobile-editor')}>
      <Header changeMode={changeMode} />
      <div className={cx('content')} ref={contentRef} onTouchStart={handleClickBlankArea}>
        <div
          className={cx('viewport-wrapper')}
          style={{
            ...viewportStyles,
            ['--operate-line' as string]: operateLineColor,
            ['--operate-line-halo' as string]: operateLineHalo,
          }}
        >
          <div className={cx('background')} style={backgroundStyle} />
          {alignmentLines.map((line, index) => (
            <AlignmentLine
              key={index}
              type={line.type}
              axis={line.axis}
              length={line.length}
              kind={line.kind}
              marks={line.marks}
              label={line.label}
              canvasScale={canvasScale}
            />
          ))}
          {elementList.map(element => (
            element.type !== 'line' ? (
              <MobileOperate
                key={element.id}
                elementInfo={element}
                isSelected={activeElementIdList.includes(element.id)}
                canvasScale={canvasScale}
                scaleElement={scaleElement}
                rotateElement={rotateElement}
              />
            ) : null
          ))}
          <div className={cx('viewport')} ref={viewportRef} style={{ transform: `scale(${canvasScale})` }}>
            {elementList.map((element, index) => (
              <MobileEditableElement
                key={element.id}
                elementInfo={element}
                elementIndex={index + 1}
                selectElement={selectElement}
              />
            ))}
          </div>
        </div>
      </div>
      <SlideToolbar />
      {handleElement ? <ElementToolbar /> : null}
    </div>
  )
}
