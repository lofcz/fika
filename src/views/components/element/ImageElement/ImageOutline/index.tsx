import { memo } from 'react'

import type { PPTImageElement } from '@/types/slides'
import useClipImage from '../useClipImage'
import ImageRectOutline from './ImageRectOutline'
import ImageEllipseOutline from './ImageEllipseOutline'
import ImagePolygonOutline from './ImagePolygonOutline'

export type IImageOutlineProps = {
  elementInfo: PPTImageElement
}

const ImageOutline = memo((props: IImageOutlineProps) => {
  const { elementInfo } = props
  const { clipShape } = useClipImage(props.elementInfo)

  return (
    <div className="image-outline">
      {clipShape.type === 'rect' ? (
        <ImageRectOutline
          width={elementInfo.width}
          height={elementInfo.height}
          radius={clipShape.radius}
          outline={elementInfo.outline}
        />
      ) : clipShape.type === 'ellipse' ? (
        <ImageEllipseOutline
          width={elementInfo.width}
          height={elementInfo.height}
          outline={elementInfo.outline}
        />
      ) : clipShape.type === 'polygon' ? (
        <ImagePolygonOutline
          width={elementInfo.width}
          height={elementInfo.height}
          outline={elementInfo.outline}
          createPath={clipShape.createPath!}
        />
      ) : null}
    </div>
  )
})

export default ImageOutline
