import { bindStyles } from '@/utils/cssm'
import styles from './Alpha.module.scss'
const cx = bindStyles(styles)
import type { CSSProperties, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';
import { useRef, useCallback, memo, useEffect } from 'react';

import Checkboard from './Checkboard';
import type { ColorFormats } from 'tinycolor2';
export type IAlphaProps = {
  value: ColorFormats.RGBA;
  className?: string;
  style?: CSSProperties;
  'data-tooltip'?: string;
} & {
  onColorChange?: (payload: ColorFormats.RGBA) => void;
};
const Alpha = memo((props: IAlphaProps) => {
  const color = props.value;
  const gradientColor = (() => {
    const rgbaStr = [color.r, color.g, color.b].join(',');
    return `linear-gradient(to right, rgba(${rgbaStr}, 0) 0%, rgba(${rgbaStr}, 1) 100%)`;
  })();
  const alphaRef = useRef<HTMLDivElement | null>(null);
  const handleChange = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    if (!alphaRef.current) return;
    const isTouchEvent = !(e instanceof MouseEvent);
    if (isTouchEvent && (!e.changedTouches || !e.changedTouches[0])) return;
    const startPageX = isTouchEvent ? e.changedTouches[0].pageX : e.pageX;
    const containerWidth = alphaRef.current.clientWidth;
    const xOffset = alphaRef.current.getBoundingClientRect().left + window.pageXOffset;
    const left = startPageX - xOffset;
    let a;
    if (left < 0) a = 0;else if (left > containerWidth) a = 1;else a = Math.round(left * 100 / containerWidth) / 100;
    if (color.a !== a) {
      props.onColorChange?.({
        r: color.r,
        g: color.g,
        b: color.b,
        a: a
      });
    }
  }, [alphaRef.current, alphaRef.current?.clientWidth, color?.a, props.onColorChange, color?.r, color?.g, color?.b]);
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
  return <><div className={cx("alpha", props.className)} style={props.style} data-tooltip={props['data-tooltip']}><div className={cx("alpha-checkboard-wrap")}><Checkboard /></div><div className={cx("alpha-gradient")} style={{
        background: gradientColor
      }} /><div className={cx("alpha-container")} ref={alphaRef} onMouseDown={($event) => {
        handleMouseDown($event);
      }} onTouchStart={($event) => {
        handleMouseDown($event);
      }}><div className={cx("alpha-pointer")} style={{
          left: color.a * 100 + '%'
        }}><div className={cx("alpha-picker")} /></div></div></div></>;
});
export default Alpha;
