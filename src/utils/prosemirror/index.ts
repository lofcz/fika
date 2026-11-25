import { EditorState } from 'prosemirror-state';
import { type DirectEditorProps, EditorView } from 'prosemirror-view';
import { Schema, DOMParser, DOMSerializer } from 'prosemirror-model';
import { typesetImportedTex } from '@/utils/importedTex';
import { getMathReadyVersion, htmlContainsMath } from '@/utils/math';
import { MATH_FONT_CHANGE_TOKEN, subscribeTextFontChanges } from '@/utils/textFit';
import { buildPlugins, type PluginOptions } from './plugins/index';
import { schemaNodes, schemaMarks } from './schema/index';
const schema = new Schema({
  nodes: schemaNodes,
  marks: schemaMarks
});
const serializer = DOMSerializer.fromSchema(schema);
const SERIALIZE_CACHE_MAX = 500;
const serializeCache = new Map<string, string>();
export const clearRichTextSerializeCache = () => {
  serializeCache.clear();
};
subscribeTextFontChanges(families => {
  if (!families || families.has(MATH_FONT_CHANGE_TOKEN)) {
    serializeCache.clear();
  }
});
export { normalizeFittedFontSizes } from '../richTextFontSize';
import { normalizeFittedFontSizes } from '../richTextFontSize';
export const createDocument = (content: string) => {
  const htmlString = `<div>${typesetImportedTex(normalizeFittedFontSizes(content))}</div>`;
  const parser = new window.DOMParser();
  const element = parser.parseFromString(htmlString, 'text/html').body.firstElementChild;
  return DOMParser.fromSchema(schema).parse(element as Element);
};
/** Same HTML the live editor paints, so static → edit cannot shift glyphs. */
export const serializeRichTextHtml = (content: string, mathVersion = getMathReadyVersion()) => {
  if (!content) return content;
  const cacheKey = `${mathVersion}\0${content}`;
  const cached = serializeCache.get(cacheKey);
  if (cached !== undefined) {
    serializeCache.delete(cacheKey);
    serializeCache.set(cacheKey, cached);
    return cached;
  }
  const wrap = document.createElement('div');
  wrap.appendChild(serializer.serializeFragment(createDocument(content).content));
  // ProseMirror's view supplies a caret break to empty paragraphs. The model
  // serializer does not: without it static slides collapse blank lines and
  // selecting the shape moves every following paragraph.
  for (const paragraph of wrap.querySelectorAll('p')) {
    if (!paragraph.hasChildNodes()) {
      const br = document.createElement('br');
      br.className = 'ProseMirror-trailingBreak';
      paragraph.appendChild(br);
    }
  }
  const html = wrap.innerHTML;
  // Never cache pending math placeholders generated before MathLive finishes loading.
  if (!html.includes('data-pending="true"')) {
    if (serializeCache.size >= SERIALIZE_CACHE_MAX) {
      const oldest = serializeCache.keys().next().value;
      if (oldest !== undefined) serializeCache.delete(oldest);
    }
    serializeCache.set(cacheKey, html);
  }
  return html;
};
export const syncMathReadyInEditorView = (
  view: Pick<EditorView, 'state' | 'hasFocus' | 'dispatch'>,
  rawValue: string,
  options: { editing: boolean; onBeforeDispatch?: () => void },
): boolean => {
  if (options.editing || view.hasFocus()) return false;
  let hasMathNode = false;
  view.state.doc.descendants(node => {
    if (node.type.name === 'math') {
      hasMathNode = true;
      return false;
    }
    return true;
  });
  if (!hasMathNode && !htmlContainsMath(rawValue)) return false;
  const incomingDoc = createDocument(rawValue);
  const { doc, tr } = view.state;
  if (doc.eq(incomingDoc)) return false;
  options.onBeforeDispatch?.();
  view.dispatch(
    tr.replaceRangeWith(0, doc.content.size, incomingDoc)
      .setMeta('fikaSyncValue', true)
      .setMeta('addToHistory', false),
  );
  return true;
};

export const initProsemirrorEditor = (dom: Element, content: string, props: Omit<DirectEditorProps, 'state'>, pluginOptions?: PluginOptions) => {
  return new EditorView(dom, {
    state: EditorState.create({
      doc: createDocument(content),
      plugins: buildPlugins(schema, pluginOptions)
    }),
    ...props
  });
};
