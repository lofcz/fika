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
const pmDOMParser = DOMParser.fromSchema(schema);
let sharedHtmlParser: InstanceType<typeof window.DOMParser> | null = null;
const getHtmlParser = () => {
  if (!sharedHtmlParser) sharedHtmlParser = new window.DOMParser();
  return sharedHtmlParser;
};
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
  const element = getHtmlParser().parseFromString(htmlString, 'text/html').body.firstElementChild;
  return pmDOMParser.parse(element as Element);
};
export const appendTrailingBreaks = (
  root: { querySelectorAll: (sel: string) => Iterable<Element> },
  createBr: () => Element,
) => {
  for (const paragraph of root.querySelectorAll('p')) {
    const last = paragraph.lastChild;
    const isHardBreak = last != null
      && last.nodeType === 1
      && (last as Element).tagName === 'BR'
      && !(last as Element).classList.contains('ProseMirror-trailingBreak');
    if (!last || isHardBreak) {
      paragraph.appendChild(createBr());
    }
  }
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
  // ProseMirror's view supplies a trailing break to empty paragraphs AND to
  // paragraphs ending with a hard break (Shift+Enter `<p>Line<br></p>`). The
  // model serializer does not: without it static slides collapse trailing
  // lines and selecting the text/shape shifts layout.
  appendTrailingBreaks(wrap, () => {
    const br = document.createElement('br');
    br.className = 'ProseMirror-trailingBreak';
    return br;
  });
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
