import { bindStyles } from '@/utils/cssm'
import styles from './Saturation.module.scss'
const cx = bindStyles(styles)
import type { CSSProperties, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';
import { useRef, useMemo, useCallback, memo, useEffect } from 'react';

import tinycolor, { type ColorFormats } from 'tinycolor2';
import { throttle } from '@/utils/debounce';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export type ISaturationProps = {
  value: ColorFormats.RGBA;
  hue: number;
  className?: string;
  style?: CSSProperties;
  'data-tooltip'?: string;
} & {
  onColorChange?: (payload: ColorFormats.HSVA) => void;
};
const Saturation = memo((props: ISaturationProps) => {
  const color = (() => {
    const hsva = tinycolor(props.value).toHsv();
    if (props.hue !== -1) hsva.h = props.hue;
    return hsva;
  })();
  const bgColor = `hsl(${color.h}, 100%, 50%)`;
  const pointerTop = -(color.v * 100) + 1 + 100 + '%';
  const pointerLeft = color.s * 100 + '%';
  const emitChangeEvent = useMemo(() => throttle(function (param: ColorFormats.HSVA) {
    props.onColorChange?.(param);
  }, 20, {
    leading: true,
    trailing: false
  }), [props.onColorChange]);
  const saturationRef = useRef<HTMLDivElement | null>(null);
  const handleChange = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    if (!saturationRef.current) return;
    const isTouchEvent = !(e instanceof MouseEvent);
    if (isTouchEvent && (!e.changedTouches || !e.changedTouches[0])) return;
    const startPageX = isTouchEvent ? e.changedTouches[0].pageX : e.pageX;
    const startPageY = isTouchEvent ? e.changedTouches[0].pageY : e.pageY;
    const containerWidth = saturationRef.current.clientWidth;
    const containerHeight = saturationRef.current.clientHeight;
    const xOffset = saturationRef.current.getBoundingClientRect().left + window.pageXOffset;
    const yOffset = saturationRef.current.getBoundingClientRect().top + window.pageYOffset;
    const left = clamp(startPageX - xOffset, 0, containerWidth);
    const top = clamp(startPageY - yOffset, 0, containerHeight);
    const saturation = left / containerWidth;
    const bright = clamp(-(top / containerHeight) + 1, 0, 1);
    emitChangeEvent({
      h: color.h,
      s: saturation,
      v: bright,
      a: color.a
    });
  }, [saturationRef.current, saturationRef.current?.clientWidth, saturationRef.current?.clientHeight, emitChangeEvent, color?.h, color?.a]);
  const unbindEventListeners = useCallback(() => {
    window.removeEventListener('mousemove', handleChange);
    window.removeEventListener('touchmove', handleChange);
    window.removeEventListener('mouseup', unbindEventListeners);
    window.removeEventListener('touchend', unbindEventListeners);
  }, [handleChange]);
  const handleMouseDown = useCallback((e: ReactMouseEvent | ReactTouchEvent) => {
    handleChange(e.nativeEvent);
    window.addEventListener('mousemove', handleChange);
    window.addEventListener('touchmove', handleChange);
    window.addEventListener('mouseup', unbindEventListeners);
    window.addEventListener('touchend', unbindEventListeners);
  }, [handleChange, unbindEventListeners]);
  useEffect(() => () => { (unbindEventListeners)() }, []);
  return <><div className={cx("saturation", props.className)} ref={saturationRef} style={{
      background: bgColor,
      ...props.style
    }} data-tooltip={props['data-tooltip']} onMouseDown={($event) => {
      handleMouseDown($event);
    }} onTouchStart={($event) => {
      handleMouseDown($event);
    }}><div className={cx("saturation-white")} /><div className={cx("saturation-black")} /><div className={cx("saturation-pointer")} style={{
        top: pointerTop,
        left: pointerLeft
      }}><div className={cx("saturation-circle")} /></div></div></>;
});
export default Saturation;
