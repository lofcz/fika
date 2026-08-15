export type JobProgressPhase = 'preparing' | 'working' | 'finishing';
export interface JobProgressBox<T> {
  value: T;
}
export interface JobProgress {
  running: JobProgressBox<boolean>;
  progress: JobProgressBox<number>;
  current: JobProgressBox<number>;
  total: JobProgressBox<number>;
  generation: () => number;
  start: (total?: number) => number;
  setTotal: (total: number, gen?: number) => boolean;
  tick: (value: number, slide?: number, gen?: number, options?: {
    yieldPaint?: boolean;
  }) => Promise<boolean>;
  finish: (gen?: number) => boolean;
  isCurrent: (gen: number) => boolean;
  subscribe: (listener: () => void) => () => void;
}
export interface JobProgressLabels {
  running: string;
  preparing: string;
  finishing: string;
  slideProgress: (params: {
    current: number;
    total: number;
  }) => string;
}
export function jobProgressPhase(current: number, total: number): JobProgressPhase {
  if (!current || !total) return 'preparing';
  if (current > total) return 'finishing';
  return 'working';
}
export function jobBoxValue<T>(box: T | { value: T } | undefined, fallback: T): T {
  if (box && typeof box === 'object' && 'value' in (box as object)) {
    const value = (box as { value: T }).value;
    return value === undefined ? fallback : value;
  }
  return (box as T) ?? fallback;
}
export function formatJobProgressTip(running: boolean, current: number, total: number, labels: JobProgressLabels): string {
  if (!running) return labels.running;
  const currentCount = Number(jobBoxValue(current as number | { value: number }, 0)) || 0;
  const totalCount = Number(jobBoxValue(total as number | { value: number }, 0)) || 0;
  const phase = jobProgressPhase(currentCount, totalCount);
  if (phase === 'preparing') return labels.preparing;
  if (phase === 'finishing') return labels.finishing;
  return labels.slideProgress({
    current: currentCount,
    total: totalCount
  });
}
export function slideJobProgress(index: number, count: number, start = 0.1, end = 0.92): number {
  return start + (index + 1) / Math.max(count, 1) * (end - start);
}
export const isAbortError = (error: unknown) => typeof error === 'object' && error !== null && 'name' in error && (error as {
  name: string;
}).name === 'AbortError';
const yieldToPaint = () => {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve());
  });
};
export function createJobProgress(): JobProgress {
  const running: JobProgressBox<boolean> = {
    value: false
  };
  const progress: JobProgressBox<number> = {
    value: 0
  };
  const current: JobProgressBox<number> = {
    value: 0
  };
  const total: JobProgressBox<number> = {
    value: 0
  };
  let generation = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    listeners.forEach(listener => listener());
  };
  const isCurrent = (gen: number) => gen === generation;
  const start = (slideTotal = 0) => {
    generation += 1;
    running.value = true;
    progress.value = 0;
    current.value = 0;
    total.value = slideTotal;
    notify();
    return generation;
  };
  const setTotal = (slideTotal: number, gen = generation) => {
    if (!isCurrent(gen)) return false;
    total.value = slideTotal;
    notify();
    return true;
  };
  const tick = async (value: number, slide = current.value, gen = generation, options?: {
    yieldPaint?: boolean;
  }) => {
    if (!isCurrent(gen)) return false;
    current.value = slide;
    const next = Math.min(1, Math.max(0, value));
    progress.value = Math.max(progress.value, next);
    notify();
    if (options?.yieldPaint === false) return true;
    await Promise.resolve();
    await yieldToPaint();
    return true;
  };
  const finish = (gen = generation) => {
    if (!isCurrent(gen)) return false;
    progress.value = 1;
    running.value = false;
    notify();
    return true;
  };
  return {
    running,
    progress,
    current,
    total,
    generation: () => generation,
    start,
    setTotal,
    tick,
    finish,
    isCurrent,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
