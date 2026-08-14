import { bindStyles } from '@/utils/cssm'
import styles from './Checkboard.module.scss'
const cx = bindStyles(styles)
import type { CSSProperties } from 'react';
import { useMemo, memo } from 'react';

export type ICheckboardProps = {
  size?: number;
  white?: string;
  grey?: string;
  className?: string;
  style?: CSSProperties;
  'data-tooltip'?: string;
};
const Checkboard = memo((vrProps: ICheckboardProps) => {
  const props = useMemo<Readonly<{
    size?: number;
    white?: string;
    grey?: string;
  }>>(() => ({
    ...vrProps,
    size: vrProps.size ?? 8,
    white: vrProps.white ?? '#fff',
    grey: vrProps.grey ?? '#e6e6e6'
  }), [vrProps.size, vrProps.white, vrProps.grey]);
  ;
  const { size, white, grey } = props;
  const checkboardCache: Record<string, string | null> = {};
  const renderCheckboard = (white: string, grey: string, size: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = white;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = grey;
    ctx.fillRect(0, 0, size, size);
    ctx.translate(size, size);
    ctx.fillRect(0, 0, size, size);
    return canvas.toDataURL();
  };
  const getCheckboard = (white: string, grey: string, size: number) => {
    const key = white + ',' + grey + ',' + size;
    if (checkboardCache[key]) return checkboardCache[key];
    const checkboard = renderCheckboard(white, grey, size);
    checkboardCache[key] = checkboard;
    return checkboard;
  };
  const bgStyle = (() => {
    const checkboard = getCheckboard(props.white, props.grey, props.size);
    return {
      backgroundImage: `url(${checkboard})`
    };
  })();
  return <><div className={cx("checkerboard", vrProps.className)} style={{ ...bgStyle, ...vrProps.style }} data-tooltip={vrProps['data-tooltip']} /></>;
});
export default Checkboard;
