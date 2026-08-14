import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cssPath = join(root, 'dist/embed/fika-embed.css')
const rootClass = 'fika-embed-root'

if (!existsSync(cssPath)) {
  console.error('dist/embed/fika-embed.css missing — run rsbuild build --config rsbuild.config.embed.ts first')
  process.exit(1)
}

function isKeyframesRule(rule) {
  let parent = rule.parent
  while (parent) {
    if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return true
    parent = parent.parent
  }
  return false
}

function prefixSelector(selector) {
  return selectorParser(selectors => {
    selectors.each(selectorNode => {
      if (selectorNode.nodes.some(node => node.type === 'class' && node.value === rootClass)) return

      const first = selectorNode.nodes.find(node => node.type !== 'comment')
      if (!first) return

      const rootNode = selectorParser.className({ value: rootClass })

      if (first.type === 'tag' && /^(html|body)$/i.test(first.value)) {
        first.replaceWith(rootNode)
        return
      }

      if (first.type === 'pseudo' && first.value === ':root') {
        first.replaceWith(rootNode)
        return
      }

      selectorNode.prepend(selectorParser.combinator({ value: ' ' }))
      selectorNode.prepend(rootNode)
    })
  }).processSync(selector)
}

const css = readFileSync(cssPath, 'utf8')
const ast = postcss.parse(css, { from: cssPath })

ast.walkRules(rule => {
  if (!rule.selector || isKeyframesRule(rule)) return
  rule.selector = prefixSelector(rule.selector)
})

writeFileSync(cssPath, ast.toString())
console.log(`Scoped embed CSS selectors to .${rootClass}`)
