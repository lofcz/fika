
import type { PPTShapeElement } from '@/types/slides';
export default (element: PPTShapeElement, source: string) => {
  const fill = (() => {
    if (element.pattern) return `url(#${source}-pattern-${element.id})`;
    if (element.gradient) return `url(#${source}-gradient-${element.id})`;
    return element.fill || 'none';
  })();
  return {
    fill
  };
};
