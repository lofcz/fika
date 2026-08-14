/**
 * Extract the contents of every equation (or equation*) environment.
 */
export const extractEquationLatex = (source: string) => {
  const equations: string[] = [];
  const equationPattern = /\\begin\s*\{\s*equation(\*)?\s*\}([\s\S]*?)\\end\s*\{\s*equation\1\s*\}/g;
  for (const match of source.matchAll(equationPattern)) {
    const latex = match[2].trim();
    if (latex) equations.push(latex);
  }
  return equations;
};

/**
 * MathLive emits compact TeX (`4^5\cdot3x`). hfmath's tokenizer treats digits
 * as part of a command name, so `\cdot3x` becomes one unknown token and is
 * drawn as literal text. TeX ends a control word before a digit; insert that
 * space here before handing the string to hfmath.
 */
export const toHfmathLatex = (latex: string) => {
  return latex.replace(/\\displaystyle\b/g, '').replace(/\\textstyle\b/g, '').replace(/\\([A-Za-z]+)(?=[0-9.])/g, '\\$1 ').trim();
};
