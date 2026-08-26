import { containsTexSource, isTexFormulaSource, tokenizeMath } from '@/utils/markdown';
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
  for (const el of Array.from(doc.body.querySelectorAll('p, span, div'))) {
    if (el.closest('.fika-math, .omml-math') || el.querySelector('.fika-math, .omml-math')) continue;
    if (
      !Array.from(el.childNodes).every(
        node => node.nodeType === Node.TEXT_NODE || (node as HTMLElement).tagName === 'BR'
      )
    ) {
      continue;
    }
    const raw = (el.textContent || '').trim();
    if (!raw || !containsTexSource(raw)) continue;
    const template = document.createElement('template');
    if (isTexFormulaSource(raw)) {
      template.innerHTML = renderMathToHtml(raw);
    } else {
      template.innerHTML = tokenizeMath(raw)
        .map(segment =>
          segment.type === 'math'
            ? renderMathToHtml(segment.value, segment.display)
            : escapeImportedText(segment.value)
        )
        .join('');
    }
    el.replaceChildren(template.content);
  }
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
  const hasBareLatex = containsTexSource(html);
  const hasBrokenOp = html.includes('\\<') || html.includes('\\>') || html.includes('&lt;') || html.includes('&gt;');
  if (!hasOmmlMath && !hasBareLatex && !hasBrokenOp) return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  if (hasOmmlMath) convertOmmlMathSpans(doc);
  if (hasBareLatex) convertBareLatexBlocks(doc);
  if (hasBrokenOp) repairFikaMathSpans(doc);
  return doc.body.innerHTML;
}
