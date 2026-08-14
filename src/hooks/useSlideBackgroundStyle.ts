
import type { SlideBackground } from '@/types/slides';
import { gradientToCss } from '@/configs/theme';
export default (background: any) => {
  const backgroundStyle = (() => {
    if (!background) return {
      backgroundColor: '#fff'
    };
    const {
      type,
      color,
      image,
      gradient
    } = background;
    if (type === 'solid') return {
      backgroundColor: color
    };else if (type === 'image' && image) {
      const {
        src,
        size
      } = image;
      if (!src) return {
        backgroundColor: '#fff'
      };
      if (size === 'repeat') {
        return {
          backgroundImage: `url(${src})`,
          backgroundRepeat: 'repeat',
          backgroundSize: 'contain'
        };
      }
      return {
        backgroundImage: `url(${src})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: size || 'cover'
      };
    } else if (type === 'gradient' && gradient) {
      return {
        backgroundImage: gradientToCss(gradient)
      };
    }
    return {
      backgroundColor: '#fff'
    };
  })();
  return {
    backgroundStyle
  };
};
