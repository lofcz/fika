import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Runtime checks for the composition sequencer (composition.ts).
 *
 * composition.ts is a pure module (no runtime imports), so we can import it
 * directly under Node's native TS type-stripping and exercise its guarantees:
 *  - no two consecutive slides share an anchor,
 *  - exactly one loud (fullBleed) slide for decks of >= 4 slides,
 *  - slide 0 is centered, the final slide is quiet,
 *  - the plan length matches the requested slide count.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { sequenceComposition } = await import(pathToFileURL(join(root, 'src/embed/agentic/composition.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const styles = ['academic', 'minimal', 'bold', 'playful']
for (const styleId of styles) {
  for (const count of [1, 2, 3, 4, 6, 8, 10, 12]) {
    const { slides, loudIndex, rhythm } = sequenceComposition(count, styleId)
    assert(slides.length === count, `${styleId}/${count}: plan length ${slides.length} != ${count}`)

    for (let i = 1; i < slides.length; i++) {
      assert(
        slides[i].anchor !== slides[i - 1].anchor,
        `${styleId}/${count}: anchor repeat at slides ${i - 1}..${i} ("${slides[i].anchor}") — ${rhythm}`,
      )
    }

    const louds = slides.filter(s => s.loud)
    if (count >= 4) {
      assert(louds.length === 1, `${styleId}/${count}: expected exactly 1 loud slide, got ${louds.length}`)
      assert(louds[0].anchor === 'fullBleed', `${styleId}/${count}: loud slide must be fullBleed, got ${louds[0].anchor}`)
      assert(louds[0].index > 0, `${styleId}/${count}: loud slide must not be first`)
      assert(louds[0].index < count - 1, `${styleId}/${count}: loud slide must not be last`)
      assert(loudIndex === louds[0].index, `${styleId}/${count}: loudIndex mismatch`)
    } else {
      assert(louds.length === 0, `${styleId}/${count}: short decks must have no loud slide`)
      assert(loudIndex === -1, `${styleId}/${count}: loudIndex must be -1 for short decks`)
    }

    if (count > 0) assert(slides[0].anchor === 'centered', `${styleId}/${count}: first slide should be centered, got ${slides[0].anchor}`)
    if (count > 1) {
      const last = slides[count - 1]
      assert(last.anchor !== 'fullBleed' && last.anchor !== 'split', `${styleId}/${count}: last slide should be quiet, got ${last.anchor}`)
    }
  }
}

{
  const multi = sequenceComposition(6, 'academic', [
    {},
    { loud: true },
    {},
    { loud: true },
    {},
    {},
  ])
  const louds = multi.slides.filter(s => s.loud)
  assert(louds.length === 1, `multi hint.loud must yield 1 loud, got ${louds.length}`)
  assert(louds[0].index === 1, `first valid middle hint.loud wins, got index ${louds[0]?.index}`)
  assert(multi.loudIndex === 1, `loudIndex must match the single loud slide`)
  assert(louds[0].anchor === 'fullBleed', 'loud slide must be fullBleed')

  const first = sequenceComposition(4, 'academic', [{ loud: true }, {}, {}, {}])
  assert(!first.slides[0].loud, 'slide 0 must never be loud even when hinted')
  assert(first.slides[0].anchor !== 'fullBleed' || !first.slides[0].loud, 'slide 0 must not stay fullBleed+loud')
  assert(first.slides.filter(s => s.loud).length === 1, 'ignoring slide-0 loud hint still leaves exactly one loud')

  const last = sequenceComposition(4, 'academic', [{}, {}, {}, { loud: true }])
  const lastSlide = last.slides[3]
  assert(!lastSlide.loud, `last slide must not be loud, got loud=${lastSlide.loud} anchor=${lastSlide.anchor}`)
  assert(lastSlide.anchor !== 'fullBleed' && lastSlide.anchor !== 'split', `last slide must be quiet, got ${lastSlide.anchor}`)
  assert(last.slides.filter(s => s.loud).length === 1, 'ignoring last-slide loud hint still leaves exactly one loud')
}

if (failures.length) {
  console.error('Composition sequencer check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log('Composition sequencer check passed: 4 styles x 8 deck sizes, no anchor repeats, loud-slide rules hold.')
