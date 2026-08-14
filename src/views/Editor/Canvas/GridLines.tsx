import { bindStyles } from '@/utils/cssm'
import styles from './GridLines.module.scss'
const cx = bindStyles(styles)
import { memo, useMemo } from 'react'

import { useMainStore, useSlidesStore } from '@/store'
import { FINE_GRID_SIZE } from '@/utils/snap'

export type IGridLinesProps = {
  size?: number
  ephemeral?: boolean
}

const GridLines = memo(({ size, ephemeral = false }: IGridLinesProps) => {
  const canvasScale = useMainStore(s => s.canvasScale)
  const storedSize = useMainStore(s => s.gridLineSize)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const viewportSize = useSlidesStore(s => s.viewportSize)
  const gridLineSize = size || storedSize

  const { path, majorPath } = useMemo(() => {
    if (!gridLineSize) return { path: '', majorPath: '' }
    const maxX = viewportSize
    const maxY = viewportSize * viewportRatio
    let minor = ''
    let major = ''
    const majorEvery = gridLineSize === FINE_GRID_SIZE ? 4 : 1
    for (let i = 0; i <= Math.floor(maxY / gridLineSize); i++) {
      const line = `M0 ${i * gridLineSize} L${maxX} ${i * gridLineSize} `
      if (majorEvery === 1 || i % majorEvery === 0) major += line
      else minor += line
    }
    for (let i = 0; i <= Math.floor(maxX / gridLineSize); i++) {
      const line = `M${i * gridLineSize} 0 L${i * gridLineSize} ${maxY} `
      if (majorEvery === 1 || i % majorEvery === 0) major += line
      else minor += line
    }
    return { path: minor, majorPath: major }
  }, [viewportSize, viewportRatio, gridLineSize])

  if (!gridLineSize) return null

  return (
    <svg className={cx('grid-lines', ephemeral && 'ephemeral')}>
      <g style={{ transform: `scale(${canvasScale})` }}>
        {path ? <path className={cx('minor')} d={path} /> : null}
        {majorPath ? <path className={cx('major')} d={majorPath} /> : null}
      </g>
    </svg>
  )
})

export default GridLines
