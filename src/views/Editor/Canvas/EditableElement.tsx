import { bindStyles } from '@/utils/cssm'
import styles from './EditableElement.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo, lazy, Suspense, createElement, type CSSProperties, type ComponentType } from 'react'

import { ElementTypes, type PPTElement } from '@/types/slides'
import useElementContextmenu from '@/hooks/useElementContextmenu'
import ImageElement from '@/views/components/element/ImageElement/index'
import TextElement from '@/views/components/element/TextElement/index'
import ShapeElement from '@/views/components/element/ShapeElement/index'
import LineElement from '@/views/components/element/LineElement/index'
import ChartElement from '@/views/components/element/ChartElement/index'
import TableElement from '@/views/components/element/TableElement/index'
import LatexElement from '@/views/components/element/LatexElement/index'
import VideoElement from '@/views/components/element/VideoElement/index'
import AudioElement from '@/views/components/element/AudioElement/index'
import { areEditableElementPropsEqual } from './EditableElement.equal'
import { CodeElementPlaceholder } from '@/views/components/element/CodeElement/CodeBlockSkeleton'

const MermaidElement = lazy(() => import('@/views/components/element/MermaidElement/index'))
const CodeElement = lazy(() => import('@/views/components/element/CodeElement/index'))

const elementTypeMap = {
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

export type IEditableElementProps = {
  elementInfo: PPTElement
  elementIndex: number
  isMultiSelect: boolean
  isEditing?: boolean
  selectElement: (e: MouseEvent | TouchEvent, element: PPTElement, canMove?: boolean) => void
  openLinkDialog: () => void
  style?: CSSProperties
}

const EditableElement = memo((props: IEditableElementProps) => {
  const { elementInfo, elementIndex, isMultiSelect, isEditing, selectElement, openLinkDialog, style } = props
  const currentElementComponent = elementTypeMap[elementInfo.type] || null
  const { contextmenus: contextmenusFor } = useElementContextmenu(openLinkDialog)
  const contextmenus = useCallback(() => contextmenusFor(elementInfo, isMultiSelect), [contextmenusFor, elementInfo, isMultiSelect])

  return (
    <div className={cx('editable-element', { 'is-editing': isEditing })} id={`editable-element-${elementInfo.id}`} data-element-type={elementInfo.type} style={{ zIndex: elementIndex, ...style }}>
      {currentElementComponent ? (
        <Suspense fallback={elementInfo.type === ElementTypes.CODE ? <CodeElementPlaceholder elementInfo={elementInfo} /> : null}>
          {createElement(currentElementComponent as ComponentType<any>, {
            elementInfo,
            selectElement,
            contextmenus,
            ...((elementInfo.type === 'text' || elementInfo.type === 'shape' || elementInfo.type === 'table') ? { isEditing } : {}),
          })}
        </Suspense>
      ) : null}
    </div>
  )
}, areEditableElementPropsEqual)

EditableElement.displayName = 'EditableElement'

export default EditableElement
