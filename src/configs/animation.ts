import type { TurningMode } from '@/types/slides';
import { getLL } from '@/i18n/getLL';
import { SLIDE_TRANSITION_DEFS } from './transitions';
export const ANIMATION_DEFAULT_DURATION = 1000;
export const ANIMATION_DEFAULT_TRIGGER = 'click';
export const ANIMATION_CLASS_PREFIX = 'animate__';

/** Locale-free enter animation structure. Resolve labels at call/render time. */
export const ENTER_ANIMATIONS = [{
  type: 'bounce',
  children: [{
    value: 'bounceIn'
  }, {
    value: 'bounceInLeft'
  }, {
    value: 'bounceInRight'
  }, {
    value: 'bounceInUp'
  }, {
    value: 'bounceInDown'
  }]
}, {
  type: 'fade',
  children: [{
    value: 'fadeIn'
  }, {
    value: 'fadeInDown'
  }, {
    value: 'fadeInDownBig'
  }, {
    value: 'fadeInLeft'
  }, {
    value: 'fadeInLeftBig'
  }, {
    value: 'fadeInRight'
  }, {
    value: 'fadeInRightBig'
  }, {
    value: 'fadeInUp'
  }, {
    value: 'fadeInUpBig'
  }, {
    value: 'fadeInTopLeft'
  }, {
    value: 'fadeInTopRight'
  }, {
    value: 'fadeInBottomLeft'
  }, {
    value: 'fadeInBottomRight'
  }]
}, {
  type: 'rotate',
  children: [{
    value: 'rotateIn'
  }, {
    value: 'rotateInDownLeft'
  }, {
    value: 'rotateInDownRight'
  }, {
    value: 'rotateInUpLeft'
  }, {
    value: 'rotateInUpRight'
  }]
}, {
  type: 'zoom',
  children: [{
    value: 'zoomIn'
  }, {
    value: 'zoomInDown'
  }, {
    value: 'zoomInLeft'
  }, {
    value: 'zoomInRight'
  }, {
    value: 'zoomInUp'
  }]
}, {
  type: 'slide',
  children: [{
    value: 'slideInDown'
  }, {
    value: 'slideInLeft'
  }, {
    value: 'slideInRight'
  }, {
    value: 'slideInUp'
  }]
}, {
  type: 'flip',
  children: [{
    value: 'flipInX'
  }, {
    value: 'flipInY'
  }]
}, {
  type: 'back',
  children: [{
    value: 'backInDown'
  }, {
    value: 'backInLeft'
  }, {
    value: 'backInRight'
  }, {
    value: 'backInUp'
  }]
}, {
  type: 'lightSpeed',
  children: [{
    value: 'lightSpeedInRight'
  }, {
    value: 'lightSpeedInLeft'
  }]
}] as const;

/** Locale-free exit animation structure. Resolve labels at call/render time. */
export const EXIT_ANIMATIONS = [{
  type: 'bounce',
  children: [{
    value: 'bounceOut'
  }, {
    value: 'bounceOutLeft'
  }, {
    value: 'bounceOutRight'
  }, {
    value: 'bounceOutUp'
  }, {
    value: 'bounceOutDown'
  }]
}, {
  type: 'fade',
  children: [{
    value: 'fadeOut'
  }, {
    value: 'fadeOutDown'
  }, {
    value: 'fadeOutDownBig'
  }, {
    value: 'fadeOutLeft'
  }, {
    value: 'fadeOutLeftBig'
  }, {
    value: 'fadeOutRight'
  }, {
    value: 'fadeOutRightBig'
  }, {
    value: 'fadeOutUp'
  }, {
    value: 'fadeOutUpBig'
  }, {
    value: 'fadeOutTopLeft'
  }, {
    value: 'fadeOutTopRight'
  }, {
    value: 'fadeOutBottomLeft'
  }, {
    value: 'fadeOutBottomRight'
  }]
}, {
  type: 'rotate',
  children: [{
    value: 'rotateOut'
  }, {
    value: 'rotateOutDownLeft'
  }, {
    value: 'rotateOutDownRight'
  }, {
    value: 'rotateOutUpLeft'
  }, {
    value: 'rotateOutUpRight'
  }]
}, {
  type: 'zoom',
  children: [{
    value: 'zoomOut'
  }, {
    value: 'zoomOutDown'
  }, {
    value: 'zoomOutLeft'
  }, {
    value: 'zoomOutRight'
  }, {
    value: 'zoomOutUp'
  }]
}, {
  type: 'slide',
  children: [{
    value: 'slideOutDown'
  }, {
    value: 'slideOutLeft'
  }, {
    value: 'slideOutRight'
  }, {
    value: 'slideOutUp'
  }]
}, {
  type: 'flip',
  children: [{
    value: 'flipOutX'
  }, {
    value: 'flipOutY'
  }]
}, {
  type: 'back',
  children: [{
    value: 'backOutDown'
  }, {
    value: 'backOutLeft'
  }, {
    value: 'backOutRight'
  }, {
    value: 'backOutUp'
  }]
}, {
  type: 'lightSpeed',
  children: [{
    value: 'lightSpeedOutRight'
  }, {
    value: 'lightSpeedOutLeft'
  }]
}] as const;

