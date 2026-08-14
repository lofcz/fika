import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSZip } from '@node-projects/jszip'

const __dirname = dirname(fileURLToPath(import.meta.url))
const buf = readFileSync(join(__dirname, 'out/fidelity.pptx'))
const zip = await JSZip.loadAsync(buf)
console.log('masters:', Object.keys(zip.files).filter(n => /slideMaster/.test(n)).join(', '))
const pres = await zip.file('ppt/presentation.xml').async('string')
console.log('pres has ScioBot:', pres.includes('ScioBot'))
const m1 = await zip.file('ppt/slideMasters/slideMaster1.xml').async('string')
console.log('master1 cSld name:', m1.match(/<p:cSld name="[^"]*"/)?.[0])
console.log('master1 has ScioBot:', m1.includes('ScioBot'))
console.log('master1 head:', m1.slice(0, 400))
const layouts = Object.keys(zip.files).filter(n => /slideLayout\d+\.xml$/.test(n))
console.log('layouts:', layouts.join(', '))
for (const l of layouts) {
  const x = await zip.file(l).async('string')
  console.log(l, '->', x.match(/<p:cSld name="[^"]*"/)?.[0], '| ScioBot:', x.includes('ScioBot'))
}
const s6 = await zip.file('ppt/slides/slide6.xml').async('string')
console.log('slide6 ph count:', (s6.match(/<p:ph/g) || []).length, JSON.stringify(s6.match(/<p:ph[^>]*>/g)))
process.exit(0)
const s1 = await zip.file('ppt/slides/slide1.xml').async('string')
console.log('--- root + bg (first 900) ---')
console.log(s1.slice(0, 900))
console.log('\n--- shape ids ---')
const ids = [...s1.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m => m[1])
console.log(ids.join(','))
console.log('\n--- bg gradient full ---')
const bgs = s1.indexOf('<p:bg>')
console.log(s1.slice(bgs, bgs + 600))
console.log('\n--- chart1 head (first 700) ---')
const c1 = await zip.file('ppt/charts/chart1.xml').async('string')
console.log(c1.slice(0, 700))
console.log('\n--- [Content_Types] fntdata + chart ---')
const ct = await zip.file('[Content_Types].xml').async('string')
console.log(ct.match(/fntdata[^/]*/g), ct.match(/chart[^/]*/g))
