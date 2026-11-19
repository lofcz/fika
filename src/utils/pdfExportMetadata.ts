/**
 * Writes host metadata (`exportMetadata`) into a pdf-lib document before save:
 * - Info `Creator` / `Producer` = generator, `Title` = title (when given)
 * - custom Info keys `AIGenerated`, `DigitalSourceType`, `AIStatement`
 * - an XMP metadata stream on the catalog with `xmp:CreatorTool`,
 *   `pdf:Producer`, `dc:title`, `dc:description` (statement),
 *   `Iptc4xmpExt:DigitalSourceType` and the host's optional custom namespace.
 */
import { PDFDict, PDFHexString, PDFName, PDFString, type PDFDocument } from 'pdf-lib'
import type { FikaExportMetadata } from '@/configs/exportMetadata'

function escapeXml(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

const XMP_NS = {
  x: 'adobe:ns:meta/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  xmp: 'http://ns.adobe.com/xap/1.0/',
  pdf: 'http://ns.adobe.com/pdf/1.3/',
  dc: 'http://purl.org/dc/elements/1.1/',
  Iptc4xmpExt: 'http://iptc.org/std/Iptc4xmpExt/2008-02-29/',
}

/** Literal string when plain printable ASCII (greppable by simple tools), UTF-16 hex otherwise. */
function pdfText(value: string) {
  return /^[\x20-\x7e]*$/.test(value) && !/[()\\]/.test(value) ? PDFString.of(value) : PDFHexString.fromText(value)
}

function xmpDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function buildExportXmp(metadata: FikaExportMetadata, options: { title?: string; date?: Date } = {}): string {
  const date = xmpDate(options.date ?? new Date())
  const title = metadata.title ?? options.title
  const alt = (value: string) => `<rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(value)}</rdf:li></rdf:Alt>`
  const custom = metadata.xmpNamespace
  const namespaces = Object.entries(XMP_NS).filter(([prefix]) => prefix !== 'x' && prefix !== 'rdf')
    .map(([prefix, uri]) => ` xmlns:${prefix}="${uri}"`).join('')
    + (custom ? ` xmlns:${custom.prefix}="${escapeXml(custom.uri)}"` : '')
  const fields = [
    `<xmp:CreatorTool>${escapeXml(metadata.generator)}</xmp:CreatorTool>`,
    `<xmp:CreateDate>${date}</xmp:CreateDate>`,
    `<xmp:ModifyDate>${date}</xmp:ModifyDate>`,
    `<xmp:MetadataDate>${date}</xmp:MetadataDate>`,
    `<pdf:Producer>${escapeXml(metadata.generator)}</pdf:Producer>`,
    '<dc:format>application/pdf</dc:format>',
    title ? `<dc:title>${alt(title)}</dc:title>` : '',
    metadata.statement ? `<dc:description>${alt(metadata.statement)}</dc:description>` : '',
    `<Iptc4xmpExt:DigitalSourceType>${escapeXml(metadata.digitalSourceType)}</Iptc4xmpExt:DigitalSourceType>`,
    ...Object.entries(custom?.properties ?? {}).map(([name, value]) => `<${custom!.prefix}:${name}>${escapeXml(value)}</${custom!.prefix}:${name}>`),
  ].filter(Boolean).map((line) => `   ${line}\n`).join('')
  // Trailing whitespace padding lets in-place XMP editors grow the packet.
  const padding = `${' '.repeat(99)}\n`.repeat(20)
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n`
    + `<x:xmpmeta xmlns:x="${XMP_NS.x}">\n`
    + ` <rdf:RDF xmlns:rdf="${XMP_NS.rdf}">\n`
    + `  <rdf:Description rdf:about=""${namespaces}>\n`
    + fields
    + '  </rdf:Description>\n'
    + ' </rdf:RDF>\n'
    + '</x:xmpmeta>\n'
    + padding
    + '<?xpacket end="w"?>'
}

export function applyPdfExportMetadata(pdf: PDFDocument, metadata: FikaExportMetadata, options: { title?: string; date?: Date } = {}): void {
  pdf.setCreator(metadata.generator)
  pdf.setProducer(metadata.generator)
  if (metadata.title) pdf.setTitle(metadata.title)
  const info = pdf.context.lookup(pdf.context.trailerInfo.Info, PDFDict)
  info.set(PDFName.of('AIGenerated'), pdfText(metadata.aiGenerated ? 'true' : 'false'))
  info.set(PDFName.of('DigitalSourceType'), pdfText(metadata.digitalSourceType))
  if (metadata.statement) info.set(PDFName.of('AIStatement'), pdfText(metadata.statement))
  const xmp = new TextEncoder().encode(buildExportXmp(metadata, options))
  const stream = pdf.context.stream(xmp, { Type: 'Metadata', Subtype: 'XML', Length: xmp.length })
  pdf.catalog.set(PDFName.of('Metadata'), pdf.context.register(stream))
}
