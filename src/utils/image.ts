import { getFikaPortalTarget } from '@/utils/portal';
interface ImageSize {
  width: number;
  height: number;
}

/**
 * Get the intrinsic width and height of an image.
 * @param src Image URL
 */
export const getImageSize = (src: string): Promise<ImageSize> => {
  return new Promise(resolve => {
    const portalTarget = getFikaPortalTarget();
    const img = document.createElement('img');
    img.src = src;
    img.style.opacity = '0';
    portalTarget.appendChild(img);
    img.onload = () => {
      const imgWidth = img.clientWidth;
      const imgHeight = img.clientHeight;
      img.onload = null;
      img.onerror = null;
      portalTarget.removeChild(img);
      resolve({
        width: imgWidth,
        height: imgHeight
      });
    };
    img.onerror = () => {
      img.onload = null;
      img.onerror = null;
    };
  });
};

/**
 * Read an image file as a data URL.
 * @param file Image file
 */
export const getImageDataURL = (file: File): Promise<string> => {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(reader.result as string);
    });
    reader.readAsDataURL(file);
  });
};

/**
 * Check whether a string is SVG markup.
 * @param text Text to validate
 */
export const isSVGString = (text: string): boolean => {
  const svgRegex = /<svg[\s\S]*?>[\s\S]*?<\/svg>/i;
  if (!svgRegex.test(text)) return false;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'image/svg+xml');
    return doc.documentElement.nodeName === 'svg';
  } catch {
    return false;
  }
};

/**
 * Convert SVG markup to a File.
 * @param svg SVG markup
 */
export const svg2File = (svg: string): File => {
  const blob = new Blob([svg], {
    type: 'image/svg+xml'
  });
  return new File([blob], `${Date.now()}.svg`, {
    type: 'image/svg+xml'
  });
};
