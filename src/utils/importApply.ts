import type { TurningMode } from '@/types/slides';
import type { ImportTurningModeInput } from '@/utils/importTransition';

export type ImportApplyMode = 'replace' | 'append';
export interface ImportApplyOptions {
  /**
   * How to apply imported slides. Takes precedence over `cover`.
   * Default is `replace`.
   */
  mode?: ImportApplyMode;
  /**
   * Override imported slide transitions. A single mode applies to every slide;
   * an array or index map sets individual slides (missing entries keep the
   * file transition, or `defaultTurningMode` / Rise when the file has none).
   */
  turningMode?: ImportTurningModeInput;
  /** Fallback when a slide has no file transition and no per-slide override. */
  defaultTurningMode?: TurningMode;
  /**
   * Legacy alias: `true` replace, `false` append.
   * An empty deck (0 slides) is always replaced.
   */
  cover?: boolean;
  /**
   * When replacing a deck that already has more than one slide, ask first.
   * Default `true` for the editor UI; the controller should pass `false`.
   */
  confirm?: boolean;
}
export interface ImportApplyDecision {
  apply: ImportApplyMode;
  needsConfirm: boolean;
}

/**
 * UI / controller policy for PPTX and JSON import.
 *
 * - 0 slides (starter deleted) or 1 slide: replace immediately.
 * - 2+ slides: replace after confirm, unless `confirm: false`.
 * - `mode: 'append'` / `cover: false`: append, no confirm (still replace if empty).
 */
export function resolveImportApply(slideCount: number, options: ImportApplyOptions = {}): ImportApplyDecision {
  const requested: ImportApplyMode = options.mode ?? (options.cover === false ? 'append' : 'replace');
  if (slideCount <= 0) {
    return {
      apply: 'replace',
      needsConfirm: false
    };
  }
  if (requested === 'append') {
    return {
      apply: 'append',
      needsConfirm: false
    };
  }
  const shouldConfirm = options.confirm ?? true;
  return {
    apply: 'replace',
    needsConfirm: shouldConfirm && slideCount > 1
  };
}
export function normalizeImportApplyOptions(options?: boolean | ImportApplyOptions): ImportApplyOptions {
  if (typeof options === 'boolean') return {
    cover: options
  };
  return options ?? {};
}
