import { bindStyles } from '@/utils/cssm'
import styles from './ElementOutline.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react';

import type { PPTElementOutline } from '@/types/slides';
import useElementOutline, { useOutlinePath } from '@/views/components/element/hooks/useElementOutline';
export type IElementOutlineProps = {
  width: number;
  height: number;
  outline?: PPTElementOutline;
};
const ElementOutline = memo((props: IElementOutlineProps) => {
  const { width, height, outline } = props;
  const {
    outlineWidth,
    outlineColor,
    strokeDashArray
  } = useElementOutline(outline);
  const outlinePath = useOutlinePath(outline, width, height);
  if (!outline) return null;
  return <svg className={cx('element-outline')} overflow='visible' viewBox={`0 0 ${width} ${height}`} preserveAspectRatio='none' width='100%' height='100%'><path vectorEffect='non-scaling-stroke' strokeLinecap='butt' strokeMiterlimit='8' fill='transparent' d={outlinePath} stroke={outlineColor} strokeWidth={outlineWidth} strokeDasharray={strokeDashArray} /></svg>;
});
export default ElementOutline;
