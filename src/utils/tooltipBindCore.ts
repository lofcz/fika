import tippy, { type Instance, type Placement } from 'tippy.js';
import { APP_SHELL_ID, resolveFikaPortalTarget } from '@/utils/portal';

const SHOW_DELAY_MS = 300;

function contentFromTarget(el: HTMLElement): string {
  return el.getAttribute('data-tooltip') || '';
}

function placementFromTarget(el: HTMLElement): Placement {
  return (el.getAttribute('data-tooltip-placement') as Placement) || 'top';
}

function isFocusVisible(el: HTMLElement): boolean {
  try {
    return typeof el.matches === 'function' ? el.matches(':focus-visible') : true;
  } catch {
    return true;
  }
}

/**
 * Delegated lazy Tippy tooltips for `[data-tooltip]`. Call once from the
 * app/embed entry and invoke the returned disposer on unmount/destroy.
 *
 * Uses a single set of delegated listeners on `root` with manual-trigger Tippy
 * instances created after the 300ms hover/focus delay and destroyed in
 * `onHidden`. This avoids eager `MutationObserver` + `querySelectorAll` scans
 * and keeps zero persistent Tippy instances or per-button event listeners.
 */
export function bindTooltips(root: ParentNode = document.getElementById(APP_SHELL_ID) ?? document): () => void {
  const targetRoot: EventTarget = root;
  const containsHost = (el: HTMLElement): boolean => (
    root instanceof Document ? root.contains(el) : root.contains(el)
  );

  let activeHost: HTMLElement | null = null;
  let activeTip: Instance | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  const clearPendingTimer = () => {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  };

  const hideActiveTip = (immediate = false) => {
    const tip = activeTip;
    if (!tip) return;
    if (immediate) {
      activeTip = null;
      tip.destroy();
    } else {
      tip.hide();
    }
  };

  const cancelAll = (immediate = false) => {
    clearPendingTimer();
    activeHost = null;
    hideActiveTip(immediate);
  };

  const showForHost = (host: HTMLElement) => {
    if (activeHost !== host || !host.isConnected || !containsHost(host)) {
      if (activeHost === host) activeHost = null;
      return;
    }
    const content = contentFromTarget(host);
    if (!content) {
      activeHost = null;
      return;
    }
    hideActiveTip(true);
    const placement = placementFromTarget(host);
    const instance = tippy(host, {
      content,
      theme: 'tooltip',
      duration: 100,
      animation: 'scale',
      allowHTML: true,
      placement,
      trigger: 'manual',
      appendTo: () => resolveFikaPortalTarget(host),
      onHidden(inst) {
        if (activeTip === inst) activeTip = null;
        inst.destroy();
      },
    });
    activeTip = instance;
    instance.show();
  };

  const scheduleForHost = (host: HTMLElement) => {
    if (!contentFromTarget(host)) {
      if (activeHost === host) cancelAll();
      return;
    }
    if (activeHost === host && (pendingTimer !== null || activeTip !== null)) {
      if (activeTip) {
        const nextContent = contentFromTarget(host);
        if (activeTip.props.content !== nextContent) activeTip.setContent(nextContent);
      }
      return;
    }
    clearPendingTimer();
    hideActiveTip(true);
    activeHost = host;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      showForHost(host);
    }, SHOW_DELAY_MS);
  };

  const onEnter = (event: Event) => {
    const rawTarget = event.target;
    if (!(rawTarget instanceof Element)) return;
    const host = rawTarget.closest<HTMLElement>('[data-tooltip]');
    if (!host || !containsHost(host)) {
      if (activeHost && !activeHost.isConnected) cancelAll(true);
      return;
    }
    if (event.type === 'focusin' && !isFocusVisible(host)) return;
    scheduleForHost(host);
  };

  const onLeave = (event: Event) => {
    if (!activeHost) return;
    if (!activeHost.isConnected) {
      cancelAll(true);
      return;
    }
    const related = (event as MouseEvent | FocusEvent).relatedTarget;
    if (related instanceof Node && activeHost.contains(related)) return;
    const rawTarget = event.target;
    if (rawTarget instanceof Node && activeHost.contains(rawTarget)) {
      cancelAll();
    }
  };

  const onDismiss = () => {
    if (activeHost || activeTip || pendingTimer !== null) {
      cancelAll();
    }
  };

  targetRoot.addEventListener('pointerover', onEnter, true);
  targetRoot.addEventListener('focusin', onEnter, true);
  targetRoot.addEventListener('pointerout', onLeave, true);
  targetRoot.addEventListener('focusout', onLeave, true);
  targetRoot.addEventListener('pointerdown', onDismiss, true);
  targetRoot.addEventListener('scroll', onDismiss, true);

  return () => {
    targetRoot.removeEventListener('pointerover', onEnter, true);
    targetRoot.removeEventListener('focusin', onEnter, true);
    targetRoot.removeEventListener('pointerout', onLeave, true);
    targetRoot.removeEventListener('focusout', onLeave, true);
    targetRoot.removeEventListener('pointerdown', onDismiss, true);
    targetRoot.removeEventListener('scroll', onDismiss, true);
    cancelAll(true);
  };
}
