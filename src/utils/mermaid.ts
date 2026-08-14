type MermaidAPI = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, code: string) => Promise<{
    svg: string;
  }>;
};
type DOMPurifyAPI = {
  sanitize: (dirty: string, config?: Record<string, unknown>) => string;
};
let mermaidPromise: Promise<MermaidAPI> | null = null;
let purifyPromise: Promise<DOMPurifyAPI> | null = null;
let renderIndex = 0;

/** Lazily load + configure mermaid (kept out of the initial embed graph). */
function ensureMermaid(): Promise<MermaidAPI> {
  if (mermaidPromise) return mermaidPromise;
  mermaidPromise = import('mermaid').then(mod => {
    const api = (mod.default ?? mod) as MermaidAPI;
    api.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false
    });
    return api;
  });
  return mermaidPromise;
}
function ensureDOMPurify(): Promise<DOMPurifyAPI> {
  if (purifyPromise) return purifyPromise;
  purifyPromise = import('dompurify').then(mod => {
    return (mod.default ?? mod) as DOMPurifyAPI;
  });
  return purifyPromise;
}
export const renderMermaid = async (code: string, key = 'diagram') => {
  const [mermaid, DOMPurify] = await Promise.all([ensureMermaid(), ensureDOMPurify()]);
  const safeKey = key.replace(/[^a-zA-Z0-9]/g, '') || 'diagram';
  const id = `mermaid${safeKey}${renderIndex++}`;
  const {
    svg
  } = await mermaid.render(id, code);
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const svgElement = document.documentElement;
  svgElement.setAttribute('width', '100%');
  svgElement.setAttribute('height', '100%');
  svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svgElement.style.maxWidth = 'none';
  return DOMPurify.sanitize(new XMLSerializer().serializeToString(svgElement), {
    USE_PROFILES: {
      svg: true,
      svgFilters: true
    }
  });
};
