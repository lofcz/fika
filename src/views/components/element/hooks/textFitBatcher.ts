import {
  getScopedFontRevision,
  rememberFitScale,
  subscribeTextFontChanges,
  type FitScaleOptions,
} from '@/utils/textFit'
import { htmlContainsMath } from '@/utils/math'

export type VerifiedFitEntry = {
  scale: number
  paragraphSpace?: string
}

const VERIFIED_FIT_CACHE_MAX = 400
const verifiedFitCache = new Map<string, VerifiedFitEntry>()

subscribeTextFontChanges(families => {
  if (!families) verifiedFitCache.clear()
})

export function clearVerifiedFitCache() {
  verifiedFitCache.clear()
}

export function readVerifiedFit(key: string): VerifiedFitEntry | undefined {
  const hit = verifiedFitCache.get(key)
  if (!hit) return undefined
  verifiedFitCache.delete(key)
  verifiedFitCache.set(key, hit)
  return hit
}

export function writeVerifiedFit(key: string, entry: VerifiedFitEntry) {
  verifiedFitCache.delete(key)
  if (verifiedFitCache.size >= VERIFIED_FIT_CACHE_MAX) {
    const oldest = verifiedFitCache.keys().next().value
    if (oldest !== undefined) verifiedFitCache.delete(oldest)
  }
  verifiedFitCache.set(key, entry)
}

