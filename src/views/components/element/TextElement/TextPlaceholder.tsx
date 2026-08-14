import { bindStyles } from '@/utils/cssm'
import styles from './TextPlaceholder.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo, type MouseEvent as ReactMouseEvent } from 'react';

import type { TextAlign, TextAlignVertical, TextInset, TextType } from '@/types/slides';
export type ITextPlaceholderProps = {
  label: string;
  contentType: TextType;
  color: string;
  fontSize?: number;
  align?: TextAlign;
  vAlign?: TextAlignVertical;
  inset?: TextInset;
  preview?: boolean;
  /** Stay mounted; CSS-hide while the live editor is up (visibility, not remount). */
  hidden?: boolean;
} & {
  onActivate?: (payload: ReactMouseEvent) => void;
};
const TextPlaceholder = memo((vrProps: ITextPlaceholderProps) => {
  const {
    label,
    contentType,
    color,
    fontSize,
    align = 'center',
    vAlign = 'middle',
    inset = [10, 10, 10, 10],
    preview = false,
    hidden = false,
    onActivate: onActivateProp
  } = vrProps;
  const showBullet = contentType === 'content' || contentType === 'item';
  const padLeft = `${inset[3]}px`;
  const interactive = !preview && !hidden;
  const onActivate = useCallback((event: ReactMouseEvent) => {
    if (preview || hidden) return;
    event.preventDefault();
    event.stopPropagation();
    onActivateProp?.(event);
  }, [preview, hidden, onActivateProp]);
  return <div className={cx('text-placeholder', [`content-type-${contentType}`, `align-${align}`, `valign-${vAlign}`, {
    preview,
    'is-hidden': hidden
  }])} hidden={hidden} role={interactive ? 'button' : undefined} aria-hidden={hidden || undefined} data-content-type={contentType} style={{
    color,
    textAlign: align,
    fontSize: fontSize ? `${fontSize}px` : undefined,
    fontWeight: 400,
    padding: `${inset[0]}px ${inset[1]}px ${inset[2]}px ${padLeft}`
  }} onMouseDown={onActivate}>{showBullet ? <span className={cx('bullet')}>•</span> : null}<span className={cx('label')}>{label}</span></div>;
});
export default TextPlaceholder;
