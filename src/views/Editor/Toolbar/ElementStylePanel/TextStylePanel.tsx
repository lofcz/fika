import { memo } from 'react'
import TextStyleContent from '../common/TextStyleContent'
import ElementOpacity from '../common/ElementOpacity'
import ElementOutline from '../common/ElementOutline'
import ElementShadow from '../common/ElementShadow'

const TextStylePanel = memo(function TextStylePanel() {
  return (
    <>
      <TextStyleContent />
      <ElementOutline />
      <ElementShadow />
      <ElementOpacity />
    </>
  )
})

export default TextStylePanel