/** Locale-free attention animation structure. Resolve labels at call/render time. */
export const ATTENTION_ANIMATIONS = [{
  type: 'shake',
  children: [{
    value: 'shakeX'
  }, {
    value: 'shakeY'
  }, {
    value: 'headShake'
  }, {
    value: 'swing'
  }, {
    value: 'wobble'
  }, {
    value: 'tada'
  }, {
    value: 'jello'
  }]
}, {
  type: 'other',
  children: [{
    value: 'bounce'
  }, {
    value: 'flash'
  }, {
    value: 'pulse'
  }, {
    value: 'rubberBand'
  }, {
    value: 'heartBeat'
  }]
}] as const;
export interface AnimationPreset {
  name: string;
  value: string;
}
export interface AnimationPresetGroup {
  type: string;
  name: string;
  children: AnimationPreset[];
}
interface SlideAnimation {
  label: string;
  value: TurningMode;
}

/** Default slide-to-slide transition when a slide has no turningMode (Rise). */
export const DEFAULT_TURNING_MODE: TurningMode = 'slideY'

/** Locale-free slide transition values. Resolve labels via getSlideAnimations(). */
export const SLIDE_ANIMATIONS: {
  value: TurningMode;
}[] = SLIDE_TRANSITION_DEFS.map(def => ({ value: def.value }))

/** Enter animations with labels in the active locale. */
export function getEnterAnimations(): AnimationPresetGroup[] {
  const enter = getLL().configs.animation.enter;
  return ENTER_ANIMATIONS.map(group => ({
    type: group.type,
    name: enter.groups[group.type](),
    children: group.children.map(child => ({
      value: child.value,
      name: enter.effects[child.value]()
    }))
  }));
}

/** Exit animations with labels in the active locale. */
export function getExitAnimations(): AnimationPresetGroup[] {
  const exit = getLL().configs.animation.exit;
  return EXIT_ANIMATIONS.map(group => ({
    type: group.type,
    name: exit.groups[group.type](),
    children: group.children.map(child => ({
      value: child.value,
      name: exit.effects[child.value]()
    }))
  }));
}

/** Attention animations with labels in the active locale. */
export function getAttentionAnimations(): AnimationPresetGroup[] {
  const attention = getLL().configs.animation.attention;
  return ATTENTION_ANIMATIONS.map(group => ({
    type: group.type,
    name: attention.groups[group.type](),
    children: group.children.map(child => ({
      value: child.value,
      name: attention.effects[child.value]()
    }))
  }));
}

/** Slide transitions with labels in the active locale. */
export function getSlideAnimations(): SlideAnimation[] {
  const slide = getLL().configs.animation.slide;
  return SLIDE_ANIMATIONS.map(item => ({
    value: item.value,
    label: slide[item.value]()
  }));
}
