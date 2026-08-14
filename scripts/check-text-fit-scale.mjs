import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  fitScaleFromContentHeight,
  fitClipPadding,
  MIN_FIT_SCALE,
} = await import(pathToFileURL(join(root, 'src/utils/textFit.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

assert(fitScaleFromContentHeight(0, 100) === 1, 'empty content does not shrink')
assert(fitScaleFromContentHeight(100, 0) === 1, 'empty box does not shrink')
assert(fitScaleFromContentHeight(200, 400) === 1, 'short content in a tall box stays at 100% (Excel does not grow)')
assert(fitScaleFromContentHeight(400, 400) === 1, 'exact fit stays at 100%')
assert(fitScaleFromContentHeight(399.4, 400) === 1, 'subpixel underfit stays at 100%')

const overflow = fitScaleFromContentHeight(500, 400)
assert(overflow === 0.8, `overflow 500→400 must be 0.8, got ${overflow}`)
assert(overflow < 1, 'overflowing content must shrink')
assert(500 * overflow <= 400 + 0.05, 'scaled height must fit the box')

const wrapping = fitScaleFromContentHeight(941, 457)
assert(wrapping < 1, 'Obsah-like overflow must shrink')
assert(941 * wrapping <= 457 + 0.05, 'Obsah-like scaled height must fit')
assert(wrapping >= MIN_FIT_SCALE, 'must not shrink below the floor')

const tiny = fitScaleFromContentHeight(10000, 100)
assert(tiny === MIN_FIT_SCALE, `extreme overflow clamps to min scale, got ${tiny}`)

const padTight = fitClipPadding(37, 0.86)
assert(padTight >= 3 && padTight <= 12, `tight line-height pad is small, got ${padTight}`)
const padNormal = fitClipPadding(16, 1.5)
assert(padNormal >= 3 && padNormal <= 8, `normal line-height pad is small, got ${padNormal}`)

if (failures.length) {
  console.error('text-fit scale checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('text-fit scale checks passed')
