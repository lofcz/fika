/**
 * Geometry of a skeleton slide (`Slide.skeleton`): grey blocks standing in for
 * a title, a few lines of body and a picture panel. Fractions of the slide
 * box so the same shapes paint on the rail thumbnail, the live canvas and an
 * offscreen `renderSlide`.
 */
export type SlideSkeletonBlock = {
  x: number
  y: number
  w: number
  h: number
}

export const SLIDE_SKELETON_BLOCKS: readonly SlideSkeletonBlock[] = [
  { x: 0.06, y: 0.11, w: 0.44, h: 0.10 },
  { x: 0.06, y: 0.30, w: 0.46, h: 0.05 },
  { x: 0.06, y: 0.39, w: 0.41, h: 0.05 },
  { x: 0.06, y: 0.48, w: 0.44, h: 0.05 },
  { x: 0.06, y: 0.57, w: 0.30, h: 0.05 },
  { x: 0.58, y: 0.28, w: 0.36, h: 0.46 },
]

/** Block fill; kept translucent so a themed slide background still reads through. */
export const SLIDE_SKELETON_FILL = 'rgba(30, 41, 59, 0.09)'

/** Corner radius as a fraction of the slide width. */
export const SLIDE_SKELETON_RADIUS = 0.008
