/**
 * Composition anchors + a deterministic deck-level composition sequencer.
 *
 * An "anchor" is the spatial center of gravity of a slide — where the eye is
 * pulled. Layout variants each declare an anchor; the sequencer plans a
 * non-repeating, rhythmic anchor sequence for a whole deck so consecutive
 * slides never share the same spatial approach (the #1 cause of the "samey"
 * look). It also designates exactly one "loud" slide (full-bleed / high
 * intensity) so the deck has a single visual climax rather than a flat line.
 *
 * The sequencer is pure and deterministic: given a slide count, per-slide
 * content hints, and the active style, it returns an ordered plan the agent
 * follows slide-by-slide. Nothing here touches the store.
 */

/** Spatial center of gravity for a slide's composition. */
export type CompositionAnchor = 'centered' 
| 'leftHeavy' 
| 'rightHeavy' 
| 'edgeAligned' 
| 'split' 
| 'fullBleed'; 

/** Coarse content density, used to alternate busy and quiet slides. */
export type CompositionDensity = 'sparse' | 'balanced' | 'dense';

/** A per-slide composition assignment returned by the sequencer. */
export interface CompositionPlanEntry {
  /**
   * Slide number. The agentic API returns this 1-based (first slide = 1).
   * Internally the sequencer still stores 0-based positions and converts on the way out.
   */
  index: number;
  /** The anchor to build this slide around. */
  anchor: CompositionAnchor;
  /** Target density — keep dense slides apart. */
  density: CompositionDensity;
  /** True for the single high-intensity "loud" slide of the deck. */
  loud: boolean;
  /** One-line rationale the agent can read aloud / log. */
  note: string;
}

/** Optional per-slide hint the caller can pass to bias the plan. */
export interface CompositionSlideHint {
  /** Suggested anchor (e.g. the caller knows this slide is a full-bleed hero). */
  anchor?: CompositionAnchor;
  /** True to force this to be the loud slide. */
  loud?: boolean;
  /** Hint at density so the sequencer can space out busy slides. */
  density?: CompositionDensity;
}

/** The full composition plan for a deck. */
export interface CompositionPlan {
  /** Ordered per-slide assignments (length = slideCount). */
  slides: CompositionPlanEntry[];
  /** 1-based slide number of the loud slide when returned over the API, or -1 when none. */
  loudIndex: number;
  /** The style id this plan was sequenced for (affects anchor preference). */
  styleId: string;
  /** Human-readable rhythm summary (e.g. "centered → leftHeavy → split → …"). */
  rhythm: string;
}

/**
 * Canonical anchor rotation. Ordered so that consecutive entries always
 * contrast, and dense/sparse alternate when walked. `fullBleed` is excluded —
 * it is reserved for the single loud slide, never part of the rotation.
 */
const ANCHOR_ROTATION: CompositionAnchor[] = ['centered', 'leftHeavy', 'split', 'rightHeavy', 'edgeAligned', 'leftHeavy', 'centered', 'split', 'rightHeavy', 'edgeAligned'];

/** Density each anchor tends to carry, used to alternate busy/quiet. */
const ANCHOR_DENSITY: Record<CompositionAnchor, CompositionDensity> = {
  centered: 'sparse',
  leftHeavy: 'balanced',
  rightHeavy: 'balanced',
  edgeAligned: 'sparse',
  split: 'dense',
  fullBleed: 'sparse'
};

/** Per-style anchor preferences — biases the rotation start so styles feel distinct. */
const STYLE_ANCHOR_BIAS: Record<string, CompositionAnchor[]> = {
  academic: ['leftHeavy', 'centered', 'split', 'rightHeavy', 'edgeAligned'],
  minimal: ['leftHeavy', 'edgeAligned', 'centered', 'rightHeavy', 'split'],
  bold: ['split', 'rightHeavy', 'fullBleed', 'leftHeavy', 'edgeAligned'],
  playful: ['rightHeavy', 'split', 'centered', 'leftHeavy', 'edgeAligned']
};

/** Pick the loud-slide index: roughly 60–75% through the deck, never first/last. */
function pickLoudIndex(slideCount: number): number {
  if (slideCount < 4) return -1;
  const idx = Math.round(slideCount * 0.65);
  return Math.min(Math.max(idx, 1), slideCount - 2);
}

/**
 * Exactly one loud index. Prefer the first hint.loud in (0, last); ignore
 * first/last hints (they break the title/closing contract) and never OR every
 * hint onto the default pick (that created multi-loud plans).
 */
function resolveLoudIndex(slideCount: number, hints: CompositionSlideHint[]): number {
  if (slideCount < 4) return -1;
  for (let i = 1; i < slideCount - 1; i++) {
    if (hints[i]?.loud === true) return i;
  }
  return pickLoudIndex(slideCount);
}

/**
 * Sequence a non-repeating composition plan for `slideCount` slides.
 *
 * Guarantees:
 *  - No two consecutive slides share the same anchor.
 *  - Dense slides are spaced out (never two dense anchors back to back).
 *  - Exactly one loud slide (fullBleed) when the deck has ≥ 4 slides.
 *  - Slide 0 is never loud; the final slide is quiet (centered/edgeAligned).
 *
 * Caller hints bias specific positions but never break the no-repeat rule —
 * a hinted anchor that would repeat its neighbour is nudged to the next
 * contrasting anchor in the style's bias order. Multiple `loud: true` hints
 * collapse to the first valid middle index.
 */
