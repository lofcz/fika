import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const failures = []

function assert(condition, message) {
  if (!condition) failures.push(message)
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

const TRANSITION_IMPORT_MAP = {
  none: 'no',
  fade: 'fade',
  fadeThroughBlack: 'fade',
  push: 'slideX',
  wipe: 'slideX',
  cover: 'slideX',
  uncover: 'slideX',
  pull: 'slideX',
  split: 'slideY',
  blinds: 'slideY',
  random: 'random',
  cut: 'no',
  dissolve: 'fade',
  wheel: 'rotate',
  zoom: 'scale',
  warp: 'scale',
  flip: 'slideX3D',
  ferris: 'rotate',
  morph: 'fade',
}

function mapPptxTransitionToTurningMode(transition) {
  if (!transition?.type || transition.type === 'none') return undefined
  const type = transition.type.replace(/^p\d{0,2}:/, '')
  const dir = (transition.direction || '').toLowerCase()
  if (type === 'push' || type === 'wipe' || type === 'cover' || type === 'uncover' || type === 'pull') {
    if (dir === 'u' || dir === 'd') return 'slideY'
    return 'slideX'
  }
  if (type === 'zoom') return dir === 'out' ? 'scaleReverse' : 'scale'
  if (type === 'warp') return dir === 'out' ? 'scaleReverse' : 'scale'
  if (type === 'flip') return (dir === 'u' || dir === 'd') ? 'slideY3D' : 'slideX3D'
  return TRANSITION_IMPORT_MAP[type]
}

const { parse: parseXml } = require('txml')

function localName(tag) {
  if (!tag) return ''
  const i = tag.indexOf(':')
  return i >= 0 ? tag.slice(i + 1) : tag
}

function textContent(node) {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (!node.children?.length) return ''
  return node.children.map(child => textContent(child)).join('')
}

function walkXml(nodes, visit) {
  if (!nodes) return
  for (const node of nodes) {
    if (typeof node === 'string' || !node?.tagName) continue
    visit(node)
    walkXml(node.children, visit)
  }
}

function findChild(node, name) {
  if (!node?.children) return undefined
  for (const child of node.children) {
    if (typeof child === 'string') continue
    if (localName(child.tagName) === name) return child
  }
  return undefined
}

function parseCommentAuthorsXml(xml) {
  const authors = new Map()
  walkXml(parseXml(xml), node => {
    const tag = localName(node.tagName)
    if (tag !== 'cmAuthor' && tag !== 'author') return
    const id = node.attributes?.id
    if (id != null) authors.set(String(id), node.attributes?.name || 'Author')
  })
  return authors
}

function extractTxBodyText(node) {
  const txBody = findChild(node, 'txBody')
  if (!txBody) return ''
  const parts = []
  walkXml(txBody.children, child => {
    if (localName(child.tagName) !== 't') return
    const value = textContent(child).trim()
    if (value) parts.push(value)
  })
  return parts.join(' ')
}

function parseLegacyCommentsXml(xml, authors = new Map()) {
  const notes = []
  walkXml(parseXml(xml), node => {
    if (localName(node.tagName) !== 'cm') return
    const legacy = findChild(node, 'text')
    const content = (legacy ? textContent(legacy) : extractTxBodyText(node)).trim()
    if (!content) return
    const replies = []
    for (const reply of findChildren(findChild(node, 'replyLst'), 'reply')) {
      const replyText = extractTxBodyText(reply).trim()
      if (!replyText) continue
      replies.push({
        content: replyText,
        user: authors.get(String(reply.attributes?.authorId ?? '')) || 'Author',
      })
    }
    notes.push({
      content,
      user: authors.get(String(node.attributes?.authorId ?? '')) || 'Author',
      time: Date.parse(node.attributes?.startDate || node.attributes?.dt || '') || 0,
      ...(replies.length ? { replies } : {}),
    })
  })
  return notes
}

function findChildren(node, name) {
  if (!node?.children) return []
  return node.children.filter(child => typeof child !== 'string' && localName(child.tagName) === name)
}

const EMU_TO_POINTS = 72 / 914400
function extractCNvPrIdentitiesFromSlideXml(xml, partPath) {
  const identities = []
  let syntheticOrder = 0
  walkXml(parseXml(xml), node => {
    const tag = localName(node.tagName)
    if (!['sp', 'pic', 'cxnSp', 'graphicFrame', 'grpSp'].includes(tag)) return
    let cNvPr
    for (const wrapper of ['nvSpPr', 'nvPicPr', 'nvCxnSpPr', 'nvGraphicFramePr', 'nvGrpSpPr']) {
      cNvPr = findChild(findChild(node, wrapper), 'cNvPr')
      if (cNvPr) break
    }
    const objectId = cNvPr?.attributes?.id
    if (objectId == null || objectId === '') return
    const xfrm = findChild(findChild(node, 'spPr'), 'xfrm')
      || findChild(findChild(node, 'picPr'), 'xfrm')
      || findChild(node, 'xfrm')
    const off = findChild(xfrm, 'off')
    const ext = findChild(xfrm, 'ext')
    identities.push({
      order: syntheticOrder++,
      objectId: String(objectId),
      name: cNvPr?.attributes?.name,
      partPath,
      left: Number(off?.attributes?.x || 0) * EMU_TO_POINTS,
      top: Number(off?.attributes?.y || 0) * EMU_TO_POINTS,
      width: Number(ext?.attributes?.cx || 0) * EMU_TO_POINTS,
      height: Number(ext?.attributes?.cy || 0) * EMU_TO_POINTS,
    })
  })
  return identities
}

assert(mapPptxTransitionToTurningMode({ type: 'fade' }) === 'fade', 'fade → fade')
assert(mapPptxTransitionToTurningMode({ type: 'push', direction: 'l' }) === 'slideX', 'push l → slideX')
assert(mapPptxTransitionToTurningMode({ type: 'push', direction: 'u' }) === 'slideY', 'push u → slideY')
assert(mapPptxTransitionToTurningMode({ type: 'zoom', direction: 'out' }) === 'scaleReverse', 'zoom out')
assert(mapPptxTransitionToTurningMode({ type: 'none' }) === undefined, 'none → undefined')
assert(mapPptxTransitionToTurningMode(null) === undefined, 'null transition')

const authors = parseCommentAuthorsXml(`<?xml version="1.0"?>
<p:cmAuthorLst xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cmAuthor id="0" name="Ada" initials="A"/>
</p:cmAuthorLst>`)
assert(authors.get('0') === 'Ada', 'comment author name')

const modernAuthors = parseCommentAuthorsXml(`<?xml version="1.0"?>
<p188:authorLst xmlns:p188="http://schemas.microsoft.com/office/powerpoint/2018/8/main">
  <p188:author id="{aaa}" name="Ada Lovelace"/>
  <p188:author id="{bbb}" name="Grace Hopper"/>
</p188:authorLst>`)
assert(modernAuthors.get('{aaa}') === 'Ada Lovelace', 'modern author list')

const notes = parseLegacyCommentsXml(`<?xml version="1.0"?>
<p:cmLst xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cm authorId="0" dt="2024-01-02T03:04:05Z" idx="1">
    <p:pos x="0" y="0"/>
    <p:text>Hello world</p:text>
  </p:cm>
</p:cmLst>`, authors)
assert(notes.length === 1 && notes[0].content === 'Hello world', 'legacy comment text')
assert(notes[0].user === 'Ada', 'legacy comment author')

const modernNotes = parseLegacyCommentsXml(`<?xml version="1.0"?>
<p188:cmLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:p188="http://schemas.microsoft.com/office/powerpoint/2018/8/main">
  <p188:cm id="{1}" authorId="{aaa}" startDate="2024-01-02T03:04:05Z">
    <p188:replyLst>
      <p188:reply id="{2}" authorId="{bbb}" created="2024-01-02T03:05:00Z">
        <p188:txBody><a:p><a:r><a:t>Looks good</a:t></a:r></a:p></p188:txBody>
      </p188:reply>
    </p188:replyLst>
    <p188:txBody><a:p><a:r><a:t>Review the title</a:t></a:r></a:p></p188:txBody>
  </p188:cm>
</p188:cmLst>`, modernAuthors)
assert(modernNotes.length === 1 && modernNotes[0].content === 'Review the title', 'modern comment text')
assert(modernNotes[0].user === 'Ada Lovelace', 'modern comment author')
assert(modernNotes[0].replies?.length === 1 && modernNotes[0].replies[0].content === 'Looks good', 'modern reply text')
assert(modernNotes[0].replies[0].user === 'Grace Hopper', 'modern reply author')

const identities = extractCNvPrIdentitiesFromSlideXml(`<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="7" name="Title 1"/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="914400" y="1828800"/><a:ext cx="2743200" cy="914400"/></a:xfrm></p:spPr>
    </p:sp>
    <p:pic>
      <p:nvPicPr><p:cNvPr id="3" name="Picture 2"/></p:nvPicPr>
      <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm></p:spPr>
    </p:pic>
  </p:spTree></p:cSld>
</p:sld>`, 'ppt/slides/slide1.xml')
assert(identities.length === 2, 'two identities')
assert(identities[0].objectId === '7' && identities[0].name === 'Title 1', 'document-order shape first')
assert(Math.abs(identities[0].left - 72) < 0.01, 'shape left in points (1")')
assert(identities[1].objectId === '3' && Math.abs(identities[1].width - 72) < 0.01, 'pic geometry')

const importSrc = read('src/hooks/useImport.ts')
assert(importSrc.includes('mapPptxTransitionToTurningMode'), 'useImport maps transitions')
assert(importSrc.includes('buildLatexElementFromMath'), 'useImport builds latex from math')
assert(importSrc.includes('extractPptxImportExtras'), 'useImport extracts provenance extras')
assert(importSrc.includes('retainSourcePackage'), 'useImport retains package bytes')
assert(importSrc.includes('sourcePackageId'), 'slides get sourcePackageId')
assert(importSrc.includes("type: 'latex'") || importSrc.includes('buildLatexElementFromMath(el'), 'math imports via latex builder')
assert(/else if \(el\.type === 'math'\)[\s\S]{0,200}buildLatexElementFromMath/.test(importSrc), 'math branch calls latex builder first')

const fidelitySrc = read('src/utils/pptxImportFidelity.ts')
assert(fidelitySrc.includes('export function mapPptxTransitionToTurningMode'), 'fidelity export transition')
assert(fidelitySrc.includes('export function buildLatexElementFromMath'), 'fidelity export latex')
assert(fidelitySrc.includes('export async function extractPptxImportExtras'), 'fidelity export extras')
assert(fidelitySrc.includes('export function parseEffectLst'), 'fidelity export parseEffectLst')
assert(fidelitySrc.includes('export function extractSlideAnimationsFromXml'), 'fidelity export animation parse')
assert(fidelitySrc.includes('export function bindImportedAnimations'), 'fidelity export animation bind')
assert(fidelitySrc.includes('export function mapPptxtojsonAnimation'), 'fidelity export pptxtojson animation map')
assert(fidelitySrc.includes('export function mapPresetToEffect'), 'fidelity export preset map')
assert(fidelitySrc.includes('export function takeIdentityForObjectId'), 'fidelity export objectId identity')
assert(importSrc.includes('bindImportedAnimations'), 'useImport binds imported animations')
assert(importSrc.includes('animationsBySlide'), 'useImport reads animationsBySlide')
assert(importSrc.includes('mapPptxtojsonAnimation'), 'useImport prefers pptxtojson animations')
assert(importSrc.includes('takeIdentityForObjectId'), 'useImport falls back to cNvPr id')
assert(importSrc.includes('spidToElId'), 'useImport tracks spid to editor id')

function parseEffectLst(effectLst) {
  if (!effectLst) return undefined
  const effects = {}
  for (const child of effectLst.children || []) {
    if (typeof child === 'string') continue
    const tag = localName(child.tagName)
    const attrs = child.attributes || {}
    if (tag === 'glow') {
      effects.glow = { radius: Number(attrs.rad || 0) * (72 / 914400) }
    }
    else if (tag === 'softEdge') {
      effects.softEdge = { radius: Number(attrs.rad || 0) * (72 / 914400) }
    }
    else if (tag === 'reflection') {
      effects.reflection = {
        blur: Number(attrs.blurRad || 0) * (72 / 914400),
        direction: Number(attrs.dir || 0) / 60000,
        distance: Number(attrs.dist || 0) * (72 / 914400),
        opacity: attrs.stA != null ? Number(attrs.stA) / 100000 : 0.5,
        scaleY: attrs.sy != null ? Number(attrs.sy) / 100000 : -1,
      }
    }
  }
  return Object.keys(effects).length ? effects : undefined
}

const effectRoots = parseXml(`<?xml version="1.0"?>
<a:effectLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:glow rad="127000"><a:srgbClr val="00AAFF"><a:alpha val="60000"/></a:srgbClr></a:glow>
  <a:softEdge rad="50800"/>
  <a:reflection blurRad="25400" stA="40000" dist="38100" dir="5400000" sy="-100000"/>
</a:effectLst>`)
const effectLst = effectRoots.find(n => localName(n.tagName) === 'effectLst') || effectRoots[0]
const parsedEffects = parseEffectLst(effectLst)
assert(parsedEffects?.glow && Math.abs(parsedEffects.glow.radius - 10) < 0.01, 'parseEffectLst glow radius (10pt)')
assert(parsedEffects?.softEdge && Math.abs(parsedEffects.softEdge.radius - 4) < 0.01, 'parseEffectLst softEdge')
assert(parsedEffects?.reflection && parsedEffects.reflection.opacity === 0.4, 'parseEffectLst reflection opacity')
assert(parsedEffects?.reflection?.scaleY === -1, 'parseEffectLst reflection scaleY')

const diagnosticsSrc = read('src/utils/pptxImportDiagnostics.ts')
assert(diagnosticsSrc.includes('export function buildImportDiagnosticsReport'), 'diagnostics builder')
assert(diagnosticsSrc.includes("disposition: 'modeled'"), 'diagnostics modeled')
assert(diagnosticsSrc.includes("disposition: 'approximated'"), 'diagnostics approximated')
assert(importSrc.includes('buildImportDiagnosticsReport'), 'useImport builds diagnostics')
assert(importSrc.includes('setLastImportDiagnostics'), 'useImport stores diagnostics')

const structuredSrc = read('src/utils/pptxStructuredText.ts')
assert(structuredSrc.includes('export function htmlToStructuredText'), 'structured text helper')
assert(importSrc.includes('htmlToStructuredText'), 'useImport wires structuredText')

const sourcePkgSrc = read('src/utils/pptxSourcePackage.ts')
assert(sourcePkgSrc.includes('export function tryGetCleanRetainedPackage'), 'hybrid retain helper')
assert(sourcePkgSrc.includes('export function markSourcePackageDirty'), 'dirty marker')
const exportSrc = read('src/hooks/useExport.ts')
assert(exportSrc.includes('tryGetCleanRetainedPackage'), 'export uses hybrid clean path')
assert(exportSrc.includes('applyEffectsOption'), 'export maps effect stack')
assert(exportSrc.includes('placeholderFontSize'), 'export uses placeholderFontSize for PPTX text')
assert(exportSrc.includes('getPlaceholderBaselineHeight'), 'export freezes empty placeholder height')
assert(exportSrc.includes('!phName && !el.placeholder'), 'export skips spAutoFit on placeholders')
const slidesStoreSrc = read('src/store/slides.ts')
assert(slidesStoreSrc.includes('markSourcePackageDirty'), 'mutations dirty retained package')

const execPlaySrc = read('src/views/Screen/hooks/useExecPlay.ts')
assert(execPlaySrc.includes('handleSlideClick'), 'play mode click advances animations')
assert(execPlaySrc.includes('execNext()'), 'slide click calls execNext')
const baseViewSrc = read('src/views/Screen/BaseView.tsx')
assert(baseViewSrc.includes('handleSlideClick'), 'BaseView wires slide click')
const presenterSrc = read('src/views/Screen/PresenterView.tsx')
assert(presenterSrc.includes('handleSlideClick'), 'PresenterView wires slide click')

function collectXmlAnimations(nodes, inheritedTrigger) {
  const animations = []
  if (!nodes) return animations
  for (const node of nodes) {
    if (typeof node === 'string' || !node.tagName) continue
    const tag = localName(node.tagName)
    const attrs = node.attributes || {}
    if (tag === 'cTn') {
      const presetClass = attrs.presetClass
      const nodeType = attrs.nodeType
      const trigger = ({ clickEffect: 'click', withEffect: 'meantime', afterEffect: 'auto' }[nodeType]) || inheritedTrigger
      const type = { entr: 'in', exit: 'out', emph: 'attention', path: 'attention' }[presetClass]
      if (presetClass && type) {
        let objectId = ''
        walkXml(node.children, child => {
          if (localName(child.tagName) === 'spTgt' && !objectId) objectId = child.attributes?.spid || ''
        })
        if (objectId) animations.push({ objectId, trigger: trigger || 'click', type, presetID: attrs.presetID, presetSubtype: attrs.presetSubtype })
        continue
      }
      animations.push(...collectXmlAnimations(node.children, trigger))
      continue
    }
    animations.push(...collectXmlAnimations(node.children, inheritedTrigger))
  }
  return animations
}

function extractSlideAnimationsFromXml(xml) {
  if (!xml || !xml.includes('<p:timing')) return []
  return collectXmlAnimations(parseXml(xml))
}

const timingXml = `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" nodeType="tmRoot"><p:childTnLst>
    <p:seq><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>
      <p:par><p:cTn id="3" fill="hold"><p:childTnLst>
        <p:par>
          <p:cTn id="4" presetID="10" presetClass="entr" presetSubtype="0" nodeType="clickEffect">
            <p:childTnLst>
              <p:animEffect transition="in" filter="fade">
                <p:cBhvr><p:cTn dur="1000"/><p:tgtEl><p:spTgt spid="7"/></p:tgtEl></p:cBhvr>
              </p:animEffect>
            </p:childTnLst>
          </p:cTn>
        </p:par>
        <p:par>
          <p:cTn id="14" presetID="10" presetClass="entr" presetSubtype="0" nodeType="withEffect">
            <p:childTnLst>
              <p:animEffect transition="in" filter="fade">
                <p:cBhvr><p:cTn dur="1000"/><p:tgtEl><p:spTgt spid="8"/></p:tgtEl></p:cBhvr>
              </p:animEffect>
            </p:childTnLst>
          </p:cTn>
        </p:par>
        <p:par>
          <p:cTn id="20" nodeType="clickEffect" fill="hold">
            <p:childTnLst>
              <p:cTn id="21" presetID="2" presetClass="entr" presetSubtype="8">
                <p:childTnLst>
                  <p:animEffect transition="in" filter="wipe">
                    <p:cBhvr><p:cTn dur="1200"/><p:tgtEl><p:spTgt spid="9"/></p:tgtEl></p:cBhvr>
                  </p:animEffect>
                </p:childTnLst>
              </p:cTn>
            </p:childTnLst>
          </p:cTn>
        </p:par>
        <p:par>
          <p:cTn id="30" presetID="10" presetClass="exit" nodeType="afterEffect">
            <p:childTnLst>
              <p:animEffect transition="out" filter="fade">
                <p:cBhvr><p:cTn dur="400"/><p:tgtEl><p:spTgt spid="10"/></p:tgtEl></p:cBhvr>
              </p:animEffect>
            </p:childTnLst>
          </p:cTn>
        </p:par>
        <p:par>
          <p:cTn id="40" presetID="26" presetClass="emph" nodeType="withEffect">
            <p:childTnLst>
              <p:animEffect>
                <p:cBhvr><p:cTn dur="600"/><p:tgtEl><p:spTgt spid="11"/></p:tgtEl></p:cBhvr>
              </p:animEffect>
            </p:childTnLst>
          </p:cTn>
        </p:par>
      </p:childTnLst></p:cTn></p:par>
    </p:childTnLst></p:cTn></p:seq>
  </p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>
</p:sld>`
const parsedAnims = extractSlideAnimationsFromXml(timingXml)
assert(parsedAnims.length === 5, `parsed 5 timing effects (got ${parsedAnims.length})`)
assert(parsedAnims[0].objectId === '7' && parsedAnims[0].trigger === 'click' && parsedAnims[0].type === 'in', 'first effect is click entrance on spid 7')
assert(parsedAnims[1].objectId === '8' && parsedAnims[1].trigger === 'meantime', 'second effect is withPrevious on spid 8')
assert(parsedAnims[2].objectId === '9' && parsedAnims[2].trigger === 'click' && parsedAnims[2].presetSubtype === '8', 'inherited clickEffect from ancestor wrapper')
assert(parsedAnims[3].objectId === '10' && parsedAnims[3].trigger === 'auto' && parsedAnims[3].type === 'out', 'afterPrevious exit')
assert(parsedAnims[4].objectId === '11' && parsedAnims[4].trigger === 'meantime' && parsedAnims[4].type === 'attention', 'withPrevious emphasis')

if (failures.length) {
  console.error('pptx import fidelity checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('pptx import fidelity checks passed')
