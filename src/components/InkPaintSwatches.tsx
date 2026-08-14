import { bindStyles } from '@/utils/cssm'
import styles from './InkPaintSwatches.module.scss'
const cx = bindStyles(styles)
import type { CSSProperties } from 'react'
import { memo } from 'react';

import { INK_SOLID_SWATCHES, MAGICAL_INK_GRADIENTS, isLightColor, paintFromPreset, samePaint, solidPaint, type InkPaint } from '@/configs/inkPaint';
import { useI18nContext } from '@/i18n/useI18nContext';
export type IInkPaintSwatchesProps = {
  paint: InkPaint;
  solids?: string[];
  variant?: 'round' | 'square';
  className?: string;
  style?: CSSProperties;
  'data-tooltip'?: string;
} & {
  onUpdatePaint?: (payload: InkPaint) => void;
};
const InkPaintSwatches = memo((props: IInkPaintSwatchesProps) => {
  const { paint, solids = INK_SOLID_SWATCHES, variant = 'round' } = props
  const {
    LL
  } = useI18nContext();
  const titles = ({
    rainbow: LL.configs.inkGradients.rainbow(),
    sunset: LL.configs.inkGradients.sunset(),
    aurora: LL.configs.inkGradients.aurora(),
    holographic: LL.configs.inkGradients.holographic()
  });
  return <><div className={cx('ink-paint-swatches', `is-${variant}`, props.className)} style={props.style} data-tooltip={props['data-tooltip']}>{solids.map(color => <button key={color} type='button' className={cx('swatch', {
        'active': samePaint(paint, solidPaint(color)),
        'light': isLightColor(color)
      })} style={{
        backgroundColor: color
      }} title={color} onMouseDown={(event) => { event.preventDefault() }} onClick={() => {
        props.onUpdatePaint?.(solidPaint(color));
      }} />)}<span className={cx("divider")} aria-hidden />{MAGICAL_INK_GRADIENTS.map(preset => <button key={preset.id} type='button' className={cx('swatch magical', {
        'active': paint.gradientId === preset.id
      })} style={{
        backgroundImage: preset.css
      }} title={titles[preset.id]} onMouseDown={(event) => { event.preventDefault() }} onClick={() => {
        props.onUpdatePaint?.(paintFromPreset(preset));
      }} />)}</div></>;
});
export default InkPaintSwatches;
