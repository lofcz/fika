import { FastAverageColor } from 'fast-average-color';
import type { PPTElement, PPTImageElement, Slide } from '@/types/slides';
import { getElementRange } from '@/utils/element';
import type { ImagePaintCache, ImageRegionPaint } from '@/utils/textContrast';
interface CanvasRange {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
interface Viewport {
  width: number;
  height: number;
}
const FAC_OPTS = {
  algorithm: 'sqrt' as const,
  mode: 'speed' as const,
  step: 8,
  silent: true
};
const isTextTarget = (el: PPTElement): boolean => {
  if (el.type === 'text' || el.type === 'latex') return true;
  return el.type === 'shape' && !!el.text?.content;
};
const intersect = (a: CanvasRange, b: CanvasRange): CanvasRange | null => {
  const minX = Math.max(a.minX, b.minX);
  const maxX = Math.min(a.maxX, b.maxX);
  const minY = Math.max(a.minY, b.minY);
  const maxY = Math.min(a.maxY, b.maxY);
  if (minX >= maxX || minY >= maxY) return null;
  return {
    minX,
    maxX,
    minY,
    maxY
  };
};
const clampCrop = (left: number, top: number, width: number, height: number, naturalWidth: number, naturalHeight: number): {
  left: number;
  top: number;
  width: number;
  height: number;
} | null => {
  const x = Math.min(Math.max(0, Math.floor(left)), Math.max(0, naturalWidth - 1));
  const y = Math.min(Math.max(0, Math.floor(top)), Math.max(0, naturalHeight - 1));
  const w = Math.max(1, Math.min(Math.ceil(width), naturalWidth - x));
  const h = Math.max(1, Math.min(Math.ceil(height), naturalHeight - y));
  if (w < 1 || h < 1) return null;
  return {
    left: x,
    top: y,
    width: w,
    height: h
  };
};

/** Map a canvas overlap onto the image's natural pixels, honoring clip + flip. */
export const canvasRegionToImagePixels = (el: PPTImageElement, region: CanvasRange, naturalWidth: number, naturalHeight: number): {
  left: number;
  top: number;
  width: number;
  height: number;
} | null => {
  const boxW = el.width;
  const boxH = el.height;
  if (boxW <= 0 || boxH <= 0 || naturalWidth <= 0 || naturalHeight <= 0) return null;
  const clip = el.clip?.range;
  const srcX0 = clip ? clip[0][0] / 100 * naturalWidth : 0;
  const srcY0 = clip ? clip[0][1] / 100 * naturalHeight : 0;
  const srcX1 = clip ? clip[1][0] / 100 * naturalWidth : naturalWidth;
  const srcY1 = clip ? clip[1][1] / 100 * naturalHeight : naturalHeight;
  const srcW = srcX1 - srcX0;
  const srcH = srcY1 - srcY0;
  if (srcW <= 0 || srcH <= 0) return null;
  const lx0 = Math.max(0, region.minX - el.left);
  const ly0 = Math.max(0, region.minY - el.top);
  const lx1 = Math.min(boxW, region.maxX - el.left);
  const ly1 = Math.min(boxH, region.maxY - el.top);
  if (lx1 <= lx0 || ly1 <= ly0) return null;
  let u0 = lx0 / boxW;
  let v0 = ly0 / boxH;
  let u1 = lx1 / boxW;
  let v1 = ly1 / boxH;
  if (el.flipH) {
    const nu0 = 1 - u1;
    const nu1 = 1 - u0;
    u0 = nu0;
    u1 = nu1;
  }
  if (el.flipV) {
    const nv0 = 1 - v1;
    const nv1 = 1 - v0;
    v0 = nv0;
    v1 = nv1;
  }
  return clampCrop(srcX0 + u0 * srcW, srcY0 + v0 * srcH, (u1 - u0) * srcW, (v1 - v0) * srcH, naturalWidth, naturalHeight);
};

/** Map a canvas overlap onto a cover-fitted slide background image. */
export const canvasRegionToCoverPixels = (region: CanvasRange, viewport: Viewport, naturalWidth: number, naturalHeight: number): {
  left: number;
  top: number;
  width: number;
  height: number;
} | null => {
  if (viewport.width <= 0 || viewport.height <= 0 || naturalWidth <= 0 || naturalHeight <= 0) return null;
  const scale = Math.max(viewport.width / naturalWidth, viewport.height / naturalHeight);
  const displayedW = naturalWidth * scale;
  const displayedH = naturalHeight * scale;
  const offsetX = (viewport.width - displayedW) / 2;
  const offsetY = (viewport.height - displayedH) / 2;
  return clampCrop((region.minX - offsetX) / scale, (region.minY - offsetY) / scale, (region.maxX - region.minX) / scale, (region.maxY - region.minY) / scale, naturalWidth, naturalHeight);
};
const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('image load failed'));
  img.src = src;
});
const regionKey = (id: string, r: CanvasRange) => `${id}:${Math.round(r.minX)}:${Math.round(r.minY)}:${Math.round(r.maxX)}:${Math.round(r.maxY)}`;
const usableSrc = (src?: string): src is string => !!src && src !== 'x' && src !== 'x.png';

