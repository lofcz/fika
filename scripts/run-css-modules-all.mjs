import { join } from 'node:path'
import { convertAll } from './to-css-modules.mjs'

const srcRoot = join(process.cwd(), 'src')
const report = convertAll(srcRoot)
console.log('converted', report.converted.length)
console.log('skipped', report.skipped.length)
if (report.missingTsx.length) {
  console.log('missing tsx for')
  for (const f of report.missingTsx) console.log(' ', f)
}
