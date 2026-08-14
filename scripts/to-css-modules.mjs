import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

export const GLOBAL_STYLE = [
  /[\\/]src[\\/]assets[\\/]/,
  /[\\/]src[\\/]App\.scss$/,
  /[\\/]src[\\/]directive[\\/]/,
  /popover-tippy\.scss$/,
  /screen-portal\.scss$/,
]

export function isGlobalStyle(file) {
  const n = file.replace(/\\/g, '/')
  return GLOBAL_STYLE.some(re => re.test(n))
}

function matchingParen(src, openIdx) {
  let depth = 0
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function matchingBrace(src, openIdx) {
  let depth = 0
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function skipWs(src, i) {
  while (i < src.length && /\s/.test(src[i])) i++
  return i
}

/** :deep(SEL) / ::v-deep(SEL) → :global { SEL { ... } } so nested pierce classes stay unhashed. */
export function convertDeepSelectors(css) {
  let src = css.replace(/::v-deep\(/g, ':deep(')
  let out = ''
  let i = 0
  while (i < src.length) {
    const idx = src.indexOf(':deep(', i)
    if (idx === -1) {
      out += src.slice(i)
      break
    }
    out += src.slice(i, idx)

    const selectors = []
    let cursor = idx
    while (src.startsWith(':deep(', cursor)) {
      const open = cursor + 5
      const close = matchingParen(src, open)
      if (close < 0) {
        out += src.slice(idx)
        return out
      }
      selectors.push(src.slice(open + 1, close).trim())
      cursor = skipWs(src, close + 1)
      if (src[cursor] === ',') {
        cursor = skipWs(src, cursor + 1)
        continue
      }
      break
    }

    if (src[cursor] === '{') {
      const end = matchingBrace(src, cursor)
      if (end < 0) {
        out += src.slice(idx)
        return out
      }
      const body = src.slice(cursor + 1, end)
      out += `:global { ${selectors.join(', ')} {${body}} }`
      i = end + 1
    }
    else {
      out += `:global(${selectors[0]})`
      i = idx + 6 + selectors[0].length + 1
    }
  }
  return out
}

export function convertScssFile(scssPath) {
  if (isGlobalStyle(scssPath)) return { skipped: true, reason: 'global' }
  const dest = scssPath.endsWith('.module.scss')
    ? scssPath
    : scssPath.replace(/\.scss$/, '.module.scss')
  let css = readFileSync(scssPath, 'utf8')
  css = convertDeepSelectors(css)
  writeFileSync(dest, css)
  if (dest !== scssPath && existsSync(scssPath)) unlinkSync(scssPath)
  return { dest }
}

function rewriteClassNameArrays(tsx) {
  return tsx.replace(
    /className=\{(\[[\s\S]*?\])\.filter\(Boolean\)\.join\(['"] ['"]\)\}/g,
    (_, arr) => `className={cx(${arr.slice(1, -1).trim()})}`,
  )
}

function rewriteJoinedClassConsts(tsx) {
  return tsx.replace(
    /(\bconst\s+\w+\s*=\s*)(\[[\s\S]*?\])\.filter\(Boolean\)\.join\(['"] ['"]\)/g,
    (full, decl, arr) => {
      if (!/className|classes|classNames|cls\b/.test(full) && !/'[a-z]/.test(arr)) return full
      return `${decl}cx(${arr.slice(1, -1).trim()})`
    },
  )
}

function rewriteBareRootJoin(tsx) {
  return tsx.replace(
    /className=\{(\[[\s\S]*?\])\.filter\(Boolean\)\.join\(['"] ['"]\)\}/g,
    (_, arr) => `className={cx(${arr.slice(1, -1).trim()})}`,
  )
}

export function convertTsxSource(tsx) {
  let next = tsx
  next = next.replace(/import\s+['"](\.[^'"]+)\.scss['"]/g, (full, spec) => {
    if (/popover-tippy$|screen-portal$/.test(spec)) return full
    return `import styles from '${spec}.module.scss'`
  })
  next = next.replace(/import styles from ['"](\.[^'"]+)\.module\.module\.scss['"]/g, `import styles from '$1.module.scss'`)
  if (/import styles from ['"].+\.module\.scss['"]/.test(next)) {
    if (!next.includes("from '@/utils/cssm'") && !next.includes('from "@/utils/cssm"')) {
      next = `import { bindStyles } from '@/utils/cssm'\n${next}`
    }
    if (!/\bconst cx = bindStyles\(styles\)/.test(next)) {
      next = next.replace(
        /(import styles from ['"].+\.module\.scss['"];?\r?\n)/,
        `$1const cx = bindStyles(styles)\n`,
      )
    }
  }
  next = next.replace(/className=['"]([^'"]+)['"]/g, (_, names) => `className={cx(${JSON.stringify(names)})}`)
  next = rewriteClassNameArrays(next)
  next = rewriteJoinedClassConsts(next)
  next = rewriteBareRootJoin(next)
  next = next.replace(/className=\{cls\(/g, 'className={cx(')
  next = next.replace(/(?<![\w.])cls\(/g, 'cx(')
  if (!/(?<![\w.])cls\b/.test(next.replace(/import[^;]+cls[^;]+;/, ''))) {
    next = next.replace(/import\s+cls\s+from\s+['"]@\/utils\/cls['"];?\r?\n/, '')
    next = next.replace(/import\s+cls\s+from\s+['"]@\/utils\/cls['"];?\r?\n/, '')
  }
  return next
}

export function convertTsxFile(tsxPath) {
  const tsx = readFileSync(tsxPath, 'utf8')
  const next = convertTsxSource(tsx)
  if (next !== tsx) writeFileSync(tsxPath, next)
  return next !== tsx
}

export function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue
    const abs = join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) walk(abs, acc)
    else acc.push(abs)
  }
  return acc
}

export function findPairs(srcRoot) {
  const files = walk(srcRoot)
  const scss = files.filter(f => f.endsWith('.scss') && !f.endsWith('.module.scss') && !isGlobalStyle(f))
  const modules = files.filter(f => f.endsWith('.module.scss') && !isGlobalStyle(f))
  const tsxFiles = files.filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
  const pairs = []

  for (const css of [...scss, ...modules]) {
    const dir = dirname(css)
    const base = css.replace(/\\/g, '/').split('/').pop().replace(/\.module\.scss$/, '.scss').replace(/\.scss$/, '')
    const candidates = tsxFiles.filter(t => dirname(t) === dir)
    let tsx = candidates.find(t => {
      const tb = t.replace(/\\/g, '/').split('/').pop().replace(/\.tsx?$/, '')
      return tb === base || (base === 'index' && (tb === 'index' || true))
    })
    if (base === 'index') {
      tsx = candidates.find(t => t.replace(/\\/g, '/').endsWith('/index.tsx'))
        || candidates.find(t => t.endsWith('.tsx'))
    }
    else {
      tsx = candidates.find(t => t.replace(/\\/g, '/').endsWith(`/${base}.tsx`))
        || candidates.find(t => t.replace(/\\/g, '/').endsWith(`/${base}.ts`))
    }
    pairs.push({ scss: css, tsx, base })
  }
  return pairs
}

export function convertAll(srcRoot) {
  const pairs = findPairs(srcRoot)
  const report = { converted: [], skipped: [], missingTsx: [] }
  for (const pair of pairs) {
    const scssResult = convertScssFile(pair.scss)
    if (scssResult.skipped) {
      report.skipped.push(relative(srcRoot, pair.scss))
      continue
    }
    if (pair.tsx) convertTsxFile(pair.tsx)
    else report.missingTsx.push(relative(srcRoot, pair.scss))
    report.converted.push(relative(srcRoot, pair.tsx || pair.scss))
  }
  return report
}
