import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import tinycolor from 'tinycolor2'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context)
    const without = specifier.slice(2)
    const candidates = [
      join(srcDir, without),
      join(srcDir, without + '.ts'),
      join(srcDir, without + '.js'),
      join(srcDir, without, 'index.ts'),
    ]
    const file = candidates.find(path => existsSync(path))
    if (!file) return nextResolve(specifier, context)
    return { url: pathToFileURL(file).href, shortCircuit: true }
  },
})

const { CHART_SERIES_CONTRAST, resolveChartSeriesColors } = await import(
  pathToFileURL(join(srcDir, 'utils/textContrast.ts')).href
)
const { DEFAULT_THEME_COLORS, PRESET_THEMES, themeChartColors } = await import(
  pathToFileURL(join(srcDir, 'configs/theme.ts')).href
)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const ink = PRESET_THEMES.find(theme => theme.id === 'ink')
assert(!!ink, 'ink preset exists')
assert(ink.colors.includes('#171717'), 'ink theme swatches still include near-black for shapes')
assert(!themeChartColors(ink).includes('#171717'), 'ink chart palette drops near-black')

const inkSurfaces = ['#0c0d10', '#1a2744']
const inkSeries = resolveChartSeriesColors(ink.colors, inkSurfaces)
assert(inkSeries.length === ink.colors.length, 'ink series count is preserved')
assert(!inkSeries.some(color => tinycolor(color).toHexString() === '#171717'), 'resolved ink series are not #171717')
for (const color of inkSeries) {
  const worst = Math.min(...inkSurfaces.map(bg => tinycolor.readability(color, bg)))
  assert(worst >= CHART_SERIES_CONTRAST, `ink series ${color} contrast ${worst.toFixed(2)} against dark slide`)
}
assert(
  tinycolor.readability(inkSeries[0], inkSeries[1]) > 1.15
    || Math.abs(tinycolor(inkSeries[0]).toHsv().h - tinycolor(inkSeries[1]).toHsv().h) >= 18,
  'ink series 1 and 2 stay visually distinct',
)

const designed = resolveChartSeriesColors(themeChartColors(ink), inkSurfaces)
for (const color of designed) {
  const worst = Math.min(...inkSurfaces.map(bg => tinycolor.readability(color, bg)))
  assert(worst >= CHART_SERIES_CONTRAST, `designed ink chart color ${color} is readable`)
}

const light = resolveChartSeriesColors(DEFAULT_THEME_COLORS, ['#ffffff'])
assert(
  light.every((color, i) => color.toLowerCase() === DEFAULT_THEME_COLORS[i].toLowerCase()),
  'light slides keep the default series palette',
)

if (failures.length) {
  console.error(`check-chart-series-contrast: ${failures.length} failed`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('check-chart-series-contrast: ok')
