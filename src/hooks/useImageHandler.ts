import { useMainStore, useSlidesStore, selectHandleElement } from '@/store';
import type { PPTImageElement } from '@/types/slides';
import { getImageDataURL, getImageSize } from '@/utils/image';
import { internMediaSrc } from '@/utils/mediaIntern';
import useHistorySnapshot from '@/hooks/useHistorySnapshot';
export default () => {
  const handleElement = useMainStore(selectHandleElement);
  const handleElementId = useMainStore(s => s.handleElementId);
  const updateElement = useSlidesStore(s => s.updateElement);
  const removeElementProps = useSlidesStore(s => s.removeElementProps);
  const handleImageElement = handleElement as any;
  const {
    addHistorySnapshot
  } = useHistorySnapshot();
  const replaceImage = (files: FileList) => {
    const imageFile = files[0];
    const imageElement = handleImageElement;
    const imageElementId = handleElementId;
    if (!imageFile || !imageElement || imageElement.type !== 'image' || !imageElementId) return;
    getImageDataURL(imageFile).then(dataURL => {
      // Warm the render alias, but persist the data URL: blob: URLs die with
      // the session and must never enter the document.
      void internMediaSrc(dataURL);
      const originWidth = imageElement.width;
      const originHeight = imageElement.height;
      const originLeft = imageElement.left;
      const originTop = imageElement.top;
      const centerX = originLeft + originWidth / 2;
      const centerY = originTop + originHeight / 2;
      getImageSize(dataURL).then(({
        width,
        height
      }) => {
        const h = originHeight;
        const w = width * (originHeight / height);
        const l = centerX - w / 2;
        const t = centerY - h / 2;
        const clip = imageElement.clip;
        if (clip && clip.shape !== 'rect') {
          updateElement({
            id: imageElementId,
            props: {
              src: dataURL,
              width: w,
              height: h,
              left: l,
              top: t,
              clip: {
                ...clip,
                range: [[0, 0], [100, 100]]
              }
            }
          });
        } else {
          removeElementProps({
            id: imageElementId,
            propName: 'clip'
          });
          updateElement({
            id: imageElementId,
            props: {
              src: dataURL,
              width: w,
              height: h,
              left: l,
              top: t
            }
          });
        }
        addHistorySnapshot();
      });
    });
  };
  return {
    replaceImage
  };
};
