import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSZip } from '@node-projects/jszip'

const __dirname = dirname(fileURLToPath(import.meta.url))
const zip = await JSZip.loadAsync(readFileSync(join(__dirname, 'out/fidelity.pptx')))
const fnt = zip.file(/ppt\/fonts\/\d+\.fntdata/)[0]
const eot = await fnt.async('uint8array')
const dv = new DataView(eot.buffer, eot.byteOffset, eot.byteLength)
const headerFsType = dv.getUint16(4 + 4 + 4 + 4 + 10 + 1 + 1 + 4, true)
const fsize = dv.getUint32(4, true)
const tdv = new DataView(eot.buffer, eot.byteOffset + (eot.length - fsize), fsize)
const num = tdv.getUint16(4, false)
let ttfFsType = null
for (let i = 0; i < num; i++) {
  const off = 12 + i * 16
  const tag = String.fromCharCode(tdv.getUint8(off), tdv.getUint8(off + 1), tdv.getUint8(off + 2), tdv.getUint8(off + 3))
  if (tag === 'OS/2') ttfFsType = tdv.getUint16(tdv.getUint32(off + 8, false) + 8, false)
}
console.log('EOT header fsType =', headerFsType, '| embedded TTF fsType =', ttfFsType)
console.log(headerFsType === 0 && ttfFsType === 0 ? 'NO RESTRICTION' : 'STILL RESTRICTED')
