/**
 * Shared PPTX (OOXML) inspection for export tests.
 * Open a buffer or file once, then read slides / media / text / math.
 */
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'

export function decodeXmlText(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

export function lintXml(xml) {
  const issues = []
  const stack = []
  const re = /<(\/?)([A-Za-z0-9]+:[A-Za-z0-9]+|[A-Za-z0-9]+)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
  let m
  while ((m = re.exec(xml))) {
    const [, closing, tag, attrs] = m
    if (tag.startsWith('?')) continue
    const selfClose = /\/$/.test(attrs.trim()) || /\/>$/.test(m[0])
    if (closing) {
      if (stack[stack.length - 1] !== tag) issues.push(`mismatch close </${tag}> top=<${stack[stack.length - 1]}>`)
      else stack.pop()
    }
    else if (!selfClose) {
      stack.push(tag)
    }
  }
  if (stack.length) issues.push(`unclosed: ${stack.slice(-5).join(',')}`)
  const ns = xml.slice(0, xml.indexOf('>') + 1)
  const prefixes = [...ns.matchAll(/xmlns:([A-Za-z0-9]+)=/g)].map(x => x[1])
  const dup = prefixes.filter((p, i) => prefixes.indexOf(p) !== i)
  if (dup.length) issues.push(`dup ns: ${dup.join(',')}`)
  const bareAmp = xml.match(/&(?!amp;|lt;|gt;|quot;|apos;|#)/)
  if (bareAmp) issues.push(`bare & at ${bareAmp.index}`)
  return issues
}

export function paragraphPprViolations(xml) {
  const violations = []
  for (const para of xml.split(/<a:p>/).slice(1)) {
    const body = para.split('</a:p>')[0]
    const count = (body.match(/<a:pPr[\s>]/g) || []).length
    if (count > 1) violations.push(`paragraph has ${count} pPr blocks`)
    else if (count === 1 && !body.startsWith('<a:pPr')) violations.push('pPr is not the first child of a:p')
  }
  return violations
}

export function inspectSlideXml(name, xml) {
  const texts = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map(m => decodeXmlText(m[1]))
  const colors = [...xml.matchAll(/<a:srgbClr val="([0-9A-Fa-f]{6})"/g)].map(m => m[1].toUpperCase())
  const solidFills = [...xml.matchAll(/<a:solidFill>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/g)].map(m => m[1].toUpperCase())
  return {
    name,
    xml,
    texts,
    plainText: texts.join(''),
    colors: [...new Set(colors)],
    solidFills: [...new Set(solidFills)],
    pictures: (xml.match(/<p:pic[\s>]/g) || []).length,
    oMath: (xml.match(/<m:oMath[\s/>]/g) || []).length,
    hasMathNs: xml.includes('xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"'),
    hasFraction: xml.includes('<m:f'),
    pPrViolations: paragraphPprViolations(xml),
    xmlIssues: lintXml(xml),
  }
}

export async function inspectPptxZip(zip) {
  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir).sort()
  const slideNames = names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  const mediaNames = names.filter(n => n.startsWith('ppt/media/'))
  const slides = []
  for (const name of slideNames) {
    const xml = await zip.file(name).async('string')
    slides.push(inspectSlideXml(name, xml))
  }
  return {
    zip,
    names,
    slideNames,
    mediaNames,
    mediaCount: mediaNames.length,
    slideCount: slides.length,
    slides,
    allText: slides.flatMap(s => s.texts),
    allXml: slides.map(s => s.xml).join('\n'),
    xmlIssues: slides.flatMap(s => s.xmlIssues.map(issue => `${s.name}: ${issue}`)),
  }
}

export async function loadPptx(source) {
  const bytes = typeof source === 'string' ? readFileSync(source) : source
  const zip = await JSZip.loadAsync(bytes)
  return inspectPptxZip(zip)
}

export async function readPptxPart(deck, path) {
  const file = deck.zip.file(path)
  return file ? file.async('string') : null
}
