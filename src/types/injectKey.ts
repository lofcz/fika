import { createContext } from 'react';
export type SlideScale = number;
export type SlideId = string;
export type RadioGroupValue = {
  value: string;
  updateValue: (value: string) => void;
};
export const SlideScaleContext = createContext<SlideScale>(1);
export const SlideIdContext = createContext<SlideId>('');
/**
 * True while the slide tree is rendered only to be rasterized (thumbnail
 * stage). Elements that gate on "is the current slide" (media players) still
 * render — paused — so captures match the editor canvas.
 */
export const SlideCaptureContext = createContext<boolean>(false);
export const RadioGroupValueContext = createContext<RadioGroupValue | null>(null);

export const injectKeySlideScale = SlideScaleContext
export const injectKeySlideId = SlideIdContext
export const injectKeyRadioGroupValue = RadioGroupValueContext
