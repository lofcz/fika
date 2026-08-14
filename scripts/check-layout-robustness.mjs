import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundleEntry } from './lib/bundle-ts-entry.mjs'

/**
 * Runtime checks for the layout-robustness layer (layouts.ts + qa.ts):
 *  - aliases: natural guessed slot names (leftColumn, columns) fill content.
 *  - validation: unknown slots produce a "did you mean" warning, not silence.
 *  - anchor-vs-variant: an anchor name passed as variantId maps to the right variant.
 *  - QA contentEmpty: a content layout that renders only a title is flagged.
 *
 * layouts.ts imports `@/…` aliases, so we bundle the entry with Rsbuild (which
 * resolves the aliases) into a temp ESM file and import that in Node. The
 * exercised functions (normalizeLayoutSlots, layoutExpectsBody, validateSlide)
 * are pure and DOM-free, so no browser boot is required.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = (entry, fileName) => bundleEntry(root, entry, fileName)

const qa = await bundle('src/embed/agentic/qa.ts', 'qa.mjs')
const { validateSlide } = qa

const layouts = await bundle('src/embed/agentic/layouts.ts', 'layouts.mjs')
const { normalizeLayoutSlots, layoutExpectsBody, listLayouts, stripLeadingListMarkers } = layouts

const stylesMod = await bundle('src/embed/agentic/styles.ts', 'styles.mjs')
const preset = stylesMod.PPTX_STYLE_PRESETS?.[0] ?? stylesMod.listStylePresets?.()[0] ?? stylesMod.resolveStylePreset?.('minimal')

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const twoColumn = listLayouts().find(l => l.id === 'twoColumn')
const comparison = listLayouts().find(l => l.id === 'comparison')
assert(twoColumn, 'twoColumn layout should exist in the catalog')
assert(comparison, 'comparison layout should exist in the catalog')

{
  const { slots, warnings } = normalizeLayoutSlots(twoColumn, {
    title: 'Význam hub',
    leftColumn: '### Les\n- rozkladači',
    rightColumn: '### Využití\n- potraviny',
  })
  const names = Object.keys(slots)
  assert(names.some(n => /left/i.test(n) && n !== 'leftColumn'), `leftColumn should map to a real left slot, got ${names.join(',')}`)
  assert(!('leftColumn' in slots), 'the guessed key should not survive as-is')
  assert(warnings.some(w => w.includes('leftColumn')), 'expected an alias warning naming leftColumn')
}

{
  const validBody = twoColumn.slots.find(s => /left/i.test(s.name) && /bod/i.test(s.name))?.name ?? 'leftBody'
  const nearMiss = validBody.replace(/Body$/, 'Bod') 
  const { slots, warnings } = normalizeLayoutSlots(twoColumn, { title: 'X', [nearMiss]: 'some content here' })
  assert(slots[validBody], `fuzzy ${nearMiss}->${validBody} failed: ${JSON.stringify(Object.keys(slots))}`)
  assert(warnings.some(w => w.includes('did you mean') || w.includes(validBody)), 'expected a suggestion warning')
}

{
  const { slots, warnings } = normalizeLayoutSlots(twoColumn, { title: 'X', zzzqqq: 'junk' })
  assert(!('zzzqqq' in slots), 'unknown slot should not be kept under its own key')
  assert(warnings.some(w => w.includes('zzzqqq')), 'expected an unknown-slot warning')
}

{
  const { slots, warnings } = normalizeLayoutSlots(comparison, {
    title: 'Jedlé vs jedovaté',
    columns: [
      { heading: 'Jedlé', body: 'hřib, liška' },
      { heading: 'Jedovaté', body: 'muchomůrka' },
    ],
  })
  assert(Array.isArray(slots.rows), 'columns alias should produce rows')
  assert(warnings.length > 0, 'expected a coercion/alias warning')
}

{
  const titleOnly = {
    elements: [
      { id: 'e1', type: 'text', left: 0, top: 0, width: 100, height: 40, content: '<p><span style="font-size:40px">Title</span></p>' },
    ],
  }
  const issues = validateSlide(titleOnly, preset, { expectsBody: true, layoutId: 'twoColumn' })
  assert(issues.some(i => i.code === 'contentEmpty' && i.severity === 'error'), `expected contentEmpty error, got ${JSON.stringify(issues)}`)
}

{
  const withBody = {
    elements: [
      { id: 'e1', type: 'text', left: 0, top: 0, width: 100, height: 40, content: '<p><span style="font-size:40px">Title</span></p>' },
      { id: 'e2', type: 'text', left: 0, top: 100, width: 100, height: 200, content: '<ul><li><span style="font-size:20px">a real bullet with several words here</span></li></ul>' },
    ],
  }
  const issues = validateSlide(withBody, preset, { expectsBody: true, layoutId: 'twoColumn' })
  assert(!issues.some(i => i.code === 'contentEmpty'), `unexpected contentEmpty: ${JSON.stringify(issues)}`)
}

{
  const cardsLike = {
    elements: [
      { id: 't', type: 'text', left: 0, top: 0, width: 100, height: 40, content: '<p>Klíčové postavy</p>' },
      { id: 'h1', type: 'text', left: 0, top: 50, width: 40, height: 20, content: '<p>Harry Domin</p>' },
      { id: 'h2', type: 'text', left: 50, top: 50, width: 40, height: 20, content: '<p>Helena Gloryová</p>' },
      { id: 'h3', type: 'text', left: 0, top: 100, width: 40, height: 20, content: '<p>Inženýr Fabry</p>' },
      { id: 'h4', type: 'text', left: 50, top: 100, width: 40, height: 20, content: '<p>Primus a Radia</p>' },
    ],
  }
  const issues = validateSlide(cardsLike, preset, { expectsBody: true, layoutId: 'cards' })
  assert(!issues.some(i => i.code === 'contentEmpty'), `cards with multiple short texts must not contentEmpty: ${JSON.stringify(issues)}`)
}

assert(layoutExpectsBody('twoColumn') === true, 'twoColumn should expect body')
assert(layoutExpectsBody('bullets') === true, 'bullets should expect body')
assert(layoutExpectsBody('cards') === true, 'cards should expect body')
assert(layoutExpectsBody('title') === false, 'title should not expect body')
assert(layoutExpectsBody('bigStat') === false, 'bigStat is inherently short — must not contentEmpty on a valid number')

{
  const imageFull = listLayouts().find(l => l.id === 'imageFull')
  assert(imageFull, 'imageFull layout should exist')
  const { slots, warnings } = normalizeLayoutSlots(imageFull, {
    title: 'R.U.R.',
    image: 'https://example.com/photo.jpg',
    sourceUrl: 'https://en.wikipedia.org/wiki/R.U.R.',
  })
  assert(
    slots.image && typeof slots.image === 'object' && slots.image.src === 'https://example.com/photo.jpg',
    `expected nested image.src, got ${JSON.stringify(slots.image)}`,
  )
  assert(
    slots.image?.sourceUrl === 'https://en.wikipedia.org/wiki/R.U.R.',
    `expected nested image.sourceUrl, got ${JSON.stringify(slots.image)}`,
  )
  assert(warnings.some(w => /sourceUrl|Nested/i.test(w)), 'expected a soft nest advisory')
}

{
  assert(typeof stripLeadingListMarkers === 'function', 'stripLeadingListMarkers must be exported')
  const cases = [
    ['• Rostliny dýchají', 'Rostliny dýchají'],
    ['• • Rostliny dýchají', 'Rostliny dýchají'],
    ['- item', 'item'],
    ['* item', 'item'],
    ['+ item', 'item'],
    ['1. First', 'First'],
    ['2) Second', 'Second'],
    ['1. - nested', 'nested'],
    ['● big', 'big'],
    ['plain', 'plain'],
  ]
  for (const [input, expected] of cases) {
    const got = stripLeadingListMarkers(input)
    assert(got === expected, `stripLeadingListMarkers(${JSON.stringify(input)}) → ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`)
  }
}

const composition = await bundle('src/embed/agentic/composition.ts', 'composition.mjs')
const { pickNearestAnchor } = composition
{
  const exact = pickNearestAnchor('centered', ['centered', 'split'])
  assert(exact?.exact === true && exact.anchor === 'centered', 'exact anchor should win')
  const near = pickNearestAnchor('edgeAligned', ['leftHeavy', 'rightHeavy', 'centered'])
  assert(near?.exact === false && (near.anchor === 'leftHeavy' || near.anchor === 'rightHeavy'), `edgeAligned should map to heavy, got ${JSON.stringify(near)}`)
  const bleed = pickNearestAnchor('fullBleed', ['centered', 'leftHeavy'])
  assert(bleed == null, 'fullBleed must not map onto non-bleed families')
}

const { buildLayoutSlide } = layouts
const viewport = { width: 1000, height: 562.5 }

{
  const { slide, warnings } = await buildLayoutSlide(
    'numbered',
    {
      title: 'Průběh',
      steps: [
        { heading: '1. Světelná fáze', body: 'Chlorofyl zachytí světlo.' },
        { heading: '2) Temnostní fáze', body: 'CO2 se mění na cukr.' },
      ],
    },
    preset,
    viewport,
    'auto',
    'standard',
  )
  const texts = (slide.elements || [])
    .filter(el => el.type === 'text')
    .map(el => String(el.content || ''))
  const joined = texts.join('\n')
  assert(!/1\.\s*Světelná/.test(joined), `numbered must strip leading "1." from heading, got: ${joined.slice(0, 200)}`)
  assert(!/2\)\s*Temnostní/.test(joined), `numbered must strip leading "2)" from heading, got: ${joined.slice(0, 200)}`)
  assert(/Světelná fáze/.test(joined), 'numbered heading text must remain after strip')
  void warnings
}

{
  const { slide } = await buildLayoutSlide(
    'bullets',
    { title: 'Co je to?', bullets: ['Jedna', 'Dva', 'Tři'] },
    preset,
    viewport,
    'auto',
    'standard',
  )
  const bulletEl = (slide.elements || []).find(el => el.type === 'text' && String(el.content || '').includes('<ul>'))
  assert(bulletEl, 'bullets standard must emit a ul')
  assert(bulletEl.width >= 800, `bullets standard must be full width, got width=${bulletEl.width}`)
}

{
  const { slide, warnings, variantId } = await buildLayoutSlide(
    'cards',
    {
      title: 'Suroviny',
      cards: [
        { heading: 'Voda', body: 'H2O' },
        { heading: 'CO2', body: 'vzduch' },
        { heading: 'Světlo', body: 'energie' },
        { heading: 'Glukóza', body: 'cukr' },
        { heading: 'Kyslík', body: 'O2' },
      ],
    },
    preset,
    viewport,
    'auto',
    'rightOffset',
  )
  assert(variantId === 'rightOffset', 'variant id is preserved even when geometry collapses')
  assert(
    warnings.some(w => /Collapsed|full-width/i.test(w)),
    `expected collapse warning for dense rightOffset, got ${JSON.stringify(warnings)}`,
  )
  const shapes = (slide.elements || []).filter(el => el.type === 'shape')
  const cardPanels = shapes.filter(el => el.width > 100 && el.height > 40)
  assert(cardPanels.length >= 5, `expected ≥5 card panels, got ${cardPanels.length}`)
  const minLeft = Math.min(...cardPanels.map(el => el.left))
  assert(minLeft < 100, `collapsed grid should start near left margin, got minLeft=${minLeft}`)
}

{
  const { slide } = await buildLayoutSlide(
    'twoColumn',
    {
      title: 'Význam',
      leftHeading: 'Život',
      leftBody: '- Zdroj kyslíku\n- Potravní řetězce',
      rightHeading: 'Klima',
      rightBody: '- Rovnováha CO2\n- Fosilní paliva',
    },
    preset,
    viewport,
    'auto',
    'even',
  )
  const ulCount = (slide.elements || []).filter(el => el.type === 'text' && String(el.content || '').includes('<ul>')).length
  assert(ulCount >= 2, `twoColumn body lists must coerce to <ul>, found ${ulCount}`)
}

{
  const academic = stylesMod.resolveStylePreset?.('academic') ?? preset
  assert(academic?.motif?.shape === 'doubleRule', 'academic style should still declare doubleRule motif')

  const thinRules = (slide) =>
    (slide.elements || []).filter(el => el.type === 'shape' && el.height <= 2.5 && el.width >= 40)

  const cardsBuilt = await buildLayoutSlide(
    'cards',
    {
      title: 'Vstupy fotosyntézy',
      cards: [
        { heading: 'Voda ($H_2O$)', body: 'Přijímán kořeny z půdy, zajišťuje transport živin.' },
        { heading: 'Oxid uhličitý ($CO_2$)', body: 'Získáván z atmosféry průduchy v listech.' },
        { heading: 'Sluneční světlo', body: 'Zachyceno chlorofylem v chloroplastech.' },
      ],
    },
    academic,
    viewport,
    'auto',
    'grid',
  )
  const cardsThin = thinRules(cardsBuilt.slide)
  assert(
    cardsThin.length === 0,
    `cards must not draw title motif underlines (got ${cardsThin.length} thin rules: ${JSON.stringify(cardsThin.map(e => ({ w: e.width, h: e.height, t: e.top })))})`,
  )
  const cardTops = (cardsBuilt.slide.elements || []).filter(el => el.type === 'shape' && el.height === 5)
  assert(cardTops.length >= 3, `cards should keep accent-top bars, found ${cardTops.length}`)

  const twoColBuilt = await buildLayoutSlide(
    'twoColumn',
    {
      title: 'Průběh fotosyntézy',
      leftHeading: '1. Světelná fáze (primární)',
      leftBody: 'Sluneční záření štěpí molekuly vody.',
      rightHeading: '2. Temnostní fáze (Calvinův cyklus)',
      rightBody: 'Za použití energie se fixuje oxid uhličitý.',
    },
    academic,
    viewport,
    'auto',
    'even',
  )
  assert(
    thinRules(twoColBuilt.slide).length === 0,
    `twoColumn must not draw title motif underlines, got ${thinRules(twoColBuilt.slide).length}`,
  )

  const bulletsBuilt = await buildLayoutSlide(
    'bullets',
    { title: 'Co je to fotosyntéza?', bullets: ['Definice', 'Kde probíhá', 'Proč je důležitá'] },
    academic,
    viewport,
    'auto',
    'standard',
  )
  assert(
    thinRules(bulletsBuilt.slide).length === 0,
    `bullets must not draw title motif underlines, got ${thinRules(bulletsBuilt.slide).length}`,
  )

  const titleBuilt = await buildLayoutSlide(
    'title',
    { title: 'Fotosyntéza', subtitle: 'Jak rostliny přeměňují světlo na život', eyebrow: 'Přírodopis' },
    academic,
    viewport,
    'auto',
    'centered',
  )
  const titleThin = thinRules(titleBuilt.slide)
  assert(titleThin.length === 2, `title feature slide should draw equal-length doubleRule (2 shapes), got ${titleThin.length}`)
  assert(
    titleThin[0].width === titleThin[1].width,
    `doubleRule lines must be equal length, got ${titleThin[0].width} vs ${titleThin[1].width}`,
  )
  const expectedLeft = 60 + Math.round((880 - titleThin[0].width) / 2)
  assert(
    Math.abs(titleThin[0].left - expectedLeft) <= 2,
    `feature motif should be centered (left≈${expectedLeft}, got ${titleThin[0].left})`,
  )

  const closingBuilt = await buildLayoutSlide(
    'closing',
    { title: 'Shrnutí & Závěr', subtitle: 'Děkuji za pozornost', eyebrow: 'Biologie rostlin' },
    academic,
    viewport,
    'auto',
    'centered',
  )
  assert(thinRules(closingBuilt.slide).length === 2, 'closing feature slide should keep doubleRule motif')
}

{
  const { slots } = normalizeLayoutSlots(comparison, {
    title: 'Jedlé vs jedovaté',
    rows: [
      ['Hřib', 'Jedlý'],
      ['Muchomůrka', 'Jedovatá'],
    ],
  })
  const { slide } = await buildLayoutSlide('comparison', slots, preset, viewport, 'auto', 'full')
  const table = (slide.elements || []).find(el => el.type === 'table')
  assert(table, 'comparison must emit a table')
  const flat = (table.data || []).flat().map(cell => String(cell?.text ?? ''))
  assert(!flat.some(t => t.includes('[object Object]')), `comparison cells must be readable text, got ${JSON.stringify(flat)}`)
  assert(flat.includes('Hřib') && flat.includes('Jedovatá'), `expected cell texts present, got ${JSON.stringify(flat)}`)

  const coerced = normalizeLayoutSlots(comparison, {
    title: 'X',
    columns: [
      { heading: 'Jedlé', body: 'hřib, liška' },
      { heading: 'Jedovaté', body: 'muchomůrka' },
    ],
  })
  assert(Array.isArray(coerced.slots.rows) && coerced.slots.rows.length === 2, `expected 2 data rows, got ${JSON.stringify(coerced.slots.rows)}`)
  assert(
    Array.isArray(coerced.slots.rows[0]) && coerced.slots.rows[0].length === 2,
    `each coerced row should be [heading, body], got ${JSON.stringify(coerced.slots.rows[0])}`,
  )
}

{
  const chartSlide = {
    elements: [
      { id: 't', type: 'text', left: 0, top: 0, width: 100, height: 40, content: '<p>Revenue</p>' },
      { id: 'c', type: 'chart', left: 0, top: 50, width: 400, height: 200, chartType: 'column', data: { labels: ['A'], legends: ['S'], series: [[1]] } },
    ],
  }
  const chartIssues = validateSlide(chartSlide, preset, { expectsBody: true, layoutId: 'chart' })
  assert(!chartIssues.some(i => i.code === 'contentEmpty'), `chart+title must not contentEmpty: ${JSON.stringify(chartIssues)}`)

  const tableSlide = {
    elements: [
      { id: 't', type: 'text', left: 0, top: 0, width: 100, height: 40, content: '<p>Compare</p>' },
      { id: 'tb', type: 'table', left: 0, top: 50, width: 400, data: [[{ text: 'a' }, { text: 'b' }]] },
    ],
  }
  const tableIssues = validateSlide(tableSlide, preset, { expectsBody: true, layoutId: 'comparison' })
  assert(!tableIssues.some(i => i.code === 'contentEmpty'), `table+title must not contentEmpty: ${JSON.stringify(tableIssues)}`)
}

{
  const left = await buildLayoutSlide(
    'imageText',
    { title: 'Leaf', image: 'https://example.com/leaf.jpg', body: 'Chloroplasts capture light.' },
    preset,
    viewport,
    'auto',
    'imageLeft',
  )
  const img = (left.slide.elements || []).find(el => el.type === 'image')
  assert(img, 'imageText must emit an image')
  assert(img.left < 100, `imageLeft variant must place image on the left, got left=${img.left}`)

  const right = await buildLayoutSlide(
    'imageText',
    { title: 'Leaf', image: 'https://example.com/leaf.jpg', body: 'Chloroplasts capture light.' },
    preset,
    viewport,
    'auto',
    'imageRight',
  )
  const imgR = (right.slide.elements || []).find(el => el.type === 'image')
  assert(imgR.left > 300, `imageRight variant must place image on the right, got left=${imgR.left}`)
}

{
  const full = await buildLayoutSlide(
    'chart',
    { title: 'Data', labels: ['A', 'B'], series: [[1, 2]] },
    preset,
    viewport,
    'auto',
    'full',
  )
  const inset = await buildLayoutSlide(
    'chart',
    { title: 'Data', labels: ['A', 'B'], series: [[1, 2]] },
    preset,
    viewport,
    'auto',
    'inset',
  )
  const fullChart = (full.slide.elements || []).find(el => el.type === 'chart')
  const insetChart = (inset.slide.elements || []).find(el => el.type === 'chart')
  assert(fullChart && insetChart, 'chart variants must emit chart elements')
  assert(insetChart.width < fullChart.width, `inset chart must be narrower (${insetChart.width} vs ${fullChart.width})`)
  assert(insetChart.left > fullChart.left, `inset chart must start further right (${insetChart.left} vs ${fullChart.left})`)
}

{
  const cardsLayout = listLayouts().find(l => l.id === 'cards')
  const { slots: cardSlots, warnings: cardWarn } = normalizeLayoutSlots(cardsLayout, {
    title: 'Pillars',
    items: [{ heading: 'A', body: 'one' }, { heading: 'B', body: 'two' }],
  })
  assert(Array.isArray(cardSlots.cards) && cardSlots.cards.length === 2, `items→cards failed: ${JSON.stringify(cardSlots)}`)
  assert(cardWarn.some(w => /items/.test(w)), 'expected items alias warning for cards')

  const { slots: colCards } = normalizeLayoutSlots(cardsLayout, {
    title: 'Pillars',
    columns: [{ heading: 'A', body: 'one' }],
  })
  assert(Array.isArray(colCards.cards) && colCards.cards.length === 1, `columns→cards failed: ${JSON.stringify(colCards)}`)
}

{
  const headingsOnly = {
    elements: [
      { id: 't', type: 'text', left: 0, top: 0, width: 100, height: 40, content: '<p>Compare</p>' },
      { id: 'l', type: 'text', left: 0, top: 50, width: 40, height: 20, content: '<p>Pros</p>' },
      { id: 'r', type: 'text', left: 50, top: 50, width: 40, height: 20, content: '<p>Cons</p>' },
    ],
  }
  const headingIssues = validateSlide(headingsOnly, preset, { expectsBody: true, layoutId: 'twoColumn' })
  assert(headingIssues.some(i => i.code === 'contentEmpty'), `twoColumn headings-only must contentEmpty: ${JSON.stringify(headingIssues)}`)

  const { slots, warnings } = normalizeLayoutSlots(twoColumn, {
    title: 'Compare',
    left: 'Sunlight splits water molecules into oxygen.',
    right: 'Calvin cycle fixes carbon dioxide into sugar.',
  })
  assert(typeof slots.leftBody === 'string' && slots.leftBody.includes('Sunlight'), `left→leftBody failed: ${JSON.stringify(slots)}`)
  assert(typeof slots.rightBody === 'string' && slots.rightBody.includes('Calvin'), `right→rightBody failed: ${JSON.stringify(slots)}`)
  assert(!('left' in slots), 'raw left key must not survive')
  assert(warnings.some(w => /left/.test(w)), 'expected left alias warning')
}

{
  const { slide } = await buildLayoutSlide(
    'bullets',
    { title: 'Points', bullets: [{ text: 'First fact' }, { label: 'Second fact' }] },
    preset,
    viewport,
    'auto',
    'standard',
  )
  const joined = (slide.elements || []).filter(el => el.type === 'text').map(el => el.content || '').join('\n')
  assert(!joined.includes('[object Object]'), `bullets must coerce objects, got: ${joined.slice(0, 200)}`)
  assert(/First fact/.test(joined) && /Second fact/.test(joined), `expected bullet texts, got: ${joined.slice(0, 200)}`)
}

{
  const leftHeavy = await buildLayoutSlide(
    'bullets',
    { title: 'Points', bullets: ['A', 'B', 'C'] },
    preset,
    viewport,
    'auto',
    'leftHeavy',
  )
  assert(leftHeavy.variantId === 'standard', `leftHeavy must map to standard (not leftRail), got ${leftHeavy.variantId}`)

  const cardsBuilt = await buildLayoutSlide(
    'cards',
    { title: 'Pillars', cards: [{ heading: 'A', body: 'one' }, { heading: 'B', body: 'two' }] },
    preset,
    viewport,
    'auto',
    'leftHeavy',
  )
  assert(cardsBuilt.variantId !== 'leftOffset', `leftHeavy on cards must not pick leftOffset, got ${cardsBuilt.variantId}`)
}

{
  const { slots, warnings } = normalizeLayoutSlots(twoColumn, {
    title: 'Pros / Cons',
    columns: [
      { heading: 'Pros', body: 'Fast to teach.' },
      { heading: 'Cons', bullets: ['Needs prep', 'Needs review'] },
    ],
  })
  assert(slots.leftHeading === 'Pros', `columns→leftHeading failed: ${JSON.stringify(slots)}`)
  assert(typeof slots.leftBody === 'string' && slots.leftBody.includes('Fast'), `columns→leftBody failed: ${JSON.stringify(slots)}`)
  assert(slots.rightHeading === 'Cons', `columns→rightHeading failed: ${JSON.stringify(slots)}`)
  assert(Array.isArray(slots.rightBullets) && slots.rightBullets.length === 2, `columns→rightBullets failed: ${JSON.stringify(slots)}`)
  assert(warnings.some(w => /columns/.test(w)), 'expected columns→twoColumn coercion warning')

  const singleList = await buildLayoutSlide(
    'imageText',
    { title: 'Leaf', body: '- Chloroplasts capture light' },
    preset,
    viewport,
    'auto',
    'imageRight',
  )
  const singleJoined = (singleList.slide.elements || []).filter(el => el.type === 'text').map(el => el.content || '').join('\n')
  assert(/<li[\s>]/i.test(singleJoined), `single-line markdown body must coerce to a list, got: ${singleJoined.slice(0, 180)}`)
  assert(!/>- Chloroplasts/.test(singleJoined), 'coerced list must strip the visible "-" marker')

  const both = await buildLayoutSlide(
    'imageText',
    { title: 'Leaf', bullets: ['Keep me'], body: 'Drop me prose' },
    preset,
    viewport,
    'auto',
    'imageRight',
  )
  assert(both.warnings.some(w => /ignored "body"/i.test(w)), `expected bullets-wins-over-body warning, got ${JSON.stringify(both.warnings)}`)
  const bothJoined = (both.slide.elements || []).filter(el => el.type === 'text').map(el => el.content || '').join('\n')
  assert(/Keep me/.test(bothJoined), 'bullets content must remain')
  assert(!/Drop me prose/.test(bothJoined), 'body must not also render when bullets win')
}

{
  const chartBuilt = await buildLayoutSlide(
    'chart',
    { title: 'Data', labels: ['A', 'B', 'C'], series: [1, 'x', 3] },
    preset,
    viewport,
    'auto',
    'full',
  )
  assert(chartBuilt.warnings.some(w => /not numeric/i.test(w)), `expected non-numeric chart warning, got ${JSON.stringify(chartBuilt.warnings)}`)

  const mismatch = await buildLayoutSlide(
    'chart',
    { title: 'Data', labels: ['A', 'B'], series: [1, 2, 3] },
    preset,
    viewport,
    'auto',
    'full',
  )
  assert(mismatch.warnings.some(w => /does not match labels/i.test(w)), `expected series/labels length warning, got ${JSON.stringify(mismatch.warnings)}`)

  const numbered = await buildLayoutSlide(
    'numbered',
    {
      title: 'Process',
      steps: Array.from({ length: 6 }, (_, i) => ({
        heading: `Step ${i + 1} with a fairly long heading line`,
        body: 'Detailed explanation that needs vertical room to render under the heading.',
      })),
    },
    preset,
    viewport,
    'auto',
    'standard',
  )
  assert(
    numbered.warnings.some(w => /Dropped body on step/i.test(w)) ||
      (numbered.slide.elements || []).filter(el => el.type === 'text').length > 7,
    `numbered must warn when body is dropped OR still render bodies; warnings=${JSON.stringify(numbered.warnings)}`,
  )
}

{
  const badSurfacePreset = {
    ...preset,
    palette: {
      ...preset.palette,
      background: '#FFFFFF',
      surface: '#1A1A1A',
      title: '#222222',
      body: '#333333',
    },
  }
  const cardSlide = {
    elements: [
      { id: 't', type: 'text', left: 0, top: 0, width: 100, height: 40, content: '<p>Title</p>' },
      { id: 'b', type: 'text', left: 0, top: 50, width: 100, height: 40, content: '<p>Body copy on a card surface needs contrast</p>' },
    ],
  }
  const surfaceIssues = validateSlide(cardSlide, badSurfacePreset, { expectsBody: true, layoutId: 'cards' })
  assert(
    surfaceIssues.some(i => i.code === 'contrast' && /surface/i.test(i.message)),
    `expected contrast-on-surface issue, got ${JSON.stringify(surfaceIssues)}`,
  )
  const okIssues = validateSlide(cardSlide, preset, { expectsBody: true, layoutId: 'cards' })
  assert(!okIssues.some(i => i.code === 'contrast'), `stock preset must pass surface contrast, got ${JSON.stringify(okIssues)}`)
}

if (failures.length) {
  console.error('Layout robustness check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log('Layout robustness check passed: aliases, sanitization, full-width standard, dense-offset collapse, body→bullets coercion, motif-on-feature-only, comparison/chart/imageText variants, nearest anchor.')
