import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  createJobProgress,
  formatJobProgressTip,
  jobProgressPhase,
  slideJobProgress,
} = await import(pathToFileURL(join(root, 'src/utils/jobProgress.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

assert(jobProgressPhase(0, 0) === 'preparing', 'no current/total is preparing')
assert(jobProgressPhase(0, 12) === 'preparing', 'current 0 is preparing')
assert(jobProgressPhase(3, 12) === 'working', 'in-range current is working')
assert(jobProgressPhase(13, 12) === 'finishing', 'current past total is finishing')

const labels = {
  running: 'Importing...',
  preparing: 'Reading file…',
  finishing: 'Applying slides…',
  slideProgress: ({ current, total }) => `Slide ${current} of ${total}`,
}

assert(formatJobProgressTip(false, 3, 12, labels) === 'Importing...', 'idle uses running label')
assert(formatJobProgressTip(true, 0, 12, labels) === 'Reading file…', 'start uses preparing')
assert(formatJobProgressTip(true, 4, 12, labels) === 'Slide 4 of 12', 'mid uses slide progress')
assert(formatJobProgressTip(true, 13, 12, labels) === 'Applying slides…', 'tail uses finishing')

assert(Math.abs(slideJobProgress(0, 10, 0.1, 0.9) - 0.18) < 1e-9, 'first slide maps to start+step')
assert(Math.abs(slideJobProgress(9, 10, 0.1, 0.9) - 0.9) < 1e-9, 'last slide maps to end')
assert(slideJobProgress(0, 0, 0.1, 0.9) === 0.9, 'empty count still reaches end')

const job = createJobProgress()
const gen = job.start(4)
await job.tick(0.92, 4, gen, { yieldPaint: false })
await job.tick(0.88, 4, gen, { yieldPaint: false })
assert(job.progress.value === 0.92, 'ticks never move progress backwards')
assert(job.finish(gen) === true, 'finish accepts current generation')
assert(job.progress.value === 1, 'finish locks progress at 100%')
assert(job.running.value === false, 'finish stops the job')

if (failures.length) {
  console.error('job progress checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('job progress checks passed')