function collectHtmlFontFamilies(html: string, baseFamily: string): string[] {
  const families = [baseFamily]
  if (html.includes('font-family')) {
    const re = /font-family\s*:\s*([^;"']+)/gi
    let match: RegExpExecArray | null
    while ((match = re.exec(html)) !== null) {
      if (match[1]) families.push(match[1])
    }
  }
  return families
}

export function verifiedFitKey(
  contentHtml: string,
  widthQ: number,
  heightQ: number,
  params: FitScaleOptions,
  vertical: boolean,
): string {
  const hasMath = htmlContainsMath(contentHtml)
  const fontRev = getScopedFontRevision(
    collectHtmlFontFamilies(contentHtml, params.defaultFontFamily || ''),
    hasMath,
  )
  return `${widthQ}x${heightQ}|${vertical ? 'v' : 'h'}|${params.defaultFontFamily || ''}|${params.defaultSize ?? 16}|${params.defaultWeight ?? ''}|${params.defaultItalic ? 1 : 0}|${params.lineHeight}|${params.letterSpacing ?? 0}|${params.blockSpace ?? 5}|${params.minFontSize ?? ''}|${fontRev}\0${contentHtml}`
}

export type SkipDomVerifyInput = {
  estimate: number
  pretextHeight: number
  boxHeight: number
  maxLinePx: number
  isScaling: boolean
  liveEdit: boolean
  isVertical: boolean
  hasMath: boolean
  fontsReady: boolean
  contentHtml?: string
}

const UNSAFE_SKIP_HTML_RE = /text-transform\s*:|<img\b/i

/**
 * True when Pretext already proves `scale === 1` with enough vertical headroom
 * (>= 15% of box height and >= 0.5 line), no inline math, no `text-transform`
 * or `<img>`, horizontal layout, and all fonts loaded — avoiding a forced DOM
 * `scrollHeight` layout on mount.
 */
export function shouldSkipDomVerify(input: SkipDomVerifyInput): boolean {
  if (input.isScaling || input.liveEdit || input.isVertical || input.hasMath || !input.fontsReady) return false
  if (input.contentHtml && UNSAFE_SKIP_HTML_RE.test(input.contentHtml)) return false
  if (input.estimate < 1) return false
  if (!(input.pretextHeight > 0) || !(input.boxHeight > 0)) return false
  return input.pretextHeight <= input.boxHeight * 0.85 && (input.boxHeight - input.pretextHeight) >= input.maxLinePx * 0.5
}

export type PendingVerifyJob = {
  host: HTMLElement
  content: HTMLElement
  box: HTMLElement | null
  elementId: string
  height: number
  floor: number
  estimate: number
  params: FitScaleOptions
  contentHtml: string
  cacheKey: string
  commitScale: (scale: number) => void
  isAlive: () => boolean
  low: number
  high: number
  probe: number
  lastCommitted: number
  hasUpperBound: boolean
  skipCacheWrite?: boolean
  maxFontSize?: number
  maxLinePx?: number
  lowHeight?: number
  highHeight?: number
  lastMovedSide?: 'low' | 'high'
  sameSideStreak?: number
}

const pendingBatchByHost = new Map<HTMLElement, PendingVerifyJob>()
let batchScheduled = false

function finishJob(job: PendingVerifyJob, settled: number, paragraphSpace?: string) {
  if (job.lastCommitted !== settled) {
    job.commitScale(settled)
    job.lastCommitted = settled
  }
  if (paragraphSpace) {
    job.host.style.setProperty('--paragraphSpace', paragraphSpace)
  }
  if (!job.skipCacheWrite) {
    writeVerifiedFit(job.cacheKey, paragraphSpace ? { scale: settled, paragraphSpace } : { scale: settled })
  }
  rememberFitScale(job.contentHtml, job.params, settled, job.elementId)
}

function nextBracketProbe(job: PendingVerifyJob): number {
  const span = job.high - job.low
  const mid = (job.low + job.high) / 2
  // Illinois-style bisection fallback: when the same endpoint moves twice in a
  // row (e.g. a 2-3 line title step-function wrap cliff), bisect so the bracket
  // always shrinks exponentially to <= 0.1px within 12 rounds.
  if ((job.sameSideStreak ?? 0) >= 2) {
    job.sameSideStreak = 0
    return mid
  }
  const loH = job.lowHeight
  const hiH = job.highHeight
  if (loH !== undefined && hiH !== undefined && hiH > loH + 1) {
    const t = (job.height - loH) / (hiH - loH)
    if (t > 0.05 && t < 0.95) {
      const secant = job.low + span * t
      const clamped = Math.max(job.low + span * 0.15, Math.min(job.high - span * 0.15, secant))
      return clamped
    }
  }
  return mid
}

function recordEndpointMove(job: PendingVerifyJob, side: 'low' | 'high') {
  if (job.lastMovedSide === side) {
    job.sameSideStreak = (job.sameSideStreak ?? 0) + 1
  }
  else {
    job.lastMovedSide = side
    job.sameSideStreak = 1
  }
}

function convergenceTolerance(job: PendingVerifyJob): number {
  const baseFont = Math.max(1, job.maxFontSize ?? job.params.defaultSize ?? 16)
  // Stop once hi - lo corresponds to <= 0.1px of font size (never looser than 0.005).
  return Math.min(0.005, 0.1 / baseFont)
}

/**
 * Run all pending DOM verification jobs in lockstep write/read phases so N
 * mounting text boxes share a few browser layouts instead of N × 12 sequential
 * forced reflows, settling to <= 0.1px font precision.
 */
export function runVerifyBatch(jobs: PendingVerifyJob[]) {
  const active: PendingVerifyJob[] = []
  for (const job of jobs) {
    if (!job.isAlive() || !job.host.isConnected) continue
    active.push(job)
  }
  if (!active.length) return

  // Pass 1 (READ ONLY — initial estimate was already written before queuing):
  const converging: PendingVerifyJob[] = []
  const floorCheck: PendingVerifyJob[] = []

  for (const job of active) {
    const rendered = job.content.scrollHeight
    if (rendered <= job.height) {
      if (job.estimate >= 1) {
        finishJob(job, 1)
        continue
      }
      if (1 - job.estimate <= convergenceTolerance(job)) {
        finishJob(job, job.estimate)
        continue
      }
      job.low = job.estimate
      job.lowHeight = rendered
      // Area/height scaling jump toward the true fit instead of tiny linear steps.
      const sqrtJump = job.estimate * Math.sqrt(job.height / Math.max(1, rendered))
      const upperProbe = Math.min(1, Math.max(sqrtJump, job.estimate + 0.03))
      job.high = 1
      job.probe = upperProbe
      job.hasUpperBound = false
      converging.push(job)
    }
    else {
      job.high = job.estimate
      job.highHeight = rendered
      job.low = job.floor
      job.hasUpperBound = true
      const ratioGuess = Math.max(
        job.floor,
        Math.min(job.estimate - 0.004, job.estimate * (job.height / Math.max(1, rendered)) * 0.995),
      )
      job.probe = ratioGuess
      converging.push(job)
    }
  }

  // Lockstep write -> read secant/bisection across all still-converging boxes (max 12 rounds).
  for (let step = 0; step < 12 && converging.length > 0; step++) {
    for (let i = 0; i < converging.length; i++) {
      const job = converging[i]
      job.commitScale(job.probe)
      job.lastCommitted = job.probe
    }
    let writeIdx = 0
    for (let i = 0; i < converging.length; i++) {
      const job = converging[i]
      const rendered = job.content.scrollHeight
      const tol = convergenceTolerance(job)
      if (rendered <= job.height) {
        job.low = job.probe
        job.lowHeight = rendered
        recordEndpointMove(job, 'low')
        if (!job.hasUpperBound) {
          if (job.probe >= 1) {
            finishJob(job, 1)
            continue
          }
          job.probe = 1
          job.hasUpperBound = true
          converging[writeIdx++] = job
          continue
        }
        if (job.high - job.low <= tol) {
          finishJob(job, job.low)
          continue
        }
        job.probe = nextBracketProbe(job)
        converging[writeIdx++] = job
      }
      else {
        job.high = job.probe
        job.highHeight = rendered
        job.hasUpperBound = true
        recordEndpointMove(job, 'high')
        if (job.high - job.low <= tol) {
          if (job.low <= job.floor + 0.0005) {
            job.commitScale(job.low)
            job.lastCommitted = job.low
            floorCheck.push(job)
          }
          else {
            finishJob(job, job.low)
          }
          continue
        }
        job.probe = nextBracketProbe(job)
        converging[writeIdx++] = job
      }
    }
    converging.length = writeIdx
  }

  for (const job of converging) {
    if (job.low <= job.floor + 0.0005) {
      if (job.lastCommitted !== job.low) {
        job.commitScale(job.low)
        job.lastCommitted = job.low
      }
      floorCheck.push(job)
    }
    else {
      finishJob(job, job.low)
    }
  }

  if (floorCheck.length > 0) {
    const gapWrites: { job: PendingVerifyJob; paragraphSpace?: string }[] = []
    for (const job of floorCheck) {
      const rendered = job.content.scrollHeight
      let paragraphSpace: string | undefined
      if (rendered > job.height + 1 && job.box) {
        const gap = parseFloat(getComputedStyle(job.box).getPropertyValue('--paragraphSpace')) || 0
        if (gap > 0) {
          paragraphSpace = `${Math.max(0, Math.floor(gap * (job.height / Math.max(1, rendered)) * 100) / 100)}px`
        }
      }
      gapWrites.push({ job, paragraphSpace })
    }
    for (const { job, paragraphSpace } of gapWrites) {
      finishJob(job, job.low, paragraphSpace)
    }
  }
}

function flushPendingVerifyBatch() {
  batchScheduled = false
  if (!pendingBatchByHost.size) return
  const jobs = Array.from(pendingBatchByHost.values())
  pendingBatchByHost.clear()
  runVerifyBatch(jobs)
}

export function enqueueVerifyJob(job: PendingVerifyJob) {
  pendingBatchByHost.set(job.host, job)
  if (!batchScheduled) {
    batchScheduled = true
    queueMicrotask(flushPendingVerifyBatch)
  }
}

export function cancelVerifyJobForHost(host: HTMLElement | null | undefined) {
  if (host) pendingBatchByHost.delete(host)
}
