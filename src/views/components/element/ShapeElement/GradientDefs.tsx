import { memo } from 'react';
import type { GradientColor, GradientType } from '@/types/slides';
export type IGradientDefsProps = {
  id: string;
  type: GradientType;
  colors: GradientColor[];
  rotate?: number;
};
const GradientDefs = memo((props: IGradientDefsProps) => {
  const { id, type, colors, rotate = 0 } = props
  return type === 'linear'
    ? <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%" gradientTransform={`rotate(${rotate},0.5,0.5)`}>{colors.map((item, index) => <stop key={index} offset={`${item.pos}%`} stopColor={item.color} />)}</linearGradient>
    : <radialGradient id={id}>{colors.map((item, index) => <stop key={index} offset={`${item.pos}%`} stopColor={item.color} />)}</radialGradient>
});
export default GradientDefs;
