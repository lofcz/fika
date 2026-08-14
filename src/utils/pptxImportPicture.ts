import type { ImageClipDataRange, ImageElementClip } from '@/types/slides';

/**
 * pptxtojson emits a `p:pic` as `type: 'image'` only when it has no preset/custom
 * geometry. PowerPoint always writes `<a:prstGeom prst="rect"/>` on pictures, so
 * almost every photo arrives as `type: 'shape'` with `fill.type === 'image'`.
 * Importing that as an SVG pattern (200×200 viewBox, then non-uniform scale)
 * stretches the bitmap. Map picture-like shapes back to image elements instead.
 */

export const PPTX_IMAGE_CLIP_SHAPES = ['rect', 'snip1Rect', 'snip2DiagRect', 'roundRect', 'ellipse', 'triangle', 'rtTriangle', 'diamond', 'pentagon', 'hexagon', 'heptagon', 'octagon', 'chevron', 'homePlate', 'rightArrow', 'parallelogram', 'trapezoid'] as const;
export type PptxSrcRect = {
  t?: number;
  b?: number;
  l?: number;
  r?: number;
};
export type PptxPictureSource = {
  src: string;
  geom: string;
  rect?: PptxSrcRect;
  isFlipH?: boolean;
  isFlipV?: boolean;
  rotate?: number;
  link?: string;
  borderWidth?: number;
};
type PptxPictureLike = {
  type?: string;
  base64?: string;
  geom?: string;
  rect?: PptxSrcRect;
  shapType?: string;
  isFlipH?: boolean;
  isFlipV?: boolean;
  rotate?: number;
  borderWidth?: number;
  link?: string;
  fill?: {
    type?: string;
    value?: string | {
      base64?: string;
      rect?: PptxSrcRect;
    };
  };
};
export function isPptxConnectorShape(shapType?: string): boolean {
  if (!shapType) return false;
  return shapType === 'line' || /straightConnector/.test(shapType) || /bentConnector/.test(shapType) || /curvedConnector/.test(shapType);
}
export function pptxPictureSource(el: unknown): PptxPictureSource | null {
  if (!el || typeof el !== 'object') return null;
  const item = el as PptxPictureLike;
  if (item.type === 'image' && item.base64) {
    return {
      src: item.base64,
      geom: item.geom || 'rect',
      rect: item.rect,
      isFlipH: item.isFlipH,
      isFlipV: item.isFlipV,
      rotate: item.rotate,
      link: item.link,
      borderWidth: item.borderWidth
    };
  }
  const imageFill = item.fill?.type === 'image' && item.fill.value && typeof item.fill.value === 'object' ? item.fill.value : undefined;
  if (item.type === 'shape' && !isPptxConnectorShape(item.shapType) && imageFill?.base64 && pptxPictureShapeCanBeImage(item.shapType)) {
    return {
      src: imageFill.base64,
      geom: item.shapType || 'rect',
      rect: imageFill.rect,
      isFlipH: item.isFlipH,
      isFlipV: item.isFlipV,
      rotate: item.rotate,
      link: item.link,
      borderWidth: item.borderWidth
    };
  }
  return null;
}

/** Preset picture frames (rect / ellipse / roundRect / …) become image clips. Custom paths stay shapes. */
export function pptxPictureShapeCanBeImage(shapType?: string): boolean {
  if (!shapType) return true;
  const geom = shapType.startsWith('custom:') ? shapType.slice('custom:'.length) : shapType;
  if (geom === 'custom') return false;
  return (PPTX_IMAGE_CLIP_SHAPES as readonly string[]).includes(geom);
}
export function pptxImageClip(geom: string, rect?: PptxSrcRect): ImageElementClip | undefined {
  let shape = geom.includes('custom:') ? geom.replace('custom:', '') : geom;
  if (!(PPTX_IMAGE_CLIP_SHAPES as readonly string[]).includes(shape)) shape = 'rect';
  if (rect) {
    const range: ImageClipDataRange = [[rect.l || 0, rect.t || 0], [100 - (rect.r || 0), 100 - (rect.b || 0)]];
    return {
      shape,
      range
    };
  }
  if (shape !== 'rect') {
    return {
      shape,
      range: [[0, 0], [100, 100]]
    };
  }
  return undefined;
}