export function sequenceComposition(slideCount: number, styleId: string, hints: CompositionSlideHint[] = []): CompositionPlan {
  const count = Math.max(0, Math.round(slideCount));
  const loudIndex = resolveLoudIndex(count, hints);
  const bias = STYLE_ANCHOR_BIAS[styleId] ?? ANCHOR_ROTATION;
  const slides: CompositionPlanEntry[] = [];
  let prevAnchor: CompositionAnchor | null = null;
  let cursor = 0;
  const nextContrasting = (avoid: CompositionAnchor | null): CompositionAnchor => {
    const candidates = [...bias, ...ANCHOR_ROTATION];
    for (let step = 0; step < candidates.length + 1; step++) {
      const candidate = candidates[(cursor + step) % candidates.length];
      if (candidate === 'fullBleed') continue;
      if (candidate !== avoid) {
        cursor = (cursor + step + 1) % candidates.length;
        return candidate;
      }
    }
    return 'leftHeavy';
  };
  for (let index = 0; index < count; index++) {
    const hint = hints[index] ?? {};
    let isLoud = index === loudIndex;
    let anchor: CompositionAnchor;
    if (isLoud) {
      anchor = 'fullBleed';
    } else if (hint.anchor && hint.anchor !== 'fullBleed' && hint.anchor !== prevAnchor) {
      anchor = hint.anchor;
    } else {
      anchor = nextContrasting(prevAnchor);
    }

    if (index === 0) {
      isLoud = false;
      if (anchor === 'fullBleed' || !hint.anchor && anchor !== 'centered') anchor = 'centered';
    }
    if (index === count - 1 && count > 1) {
      isLoud = false;
      if (anchor === 'fullBleed' || anchor === 'split') {
        anchor = prevAnchor === 'centered' ? 'edgeAligned' : 'centered';
      }
    }
    const density: CompositionDensity = hint.density ?? ANCHOR_DENSITY[anchor];
    slides.push({
      index,
      anchor,
      density,
      loud: isLoud,
      note: describeAssignment(anchor, isLoud, density)
    });
    prevAnchor = anchor;
  }
  const actualLoudIndex = slides.findIndex(entry => entry.loud);
  return {
    slides,
    loudIndex: actualLoudIndex,
    styleId,
    rhythm: slides.map(s => s.loud ? `${s.anchor}*` : s.anchor).join(' → ')
  };
}
function describeAssignment(anchor: CompositionAnchor, loud: boolean, density: CompositionDensity): string {
  if (loud) {
    return 'The loud slide — use layoutId "imageFull" (variant fullBleed) with image:{src,sourceUrl} from image_search; minimal overlaid text. This is the deck’s single high-intensity moment.';
  }
  const densityNote = density === 'dense' ? 'denser slide — keep copy tight' : density === 'sparse' ? 'airy slide — lean on whitespace' : 'balanced slide';
  switch (anchor) {
    case 'centered':
      return `Centered, symmetric composition; ${densityNote}.`;
    case 'leftHeavy':
      return `Content massed on the left with breathing room on the right; ${densityNote}.`;
    case 'rightHeavy':
      return `Content massed on the right with breathing room on the left; ${densityNote}.`;
    case 'edgeAligned':
      return `Content pushed toward an edge with a large empty field opposite; ${densityNote}.`;
    case 'split':
      return `Two-panel split composition; ${densityNote}.`;
    default:
      return `${anchor}; ${densityNote}.`;
  }
}

/** List the anchors a layout family supports, used to match a plan to a variant. */
export function anchorsCompatible(preferred: CompositionAnchor, supported: CompositionAnchor[]): boolean {
  return supported.includes(preferred);
}

/**
 * Fallback chain when a layout family has no exact variant for a planned
 * anchor. Prefer a spatially-similar alternative over a rebuild demand.
 * `fullBleed` only maps to itself (never force a non-bleed family into loud).
 */
const ANCHOR_NEAREST: Record<CompositionAnchor, CompositionAnchor[]> = {
  edgeAligned: ['leftHeavy', 'rightHeavy', 'centered'],
  leftHeavy: ['edgeAligned', 'rightHeavy', 'centered'],
  rightHeavy: ['edgeAligned', 'leftHeavy', 'centered'],
  centered: ['leftHeavy', 'rightHeavy', 'split'],
  split: ['leftHeavy', 'rightHeavy', 'centered'],
  fullBleed: ['fullBleed']
};
export interface NearestAnchorPick {
  anchor: CompositionAnchor;
  /** Exact match vs nearest-neighbor fallback. */
  exact: boolean;
}

/**
 * Pick the best available anchor from `supported` for a planned `preferred`.
 * Returns null when the family cannot approximate at all (e.g. fullBleed-only
 * request on a family with no fullBleed).
 */
export function pickNearestAnchor(preferred: CompositionAnchor, supported: CompositionAnchor[]): NearestAnchorPick | null {
  if (!supported.length) return null;
  if (supported.includes(preferred)) return {
    anchor: preferred,
    exact: true
  };
  for (const candidate of ANCHOR_NEAREST[preferred] ?? []) {
    if (supported.includes(candidate)) return {
      anchor: candidate,
      exact: false
    };
  }
  if (preferred !== 'fullBleed') {
    const soft = supported.find(a => a !== 'fullBleed');
    if (soft) return {
      anchor: soft,
      exact: false
    };
  }
  return null;
}

/** Convert an internal 0-based plan to the 1-based numbers agents send and receive. */
export function toApiCompositionPlan(plan: CompositionPlan): CompositionPlan {
  return {
    ...plan,
    loudIndex: plan.loudIndex < 0 ? -1 : plan.loudIndex + 1,
    slides: plan.slides.map(entry => ({
      ...entry,
      index: entry.index + 1
    }))
  };
}
