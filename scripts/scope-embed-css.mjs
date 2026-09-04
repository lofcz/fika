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

function hasAtRuleAncestor(rule, namePattern) {
  let parent = rule.parent
  while (parent) {
    if (parent.type === 'atrule' && namePattern.test(parent.name)) return true
    parent = parent.parent
  }
  return false
}

function isKeyframesRule(rule) {
  return hasAtRuleAncestor(rule, /keyframes$/i)
}

/**
 * Selectors inside `@scope (...) { }` are already confined to the scoping root and
 * are matched relative to it. Prefixing them with `.fika-embed-root ` makes the root
 * part of the selector's own compound chain, which browsers do not let a scoped
 * selector match (only `:scope` / `&` may address the root) — the whole rule goes
 * dead. prosemirror.scss (list bullets, code, sup/sub, links) and the document
 * reset live in such blocks, so leave them untouched.
 */
function isScopedRule(rule) {
  return hasAtRuleAncestor(rule, /^scope$/i)
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
  if (!rule.selector || isKeyframesRule(rule) || isScopedRule(rule)) return
  rule.selector = prefixSelector(rule.selector)
})

writeFileSync(cssPath, ast.toString())
console.log(`Scoped embed CSS selectors to .${rootClass}`)
