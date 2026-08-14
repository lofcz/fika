
import { CLIPPATHS, ClipPathTypes } from '@/configs/imageClip';
import type { PPTImageElement } from '@/types/slides';
export default (element: any) => {
  const clipShape = (() => {
    let _clipShape = CLIPPATHS.rect;
    if (element.clip) {
      const shape = element.clip.shape || ClipPathTypes.RECT;
      _clipShape = CLIPPATHS[shape];
    }
    if (_clipShape.radius !== undefined && element.radius) {
      _clipShape = {
        ..._clipShape,
        radius: `${element.radius}px`,
        style: `inset(0 round ${element.radius}px)`
      };
    }
    return _clipShape;
  })();
  const imgPosition = (() => {
    if (!element.clip) {
      return {
        top: '0',
        left: '0',
        width: '100%',
        height: '100%'
      };
    }
    const [start, end] = element.clip.range;
    const widthScale = (end[0] - start[0]) / 100;
    const heightScale = (end[1] - start[1]) / 100;
    const left = start[0] / widthScale;
    const top = start[1] / heightScale;
    return {
      left: -left + '%',
      top: -top + '%',
      width: 100 / widthScale + '%',
      height: 100 / heightScale + '%'
    };
  })();
  return {
    clipShape,
    imgPosition
  };
};
