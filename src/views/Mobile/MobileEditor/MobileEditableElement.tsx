import { lazy, createElement, Suspense, type ComponentType } from 'react'
import { ElementTypes, type PPTElement } from '@/types/slides'
import { CodeElementPlaceholder } from '@/views/components/element/CodeElement/CodeBlockSkeleton'
import ImageElement from '@/views/components/element/ImageElement/index'
import TextElement from '@/views/components/element/TextElement/index'
import ShapeElement from '@/views/components/element/ShapeElement/index'
import LineElement from '@/views/components/element/LineElement/index'
import ChartElement from '@/views/components/element/ChartElement/index'
import TableElement from '@/views/components/element/TableElement/index'
import LatexElement from '@/views/components/element/LatexElement/index'
import VideoElement from '@/views/components/element/VideoElement/index'
import AudioElement from '@/views/components/element/AudioElement/index'

const MermaidElement = lazy(() => import('@/views/components/element/MermaidElement/index'))
const CodeElement = lazy(() => import('@/views/components/element/CodeElement/index'))

export type IMobileEditableElementProps = {
  elementInfo: PPTElement
  elementIndex: number
  selectElement: (e: TouchEvent, element: PPTElement, canMove?: boolean) => void
}

export default function MobileEditableElement({
  elementInfo,
  elementIndex,
  selectElement,
}: IMobileEditableElementProps) {
  const elementTypeMap: Record<string, ComponentType<any>> = {
    [ElementTypes.IMAGE]: ImageElement,
    [ElementTypes.TEXT]: TextElement,
    [ElementTypes.SHAPE]: ShapeElement,
    [ElementTypes.LINE]: LineElement,
    [ElementTypes.CHART]: ChartElement,
    [ElementTypes.TABLE]: TableElement,
    [ElementTypes.LATEX]: LatexElement,
    [ElementTypes.MERMAID]: MermaidElement,
    [ElementTypes.CODE]: CodeElement,
    [ElementTypes.VIDEO]: VideoElement,
    [ElementTypes.AUDIO]: AudioElement,
  }
  const currentElementComponent = elementTypeMap[elementInfo.type] || null

  return (
    <div className="mobile-editable-element" style={{ zIndex: elementIndex }}>
      {currentElementComponent ? (
        <Suspense fallback={elementInfo.type === ElementTypes.CODE ? <CodeElementPlaceholder elementInfo={elementInfo} /> : null}>
          {createElement(currentElementComponent, { elementInfo, selectElement, contextmenus: () => null })}
        </Suspense>
      ) : null}
    </div>
  )
}
