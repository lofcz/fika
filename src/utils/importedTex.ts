import { isTexFormulaSource, mayContainTexSource, tokenizeMath } from '@/utils/markdown';
import { normalizeImportedLatex, renderMathToHtml } from '@/utils/math';

const escapeImportedText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The pptxtojson fork emits inline OMML equations as `span.omml-math` carrying
 * bare LaTeX in `data-latex`. Re-typeset them into the canonical
 * `span.fika-math` wrapper so they render and stay editable like all other
 * in-text math.
 */
export const convertOmmlMathSpans = (doc: Document) => {
  for (const span of Array.from(doc.body.querySelectorAll('span.omml-math'))) {
    const latex = normalizeImportedLatex(
      (span.getAttribute('data-latex') || span.textContent || '').trim()
    );
    if (!latex) {
      span.remove();
      continue;
    }
    const template = document.createElement('template');
    template.innerHTML = renderMathToHtml(latex);

    const styleText = span.getAttribute('style');
    if (styleText) {
      const wrapper = doc.createElement('span');
      wrapper.setAttribute('style', styleText);
      wrapper.append(template.content);
      span.replaceWith(wrapper);
    } else {
      span.replaceWith(template.content);
    }
  }
};

/** Typeset leftover TeX source with MathLive — any control word, not a command list. */
export const convertBareLatexBlocks = (doc: Document) => {
  // Parse runs in place so a literal price cannot erase <br> or edge spaces.
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let changed = false;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const text = node;
    node = walker.nextNode() as Text | null;
    const raw = text.data;
    if (!mayContainTexSource(raw) || text.parentElement?.closest('.fika-math, .omml-math, [data-literal-dollar], eq, eqn, math, code, pre, script, style')) continue;
    const segments = tokenizeMath(raw);
    const template = doc.createElement('template');
    if (segments.some(segment => segment.type === 'math')) {
      template.innerHTML = segments
        .map(segment =>
          segment.type === 'math'
            ? renderMathToHtml(segment.value, segment.display)
            : escapeImportedText(segment.value)
        )
        .join('');
    } else if (isTexFormulaSource(raw, segments)) {
      const formula = raw.trim();
      template.innerHTML = raw.replace(formula, () => renderMathToHtml(formula));
    } else continue;
    text.replaceWith(template.content);
    changed = true;
  }
  return changed;
};

/** Re-typeset stored fika-math whose data-latex still has XML entities or `\<`. */
const repairFikaMathSpans = (doc: Document) => {
  for (const span of Array.from(doc.body.querySelectorAll('.fika-math'))) {
    const raw = span.getAttribute('data-latex') || '';
    const latex = normalizeImportedLatex(raw);
    if (latex === raw) continue;
    const template = document.createElement('template');
    template.innerHTML = renderMathToHtml(latex, span.getAttribute('data-display') === 'true');
    span.replaceWith(template.content);
  }
};

/** Import-time and paint-time: OMML spans + leftover TeX source → fika-math. */
export function typesetImportedTex(html: string): string {
  if (!html) return html;
  const hasOmmlMath = html.includes('omml-math');
  const hasBareLatex = mayContainTexSource(html);
  const hasBrokenOp = html.includes('fika-math') && (html.includes('\\<') || html.includes('\\>') || html.includes('&lt;') || html.includes('&gt;'));
  if (!hasOmmlMath && !hasBareLatex && !hasBrokenOp) return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  if (hasOmmlMath) convertOmmlMathSpans(doc);
  const converted = hasBareLatex && convertBareLatexBlocks(doc);
  if (hasBrokenOp) repairFikaMathSpans(doc);
  return converted || hasOmmlMath || hasBrokenOp ? doc.body.innerHTML : html;
}
