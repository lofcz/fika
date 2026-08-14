import { bindStyles } from '@/utils/cssm'
import styles from './LaserColorSwatches.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import { LASER_COLOR_IDS, LASER_COLORS, type LaserColorId } from '@/configs/laser'
import { useI18nContext } from '@/i18n/useI18nContext'

export type ILaserColorSwatchesProps = {
  laserColor: LaserColorId
  toggleLaserColor: (color: LaserColorId) => void
  layout?: 'row' | 'grid'
}

const LaserColorSwatches = memo((props: ILaserColorSwatchesProps) => {
  const { laserColor, toggleLaserColor, layout = 'row' } = props
  const { LL } = useI18nContext()
  const titles = {
    red: LL.screen.baseView.tooltip.laserRed(),
    green: LL.screen.baseView.tooltip.laserGreen(),
    blue: LL.screen.baseView.tooltip.laserBlue(),
    purple: LL.screen.baseView.tooltip.laserPurple(),
  }
  return (
    <div className={cx('laser-swatches', layout)}>
      {LASER_COLOR_IDS.map(id => (
        <button
          key={id}
          type="button"
          className={cx('laser-swatch', { on: laserColor === id })}
          style={{ backgroundColor: LASER_COLORS[id].hex }}
          data-tooltip={titles[id]}
          onClick={event => { event.stopPropagation(); toggleLaserColor(id) }}
        />
      ))}
    </div>
  )
})

export default LaserColorSwatches
