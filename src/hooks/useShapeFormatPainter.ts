import { useMainStore, selectHandleElement } from '@/store';
import type { PPTShapeElement } from '@/types/slides';
export default () => {
  const shapeFormatPainter = useMainStore(s => s.shapeFormatPainter);
  const handleElement = useMainStore(selectHandleElement);
  const setShapeFormatPainter = useMainStore(s => s.setShapeFormatPainter);
  const toggleShapeFormatPainter = (keep = false) => {
    const _handleElement = handleElement as PPTShapeElement;
    if (shapeFormatPainter) setShapeFormatPainter(null);else {
      setShapeFormatPainter({
        keep,
        fill: _handleElement.fill,
        gradient: _handleElement.gradient,
        outline: _handleElement.outline,
        opacity: _handleElement.opacity,
        shadow: _handleElement.shadow
      });
    }
  };
  return {
    toggleShapeFormatPainter
  };
};
