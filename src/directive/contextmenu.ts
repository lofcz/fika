import type { ContextmenuItem } from '@/components/Contextmenu/types';
import { openContextmenu } from '@/utils/openContextmenu';

const CTX_CONTEXTMENU_HANDLER = 'CTX_CONTEXTMENU_HANDLER';

interface CustomHTMLElement extends HTMLElement {
  [CTX_CONTEXTMENU_HANDLER]?: (event: MouseEvent) => void;
}

type MenuFactory = (el: HTMLElement) => ContextmenuItem[] | null | undefined;

const contextmenuListener = (el: HTMLElement, event: MouseEvent, binding: { value: MenuFactory }) => {
  openContextmenu(event, () => binding.value(el));
};

const ContextmenuDirective = {
  mounted(el: CustomHTMLElement, binding: { value: MenuFactory }) {
    el[CTX_CONTEXTMENU_HANDLER] = (event: MouseEvent) => contextmenuListener(el, event, binding);
    el.addEventListener('contextmenu', el[CTX_CONTEXTMENU_HANDLER]);
  },
  unmounted(el: CustomHTMLElement) {
    if (el && el[CTX_CONTEXTMENU_HANDLER]) {
      el.removeEventListener('contextmenu', el[CTX_CONTEXTMENU_HANDLER]);
      delete el[CTX_CONTEXTMENU_HANDLER];
    }
  },
};

export default ContextmenuDirective;
