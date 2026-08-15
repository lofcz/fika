import { memo, useLayoutEffect, useRef } from 'react';
import type { GradientColor, GradientType } from '@/types/slides';
import { syncGradientDef } from '@/utils/liveElementPaint';

export type IGradientDefsProps = {
  id: string;
  type: GradientType;
  colors: GradientColor[];
  rotate?: number;
};

const GradientDefs = memo((props: IGradientDefsProps) => {
  const { id, type, colors, rotate = 0 } = props
  const defRef = useRef<SVGLinearGradientElement | SVGRadialGradientElement | null>(null)

  useLayoutEffect(() => {
    const def = defRef.current
    if (!def) return
    syncGradientDef(def, { colors, rotate })
  }, [type, colors, rotate])

  return type === 'linear'
    ? <linearGradient ref={defRef} id={id} x1="0%" y1="0%" x2="100%" y2="0%" />
    : <radialGradient ref={defRef} id={id} />
});
export default GradientDefs;
