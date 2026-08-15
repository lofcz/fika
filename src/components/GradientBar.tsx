import { bindStyles } from '@/utils/cssm'
import styles from './GradientBar.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useState, useEffect, useMemo, type MouseEvent as ReactMouseEvent } from 'react';

import type { GradientColor } from '@/types/slides';
import { throttle } from '@/utils/debounce';

const LIVE_INPUT_MS = 32

const sortStops = (colors: GradientColor[]) => [...colors].toSorted((a, b) => a.pos - b.pos)

export type IGradientBarProps = {
  value: GradientColor[];
  index: number;
  className?: string;
} & {
  onInput?: (payload: GradientColor[]) => void;
  onUpdateValue?: (payload: GradientColor[]) => void;
  onUpdateIndex?: (payload: number) => void;
};
const GradientBar = memo((props: IGradientBarProps) => {
  const { index } = props;
  const [points, setPoints] = useState<GradientColor[]>([]);
  const barRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const onInputRef = useRef(props.onInput);
  const onUpdateValueRef = useRef(props.onUpdateValue);
  const onUpdateIndexRef = useRef(props.onUpdateIndex);
  onInputRef.current = props.onInput;
  onUpdateValueRef.current = props.onUpdateValue;
  onUpdateIndexRef.current = props.onUpdateIndex;

  const emitInput = useMemo(() => throttle((next: GradientColor[]) => {
    onInputRef.current?.(next);
  }, LIVE_INPUT_MS), []);

  useEffect(() => () => emitInput.cancel(), [emitInput]);

  useEffect(() => {
    if (draggingRef.current) return;
    setPoints(props.value);
    if (props.index > props.value.length - 1) onUpdateIndexRef.current?.(0);
  }, [props.value, props.index]);
  const gradientStyle = (() => {
    const list = points.map(item => `${item.color} ${item.pos}%`);
    return `linear-gradient(to right, ${list.join(',')})`;
  })();
  const removePoint = useCallback((index: number) => {
    if (props.value.length <= 2) return;
    let targetIndex = 0;
    if (index === props.index) {
      targetIndex = index - 1 < 0 ? 0 : index - 1;
    } else if (props.index === props.value.length - 1) {
      targetIndex = props.value.length - 2;
    }
    const values = props.value.filter((item, _index) => _index !== index);
    onUpdateIndexRef.current?.(targetIndex);
    onUpdateValueRef.current?.(values);
  }, [props.value, props.index]);
  const movePoint = useCallback((index: number) => {
    let isMouseDown = true;
    let current = points;
    draggingRef.current = true;
    document.onmousemove = e => {
      if (!isMouseDown) return;
      if (!barRef.current) return;
      let pos = Math.round((e.clientX - barRef.current.getBoundingClientRect().left) / barRef.current.clientWidth * 100);
      if (pos > 100) pos = 100;
      if (pos < 0) pos = 0;
      current = current.map((item, _index) => {
        if (_index === index) return {
          ...item,
          pos
        };
        return item;
      });
      setPoints(current);
      emitInput(sortStops(current));
    };
    document.onmouseup = () => {
      isMouseDown = false;
      draggingRef.current = false;
      emitInput.flush();
      const point = current[index];
      const _points = [...current];
      _points.splice(index, 1);
      let targetIndex = 0;
      for (let i = 0; i < _points.length; i++) {
        if (point.pos > _points[i].pos) targetIndex = i + 1;
      }
      _points.splice(targetIndex, 0, point);
      onUpdateIndexRef.current?.(targetIndex);
      onUpdateValueRef.current?.(_points);
      document.onmousemove = null;
      document.onmouseup = null;
    };
  }, [points, emitInput]);
  const addPoint = useCallback((e: ReactMouseEvent) => {
    if (props.value.length >= 6) return;
    if (!barRef.current) return;
    const pos = Math.round((e.clientX - barRef.current.getBoundingClientRect().left) / barRef.current.clientWidth * 100);
    let targetIndex = 0;
    for (let i = 0; i < props.value.length; i++) {
      if (pos > props.value[i].pos) targetIndex = i + 1;
    }
    const color = props.value[targetIndex - 1] ? props.value[targetIndex - 1].color : props.value[targetIndex].color;
    const values = [...props.value];
    values.splice(targetIndex, 0, {
      pos,
      color
    });
    props.onUpdateIndex?.(targetIndex);
    props.onUpdateValue?.(values);
  }, [props.value?.length, barRef.current, barRef.current?.clientWidth, props, props.value, props.onUpdateIndex, props.onUpdateValue]);
  return <><div className={cx("gradient-bar", props.className)}><div className={cx("bar")} ref={barRef} style={{
        backgroundImage: gradientStyle
      }} onClick={($event) => {
        addPoint($event);
      }} />{points.map((item, i) => <div className={cx('point', {
        'active': index === i
      })} key={item.pos + '-' + i} style={{
        backgroundColor: item.color,
        left: `calc(${item.pos}% - 5px)`
      }} onMouseDown={(event) => { if (event.button !== 0) return; movePoint(i) }} onContextMenu={(event) => { event.preventDefault(); removePoint(i) }} />)}</div></>;
});
export default GradientBar;
