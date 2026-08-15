import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  livePositionCss,
  applyLivePositionStyles,
} = await import(pathToFileURL(join(root, 'src/utils/liveElementOffset.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const scaled = livePositionCss(140, 68, 0.75)
assert(scaled.slideLeft === '140px' && scaled.slideTop === '68px', 'painted box uses slide left/top')
assert(scaled.visualLeft === '105px' && scaled.visualTop === '51px', 'operate uses slide × canvasScale')

const identity = livePositionCss(16, 8, 1)
assert(identity.slideLeft === identity.visualLeft && identity.slideTop === identity.visualTop, 'scale 1 is the same in both spaces')

const box = { style: { translate: '40px -12px', left: '100px', top: '80px' } }
const operate = { style: { translate: '30px -9px', left: '75px', top: '60px' } }
const wrapper = { style: { translate: '' } }
applyLivePositionStyles({ box, operate }, 140, 68, 0.75)
assert(box.style.left === '140px' && box.style.top === '68px', 'live drag writes slide left/top onto the box')
assert(box.style.translate === '', 'painted box never keeps a CSS translate')
assert(operate.style.left === '105px' && operate.style.top === '51px', 'live drag writes visual left/top onto operate')
assert(operate.style.translate === '', 'operate never keeps a CSS translate')
assert(wrapper.style.translate === '', 'unsized editable wrapper is never touched')

const drag = readFileSync(join(root, 'src/views/Editor/Canvas/hooks/useDragElement.ts'), 'utf8')
assert(
  /setLiveElementOffset\(\s*liveOrigins,\s*targetLeft - elOriginLeft,\s*targetTop - elOriginTop,\s*canvasScaleRef\.current/.test(drag),
  'mousemove passes origin + slide delta; scale is only applied inside liveElementOffset',
)
assert(!/\.style\.translate/.test(drag), 'useDragElement does not set CSS translate')
assert(/\bsettleLiveElementOffset\b/.test(drag), 'pointerup settles left/top before React commit')
assert(/setGesturingState\(false\)/.test(drag), 'gesturing ends after the drop commit')
assert(/requestAnimationFrame/.test(drag), 'gesturing stays true through the drop commit frame')

const scale = readFileSync(join(root, 'src/views/Editor/Canvas/hooks/useScaleElement.ts'), 'utf8')
assert(scale.includes("from '@/utils/liveElementSize'"), 'live resize writes size through the same shared module as drag writes position')

const impl = readFileSync(join(root, 'src/utils/liveElementOffset.ts'), 'utf8')
assert(/firstElementChild/.test(impl), 'live position targets the positioned box, not the unsized wrapper')
assert(!/nodes\.box\.style\.translate = (?!'')/.test(impl), 'live offset never assigns a non-empty translate on the painted box')

const textEl = readFileSync(join(root, 'src/views/components/element/TextElement/index.tsx'), 'utf8')
assert(/isGesturing/.test(textEl), 'auto-size height must not rewrite during a drag gesture')

if (failures.length) {
  console.error('liveElementOffset checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('liveElementOffset checks passed')
