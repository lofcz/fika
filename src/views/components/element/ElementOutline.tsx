import { bindStyles } from '@/utils/cssm'
import styles from './ElementOutline.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react';

import type { PPTElementOutline } from '@/types/slides';
import useElementOutline from '@/views/components/element/hooks/useElementOutline';
import { resolveOutlineRadiusPx } from '@/utils/elementOutline';
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
  if (!outline) return null;
  const radius = resolveOutlineRadiusPx(outline.radius, width, height);
  return (
    <svg className={cx('element-outline')} overflow="visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height="100%">
      <rect
        vectorEffect="non-scaling-stroke"
        strokeLinecap="butt"
        strokeMiterlimit={8}
        fill="transparent"
        x={0}
        y={0}
        width={width}
        height={height}
        rx={radius}
        ry={radius}
        stroke={outlineColor}
        strokeWidth={outlineWidth}
        strokeDasharray={strokeDashArray}
      />
    </svg>
  );
});
export default ElementOutline;
