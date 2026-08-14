/**
 * Real-PPTX import fidelity harness.
 * Exercises pptxtojson + pptxImportFidelity against fixtures under
 * tests/fixtures/pptx-import (Mona corpus, PowerPoint-touched math, generated comments).
 *
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/e2e-pptx-import-fidelity.mts
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'pptxtojson/dist/index.js'
import {
  bindImportedAnimations,
  buildLatexElementFromMath,
  extractPptxImportExtras,
  extractSlideAnimationsFromXml,
  mapPptxtojsonAnimation,
  mapPptxTransitionToTurningMode,
  mapPresetToEffect,
  takeIdentityForGeometry,
  takeIdentityForObjectId,
} from '../src/utils/pptxImportFidelity'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixturesDir = join(root, 'tests/fixtures/pptx-import')

type Failure = { fixture: string; message: string }
const failures: Failure[] = []
const reports: string[] = []

function assert(fixture: string, condition: unknown, message: string) {
  if (!condition) failures.push({ fixture, message })
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

async function runFixture(fileName: string) {
  const path = join(fixturesDir, fileName)
  const buf = readFileSync(path)
  assert(fileName, buf.length > 1000, `fixture too small (${buf.length} bytes)`)

  const ab = toArrayBuffer(buf)
  const json = await parse(ab, { imageMode: 'base64', videoMode: 'blob', audioMode: 'blob' })
  const extras = await extractPptxImportExtras(ab)

  assert(fileName, !!extras.packageId, 'packageId missing')
  assert(fileName, extras.packageId.length >= 8, 'packageId too short')
  assert(fileName, json.slides.length > 0, 'no slides parsed')
  if (fileName === 'sb1.pptx') {
    assert(fileName, json.slides.length === 7, `sb1.pptx must parse as 7 slides, got ${json.slides.length}`)
    const texts = json.slides.flatMap(s => s.elements.map(el => String(el.content || ''))).join(' ').replace(/&nbsp;/g, ' ')
    assert(fileName, /Jan Hus/i.test(texts), 'sb1.pptx must retain Jan Hus title text')
  }

  let mathCount = 0
  let latexOk = 0
  let provenanceHits = 0
  let provenanceCandidates = 0
  let transitionMapped = 0
  let transitionPresent = 0
  let commentsImported = 0
  let animationsImported = 0

  for (const [slideIndex, slide] of json.slides.entries()) {
    if (slide.transition?.type && slide.transition.type !== 'none') {
      transitionPresent += 1
      const mode = mapPptxTransitionToTurningMode(slide.transition)
      if (mode) transitionMapped += 1
      else {
        failures.push({
          fixture: fileName,
          message: `unmapped transition slide ${slideIndex}: ${JSON.stringify(slide.transition)}`,
        })
      }
    }

    const notes = extras.commentsBySlide.get(slideIndex) || []
    commentsImported += notes.length
    animationsImported += extras.animationsBySlide.get(slideIndex)?.length
      || (slide as { animations?: unknown[] }).animations?.length
      || 0

    const pool = (extras.identitiesBySlide.get(slideIndex) || []).slice()
    const elements = [...slide.elements, ...(slide.layoutElements || [])]

    for (const el of elements) {
      if (el.type === 'group' || el.type === 'diagram') continue

      const box = {
        left: Number(el.left) || 0,
        top: Number(el.top) || 0,
        width: Number(el.width) || 0,
        height: Number(el.height) || 0,
      }
      if (box.width > 0.01 || box.height > 0.01) {
        provenanceCandidates += 1
        const hit = takeIdentityForGeometry(pool, box)
        if (hit) provenanceHits += 1
      }

      if (el.type === 'math') {
        mathCount += 1
        const latexEl = buildLatexElementFromMath({
          type: 'math',
          left: box.left,
          top: box.top,
          width: box.width || 1,
          height: box.height || 1,
          latex: String(el.latex || ''),
          picBase64: String(el.picBase64 || ''),
        })
        if (latexEl?.latex) {
          latexOk += 1
          if (/[\u{1D400}-\u{1D7FF}]/u.test(latexEl.latex) || /\u00a0/.test(latexEl.latex)) {
            failures.push({
              fixture: fileName,
              message: `latex still has math-alphanumeric/nbsp after normalize: ${JSON.stringify(latexEl.latex)}`,
            })
          }
        }
        else {
          failures.push({
            fixture: fileName,
            message: `math on slide ${slideIndex} failed latex build (latex=${JSON.stringify(el.latex)})`,
          })
        }
      }
    }
  }

  const provenanceRate = provenanceCandidates
    ? provenanceHits / provenanceCandidates
    : 1

  reports.push(
    [
      fileName,
      `slides=${json.slides.length}`,
      `pkg=${extras.packageId.slice(0, 8)}`,
      `tr=${transitionMapped}/${transitionPresent}`,
      `comments=${commentsImported}`,
      `anims=${animationsImported}`,
      `math=${latexOk}/${mathCount}`,
      `prov=${provenanceHits}/${provenanceCandidates} (${(provenanceRate * 100).toFixed(0)}%)`,
    ].join(' | '),
  )

  return {
    fileName,
    transitionPresent,
    transitionMapped,
    commentsImported,
    mathCount,
    latexOk,
    provenanceRate,
    provenanceHits,
    provenanceCandidates,
  }
}

function runAnimationUnitChecks() {
  const fixture = 'animation-unit'
  assert(fixture, mapPresetToEffect('entr', 10, 'fade', 0) === 'fadeIn', 'fadein maps to fadeIn')
  assert(fixture, mapPresetToEffect('entr', 1, '', 0) === 'appear', 'appear maps to appear')
  assert(fixture, mapPresetToEffect('entr', 2, 'wipe', 8) === 'fadeInLeft', 'fly/wipe from left')
  assert(fixture, mapPresetToEffect('entr', 2, 'wipe', 4) === 'fadeInUp', 'fly from bottom')
  assert(fixture, mapPresetToEffect('exit', 10, 'fade', 0) === 'fadeOut', 'fadeout maps to fadeOut')
  assert(fixture, mapPresetToEffect('exit', 2, '', 2) === 'fadeOutRight', 'fly out to right')
  assert(fixture, mapPresetToEffect('emph', 26, '', 0) === 'pulse', 'pulse emphasis')
  assert(fixture, mapPresetToEffect('emph', 32, '', 0) === 'shakeX', 'teeter emphasis')
  assert(fixture, mapPresetToEffect('path', 1, '', 0) === 'pulse', 'motion path approximates as pulse')

  const mapped = mapPptxtojsonAnimation({
    spid: '7',
    trigger: 'onClick',
    class: 'entr',
    presetId: 10,
    presetSubtype: 0,
    duration: 800,
    filter: 'fade',
  })
  assert(fixture, !!mapped && mapped.objectId === '7' && mapped.trigger === 'click' && mapped.effect === 'fadeIn', 'pptxtojson fadein maps')
  assert(fixture, mapPptxtojsonAnimation({
    spid: '1',
    trigger: 'onClick',
    class: 'mediacall',
    presetId: 1,
    duration: 0,
  }) === null, 'mediacall is skipped')

  const withPrev = mapPptxtojsonAnimation({
    spid: '8',
    trigger: 'withPrevious',
    class: 'entr',
    presetId: 10,
    duration: 800,
    filter: 'fade',
  })
  const after = mapPptxtojsonAnimation({
    spid: '9',
    trigger: 'afterPrevious',
    class: 'exit',
    presetId: 10,
    duration: 400,
    filter: 'fade',
  })
  assert(fixture, withPrev?.trigger === 'meantime', 'withPrevious → meantime')
  assert(fixture, after?.trigger === 'auto' && after.type === 'out', 'afterPrevious exit → auto/out')

  const bound = bindImportedAnimations(
    [mapped!, withPrev!, after!],
    [{ id: 'el-a', source: { objectId: '7' } }, { id: 'el-b' }],
    new Map([['8', 'el-b'], ['9', 'el-c']]),
  )
  assert(fixture, bound.length === 3, `bound 3 animations (got ${bound.length})`)
  assert(fixture, bound[0].elId === 'el-a' && bound[0].trigger === 'click', 'spid 7 via source.objectId')
  assert(fixture, bound[1].elId === 'el-b' && bound[1].trigger === 'meantime', 'spid 8 via spid map')
  assert(fixture, bound[2].elId === 'el-c' && bound[2].trigger === 'auto', 'spid 9 via spid map only')

  const pool = [
    { order: 0, objectId: '4', partPath: 'ppt/slides/slide1.xml', left: 0, top: 0, width: 10, height: 10 },
    { order: 1, objectId: '5', partPath: 'ppt/slides/slide1.xml', left: 20, top: 20, width: 10, height: 10 },
  ]
  const byId = takeIdentityForObjectId(pool, '5')
  assert(fixture, byId?.objectId === '5' && pool.length === 1, 'takeIdentityForObjectId consumes match')

  const xml = `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:timing><p:tnLst><p:par><p:cTn id="1" nodeType="tmRoot"><p:childTnLst>
    <p:seq><p:cTn id="2" nodeType="mainSeq"><p:childTnLst>
      <p:par><p:cTn id="3" nodeType="clickEffect"><p:childTnLst>
        <p:cTn id="4" presetID="2" presetClass="entr" presetSubtype="8">
          <p:childTnLst>
            <p:animEffect filter="wipe"><p:cBhvr><p:cTn dur="1200"/><p:tgtEl><p:spTgt spid="12"/></p:tgtEl></p:cBhvr></p:animEffect>
          </p:childTnLst>
        </p:cTn>
      </p:childTnLst></p:cTn></p:par>
    </p:childTnLst></p:cTn></p:seq>
  </p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>
</p:sld>`
  const parsed = extractSlideAnimationsFromXml(xml)
  assert(fixture, parsed.length === 1, `inherited nodeType parsed (got ${parsed.length})`)
  assert(
    fixture,
    parsed[0].objectId === '12' && parsed[0].trigger === 'click' && parsed[0].effect === 'fadeInLeft' && parsed[0].duration === 1200,
    `inherited fly-from-left: ${JSON.stringify(parsed[0])}`,
  )
}

async function main() {
  runAnimationUnitChecks()

  if (!existsSync(fixturesDir)) {
    console.error('Missing fixtures dir:', fixturesDir)
    process.exit(1)
  }

  const fixtures = readdirSync(fixturesDir).filter(name => name.endsWith('.pptx')).sort()
  if (!fixtures.length) {
    console.error('No .pptx fixtures in', fixturesDir)
    process.exit(1)
  }

  const results: Awaited<ReturnType<typeof runFixture>>[] = []
  for (const file of fixtures) {
    try {
      results.push(await runFixture(file))
    }
    catch (error) {
      failures.push({
        fixture: file,
        message: `threw: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  const byName = Object.fromEntries(results.map(r => [r.fileName, r]))

  const tc = byName['transitions-comments.pptx']
  if (tc) {
    assert('transitions-comments.pptx', tc.transitionPresent >= 3, 'expected 3 transitions in fixture')
    assert('transitions-comments.pptx', tc.transitionMapped >= 3, 'expected all transitions mapped')
    assert('transitions-comments.pptx', tc.commentsImported >= 2, 'expected modern comments imported')

    const buf = readFileSync(join(fixturesDir, 'transitions-comments.pptx'))
    const extras = await extractPptxImportExtras(toArrayBuffer(buf))
    const slide0 = extras.commentsBySlide.get(0) || []
    assert('transitions-comments.pptx', slide0.some(n => n.content.includes('Review the title')), 'missing root comment text')
    assert(
      'transitions-comments.pptx',
      slide0.some(n => n.user === 'Ada Lovelace'),
      `expected Ada Lovelace author, got ${JSON.stringify(slide0.map(n => n.user))}`,
    )
    assert(
      'transitions-comments.pptx',
      slide0.some(n => n.replies?.some(r => r.content.includes('Looks good') && r.user === 'Grace Hopper')),
      'missing modern reply / Grace Hopper',
    )
  }
  else {
    failures.push({ fixture: 'transitions-comments.pptx', message: 'fixture missing from run' })
  }

  for (const mathFile of [
    'math-powerpoint-native.pptx',
    'math-a14-omath-after-ppt.pptx',
    'math-a14-omath-alt-after-ppt.pptx',
  ]) {
    const math = byName[mathFile]
    if (!math) {
      failures.push({ fixture: mathFile, message: 'fixture missing from run' })
      continue
    }
    assert(mathFile, math.mathCount >= 1, 'expected at least one math element from PowerPoint-touched deck')
    assert(mathFile, math.latexOk >= 1, 'expected latex element built from OMML')
  }

  for (const corpus of fixtures.filter(f => f.startsWith('corpus-'))) {
    const row = byName[corpus]
    if (!row) continue
    assert(
      corpus,
      row.provenanceCandidates === 0 || row.provenanceRate >= 0.5,
      `provenance hit rate too low: ${(row.provenanceRate * 100).toFixed(0)}% (${row.provenanceHits}/${row.provenanceCandidates})`,
    )
  }

  console.log('PPTX import fidelity (real fixtures)\n')
  for (const line of reports) console.log(' ', line)

  if (failures.length) {
    console.error('\nFAILED:\n' + failures.map(f => ` - [${f.fixture}] ${f.message}`).join('\n'))
    process.exit(1)
  }

  console.log(`\nAll ${fixtures.length} real PPTX fixtures passed`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
