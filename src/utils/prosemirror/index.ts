import { EditorState } from 'prosemirror-state';
import { type DirectEditorProps, EditorView } from 'prosemirror-view';
import { Schema, DOMParser, DOMSerializer } from 'prosemirror-model';
import { buildPlugins, type PluginOptions } from './plugins/index';
import { schemaNodes, schemaMarks } from './schema/index';
const schema = new Schema({
  nodes: schemaNodes,
  marks: schemaMarks
});
const serializer = DOMSerializer.fromSchema(schema);
const serializeCache = new Map<string, string>();
/** Rendered spans carry `calc(var(--text-fit-scale,1) * Npx)`; parse/store paths want plain px. */
const FITTED_FONT_RE = /calc\(var\(--text-fit-scale,\s*1\)\s*\*\s*([0-9.]+)px\)/g;
export const normalizeFittedFontSizes = (html: string) => (
  html && html.includes('--text-fit-scale') ? html.replace(FITTED_FONT_RE, '$1px') : html
);
export const createDocument = (content: string) => {
  const htmlString = `<div>${normalizeFittedFontSizes(content)}</div>`;
  const parser = new window.DOMParser();
  const element = parser.parseFromString(htmlString, 'text/html').body.firstElementChild;
  return DOMParser.fromSchema(schema).parse(element as Element);
};
/** Same HTML the live editor paints, so static → edit cannot shift glyphs. */
export const serializeRichTextHtml = (content: string) => {
  if (!content) return content;
  const cached = serializeCache.get(content);
  if (cached !== undefined) return cached;
  const wrap = document.createElement('div');
  wrap.appendChild(serializer.serializeFragment(createDocument(content).content));
  const html = wrap.innerHTML;
  serializeCache.set(content, html);
  return html;
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
