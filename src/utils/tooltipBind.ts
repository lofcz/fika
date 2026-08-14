import tippy, { type Instance } from 'tippy.js';
import { APP_SHELL_ID, resolveFikaPortalTarget } from '@/utils/portal';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/animations/scale.css';
import '@/directive/tooltip.scss';
const INSTANCE = '__fikaTooltip';
interface TooltipHost extends HTMLElement {
  [INSTANCE]?: Instance;
}
function contentFromTarget(el: HTMLElement): string {
  return el.getAttribute('data-tooltip') || '';
}
function bindEl(el: TooltipHost) {
  const content = contentFromTarget(el);
  if (!content) {
    el[INSTANCE]?.destroy();
    delete el[INSTANCE];
    return;
  }
  if (el[INSTANCE]) {
    el[INSTANCE].setContent(content);
    return;
  }
  el[INSTANCE] = tippy(el, {
    content,
    theme: 'tooltip',
    duration: 100,
    animation: 'scale',
    allowHTML: true,
    placement: el.getAttribute('data-tooltip-placement') as 'top' || 'top',
    delay: [300, 0],
    appendTo: () => resolveFikaPortalTarget(el)
  });
}
function unbindEl(el: TooltipHost) {
  el[INSTANCE]?.destroy();
  delete el[INSTANCE];
}

/**
 * Tippy tooltips for `[data-tooltip]`. Call once from the app/embed entry.
 *
 * Standalone presentation mode portals into `#fika-portals`, a sibling of
 * `#app`. Watch the shell (or the embed root) so slideshow toolbar tips bind.
 */
export function bindTooltips(root: ParentNode = document.getElementById(APP_SHELL_ID) ?? document): () => void {
  const seen = new WeakSet<Element>();
  const scan = () => {
    root.querySelectorAll<HTMLElement>('[data-tooltip]').forEach(el => {
      if (seen.has(el)) {
        bindEl(el);
        return;
      }
      seen.add(el);
      bindEl(el);
    });
  };
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(root instanceof Document ? root.body : root as Element, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-tooltip', 'data-tooltip-placement']
  });
  return () => {
    observer.disconnect();
    root.querySelectorAll<TooltipHost>('[data-tooltip]').forEach(unbindEl);
  };
}
