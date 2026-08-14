import { useEffect } from 'react';
import { isAppOwnedEvent } from '@/utils/portal';
type MaybeEl = {
  value: HTMLElement | null | undefined;
} | {
  current: HTMLElement | null | undefined;
} | HTMLElement | null | undefined;
function unwrap(el: MaybeEl): HTMLElement | null {
  if (!el) return null;
  if (el instanceof HTMLElement) return el;
  if (typeof el === 'object' && 'current' in el) return el.current ?? null;
  if (typeof el === 'object' && 'value' in el) return el.value ?? null;
  return null;
}
export function useClickOutside(elRef: MaybeEl, handler: (event: MouseEvent) => void) {
  useEffect(() => {
    const listener = (event: MouseEvent) => {
      if (!isAppOwnedEvent(event)) return;
      const el = unwrap(elRef);
      if (!el) return;
      const path = event.composedPath();
      const isClickOutside = path ? path.indexOf(el) < 0 : !el.contains(event.target as Node);
      if (!isClickOutside) return;
      handler(event);
    };
    document.addEventListener('click', listener);
    return () => document.removeEventListener('click', listener);
  }, [elRef, handler]);
}
