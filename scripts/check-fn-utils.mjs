import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { debounce, throttle } = await import(pathToFileURL(join(root, 'src/utils/debounce.ts')).href)
const { omit, isEqual, arraysEqual } = await import(pathToFileURL(join(root, 'src/utils/object.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const omitted = omit({ a: 1, b: 2, c: 3 }, ['b', 'c'])
assert(omitted.a === 1 && omitted.b === undefined && omitted.c === undefined, 'omit drops listed keys')
const src = { keep: true, drop: 1 }
const copy = omit(src, 'drop')
assert(src.drop === 1 && copy.drop === undefined && copy.keep === true, 'omit copies instead of mutating')

assert(isEqual(1, 1) && isEqual('a', 'a') && isEqual(null, null), 'isEqual primitives')
assert(isEqual(NaN, NaN), 'isEqual treats NaN as equal')
assert(!isEqual(1, '1') && !isEqual(null, undefined) && !isEqual(null, {}), 'isEqual rejects mixed types')
assert(isEqual([1, { x: 2 }], [1, { x: 2 }]), 'isEqual nested arrays')
assert(isEqual({ id: 's', els: [1, { x: 2 }] }, { els: [1, { x: 2 }], id: 's' }), 'isEqual ignores object key order')
assert(!isEqual({ id: 's', els: [1, 2] }, { id: 's', els: [2, 1] }), 'isEqual respects array order')
assert(!isEqual([1], { 0: 1, length: 1 }), 'isEqual does not treat array-like objects as arrays')
assert(isEqual({}, {}) && isEqual([], []), 'isEqual empty containers')

const cycleA = { x: 1 }
cycleA.self = cycleA
const cycleB = { x: 1 }
cycleB.self = cycleB
assert(isEqual(cycleA, cycleB), 'isEqual same-shaped cycles')
const cycleC = { x: 2 }
cycleC.self = cycleC
assert(!isEqual(cycleA, cycleC), 'isEqual different cycle values')

const leftA = { n: 1 }
const leftB = { n: 1 }
leftA.ref = leftB
leftB.ref = leftA
const rightA = { n: 1 }
const rightB = { n: 1 }
rightA.ref = rightB
rightB.ref = rightA
assert(isEqual(leftA, rightA), 'isEqual mutual cycles')
const selfCycle = { n: 1 }
selfCycle.ref = selfCycle
assert(!isEqual(leftA, selfCycle), 'isEqual rejects different cycle shapes')

assert(arraysEqual(['0_0', '0_1'], ['0_0', '0_1']), 'arraysEqual matches same string[]')
assert(!arraysEqual(['0_0'], ['0_0', '0_1']), 'arraysEqual rejects different length')
assert(!arraysEqual(['0_0', '0_1'], ['0_1', '0_0']), 'arraysEqual respects order')
assert(arraysEqual(undefined, undefined) && !arraysEqual(['0_0'], undefined) && !arraysEqual(null, []), 'arraysEqual nullish')
const same = ['a']
assert(arraysEqual(same, same), 'arraysEqual same reference')

const trailingCalls = []
const trailing = debounce((n) => trailingCalls.push(n), 25, { trailing: true })
trailing(1)
trailing(2)
await wait(45)
assert(trailingCalls.join(',') === '2', 'debounce trailing invokes last args once')

const flushed = []
const flushable = debounce((n) => flushed.push(n), 200, { trailing: true })
flushable(3)
flushable.flush()
assert(flushed.join(',') === '3', 'debounce flush invokes pending call')
flushable.flush()
assert(flushed.join(',') === '3', 'debounce flush is a no-op when idle')

const cancelled = []
const cancelable = debounce((n) => cancelled.push(n), 25, { trailing: true })
cancelable(4)
cancelable.cancel()
await wait(45)
assert(cancelled.length === 0, 'debounce cancel drops pending call')
cancelable(5)
await wait(45)
assert(cancelled.join(',') === '5', 'debounce works after cancel')

const zeroWait = []
const immediate = debounce((n) => zeroWait.push(n), 0)
immediate(1)
immediate(2)
await wait(10)
assert(zeroWait.join(',') === '2', 'debounce wait 0 still collapses a burst')

const leadingDebounced = []
const lead = debounce((n) => leadingDebounced.push(n), 25, { leading: true, trailing: true })
lead(1)
lead(2)
await wait(45)
assert(leadingDebounced[0] === 1 && leadingDebounced[leadingDebounced.length - 1] === 2, 'debounce leading+trailing fires first and last')

const leadingOnlyDebounce = []
const leadOnly = debounce((n) => leadingOnlyDebounce.push(n), 25, { leading: true, trailing: false })
leadOnly(1)
leadOnly(2)
await wait(45)
assert(leadingOnlyDebounce.join(',') === '1', 'debounce leading-only ignores the rest of the burst')

const ctx = { n: 0 }
const bound = debounce(function (delta) {
  this.n += delta
}, 20)
bound.call(ctx, 2)
bound.flush()
assert(ctx.n === 2, 'debounce preserves this')

const leadingOnly = []
const leadingThrottle = throttle((n) => leadingOnly.push(n), 30, { leading: true, trailing: false })
leadingThrottle(1)
leadingThrottle(2)
leadingThrottle(3)
await wait(20)
assert(leadingOnly.join(',') === '1', 'throttle leading-only ignores the rest of the window')
await wait(25)
leadingThrottle(4)
assert(leadingOnly.join(',') === '1,4', 'throttle leading-only fires again after the window')

const bothEdges = []
const both = throttle((n) => bothEdges.push(n), 30, { leading: true, trailing: true })
both(1)
both(2)
both(3)
await wait(50)
assert(bothEdges[0] === 1 && bothEdges[bothEdges.length - 1] === 3 && bothEdges.length === 2, 'throttle leading+trailing fires first and last')

const cancelledThrottle = []
const cancelThrottle = throttle((n) => cancelledThrottle.push(n), 40, { leading: true, trailing: true })
cancelThrottle(1)
cancelThrottle(2)
cancelThrottle.cancel()
await wait(50)
assert(cancelledThrottle.join(',') === '1', 'throttle cancel drops the trailing call')
cancelThrottle(3)
assert(cancelledThrottle.join(',') === '1,3', 'throttle leading-fires after cancel')

if (failures.length) {
  console.error('fn-utils checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('fn-utils checks passed')
