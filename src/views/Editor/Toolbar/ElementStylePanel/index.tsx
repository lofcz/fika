import { memo, type ComponentType } from 'react'

import { ElementTypes } from '@/types/slides'
import { useHandleElementType } from '../common/handleElement'
import { useKeepAlive } from '../common/panelSwitch'
import TextStylePanel from './TextStylePanel'
import ImageStylePanel from './ImageStylePanel'
import ShapeStylePanel from './ShapeStylePanel'
import LineStylePanel from './LineStylePanel'
import ChartStylePanel from './ChartStylePanel/index'
import TableStylePanel from './TableStylePanel'
import LatexStylePanel from './LatexStylePanel'
import CodeStylePanel from './CodeStylePanel'
import VideoStylePanel from './VideoStylePanel'
import AudioStylePanel from './AudioStylePanel'

const panelMap: Partial<Record<ElementTypes, ComponentType>> = {
  [ElementTypes.TEXT]: TextStylePanel,
  [ElementTypes.IMAGE]: ImageStylePanel,
  [ElementTypes.SHAPE]: ShapeStylePanel,
  [ElementTypes.LINE]: LineStylePanel,
  [ElementTypes.CHART]: ChartStylePanel,
  [ElementTypes.TABLE]: TableStylePanel,
  [ElementTypes.LATEX]: LatexStylePanel,
  [ElementTypes.CODE]: CodeStylePanel,
  [ElementTypes.VIDEO]: VideoStylePanel,
  [ElementTypes.AUDIO]: AudioStylePanel,
}

const ElementStylePanel = memo(() => {
  const handleElementType = useHandleElementType()
  const mountedTypes = useKeepAlive(handleElementType && panelMap[handleElementType] ? handleElementType : null)

  return (
    <div className="element-style-panel">
      {mountedTypes.map(type => {
        const Panel = panelMap[type]
        if (!Panel) return null
        return (
          <div key={type} hidden={type !== handleElementType}>
            <Panel />
          </div>
        )
      })}
    </div>
  )
})

export default ElementStylePanel
