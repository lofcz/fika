import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { orderElementList, collectOrderUnitIds } = await import(
  pathToFileURL(join(root, 'src/utils/elementOrder.ts')).href
)

const TOP = 'top'
const BOTTOM = 'bottom'
const UP = 'up'
const DOWN = 'down'

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const ids = list => list.map(el => el.id).join(',')
const el = (id, groupId) => ({ id, groupId, type: 'shape', left: 0, top: 0, width: 10, height: 10, rotate: 0 })

const grouped = [el('a', 'g1'), el('b', 'g1'), el('c', 'g1'), el('d')]
assert(collectOrderUnitIds(grouped, ['b']).join(',') === 'a,b,c', 'seed in a group expands to all members')

const front = orderElementList(grouped, ['b'], TOP)
assert(ids(front) === 'd,a,b,c', 'bring group to front keeps member order and moves as one block')

const back = orderElementList(grouped, ['b'], BOTTOM)
assert(back === null, 'group already at back cannot send further back')

const stacked = [el('x'), el('a', 'g1'), el('b', 'g1'), el('y')]
const toBack = orderElementList(stacked, ['a'], BOTTOM)
assert(ids(toBack) === 'a,b,x,y', 'send group to back places the whole group first')

const toFront = orderElementList(stacked, ['a'], TOP)
assert(ids(toFront) === 'x,y,a,b', 'bring group to front places the whole group last')

const forward = orderElementList(stacked, ['a'], UP)
assert(ids(forward) === 'x,y,a,b', 'bring group forward skips the next singleton')

const backward = orderElementList(stacked, ['a'], DOWN)
assert(ids(backward) === 'a,b,x,y', 'send group backward skips the previous singleton')

const twoGroups = [el('a', 'g1'), el('b', 'g1'), el('c', 'g2'), el('d', 'g2')]
const g1Forward = orderElementList(twoGroups, ['a'], UP)
assert(ids(g1Forward) === 'c,d,a,b', 'bring group forward skips the next group as a unit')

const g2Back = orderElementList(twoGroups, ['c'], DOWN)
assert(ids(g2Back) === 'c,d,a,b', 'send group backward skips the previous group as a unit')

const multi = [el('a'), el('b'), el('c'), el('d')]
const multiFront = orderElementList(multi, ['a', 'c'], TOP)
assert(ids(multiFront) === 'b,d,a,c', 'multi-select bring to front keeps relative order')

const multiBack = orderElementList(multi, ['b', 'd'], BOTTOM)
assert(ids(multiBack) === 'b,d,a,c', 'multi-select send to back keeps relative order')

const alreadyFront = orderElementList(multi, ['d'], TOP)
assert(alreadyFront === null, 'already at front is a no-op')

if (failures.length) {
  console.error('elementOrder checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('elementOrder checks passed')
