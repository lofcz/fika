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
  return new Promise((resolve, reject) => {
    const portalTarget = getFikaPortalTarget();
    const img = document.createElement('img');
    img.style.opacity = '0';
    portalTarget.appendChild(img);
    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
      img.remove();
    };
    img.onload = () => {
      const imgWidth = img.clientWidth;
      const imgHeight = img.clientHeight;
      cleanup();
      resolve({
        width: imgWidth,
        height: imgHeight
      });
    };
    img.onerror = () => {
      cleanup();
      reject(new Error('Unable to load image'));
    };
    img.src = src;
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
