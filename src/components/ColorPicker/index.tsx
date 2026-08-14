import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import type { CSSProperties } from 'react';
import { useMemo, useCallback, memo, useState, useEffect } from 'react';

import tinycolor, { type ColorFormats } from 'tinycolor2';
import { debounce } from '@/utils/debounce';
import { toCanvas } from 'html-to-image';
import message from '@/utils/message';
import { useI18nContext } from '@/i18n/useI18nContext';
import { getFikaPortalTarget, queryFika } from '@/utils/portal';
import { DEFAULT_THEME_COLORS } from '@/configs/theme';
import Alpha from './Alpha';
import Checkboard from './Checkboard';
import Hue from './Hue';
import Saturation from './Saturation';
import EditableInput from './EditableInput';
export type IColorPickerProps = {
  modelValue?: string;
  className?: string;
  style?: CSSProperties;
  'data-tooltip'?: string;
} & {
  onUpdateModelValue?: (payload: string) => void;
};
const RECENT_COLORS = 'RECENT_COLORS';
const ColorPicker = memo((vrProps: IColorPickerProps) => {
  const {
    LL
  } = useI18nContext();
  const props = useMemo<Readonly<{
    modelValue?: string;
  }>>(() => ({
    ...vrProps,
    modelValue: vrProps.modelValue ?? '#ffffff'
  }), [vrProps.modelValue]);
  ;
  const { modelValue } = props;
  const presetColorConfig = [['#7f7f7f', '#f2f2f2'], ['#0d0d0d', '#808080'], ['#1c1a10', '#ddd8c3'], ['#0e243d', '#c6d9f0'], ['#233f5e', '#dae5f0'], ['#632623', '#f2dbdb'], ['#4d602c', '#eaf1de'], ['#3f3150', '#e6e0ec'], ['#1e5867', '#d9eef3'], ['#99490f', '#fee9da']];
  const gradient = (startColor: string, endColor: string, step: number) => {
    const _startColor = tinycolor(startColor).toRgb();
    const _endColor = tinycolor(endColor).toRgb();
    const rStep = (_endColor.r - _startColor.r) / step;
    const gStep = (_endColor.g - _startColor.g) / step;
    const bStep = (_endColor.b - _startColor.b) / step;
    const gradientColorArr = [];
    for (let i = 0; i < step; i++) {
      const gradientColor = tinycolor({
        r: _startColor.r + rStep * i,
        g: _startColor.g + gStep * i,
        b: _startColor.b + bStep * i
      }).toRgbString();
      gradientColorArr.push(gradientColor);
    }
    return gradientColorArr;
  };
  const getPresetColors = () => {
    const presetColors = [];
    for (const color of presetColorConfig) {
      presetColors.push(gradient(color[1], color[0], 5));
    }
    return presetColors;
  };
  const themeColors = ['#18181b', '#ffffff', ...DEFAULT_THEME_COLORS];
  const standardColors = ['#c21401', '#ff1e02', '#ffc12a', '#ffff3a', '#90cf5b', '#00af57', '#00afee', '#0071be', '#00215f', '#72349d'];
  const [hue, setHue] = useState(-1);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const color = useMemo(() => tinycolor(props.modelValue).toRgb(), [props.modelValue]);
  const setColor = (rgba: ColorFormats.RGBA) => {
    const rgbaString = `rgba(${[rgba.r, rgba.g, rgba.b, rgba.a].join(',')})`;
    vrProps.onUpdateModelValue?.(rgbaString);
  };
  const presetColors = getPresetColors();
  const currentColor = (() => {
    return `rgba(${[color.r, color.g, color.b, color.a].join(',')})`;
  })();
  const selectPresetColor = useCallback((colorString: string) => {
    setHue(tinycolor(colorString).toHsl().h);
    vrProps.onUpdateModelValue?.(colorString);
  }, [hue, vrProps.onUpdateModelValue]);

  const updateRecentColorsCache = useMemo(() => debounce(function () {
    const _color = tinycolor(color).toRgbString();
    if (!recentColors.includes(_color)) {
      setRecentColors([_color, ...recentColors]);
      const maxLength = 10;
      if (recentColors.length > maxLength) {
        setRecentColors(recentColors.slice(0, maxLength));
      }
    }
  }, 300, {
    trailing: true
  }), [color, recentColors, recentColors?.length]);
  useEffect(() => {
    const recentColorsCache = localStorage.getItem(RECENT_COLORS);
    if (recentColorsCache) setRecentColors(JSON.parse(recentColorsCache));
  }, []);
  useEffect(() => {
    const recentColorsCache = JSON.stringify(recentColors);
    localStorage.setItem(RECENT_COLORS, recentColorsCache);
  }, [recentColors]);
  const changeColor = useCallback((value: ColorFormats.RGBA | ColorFormats.HSLA | ColorFormats.HSVA) => {
    if ('h' in value) {
      setHue(value.h);
      setColor(tinycolor(value).toRgb());
    } else {
      setHue(tinycolor(value).toHsl().h);
      setColor(value);
    }
    updateRecentColorsCache();
  }, [hue, color, updateRecentColorsCache]);

  const openEyeDropper = () => {
    const isSupportedEyeDropper = 'EyeDropper' in window;
    if (isSupportedEyeDropper) browserEyeDropper();else customEyeDropper();
  };

  const browserEyeDropper = useCallback(() => {
    message.success(LL.components.colorPicker.eyeDropperEscHint(), {
      duration: 0
    });

    // eslint-disable-next-line
    const eyeDropper = new (window as any).EyeDropper();
    eyeDropper.open().then((result: {
      sRGBHex: string;
    }) => {
      const tColor = tinycolor(result.sRGBHex);
      setHue(tColor.toHsl().h);
      setColor(tColor.toRgb());
      message.closeAll();
      updateRecentColorsCache();
    }).catch(() => {
      message.closeAll();
    });
  }, [LL?.components?.colorPicker, hue, color, updateRecentColorsCache]);

  const customEyeDropper = useCallback(() => {
    const targetRef = queryFika<HTMLElement>('.canvas');
    if (!targetRef) return;
    const portalTarget = getFikaPortalTarget();
    const maskRef = document.createElement('div');
    maskRef.style.cssText = 'position: fixed; top: 0; left: 0; bottom: 0; right: 0; z-index: 9999; cursor: wait;';
    portalTarget.appendChild(maskRef);
    const colorBlockRef = document.createElement('div');
    colorBlockRef.style.cssText = 'position: absolute; top: -100px; left: -100px; width: 16px; height: 16px; border: 1px solid #000; z-index: 999';
    maskRef.appendChild(colorBlockRef);
    const {
      left,
      top,
      width,
      height
    } = targetRef.getBoundingClientRect();
    const filter = (node: HTMLElement) => {
      if (node.tagName && node.tagName.toUpperCase() === 'FOREIGNOBJECT') return false;
      if (node.classList && node.classList.contains('operate')) return false;
      return true;
    };
    toCanvas(targetRef, {
      filter,
      fontEmbedCSS: '',
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio: 1
    }).then(canvasRef => {
      canvasRef.style.cssText = `position: absolute; top: ${top}px; left: ${left}px; cursor: crosshair;`;
      maskRef.style.cursor = 'default';
      maskRef.appendChild(canvasRef);
      const ctx = canvasRef.getContext('2d');
      if (!ctx) return;
      let currentColor = '';
      const handleMousemove = (e: MouseEvent) => {
        const x = e.x;
        const y = e.y;
        const mouseX = x - left;
        const mouseY = y - top;
        const [r, g, b, a] = ctx.getImageData(mouseX, mouseY, 1, 1).data;
        currentColor = `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`;
        colorBlockRef.style.left = x + 10 + 'px';
        colorBlockRef.style.top = y + 10 + 'px';
        colorBlockRef.style.backgroundColor = currentColor;
      };
      const handleMouseleave = () => {
        currentColor = '';
        colorBlockRef.style.left = '-100px';
        colorBlockRef.style.top = '-100px';
        colorBlockRef.style.backgroundColor = '';
      };
      const handleMousedown = (e: MouseEvent) => {
        if (currentColor && e.button === 0) {
          const tColor = tinycolor(currentColor);
          setHue(tColor.toHsl().h);
          setColor(tColor.toRgb());
          updateRecentColorsCache();
        }
        portalTarget.removeChild(maskRef);
        canvasRef.removeEventListener('mousemove', handleMousemove);
        canvasRef.removeEventListener('mouseleave', handleMouseleave);
        window.removeEventListener('mousedown', handleMousedown);
      };
      canvasRef.addEventListener('mousemove', handleMousemove);
      canvasRef.addEventListener('mouseleave', handleMouseleave);
      window.addEventListener('mousedown', handleMousedown);
    }).catch(() => {
      message.error(LL.components.colorPicker.eyeDropperInitFailed());
      portalTarget.removeChild(maskRef);
    });
  }, [hue, color, updateRecentColorsCache, LL?.components?.colorPicker]);
  const isPureWhiteColor = (color?: string) => {
    const rgba = tinycolor(color).toRgb();
    return rgba.r === 255 && rgba.g === 255 && rgba.b === 255 && rgba.a === 1;
  };
  return <><div className={cx("color-picker", vrProps.className)} style={vrProps.style} data-tooltip={vrProps['data-tooltip']}><div className={cx("picker-saturation-wrap")}><Saturation value={color} hue={hue} onColorChange={value => changeColor(value)} /></div><div className={cx("picker-controls")}><div className={cx("picker-color-wrap")}><div className={cx("picker-current-color")} style={{
            background: currentColor
          }} /><Checkboard /></div><div className={cx("picker-sliders")}><div className={cx("picker-hue-wrap")}><Hue value={color} hue={hue} onColorChange={value => changeColor(value)} /></div><div className={cx("picker-alpha-wrap")}><Alpha value={color} onColorChange={value => changeColor(value)} /></div></div></div><div className={cx("picker-field")}><EditableInput className={cx("input")} value={color} onColorChange={value => changeColor(value)} /><div className={cx("straw")} onClick={() => {
          openEyeDropper();
        }}><Icon icon="pipette" /></div><div className={cx("transparent")} onClick={() => {
          selectPresetColor('#00000000');
        }}><Checkboard /></div></div><div className={cx("picker-presets")}>{themeColors.map(c => <div className={cx('picker-presets-color', {
          'white': isPureWhiteColor(c)
        })} key={c} style={{
          background: c
        }} onClick={() => {
          selectPresetColor(c);
        }} />)}</div><div className={cx("picker-gradient-presets")}>{presetColors.map((col, index) => <div className={cx("picker-gradient-col")} key={index}>{col.map(c => <div className={cx("picker-gradient-color")} key={c} style={{
            background: c
          }} onClick={() => {
            selectPresetColor(c);
          }} />)}</div>)}</div><div className={cx("picker-presets")}>{standardColors.map(c => <div className={cx("picker-presets-color")} key={c} style={{
          background: c
        }} onClick={() => {
          selectPresetColor(c);
        }} />)}</div>{recentColors.length ? <div className={cx("recent-colors-title")}>{LL.components.colorPicker.recentColors()}</div> : null}<div className={cx("picker-presets")}>{recentColors.map(c => <div className={cx('picker-presets-color alpha', {
          'white': isPureWhiteColor(c)
        })} key={c} onClick={() => {
          selectPresetColor(c);
        }}><div className={cx("picker-presets-color-content")} style={{
            background: c
          }} /></div>)}</div></div></>;
});
export default ColorPicker;
