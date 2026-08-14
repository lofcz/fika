import { getLL } from '@/i18n/getLL';

/** Element type labels in the active locale. */
export function getElementTypeZh(): Record<string, string> {
  const types = getLL().configs.element.types;
  return {
    text: types.text(),
    image: types.image(),
    shape: types.shape(),
    line: types.line(),
    chart: types.chart(),
    table: types.table(),
    video: types.video(),
    audio: types.audio(),
    latex: types.latex(),
    mermaid: types.mermaid()
  };
}
export const MIN_SIZE: Record<string, number> = {
  text: 40,
  image: 20,
  shape: 20,
  chart: 200,
  table: 30,
  video: 250,
  audio: 20,
  latex: 20,
  mermaid: 80
};
