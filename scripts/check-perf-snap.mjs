import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function assert(condition, message) {
  if (!condition) failures.push(message)
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

function sliceNamedFn(src, name) {
  const match = src.match(new RegExp(String.raw`(?:const|function|let)\s+${name}\b[\s\S]*?\{`))
  if (!match) return ''
  const open = src.indexOf(match[0]) + match[0].length - 1
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  return ''
}

const snap = read('src/utils/snap.ts')
assert(/\bcollectGaps\b/.test(snap), 'collectGaps may exist for spacing snap')
assert(/\bboxesNear\b/.test(snap) || /\bquerySnap\b/.test(snap), 'snap.ts queries the k-neighbor set via boxesNear/querySnap')
assert(
  /(?:const\s+nearby\s*=\s*(?:boxesNear|neighborsForMove|querySnap)\b|const\s+\{\s*nearby\b)/.test(snap),
  'snapMovingBox/snapResizePoint must bind nearby from boxesNear/querySnap (or a thin wrapper)',
)
assert(
  /collectGaps\s*\(\s*nearby\s*,/.test(snap),
  'collectGaps must only run on the k-neighbor set from boxesNear/querySnap',
)
assert(
  !/collectGaps\s*\(\s*others\s*,/.test(snap),
  'collectGaps must not walk ALL others',
)
assert(
  /collectSpacingCandidates\s*\(\s*moving,\s*nearby\s*\)/.test(snap),
  'collectSpacingCandidates must receive the nearby k-set, not the full others list',
)
assert(
  !/collectSpacingCandidates\s*\(\s*moving,\s*others\s*\)/.test(snap),
  'collectSpacingCandidates must not receive the full others list',
)
assert(
  !/collectGaps\s*\(\s*others\s*,/.test(sliceNamedFn(snap, 'snapMovingBox')),
  'snapMovingBox must not call collectGaps on ALL others',
)

const drag = read('src/views/Editor/Canvas/hooks/useDragElement.ts')
const handleMousemove = sliceNamedFn(drag, 'handleMousemove')
const handleMouseup = sliceNamedFn(drag, 'handleMouseup')
assert(handleMousemove.length > 0, 'useDragElement has a handleMousemove path')
assert(handleMouseup.length > 0, 'useDragElement has a handleMouseup/commit path')
assert(!/\bsetElementList\b/.test(handleMousemove), 'no setElementList inside the mousemove path')
assert(
  !/\bsetElementList\b/.test(handleMousemove) && !/commitLiveList\s*\(/.test(handleMousemove),
  'mousemove must not commit element list state',
)

const onDragMatch = drag.match(/onDrag\s*:\s*([^,\n]+)/)
assert(onDragMatch, 'useDragElement binds an onDrag handler')
assert(!/\bsetElementList\b/.test(onDragMatch[1]), 'no setElementList inside the onDrag path')

assert(
  /\bsetElementList\b/.test(handleMouseup) || /\bcommitLiveList\b/.test(handleMouseup),
  'setElementList is allowed only on pointerup/commit',
)
assert(/\bctrlMeasures\b/.test(handleMousemove), 'ctrl measures ride the existing snap query, not a second index build')
assert(!/buildSnapIndex\s*\(/.test(handleMousemove), 'mousemove must not rebuild the snap index')
assert(/\bsetLiveElementOffset\b/.test(handleMousemove), 'mousemove applies a live DOM write instead of React state')
assert(
  /setLiveElementOffset\(\s*liveOrigins,\s*targetLeft - elOriginLeft,\s*targetTop - elOriginTop,\s*canvasScaleRef\.current/.test(handleMousemove),
  'live offset is origin + slide delta; canvasScale is only applied to the operate layer',
)
assert(/\bsettleLiveElementOffset\b/.test(handleMouseup), 'pointerup settles geometry before setElementList')

const canvas = read('src/views/Editor/Canvas/index.tsx')
assert(/if\s*\(\s*gesturingState\s*\)\s*return alignmentLines/.test(canvas), 'idle ctrl measures do not recompute from stale store boxes during a gesture')
assert(/buildSnapIndex\(others\)/.test(canvas), 'idle ctrl still uses the spatial index')

if (failures.length) {
  console.error('perf snap checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('perf snap checks passed')
