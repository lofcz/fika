import { bindStyles } from '@/utils/cssm'
import styles from './EditableInput.module.scss'
const cx = bindStyles(styles)
import type { CSSProperties, FormEvent } from 'react';
import { useCallback, memo } from 'react';

import tinycolor, { type ColorFormats } from 'tinycolor2';
export type IEditableInputProps = {
  value: ColorFormats.RGBA;
  className?: string;
  style?: CSSProperties;
  'data-tooltip'?: string;
} & {
  onColorChange?: (payload: ColorFormats.RGBA) => void;
};
const EditableInput = memo((props: IEditableInputProps) => {
  const val = (() => {
    let _hex = '';
    if (props.value.a < 1) _hex = tinycolor(props.value).toHex8String().toUpperCase();else _hex = tinycolor(props.value).toHexString().toUpperCase();
    return _hex.replace('#', '');
  })();
  const handleInput = useCallback((e: FormEvent<HTMLInputElement>) => {
    const value = (e.target as HTMLInputElement).value;
    if (value.length >= 6) {
      const color = tinycolor(value);
      if (color.isValid()) {
        props.onColorChange?.(color.toRgb());
      }
    }
  }, [props.onColorChange]);
  return <><div className={cx("editable-input", props.className)} style={props.style} data-tooltip={props['data-tooltip']}><input className={cx("input-content")} value={val} onInput={($event) => {
        handleInput($event);
      }} /></div></>;
});
export default EditableInput;
