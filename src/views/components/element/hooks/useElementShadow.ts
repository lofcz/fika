
import type { PPTElementShadow } from '@/types/slides';

export default (shadow?: PPTElementShadow | null) => {
  const shadowStyle = (() => {
    if (shadow) {
      const {
        h,
        v,
        blur,
        color
      } = shadow;
      return `${h}px ${v}px ${blur}px ${color}`;
    }
    return '';
  })();
  return {
    shadowStyle
  };
};
