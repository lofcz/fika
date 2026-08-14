import { bindStyles } from '@/utils/cssm'
import styles from './ThumbnailElement.module.scss'
const cx = bindStyles(styles)
import { memo, lazy, createElement, Suspense, type ReactNode } from 'react'

import { ElementTypes, type PPTElement, type Slide, type SlideBackground } from '@/types/slides'
import BaseImageElement from '@/views/components/element/ImageElement/BaseImageElement'
import BaseTextElement from '@/views/components/element/TextElement/BaseTextElement'
import BaseShapeElement from '@/views/components/element/ShapeElement/BaseShapeElement'
import BaseLineElement from '@/views/components/element/LineElement/BaseLineElement'
import BaseChartElement from '@/views/components/element/ChartElement/BaseChartElement'
import BaseTableElement from '@/views/components/element/TableElement/BaseTableElement'
import BaseLatexElement from '@/views/components/element/LatexElement/BaseLatexElement'
import BaseVideoElement from '@/views/components/element/VideoElement/BaseVideoElement'
import BaseAudioElement from '@/views/components/element/AudioElement/BaseAudioElement'
import { CodeElementPlaceholder } from '@/views/components/element/CodeElement/CodeBlockSkeleton'

const BaseMermaidElement = lazy(() => import('@/views/components/element/MermaidElement/BaseMermaidElement'))
const BaseCodeElement = lazy(() => import('@/views/components/element/CodeElement/BaseCodeElement'))

export type IThumbnailElementProps = {
  elementInfo: PPTElement
  elementIndex: number
  slideId?: string
  slideType?: Slide['type']
  showPlaceholders?: boolean
  background?: SlideBackground
  themeBackgroundColor?: string
}

function areThumbnailElementPropsEqual(prev: IThumbnailElementProps, next: IThumbnailElementProps): boolean {
  return prev.elementInfo === next.elementInfo
    && prev.elementIndex === next.elementIndex
    && prev.slideId === next.slideId
    && prev.slideType === next.slideType
    && prev.showPlaceholders === next.showPlaceholders
    && prev.background === next.background
    && prev.themeBackgroundColor === next.themeBackgroundColor
}

function createThumbnailElementNode(props: IThumbnailElementProps): ReactNode {
  const {
    elementInfo,
    slideId,
    slideType,
    showPlaceholders,
    background,
    themeBackgroundColor,
  } = props

  switch (elementInfo.type) {
    case ElementTypes.IMAGE:
      return createElement(BaseImageElement, { elementInfo })
    case ElementTypes.TEXT:
      return createElement(BaseTextElement, {
        elementInfo,
        target: 'thumbnail',
        slideType,
        showPlaceholders,
        background,
        themeBackgroundColor,
      })
    case ElementTypes.SHAPE:
      return createElement(BaseShapeElement, { elementInfo })
    case ElementTypes.LINE:
      return createElement(BaseLineElement, { elementInfo })
    case ElementTypes.CHART:
      return createElement(BaseChartElement, {
        elementInfo,
        target: 'thumbnail',
        background,
        themeBackgroundColor,
      })
    case ElementTypes.TABLE:
      return createElement(BaseTableElement, { elementInfo })
    case ElementTypes.LATEX:
      return createElement(BaseLatexElement, { elementInfo })
    case ElementTypes.MERMAID:
      return createElement(BaseMermaidElement, { elementInfo })
    case ElementTypes.CODE:
      return createElement(BaseCodeElement, { elementInfo })
    case ElementTypes.VIDEO:
      return createElement(BaseVideoElement, { elementInfo, slideId })
    case ElementTypes.AUDIO:
      return createElement(BaseAudioElement, { elementInfo, slideId })
    default:
      return null
  }
}

const ThumbnailElement = memo((props: IThumbnailElementProps) => {
  const { elementInfo, elementIndex } = props
  const isAsyncElement = elementInfo.type === ElementTypes.MERMAID || elementInfo.type === ElementTypes.CODE
  const elementNode = createThumbnailElementNode(props)

  return (
    <div
      className={cx('base-element', `base-element-${elementInfo.id}`)}
      style={{ zIndex: elementIndex }}
    >
      {elementNode ? (isAsyncElement ? (
        <Suspense fallback={elementInfo.type === ElementTypes.CODE ? <CodeElementPlaceholder elementInfo={elementInfo} /> : null}>
          {elementNode}
        </Suspense>
      ) : elementNode) : null}
    </div>
  )
}, areThumbnailElementPropsEqual)

ThumbnailElement.displayName = 'ThumbnailElement'

export default ThumbnailElement
