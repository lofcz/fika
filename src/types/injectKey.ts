import { createContext } from 'react';
export type SlideScale = number;
export type SlideId = string;
export type RadioGroupValue = {
  value: string;
  updateValue: (value: string) => void;
};
export const SlideScaleContext = createContext<SlideScale>(1);
export const SlideIdContext = createContext<SlideId>('');
export const RadioGroupValueContext = createContext<RadioGroupValue | null>(null);

export const injectKeySlideScale = SlideScaleContext
export const injectKeySlideId = SlideIdContext
export const injectKeyRadioGroupValue = RadioGroupValueContext