/**
 * Sample average colors for image layers that actually sit under text.
 * Browser-only (`Image` + canvas). Returns `undefined` when there is nothing
 * to sample or the environment can't decode images — the contrast query then
 * keeps treating those layers as `unknown`.
 */
export const sampleImagePaintsForSlide = async (slide: Slide, viewport: Viewport): Promise<ImagePaintCache | undefined> => {
  if (typeof Image === 'undefined') return undefined;
  const elements = slide.elements;
  type Job = {
    key: string;
    src: string;
    canvas: CanvasRange;
    kind: 'element' | 'slide';
    element?: PPTImageElement;
  };
  const jobs: Job[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < elements.length; i++) {
    const target = elements[i];
    if (!isTextTarget(target)) continue;
    const textRange = getElementRange(target);
    for (let j = i - 1; j >= 0; j--) {
      const under = elements[j];
      if (under.type !== 'image' || !usableSrc(under.src)) continue;
      const overlap = intersect(textRange, getElementRange(under));
      if (!overlap) continue;
      const key = regionKey(under.id, overlap);
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push({
        key,
        src: under.src,
        canvas: overlap,
        kind: 'element',
        element: under
      });
    }
  }
  const bgSrc = slide.background?.type === 'image' ? slide.background.image?.src : undefined;
  if (usableSrc(bgSrc)) {
    for (const el of elements) {
      if (!isTextTarget(el)) continue;
      const canvas = getElementRange(el);
      const key = regionKey('__slidebg__', canvas);
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push({
        key,
        src: bgSrc,
        canvas,
        kind: 'slide'
      });
    }
  }
  if (!jobs.length) return undefined;
  const srcs = [...new Set(jobs.map(j => j.src))];
  const loaded = new Map<string, HTMLImageElement>();
  await Promise.all(srcs.map(async src => {
    try {
      loaded.set(src, await loadImage(src));
    } catch {}
  }));
  if (!loaded.size) return undefined;
  const fac = new FastAverageColor();
  const byElementId = new Map<string, ImageRegionPaint[]>();
  const slideBackground: ImageRegionPaint[] = [];
  try {
    for (const job of jobs) {
      const img = loaded.get(job.src);
      if (!img) continue;
      const nw = img.naturalWidth || img.width;
      const nh = img.naturalHeight || img.height;
      const crop = job.kind === 'element' && job.element ? canvasRegionToImagePixels(job.element, job.canvas, nw, nh) : canvasRegionToCoverPixels(job.canvas, viewport, nw, nh);
      if (!crop) continue;
      try {
        const result = fac.getColor(img, {
          ...FAC_OPTS,
          ...crop
        });
        if (result.error || !result.hex) continue;
        const paint: ImageRegionPaint = {
          ...job.canvas,
          hex: result.hex
        };
        if (job.kind === 'slide') slideBackground.push(paint);else if (job.element) {
          const list = byElementId.get(job.element.id) || [];
          list.push(paint);
          byElementId.set(job.element.id, list);
        }
      } catch {}
    }
  } finally {
    fac.destroy();
  }
  if (!byElementId.size && !slideBackground.length) return undefined;
  return {
    byElementId,
    slideBackground: slideBackground.length ? slideBackground : undefined
  };
};
