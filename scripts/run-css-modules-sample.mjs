import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = process.cwd()
const pairs = [
  ['src/components/Button.tsx', 'src/components/Button.scss'],
  ['src/components/ColorSwatches.tsx', 'src/components/ColorSwatches.scss'],
  ['src/components/Select.tsx', 'src/components/Select.scss'],
  ['src/views/Editor/Toolbar/common/PanelSection.tsx', 'src/views/Editor/Toolbar/common/PanelSection.scss'],
  ['src/views/Editor/Toolbar/SlideDesignPanel/index.tsx', 'src/views/Editor/Toolbar/SlideDesignPanel/index.scss'],
  ['src/views/Editor/index.tsx', 'src/views/Editor/index.scss'],
]

function convertScss(abs) {
  const dest = abs.replace(/\.scss$/, '.module.scss')
  let css = readFileSync(abs, 'utf8')
  css = css.replace(/:deep\(/g, ':global(')
  writeFileSync(dest, css)
  unlinkSync(abs)
  return dest
}

function convertTsx(abs, moduleName) {
  let tsx = readFileSync(abs, 'utf8')
  tsx = tsx.replace(/import\s+['"](\.[^'"]+)\.scss['"]/, `import styles from '$1.module.scss'`)
  tsx = tsx.replace(/import styles from ['"](\.[^'"]+)\.module\.module\.scss['"]/, `import styles from '$1.module.scss'`)
  if (!tsx.includes("from '@/utils/cssm'")) {
    tsx = `import { bindStyles } from '@/utils/cssm'\n${tsx}`
  }
  if (!tsx.includes('const cx = bindStyles(styles)')) {
    tsx = tsx.replace(
      /(import styles from ['"].+\.module\.scss['"];?\r?\n)/,
      `$1const cx = bindStyles(styles)\n`,
    )
  }
  tsx = tsx.replace(/className=['"]([^'"]+)['"]/g, (_, names) => `className={cx(${JSON.stringify(names)})}`)
  tsx = tsx.replace(/className=\{cls\(/g, 'className={cx(')
  tsx = tsx.replace(/(?<![\w.])cls\(/g, 'cx(')
  writeFileSync(abs, tsx)
}

for (const [tsxRel, scssRel] of pairs) {
  const tsx = join(root, tsxRel)
  const scss = join(root, scssRel)
  if (!existsSync(scss)) {
    console.log('skip missing scss', scssRel)
    continue
  }
  convertScss(scss)
  convertTsx(tsx)
  console.log('converted', tsxRel)
}
