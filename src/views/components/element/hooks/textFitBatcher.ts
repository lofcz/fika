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

/**
 * Run all pending DOM verification jobs in lockstep write/read phases so N
 * mounting text boxes share 1–6 browser layouts instead of N × 12 sequential
 * forced reflows.
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
      job.low = job.estimate
      const upperProbe = Math.min(1, Math.max(job.estimate * 1.08, job.estimate + 0.025))
      job.high = 1
      job.probe = upperProbe
      job.hasUpperBound = false
      converging.push(job)
    }
    else {
      job.high = job.estimate
      job.low = job.floor
      job.hasUpperBound = true
      const ratioGuess = Math.max(
        job.floor,
        Math.min(job.estimate - 0.002, job.estimate * (job.height / Math.max(1, rendered)) * 0.985),
      )
      job.probe = ratioGuess
      converging.push(job)
    }
  }

  // Lockstep write -> read bisection across all still-converging boxes.
  for (let step = 0; step < 10 && converging.length > 0; step++) {
    for (let i = 0; i < converging.length; i++) {
      const job = converging[i]
      job.commitScale(job.probe)
      job.lastCommitted = job.probe
    }
    let writeIdx = 0
    for (let i = 0; i < converging.length; i++) {
      const job = converging[i]
      const rendered = job.content.scrollHeight
      if (rendered <= job.height) {
        job.low = job.probe
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
        if (job.high - job.low <= 0.001) {
          finishJob(job, job.low)
          continue
        }
        job.probe = (job.low + job.high) / 2
        converging[writeIdx++] = job
      }
      else {
        job.high = job.probe
        job.hasUpperBound = true
        if (job.high - job.low <= 0.001) {
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
        job.probe = (job.low + job.high) / 2
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
