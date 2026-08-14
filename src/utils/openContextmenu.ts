import type { ContextmenuItem } from '@/components/Contextmenu/types';
import { menuAxisFromEvent, resolveFikaPortalTarget } from '@/utils/portal';

export interface ContextmenuRenderProps {
  axis: {
    x: number;
    y: number;
  };
  bounds?: {
    width: number;
    height: number;
  };
  el: HTMLElement;
  menus: ContextmenuItem[];
  removeContextmenu: () => void;
}

type Menus = ContextmenuItem[] | ((el: HTMLElement) => ContextmenuItem[] | null | undefined);

interface ContextmenuPointerEvent {
  stopPropagation(): void;
  preventDefault(): void;
  currentTarget: EventTarget | null;
  target?: EventTarget | null;
  clientX: number;
  clientY: number;
  x?: number;
  y?: number;
}

type ContextmenuRenderer = (
  container: HTMLElement,
  props: ContextmenuRenderProps,
) => void | (() => void);

let renderer: ContextmenuRenderer | null = null;
let activeRemove: (() => void) | null = null;

export function setContextmenuRenderer(fn: ContextmenuRenderer | null) {
  renderer = fn;
}

function resolveEventElement(event: ContextmenuPointerEvent): HTMLElement | null {
  if (event.currentTarget instanceof HTMLElement) return event.currentTarget;
  if (event.target instanceof HTMLElement) return event.target;
  if (event.target instanceof Node) return event.target.parentElement;
  return null;
}

export function openContextmenu(event: ContextmenuPointerEvent, menusOrFn: Menus) {
  event.stopPropagation();
  event.preventDefault();
  const el = resolveEventElement(event);
  if (!el || !renderer) return;
  const menus = typeof menusOrFn === 'function' ? menusOrFn(el) : menusOrFn;
  if (!menus) return;
  if (activeRemove) {
    activeRemove();
    activeRemove = null;
  }
  let container: HTMLDivElement | null = null;
  let dispose: (() => void) | undefined;
  const portalTarget = resolveFikaPortalTarget(el);
  const removeContextmenu = () => {
    if (!container) return;
    const node = container;
    const unmount = dispose;
    container = null;
    dispose = undefined;
    el.classList.remove('contextmenu-active');
    portalTarget.removeEventListener('scroll', removeContextmenu);
    window.removeEventListener('resize', removeContextmenu);
    if (activeRemove === removeContextmenu) activeRemove = null;
    const teardown = () => {
      unmount?.();
      node.parentNode?.removeChild(node);
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(teardown);
    else setTimeout(teardown, 0);
  };
  container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;pointer-events:auto;';
  container.addEventListener('mousedown', (downEvent) => {
    if (downEvent.button !== 0) return;
    if (downEvent.target === container) removeContextmenu();
  });
  portalTarget.appendChild(container);
  const axis = menuAxisFromEvent(event as MouseEvent, portalTarget);
  const result = renderer(container, {
    axis: { x: axis.x, y: axis.y },
    bounds: { width: axis.width, height: axis.height },
    el,
    menus,
    removeContextmenu,
  });
  if (typeof result === 'function') dispose = result;
  el.classList.add('contextmenu-active');
  activeRemove = removeContextmenu;
  portalTarget.addEventListener('scroll', removeContextmenu);
  window.addEventListener('resize', removeContextmenu);
}
