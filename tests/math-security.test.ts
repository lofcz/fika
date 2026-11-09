import { expect, it } from '@rstest/core'
import { convertLatexToMarkup } from 'mathlive/ssr'
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'

// The embed bundles MathLive, so its own locked dependency must be patched;
// updating the host application's copy does not update the slides renderer.
it.each([
  String.raw`\text{<img src=x onerror=alert(1)>}`,
  String.raw`\enclose{updiagonalstrike}[shadow="x onmouseover=alert(1)//"]{x}`,
  String.raw`\enclose{updiagonalstrike}[shadow="x"onmouseover="alert(1)//"]{x}`,
  String.raw`\enclose{updiagonalarrow}[mathcolor="red"onmouseover="alert(1)//"]{x}`,
])('keeps stored math out of executable HTML: %s', (latex) => {
  const root = parseFragment(convertLatexToMarkup(latex))
  const visit = (node: DefaultTreeAdapterMap['node']) => {
    if ('tagName' in node) {
      expect(['img', 'script', 'iframe', 'object', 'embed']).not.toContain(node.tagName)
      expect(node.attrs.filter(attr => /^on/i.test(attr.name))).toEqual([])
    }
    if ('childNodes' in node) node.childNodes.forEach(visit)
  }
  visit(root)
})
